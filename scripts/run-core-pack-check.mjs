import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageDir = path.join(repoRoot, 'packages', 'core');
const outputPath = path.join(repoRoot, 'docs', 'qc', 'benchmarks', 'core-pack.json');

const packDir = await mkdtemp(path.join(os.tmpdir(), 'csvshape-core-pack-'));

try {
  const command =
    process.platform === 'win32'
      ? {
          file: 'cmd.exe',
          args: ['/d', '/s', '/c', `npm pack --json --pack-destination ${packDir}`],
        }
      : {
          file: 'npm',
          args: ['pack', '--json', '--pack-destination', packDir],
        };

  const { stdout, stderr } = await execFile(command.file, command.args, {
    cwd: packageDir,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  const payload = {
    checkedAt: new Date().toISOString(),
    package: '@csvshape/core',
    stderr: stderr.trim(),
    result: parsed,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(payload, null, 2));
} finally {
  await rm(packDir, { recursive: true, force: true });
}
