import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

type WorkerFileFormat = 'csv' | 'tsv' | 'jsonl' | 'ndjson';

export interface NativeMlrFile {
  format: WorkerFileFormat;
  name: string;
  text: string;
}

export interface NativeMlrPlan {
  args: string[];
  files: NativeMlrFile[];
  outputFormat?: WorkerFileFormat;
  previewLimit?: number;
}

export interface NativeMlrArtifact {
  contentText: string;
  filename: string;
  format: WorkerFileFormat;
  sizeBytes: number;
}

export interface NativeMlrExecutionResult {
  artifact: NativeMlrArtifact;
  columns: string[];
  preview: Array<Record<string, unknown>>;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
}

const DEFAULT_PREVIEW_LIMIT = 25;

function outputExtension(format: WorkerFileFormat): string {
  return format === 'ndjson' ? 'jsonl' : format;
}

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
}

function splitDelimitedRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuote && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (!inQuote && char === delimiter) {
      cells.push(cell);
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function parseDelimitedText(text: string, delimiter: string): Array<Record<string, unknown>> {
  const lines = normalizeLines(text);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitDelimitedRow(lines[0], delimiter);

  return lines.slice(1).map((line) => {
    const cells = splitDelimitedRow(line, delimiter);
    const row: Record<string, unknown> = {};

    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = cells[index] ?? '';
    }

    return row;
  });
}

function parseOutput(text: string, format: WorkerFileFormat): Array<Record<string, unknown>> {
  if (format === 'jsonl' || format === 'ndjson') {
    return normalizeLines(text).map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  return parseDelimitedText(text, format === 'tsv' ? '\t' : ',');
}

function resolveMlrBinary(): string {
  return process.env.MLR_BIN?.trim() || 'mlr';
}

function quoteWindowsArg(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function inferInputPath(dir: string, index: number, file: NativeMlrFile): string {
  return path.join(dir, `input-${index}.${outputExtension(file.format)}`);
}

function inferArtifact(plan: NativeMlrPlan, outputText: string): NativeMlrArtifact {
  const format = plan.outputFormat ?? plan.files[0]?.format ?? 'csv';

  return {
    contentText: outputText,
    filename: `csvshape-output.${outputExtension(format)}`,
    format,
    sizeBytes: Buffer.byteLength(outputText),
  };
}

export async function executeNativeMlrPlan(
  plan: NativeMlrPlan,
): Promise<NativeMlrExecutionResult> {
  const previewLimit = plan.previewLimit ?? DEFAULT_PREVIEW_LIMIT;
  const tempDir = await mkdtemp(path.join(tmpdir(), 'csvshape-mlr-'));
  const inputPaths: string[] = [];

  try {
    for (const [index, file] of plan.files.entries()) {
      const filePath = inferInputPath(tempDir, index, file);
      await writeFile(filePath, file.text, 'utf8');
      inputPaths.push(filePath);
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      const binary = resolveMlrBinary();
      const commandArgs = [...plan.args, ...inputPaths];
      const child =
        process.platform === 'win32'
          ? spawn(
              'cmd.exe',
              [
                '/d',
                '/s',
                '/c',
                [quoteWindowsArg(binary), ...commandArgs.map(quoteWindowsArg)].join(' '),
              ],
              {
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
              },
            )
          : spawn(binary, commandArgs, {
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true,
            });

      let output = '';
      let error = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        error += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) {
          resolve(output);
          return;
        }

        reject(new Error(error.trim() || `mlr exited with code ${code ?? 'null'}`));
      });
    });

    const artifact = inferArtifact(plan, stdout);
    const rows = parseOutput(stdout, artifact.format);

    return {
      artifact,
      columns: Object.keys(rows[0] ?? {}),
      preview: rows.slice(0, previewLimit),
      rowCount: rows.length,
      rows,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
