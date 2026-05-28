import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const samplePath = path.resolve(
  repoRoot,
  'packages',
  'web',
  'public',
  'samples',
  'ecommerce-events.csv',
);
const outputPath = path.resolve(
  repoRoot,
  'docs',
  'qc',
  'benchmarks',
  'native-mlr-smoke.json',
);

if (!process.env.MLR_BIN && process.platform === 'win32') {
  process.env.MLR_BIN = path.join(process.env.TEMP ?? '', 'csvshape-tools', 'bin', 'mlr.exe');
}

const sampleText = await readFile(samplePath, 'utf8');
const worker = await import('../src/index');
const response = await worker.default.fetch(
  new Request('http://localhost/v1/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mlrPlan: {
        args: ['--csv', 'filter', '$status == "paid"', 'then', 'cut', '-f', 'category,total'],
        files: [
          {
            format: 'csv',
            name: 'ecommerce-events.csv',
            text: sampleText,
          },
        ],
        outputFormat: 'csv',
      },
    }),
  }),
);

const payload = (await response.json()) as Record<string, unknown>;
const artifact = {
  mlrBin: process.env.MLR_BIN ?? 'mlr',
  responseStatus: response.status,
  result: payload,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(artifact, null, 2));
