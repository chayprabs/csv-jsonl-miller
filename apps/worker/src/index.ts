import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (context) => {
  return context.json({
    status: 'ok',
    artifactTtlSeconds: Number(process.env.WORKER_ARTIFACT_TTL_SECONDS ?? 900),
    workerMode: 'native-fallback',
  });
});

app.post('/v1/run', async (context) => {
  const body = await context.req.json().catch(() => ({}));

  return context.json(
    {
      status: 'queued',
      message: 'Worker execution scaffolding is present; job execution wiring is pending.',
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
