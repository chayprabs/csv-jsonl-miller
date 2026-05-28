import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultOutput = path.join(repoRoot, 'docs', 'qc', 'benchmarks', 'browser-miller-wasm-probe.json');
const outputPath = process.env.CSVSHAPE_MLR_WASM_PROBE_OUT ?? defaultOutput;
const moduleDirPrefix = path.join(os.tmpdir(), 'csvshape-mlr-wasm-');

async function runCommand(command, args, options = {}) {
  try {
    const result = await execFile(command, args, {
      ...options,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });
    return { ok: true, code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      code: error.code ?? 1,
      stdout: typeof error.stdout === 'string' ? error.stdout.trim() : '',
      stderr: typeof error.stderr === 'string' ? error.stderr.trim() : error.message
    };
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const scratchDir = await mkdtemp(moduleDirPrefix);
  const wasmPath = path.join(scratchDir, 'mlr.wasm');
  const result = {
    startedAt,
    probe: 'browser-miller-wasm',
    supported: false,
    command: 'go build',
    target: 'github.com/johnkerl/miller/v6/cmd/mlr',
    goos: 'js',
    goarch: 'wasm',
    scratchDir,
    wasmPath,
    goVersion: null,
    steps: [],
    failure: null,
    finishedAt: null
  };

  try {
    result.goVersion = await runCommand('go', ['version']);
    result.steps.push({
      name: 'go version',
      ok: result.goVersion.ok,
      code: result.goVersion.code,
      stdout: result.goVersion.stdout,
      stderr: result.goVersion.stderr
    });

    if (!result.goVersion.ok) {
      result.failure = 'go toolchain unavailable';
      return result;
    }

    const modInit = await runCommand('go', ['mod', 'init', 'mlrwasmprobe'], { cwd: scratchDir });
    result.steps.push({ name: 'go mod init', ...modInit });
    if (!modInit.ok) {
      result.failure = 'failed to initialize disposable Go module';
      return result;
    }

    const goGet = await runCommand('go', ['get', 'github.com/johnkerl/miller/v6/cmd/mlr'], { cwd: scratchDir });
    result.steps.push({ name: 'go get', ...goGet });
    if (!goGet.ok) {
      result.failure = 'failed to fetch Miller source';
      return result;
    }

    const build = await runCommand('go', ['build', '-o', wasmPath, 'github.com/johnkerl/miller/v6/cmd/mlr'], {
      cwd: scratchDir,
      env: {
        ...process.env,
        GOOS: 'js',
        GOARCH: 'wasm'
      }
    });
    result.steps.push({ name: 'go build', ...build });

    if (build.ok) {
      result.supported = true;
    } else {
      result.failure = build.stderr || build.stdout || 'go build failed';
    }

    return result;
  } finally {
    result.finishedAt = new Date().toISOString();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await rm(scratchDir, { recursive: true, force: true });
  }
}

const result = await main();
const summary = result.supported
  ? `Browser Miller-WASM probe passed; artifact written to ${outputPath}`
  : `Browser Miller-WASM probe failed as expected; artifact written to ${outputPath}`;

console.log(summary);
if (result.failure) {
  console.log(result.failure);
}
