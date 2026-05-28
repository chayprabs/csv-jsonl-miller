const healthUrl = process.env.CSVSHAPE_WORKER_HEALTH_URL ?? 'http://127.0.0.1:8797/health';
const timeoutMs = Number(process.env.CSVSHAPE_WORKER_HEALTH_TIMEOUT_MS ?? 30000);
const startedAt = Date.now();

async function waitForHealth() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl);

      if (response.ok) {
        const payload = await response.json();

        if (payload?.engines?.duckdbNative !== true) {
          throw new Error('duckdbNative was not true');
        }

        if (payload?.engines?.mlrBinary !== true) {
          throw new Error('mlrBinary was not true');
        }

        console.log(JSON.stringify(payload, null, 2));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Waiting for worker health: ${message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Worker health check timed out after ${timeoutMs}ms: ${healthUrl}`);
}

await waitForHealth();
