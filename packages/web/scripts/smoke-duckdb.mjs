import { mkdir, writeFile } from 'node:fs/promises';
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
const artifactPath =
  process.env.CSVSHAPE_ARTIFACT_PATH ??
  path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'browser-duckdb-smoke.json');

const scenarios = [
  {
    expectedTexts: ['books', 'electronics', 'home'],
    name: 'ecommerce-events',
    sampleButton: /Ecommerce events CSV/i,
    sampleLoadedText: 'ecommerce-events.csv',
    screenshotPath: screenshotPath,
    steps: [
      { value: '$status == "paid"', verb: 'filter' },
      { value: 'sum,total;count,* then group-by category', verb: 'stats1' },
    ],
  },
  {
    expectedTexts: ['u1', '396.55'],
    jsonQuery: '.',
    name: 'access-log',
    sampleButton: /Access log JSONL/i,
    sampleLoadedText: 'access-log.jsonl',
    screenshotPath: screenshotPath.replace(/\.png$/i, '-access-log.png'),
    steps: [
      { value: '$status == 200', verb: 'filter' },
      { value: 'count,*;p95,duration_ms then group-by user_id', verb: 'stats1' },
    ],
  },
  {
    expectedTexts: ['west', '160', 'north', '150', 'south', '119'],
    name: 'wide-sales',
    sampleButton: /Wide-form CSV/i,
    sampleLoadedText: 'wide-sales.csv',
    screenshotPath: screenshotPath.replace(/\.png$/i, '-wide-sales.png'),
    steps: [
      { value: 'region,mar', verb: 'cut' },
      { value: '-mar', verb: 'sort' },
    ],
  },
];

async function selectDuckDbMode(page) {
  await page
    .locator('.preview-stack .dialect-controls')
    .nth(0)
    .locator('select')
    .nth(0)
    .selectOption('duckdb-wasm');
}

async function fillLatestStep(page, value) {
  const card = page.locator('.chain-card').last();

  if (await card.locator('label.field textarea').count()) {
    await card.locator('label.field textarea').first().fill(value);
    return;
  }

  await card.locator('label.field input').first().fill(value);
}

async function runScenario(page, scenario) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=CSVShape');
  await page.getByRole('button', { name: scenario.sampleButton }).click();
  await page.waitForFunction((text) => document.body.innerText.includes(text), scenario.sampleLoadedText);

  if (scenario.jsonQuery) {
    const jsonQueryArea = page.locator('textarea').first();
    await jsonQueryArea.waitFor();
    await jsonQueryArea.fill(scenario.jsonQuery);
  }

  await selectDuckDbMode(page);

  for (const step of scenario.steps) {
    await page.getByRole('button', { name: new RegExp(`^${step.verb}$`, 'i') }).click({ force: true });
    await page.locator('.chain-card').last().waitFor();
    await fillLatestStep(page, step.value);
  }

  await page.waitForFunction(() =>
    document.body.innerText.includes('DuckDB-WASM preview is active for the current chain.'),
  );

  for (const text of scenario.expectedTexts) {
    await page.waitForFunction((expectedText) => document.body.innerText.includes(expectedText), text);
  }

  await mkdir(path.dirname(scenario.screenshotPath), { recursive: true });
  await page.screenshot({ fullPage: true, path: scenario.screenshotPath });

  return {
    expectedTexts: scenario.expectedTexts,
    name: scenario.name,
    screenshotPath: scenario.screenshotPath,
    status: 'ok',
  };
}

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
  const results = [];

  for (const scenario of scenarios) {
    console.log(`Running DuckDB-WASM smoke for ${scenario.name}`);
    results.push(await runScenario(page, scenario));
  }

  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        baseUrl,
        consoleMessages,
        edgeExecutable,
        results,
        status: 'ok',
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        artifactPath,
        baseUrl,
        consoleMessages,
        edgeExecutable,
        results,
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
