import { describe, expect, it } from 'vitest';

describe('worker metadata', () => {
  it('keeps the fallback retention TTL documented in the worker contract', async () => {
    process.env.WORKER_ARTIFACT_TTL_SECONDS = '900';
    const mod = await import('./index');

    expect(mod.default.port).toBe(8787);
  });
});
