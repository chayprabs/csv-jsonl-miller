import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

function waitForPort(port, timeoutMs) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();

        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }

        setTimeout(tryConnect, 500);
      });
    };

    tryConnect();
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
            shell: false,
            stdio: 'inherit',
            windowsHide: true,
            ...options,
          })
        : spawn(command, args, {
            shell: false,
            stdio: 'inherit',
            ...options,
          });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

const repoRoot = process.cwd();
const reportPath = path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'lighthouse.json');
const summaryPath = path.resolve(repoRoot, 'docs', 'qc', 'benchmarks', 'lighthouse-summary.json');
const chromeProfileDir = path.resolve(repoRoot, 'docs', 'qc', '.tmp', 'lighthouse-profile');
const edgeCandidates = [
  process.env.CSVSHAPE_EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const edgeExecutable = edgeCandidates.find((candidate) => existsSync(candidate));

if (!edgeExecutable) {
  throw new Error('Microsoft Edge executable was not found for Lighthouse.');
}

await runCommand('pnpm', ['build']);

const server =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @csvshape/web exec vite preview --host 127.0.0.1 --port 4174'], {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      })
    : spawn(
        'pnpm',
        ['--filter', '@csvshape/web', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '4174'],
        {
          shell: false,
          stdio: 'ignore',
        },
      );

try {
  await waitForPort(4174, 60_000);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await rm(chromeProfileDir, { force: true, recursive: true });
  await mkdir(chromeProfileDir, { recursive: true });
  try {
    await runCommand('pnpm', [
      'exec',
      'lighthouse',
      'http://127.0.0.1:4174',
      '--chrome-path',
      edgeExecutable,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      '--output-path',
      reportPath,
      '--chrome-flags',
      `--headless=new --user-data-dir=${chromeProfileDir}`,
      '--quiet',
    ]);
  } catch (error) {
    if (!existsSync(reportPath)) {
      throw error;
    }
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const summary = {
    accessibility: report.categories.accessibility.score * 100,
    bestPractices: report.categories['best-practices'].score * 100,
    performance: report.categories.performance.score * 100,
    seo: report.categories.seo.score * 100,
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  server.kill('SIGTERM');
}
