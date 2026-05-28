import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const samplesDir = path.resolve(
  process.cwd(),
  '..',
  '..',
  'packages',
  'web',
  'public',
  'samples',
);

function readSample(filename: string): string {
  return readFileSync(path.join(samplesDir, filename), 'utf8');
}

const tempPaths: string[] = [];

afterEach(async () => {
  delete process.env.MLR_BIN;
  vi.resetModules();

  await Promise.all(
    tempPaths.splice(0, tempPaths.length).map((targetPath) =>
      rm(targetPath, { force: true, recursive: true }),
    ),
  );
});

async function createFakeMlr(outputText: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'csvshape-mlr-test-'));
  tempPaths.push(tempDir);
  const scriptPath = path.join(tempDir, process.platform === 'win32' ? 'fake-mlr.cmd' : 'fake-mlr');
  const lines = outputText.trimEnd().split('\n');

  if (process.platform === 'win32') {
    await writeFile(
      scriptPath,
      `@echo off\r\nsetlocal\r\n(\r\n${lines.map((line) => `echo ${line}`).join('\r\n')}\r\n)\r\n`,
      'utf8',
    );
  } else {
    await writeFile(
      scriptPath,
      `#!/bin/sh\ncat <<'EOF'\n${lines.join('\n')}\nEOF\n`,
      'utf8',
    );
    await chmod(scriptPath, 0o755);
  }

  return scriptPath;
}

describe('worker metadata', () => {
  it('keeps the fallback retention TTL documented in the worker contract', async () => {
    process.env.WORKER_ARTIFACT_TTL_SECONDS = '900';
    const mod = await import('./index');

    expect(mod.default.port).toBe(8797);
  });

  it('queues worker fallback jobs with structured metadata', async () => {
    const mod = await import('./index');
    const response = await mod.default.fetch(
      new Request('http://localhost/v1/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: {
            kind: 'local-file-meta',
            name: 'huge.csv',
            sizeBytes: 2_000_000_000,
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      status: string;
      acceptedSource: string;
      artifactTtlSeconds: number;
      jobId: string;
    };

    expect(response.status).toBe(202);
    expect(payload.status).toBe('queued');
    expect(payload.acceptedSource).toBe('local-file-meta');
    expect(payload.artifactTtlSeconds).toBe(900);
    expect(payload.jobId).toBeTruthy();
  });

  it('reports native engine availability on health checks', async () => {
    const mod = await import('./index');
    const response = await mod.default.fetch(new Request('http://localhost/health'));
    const payload = (await response.json()) as {
      engines: {
        duckdbNative: boolean;
        mlrBinary: boolean;
      };
      status: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.status).toBe('ok');
    expect(payload.engines.duckdbNative).toBe(true);
    expect(typeof payload.engines.mlrBinary).toBe('boolean');
  });

  it('executes native Miller plans when a binary is configured', async () => {
    process.env.MLR_BIN = await createFakeMlr('category,sum_total\nbooks,42.5\nhome,77.1\n');
    const mod = await import('./index');
    const response = await mod.default.fetch(
      new Request('http://localhost/v1/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mlrPlan: {
            args: ['--csv', 'cut', '-f', 'category,total'],
            files: [
              {
                format: 'csv',
                name: 'ecommerce-events.csv',
                text: readSample('ecommerce-events.csv'),
              },
            ],
            outputFormat: 'csv',
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      artifact?: {
        contentText?: string;
        format: string;
      };
      engine: string;
      preview: Array<Record<string, unknown>>;
      rowCount: number;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.status).toBe('completed');
    expect(payload.engine).toBe('mlr-native');
    expect(payload.preview).toEqual([
      { category: 'books', sum_total: '42.5' },
      { category: 'home', sum_total: '77.1' },
    ]);
    expect(payload.rowCount).toBe(2);
    expect(payload.artifact?.format).toBe('csv');
    expect(payload.artifact?.contentText).toContain('category,sum_total');
  });

  it('reports Miller unavailability when the binary cannot be started', async () => {
    process.env.MLR_BIN = path.join(process.cwd(), 'missing-mlr.cmd');
    const mod = await import('./index');
    const response = await mod.default.fetch(
      new Request('http://localhost/v1/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mlrPlan: {
            args: ['--csv', 'cat'],
            files: [
              {
                format: 'csv',
                name: 'ecommerce-events.csv',
                text: readSample('ecommerce-events.csv'),
              },
            ],
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      engine: string;
      error: string;
      status: string;
    };

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.status).toBe('unavailable');
    expect(payload.engine).toBe('mlr-native');
    expect(payload.error).toBeTruthy();
  });

  it('executes native DuckDB SQL over inline CSV fixtures', async () => {
    const mod = await import('./index');
    const response = await mod.default.fetch(
      new Request('http://localhost/v1/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nativePlan: {
            files: [
              {
                format: 'csv',
                name: 'ecommerce-events.csv',
                text: readSample('ecommerce-events.csv'),
              },
            ],
            outputFormat: 'csv',
            sql: `
              SELECT
                category,
                sum(total) AS sum_total,
                count(*) AS paid_orders
              FROM input0
              WHERE status = 'paid'
              GROUP BY 1
              ORDER BY 1
            `,
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      artifact?: {
        contentText?: string;
        format: string;
      };
      engine: string;
      preview: Array<Record<string, unknown>>;
      rowCount: number;
      status: string;
      tables: Array<{ sourceName: string; tableName: string }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.status).toBe('completed');
    expect(payload.engine).toBe('duckdb-native');
    expect(payload.tables).toEqual([
      { sourceName: 'ecommerce-events.csv', tableName: 'input0' },
    ]);
    expect(payload.preview).toEqual([
      { category: 'books', sum_total: 42.5, paid_orders: '1' },
      { category: 'electronics', sum_total: 129.99, paid_orders: '1' },
      { category: 'home', sum_total: 77.1, paid_orders: '1' },
    ]);
    expect(payload.rowCount).toBe(3);
    expect(payload.artifact?.format).toBe('csv');
    expect(payload.artifact?.contentText).toContain('category,sum_total,paid_orders');
  });

  it('executes native DuckDB joins across JSONL and CSV inputs and exports parquet', async () => {
    const mod = await import('./index');
    const response = await mod.default.fetch(
      new Request('http://localhost/v1/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nativePlan: {
            files: [
              {
                format: 'jsonl',
                name: 'access-log.jsonl',
                text: readSample('access-log.jsonl'),
              },
              {
                format: 'csv',
                name: 'users.csv',
                text: 'user_id,team\nu1,alpha\nu2,beta\n',
              },
            ],
            outputFormat: 'parquet',
            sql: `
              SELECT
                logs.request_id,
                logs.path,
                users.team
              FROM input0 AS logs
              LEFT JOIN input1 AS users
                ON logs.user_id = users.user_id
              ORDER BY logs.request_id
            `,
          },
        }),
      }),
    );
    const payload = (await response.json()) as {
      artifact?: {
        contentBase64?: string;
        format: string;
        sizeBytes: number;
      };
      preview: Array<Record<string, unknown>>;
      rowCount: number;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.status).toBe('completed');
    expect(payload.preview).toEqual([
      { request_id: 'r1', path: '/login', team: 'alpha' },
      { request_id: 'r2', path: '/cart', team: 'beta' },
      { request_id: 'r3', path: '/checkout', team: 'alpha' },
    ]);
    expect(payload.rowCount).toBe(3);
    expect(payload.artifact?.format).toBe('parquet');
    expect(payload.artifact?.sizeBytes).toBeGreaterThan(0);
    expect(payload.artifact?.contentBase64).toBeTruthy();
  });
});
