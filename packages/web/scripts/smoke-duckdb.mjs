import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const baseUrl = process.env.CSVSHAPE_BASE_URL ?? 'http://127.0.0.1:4173';
const screenshotPath =
  process.env.CSVSHAPE_SCREENSHOT_PATH ??
  path.resolve(repoRoot, 'docs', 'qc', 'screenshots', 'duckdb-wasm-preview.png');

const edgeCandidates = [
  process.env.CSVSHAPE_EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const edgeExecutable = edgeCandidates.find((candidate) => existsSync(candidate));

if (!edgeExecutable) {
  throw new Error('Microsoft Edge executable was not found for the DuckDB-WASM smoke test.');
}

const browser = await chromium.launch({
  executablePath: edgeExecutable,
  headless: true,
});

const consoleMessages = [];
let page;

try {
  page = await browser.newPage({
    viewport: {
      height: 1400,
      width: 1440,
    },
  });
  page.setDefaultTimeout(20_000);
  page.on('console', (message) => {
    consoleMessages.push(`[console:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    consoleMessages.push(`[pageerror] ${error.message}`);
  });

  console.log(`Opening ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=CSVShape');
  const verbPalette = page.locator('.verb-grid');
  console.log('Loading ecommerce sample');
  await page.getByRole('button', { name: /Ecommerce events CSV/i }).click();
  await page.waitForFunction(() => document.body.innerText.includes('ecommerce-events.csv'));
  await page.waitForFunction(() => document.body.innerText.includes('1001'));
  console.log('Adding filter step');
  console.log(`Verb palette: ${(await verbPalette.locator('button.verb-chip').allInnerTexts()).join(', ')}`);
  await verbPalette.locator('button.verb-chip').nth(1).click({ force: true });
  await page.waitForTimeout(1_000);
  console.log(`Chain cards after filter click: ${await page.locator('.chain-card').count()}`);
  await page.locator('.chain-card').nth(0).waitFor();
  await page.locator('.chain-card').nth(0).locator('label.field input').fill('$status == "paid"');
  console.log('Adding stats1 step');
  await verbPalette.locator('button.verb-chip').nth(6).click({ force: true });
  await page
    .locator('.chain-card')
    .nth(1)
    .locator('label.field input')
    .fill('sum,total;count,* then group-by category');

  console.log('Waiting for DuckDB-WASM engine message');
  await page.waitForFunction(() =>
    document.body.innerText.includes('DuckDB-WASM preview is active for the current chain.'),
  );
  await page.waitForFunction(() => document.body.innerText.includes('books'));

  const bodyText = await page.locator('body').innerText();

  if (!bodyText.includes('DuckDB-WASM preview is active for the current chain.')) {
    throw new Error('DuckDB-WASM engine message did not appear in the UI.');
  }

  if (!bodyText.includes('books') || !bodyText.includes('electronics') || !bodyText.includes('home')) {
    throw new Error('Expected grouped preview rows were not present in the UI.');
  }

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ fullPage: true, path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        consoleMessages,
        edgeExecutable,
        screenshotPath,
        status: 'ok',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('DuckDB smoke failed.');
  console.error(consoleMessages.join('\n'));

  if (page) {
    const failureScreenshot = screenshotPath.replace(/\.png$/i, '-failure.png');
    await mkdir(path.dirname(failureScreenshot), { recursive: true });
    await page.screenshot({ fullPage: true, path: failureScreenshot });
    console.error(`Saved failure screenshot to ${failureScreenshot}`);
  }

  throw error;
} finally {
  await browser.close();
}
