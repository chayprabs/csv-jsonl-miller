import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as duckdb from '@duckdb/node-api';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const rowCount = Number(process.env.CSVSHAPE_WORKER_BENCH_ROWS ?? 100000000);
const outputPath =
  process.env.CSVSHAPE_WORKER_BENCH_OUT ??
  path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'worker-duckdb.json');

const db = await duckdb.DuckDBInstance.create(':memory:');
const conn = await db.connect();

try {
  const sql = `
    SELECT
      count(*) AS row_count,
      sum(i) AS sum_i
    FROM generate_series(1, ${rowCount}) AS t(i)
  `;
  const started = performance.now();
  const result = await conn.runAndReadAll(sql);
  const elapsedMs = Number((performance.now() - started).toFixed(2));
  const [row] = result.getRowObjectsJS();
  const payload = {
    elapsedMs,
    rowCount,
    result: {
      row_count: row?.row_count?.toString?.() ?? String(row?.row_count ?? ''),
      sum_i: row?.sum_i?.toString?.() ?? String(row?.sum_i ?? ''),
    },
    thresholdMs: 60000,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(payload, null, 2));
} finally {
  conn.closeSync();
}
