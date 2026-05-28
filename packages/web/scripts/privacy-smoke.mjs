import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const baseUrl = process.env.CSVSHAPE_BASE_URL ?? 'http://127.0.0.1:4173';
const workerBaseUrl = process.env.CSVSHAPE_WORKER_BASE_URL ?? 'http://localhost:8797';
const outputPath =
  process.env.CSVSHAPE_PRIVACY_OUT ??
  path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'browser-privacy.json');

const edgeCandidates = [
  process.env.CSVSHAPE_EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const edgeExecutable = edgeCandidates.find((candidate) => existsSync(candidate));

if (!edgeExecutable) {
  throw new Error('Microsoft Edge executable was not found for the privacy smoke test.');
}

const browser = await chromium.launch({
  executablePath: edgeExecutable,
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: {
      height: 1400,
      width: 1440,
    },
  });
  page.setDefaultTimeout(20_000);

  const requests = [];
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=CSVShape');
  await page.getByRole('button', { name: /Ecommerce events CSV/i }).click();
  await page.waitForFunction(() => document.body.innerText.includes('ecommerce-events.csv'));

  const verbPalette = page.locator('.verb-grid');
  await verbPalette.locator('button.verb-chip').nth(1).click({ force: true });
  await page.locator('.chain-card').nth(0).locator('label.field input').fill('$status == "paid"');
  await page.waitForFunction(() => document.body.innerText.includes('1001'));

  const storageState = await page.evaluate(async () => {
    const databases =
      typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];

    return {
      indexedDbNames: databases.map((db) => db.name).filter(Boolean),
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    };
  });

  const externalRequests = requests.filter((request) => {
    if (
      request.url.startsWith('data:') ||
      request.url.startsWith('about:') ||
      request.url.startsWith('blob:')
    ) {
      return false;
    }

    return !request.url.startsWith(baseUrl);
  });
  const workerRequests = requests.filter((request) => request.url.startsWith(workerBaseUrl));
  const result = {
    baseUrl,
    externalRequests,
    requestCount: requests.length,
    requests,
    storageState,
    workerBaseUrl,
    workerRequests,
  };

  if (workerRequests.length > 0) {
    throw new Error(`Unexpected worker requests were observed: ${workerRequests.map((request) => request.url).join(', ')}`);
  }

  if (externalRequests.length > 0) {
    throw new Error(`Unexpected external requests were observed: ${externalRequests.map((request) => request.url).join(', ')}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
