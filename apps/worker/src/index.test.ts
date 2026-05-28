import { describe, expect, it } from 'vitest';

describe('worker metadata', () => {
  it('keeps the fallback retention TTL documented in the worker contract', async () => {
    process.env.WORKER_ARTIFACT_TTL_SECONDS = '900';
    const mod = await import('./index');

    expect(mod.default.port).toBe(8787);
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
});
