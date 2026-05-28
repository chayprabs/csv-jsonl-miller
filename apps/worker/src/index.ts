import { Hono } from 'hono';
import { z } from 'zod';

import { executeNativeDuckDbPlan, nativeEngineStatus } from './native-duckdb';

const app = new Hono();
const artifactTtlSeconds = Number(process.env.WORKER_ARTIFACT_TTL_SECONDS ?? 900);
const nativePlanSchema = z.object({
  files: z
    .array(
      z.object({
        format: z.enum(['csv', 'tsv', 'jsonl', 'ndjson', 'parquet']),
        name: z.string().min(1),
        text: z.string(),
      }),
    )
    .min(1),
  outputFormat: z.enum(['csv', 'tsv', 'jsonl', 'ndjson', 'parquet']).optional(),
  previewLimit: z.number().int().min(1).max(250).optional(),
  sql: z.string().min(1),
});

app.get('/health', (context) => {
  return context.json({
    engines: nativeEngineStatus,
    status: 'ok',
    artifactTtlSeconds,
    workerMode: 'native-fallback',
  });
});

app.post('/v1/run', async (context) => {
  const body = (await context.req.json().catch(() => ({}))) as {
    nativePlan?: unknown;
    source?: {
      kind?: string;
      url?: string;
      name?: string;
      sizeBytes?: number;
    };
    chain?: unknown;
  };

  if (body.nativePlan !== undefined) {
    const parsedPlan = nativePlanSchema.safeParse(body.nativePlan);

    if (!parsedPlan.success) {
      return context.json(
        {
          error: 'Invalid native DuckDB plan.',
          issues: parsedPlan.error.flatten(),
        },
        400,
      );
    }

    const result = await executeNativeDuckDbPlan(parsedPlan.data);

    return context.json({
      artifact: result.artifact,
      artifactTtlSeconds,
      columns: result.columns,
      engine: 'duckdb-native',
      preview: result.preview,
      rowCount: result.rowCount,
      rows: result.rows,
      status: 'completed',
      tables: result.tables,
    });
  }

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

const port = Number(process.env.PORT ?? 8797);

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
