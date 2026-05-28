import { Hono } from 'hono';

const app = new Hono();
const artifactTtlSeconds = Number(process.env.WORKER_ARTIFACT_TTL_SECONDS ?? 900);

app.get('/health', (context) => {
  return context.json({
    status: 'ok',
    artifactTtlSeconds,
    workerMode: 'native-fallback',
  });
});

app.post('/v1/run', async (context) => {
  const body = (await context.req.json().catch(() => ({}))) as {
    source?: {
      kind?: string;
      url?: string;
      name?: string;
      sizeBytes?: number;
    };
    chain?: unknown;
  };
  const jobId = crypto.randomUUID();
  const sourceKind = body.source?.kind ?? 'unknown';

  return context.json(
    {
      status: 'queued',
      jobId,
      acceptedSource: sourceKind,
      artifactTtlSeconds,
      message:
        sourceKind === 'local-file-meta'
          ? 'Large local file accepted for worker fallback planning.'
          : 'Worker request accepted for native fallback processing.',
      request: body,
    },
    202,
  );
});

const port = Number(process.env.PORT ?? 8787);

export default {
  port,
  fetch: app.fetch,
};

if (import.meta.main) {
  const { serve } = await import('@hono/node-server');

  serve({
    fetch: app.fetch,
    port,
  });
}
