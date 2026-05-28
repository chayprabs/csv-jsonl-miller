import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as duckdb from '@duckdb/node-api';

type WorkerFileFormat = 'csv' | 'tsv' | 'jsonl' | 'ndjson' | 'parquet';

export interface NativeDuckDbFile {
  format: WorkerFileFormat;
  name: string;
  text: string;
}

export interface NativeDuckDbPlan {
  files: NativeDuckDbFile[];
  outputFormat?: WorkerFileFormat;
  previewLimit?: number;
  sql: string;
}

export interface NativeDuckDbArtifact {
  contentBase64?: string;
  contentText?: string;
  filename: string;
  format: WorkerFileFormat;
  sizeBytes: number;
}

export interface NativeDuckDbExecutionResult {
  artifact?: NativeDuckDbArtifact;
  columns: string[];
  preview: Array<Record<string, unknown>>;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
  tables: Array<{ sourceName: string; tableName: string }>;
}

export interface NativeEngineStatus {
  duckdbNative: boolean;
  mlrBinary: boolean;
}

const DEFAULT_PREVIEW_LIMIT = 25;

function probeMlrBinary(): boolean {
  const result = spawnSync('mlr', ['--version'], {
    encoding: 'utf8',
    shell: false,
    timeout: 250,
    windowsHide: true,
  });

  return result.status === 0;
}

export function getNativeEngineStatus(): NativeEngineStatus {
  return {
    duckdbNative: true,
    mlrBinary: probeMlrBinary(),
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function outputExtension(format: WorkerFileFormat): string {
  switch (format) {
    case 'jsonl':
    case 'ndjson':
      return 'jsonl';
    default:
      return format;
  }
}

function quoteDelimited(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }

  return value;
}

function inferInputPath(dir: string, index: number, file: NativeDuckDbFile): string {
  return path.join(dir, `input-${index}.${outputExtension(file.format)}`);
}

function sourceTableName(index: number): string {
  return `input${index}`;
}

function sourceScanExpression(filePath: string, format: WorkerFileFormat): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const quotedPath = `'${escapeSqlLiteral(normalizedPath)}'`;

  switch (format) {
    case 'csv':
      return `read_csv_auto(${quotedPath})`;
    case 'tsv':
      return `read_csv_auto(${quotedPath}, delim='\\t')`;
    case 'jsonl':
    case 'ndjson':
      return `read_ndjson_auto(${quotedPath})`;
    case 'parquet':
      return `read_parquet(${quotedPath})`;
    default:
      return `read_csv_auto(${quotedPath})`;
  }
}

function serializeDelimited(rows: Array<Record<string, unknown>>, delimiter: ',' | '\t'): string {
  const columns = Array.from(
    rows.reduce((seen, row) => {
      Object.keys(row).forEach((key) => seen.add(key));
      return seen;
    }, new Set<string>()),
  );

  const lines = [
    columns.join(delimiter),
    ...rows.map((row) =>
      columns
        .map((column) => quoteDelimited(String(row[column] ?? ''), delimiter))
        .join(delimiter),
    ),
  ];

  return lines.join('\n');
}

function serializeJsonLines(rows: Array<Record<string, unknown>>): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

async function buildArtifact(
  dir: string,
  outputFormat: WorkerFileFormat,
  sql: string,
  rows: Array<Record<string, unknown>>,
  conn: duckdb.DuckDBConnection,
): Promise<NativeDuckDbArtifact> {
  const filename = `csvshape-output.${outputExtension(outputFormat)}`;

  switch (outputFormat) {
    case 'csv': {
      const contentText = serializeDelimited(rows, ',');
      return {
        contentText,
        filename,
        format: outputFormat,
        sizeBytes: Buffer.byteLength(contentText),
      };
    }
    case 'tsv': {
      const contentText = serializeDelimited(rows, '\t');
      return {
        contentText,
        filename,
        format: outputFormat,
        sizeBytes: Buffer.byteLength(contentText),
      };
    }
    case 'jsonl':
    case 'ndjson': {
      const contentText = serializeJsonLines(rows);
      return {
        contentText,
        filename,
        format: outputFormat,
        sizeBytes: Buffer.byteLength(contentText),
      };
    }
    case 'parquet': {
      const outputPath = path.join(dir, filename).replace(/\\/g, '/');
      await conn.run(
        `COPY (${sql}) TO '${escapeSqlLiteral(outputPath)}' (FORMAT PARQUET)`,
      );
      const content = await readFile(path.join(dir, filename));
      const fileInfo = await stat(path.join(dir, filename));

      return {
        contentBase64: content.toString('base64'),
        filename,
        format: outputFormat,
        sizeBytes: fileInfo.size,
      };
    }
    default: {
      const contentText = serializeDelimited(rows, ',');
      return {
        contentText,
        filename,
        format: 'csv',
        sizeBytes: Buffer.byteLength(contentText),
      };
    }
  }
}

export async function executeNativeDuckDbPlan(
  plan: NativeDuckDbPlan,
): Promise<NativeDuckDbExecutionResult> {
  const previewLimit = plan.previewLimit ?? DEFAULT_PREVIEW_LIMIT;
  const tempDir = await mkdtemp(path.join(tmpdir(), 'csvshape-worker-'));

  try {
    const db = await duckdb.DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    const tables: Array<{ sourceName: string; tableName: string }> = [];

    for (const [index, file] of plan.files.entries()) {
      const filePath = inferInputPath(tempDir, index, file);
      const tableName = sourceTableName(index);
      await writeFile(filePath, file.text, 'utf8');
      await conn.run(
        `CREATE OR REPLACE TEMP TABLE ${tableName} AS SELECT * FROM ${sourceScanExpression(filePath, file.format)}`,
      );
      tables.push({
        sourceName: file.name,
        tableName,
      });
    }

    const result = await conn.runAndReadAll(plan.sql);
    const rows = result
      .getRowObjectsJS()
      .map((row) => normalizeValue(row) as Record<string, unknown>);
    const artifact = plan.outputFormat
      ? await buildArtifact(tempDir, plan.outputFormat, plan.sql, rows, conn)
      : undefined;

    return {
      artifact,
      columns: result.columnNames(),
      preview: rows.slice(0, previewLimit),
      rowCount: rows.length,
      rows,
      tables,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
