import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const baseUrl = process.env.CSVSHAPE_BASE_URL ?? 'http://127.0.0.1:4173';
const iterationCount = Number(process.env.CSVSHAPE_BROWSER_BENCH_ITERS ?? 5);
const rowCount = Number(process.env.CSVSHAPE_BROWSER_BENCH_ROWS ?? 100000);
const outputPath =
  process.env.CSVSHAPE_BROWSER_BENCH_OUT ??
  path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'browser-duckdb.json');

const edgeCandidates = [
  process.env.CSVSHAPE_EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const edgeExecutable = edgeCandidates.find((candidate) => existsSync(candidate));

if (!edgeExecutable) {
  throw new Error('Microsoft Edge executable was not found for the browser benchmark.');
}

function buildCsv(rows) {
  const parts = ['order_id,category,total,status\n'];

  for (let index = 0; index < rows; index += 1) {
    const category =
      index % 3 === 0 ? 'books' : index % 3 === 1 ? 'electronics' : 'home';
    const total = (index % 97) + 1;
    const status = index % 5 === 0 ? 'refunded' : 'paid';
    parts.push(`${100000 + index},${category},${total},${status}\n`);
  }

  return parts.join('');
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

const csvPayload = Buffer.from(buildCsv(rowCount), 'utf8');
const browser = await chromium.launch({
  executablePath: edgeExecutable,
  headless: true,
});

try {
  const timingsMs = [];

  for (let iteration = 0; iteration < iterationCount; iteration += 1) {
    const page = await browser.newPage({
      viewport: {
        height: 1400,
        width: 1440,
      },
    });
    page.setDefaultTimeout(30_000);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=CSVShape');

    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles({
      buffer: csvPayload,
      mimeType: 'text/csv',
      name: `browser-bench-${rowCount}.csv`,
    });
    await page.waitForFunction(
      (expectedName) => document.body.innerText.includes(expectedName),
      `browser-bench-${rowCount}.csv`,
    );
    const verbPalette = page.locator('.verb-grid');
    const start = performance.now();
    await verbPalette.locator('button.verb-chip').nth(1).click({ force: true });
    await page.locator('.chain-card').nth(0).locator('label.field input').fill('$status == "paid"');
    await verbPalette.locator('button.verb-chip').nth(6).click({ force: true });
    await page
      .locator('.chain-card')
      .nth(1)
      .locator('label.field input')
      .fill('sum,total;count,* then group-by category');
    await page.waitForFunction(() =>
      document.body.innerText.includes('DuckDB-WASM preview is active for the current chain.'),
    );
    await page.waitForFunction(() => document.body.innerText.includes('books'));
    timingsMs.push(Number((performance.now() - start).toFixed(2)));

    await page.close();
  }

  const result = {
    baseUrl,
    edgeExecutable,
    iterationCount,
    p95Ms: percentile(timingsMs, 0.95),
    rowCount,
    thresholdMs: 1000,
    timingsMs,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
