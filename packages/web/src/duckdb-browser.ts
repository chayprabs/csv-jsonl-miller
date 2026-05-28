import type {
  DataRow,
  DialectDetection,
  FileFormat,
  PreviewTable,
  VerbChain,
} from '@csvshape/core';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

import { buildDuckDbQueryPlan, buildReadExpression } from './duckdb-plan';

export interface DuckDbBrowserSource {
  dialect?: DialectDetection | null;
  format: FileFormat;
  name: string;
  text: string;
}

export interface DuckDbBrowserResult {
  columns: string[];
  planReason: string | null;
  preview: PreviewTable;
  rows: DataRow[];
  usingDuckDb: boolean;
  warnings: string[];
}

const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  eh: {
    mainModule: duckdbWasmEh,
    mainWorker: ehWorker,
  },
  mvp: {
    mainModule: duckdbWasmMvp,
    mainWorker: mvpWorker,
  },
};

let duckDbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function normalizeRow(row: Record<string, unknown>): DataRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : (value as DataRow[string]),
    ]),
  );
}

function previewFromRows(rows: DataRow[]): PreviewTable {
  const columns = Array.from(
    rows.reduce((seen, row) => {
      Object.keys(row).forEach((key) => seen.add(key));
      return seen;
    }, new Set<string>()),
  );

  return {
    columns,
    rows: rows.slice(0, 25).map((row) =>
      columns.reduce<Record<string, string>>((next, column) => {
        next[column] = toDisplayValue(row[column] ?? '');
        return next;
      }, {}),
    ),
  };
}

async function getDuckDb(): Promise<duckdb.AsyncDuckDB> {
  if (!duckDbPromise) {
    duckDbPromise = (async () => {
      const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);

      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      await db.open({
        path: ':memory:',
        query: {
          castBigIntToDouble: true,
          castDecimalToDouble: true,
        },
      });

      return db;
    })();
  }

  return duckDbPromise;
}

export async function runDuckDbPreview(
  chain: VerbChain,
  sources: DuckDbBrowserSource[],
  extraWarnings: string[] = [],
): Promise<DuckDbBrowserResult> {
  const plan = buildDuckDbQueryPlan(chain, sources);

  if (!plan.supported) {
    return {
      columns: [],
      planReason: plan.reason ?? null,
      preview: { columns: [], rows: [] },
      rows: [],
      usingDuckDb: false,
      warnings: extraWarnings,
    };
  }

  const db = await getDuckDb();
  const conn = await db.connect();

  try {
    for (const source of plan.registeredSources) {
      await db.registerFileText(source.fileName, source.text);
      await conn.query(
        `CREATE OR REPLACE TEMP TABLE ${source.tableName} AS SELECT * FROM ${buildReadExpression(
          source,
          source.fileName,
        )}`,
      );
    }

    const table = await conn.query(plan.sql);
    const rows = table
      .toArray()
      .map((row: { toJSON?: () => Record<string, unknown> }) =>
        normalizeRow(typeof row?.toJSON === 'function' ? row.toJSON() : (row as Record<string, unknown>)),
      );

    return {
      columns: previewFromRows(rows).columns,
      planReason: null,
      preview: previewFromRows(rows),
      rows,
      usingDuckDb: true,
      warnings: extraWarnings,
    };
  } finally {
    await conn.close();
    await db.dropFiles(plan.registeredSources.map((source) => source.fileName));
  }
}

export async function exportDuckDbParquet(
  chain: VerbChain,
  sources: DuckDbBrowserSource[],
): Promise<Uint8Array | null> {
  const plan = buildDuckDbQueryPlan(chain, sources);

  if (!plan.supported) {
    return null;
  }

  const db = await getDuckDb();
  const conn = await db.connect();
  const outputFile = `csvshape-output-${crypto.randomUUID()}.parquet`;

  try {
    for (const source of plan.registeredSources) {
      await db.registerFileText(source.fileName, source.text);
      await conn.query(
        `CREATE OR REPLACE TEMP TABLE ${source.tableName} AS SELECT * FROM ${buildReadExpression(
          source,
          source.fileName,
        )}`,
      );
    }

    await conn.query(`COPY (${plan.sql}) TO '${outputFile}' (FORMAT PARQUET)`);
    return await db.copyFileToBuffer(outputFile);
  } finally {
    await conn.close();
    await db.dropFiles([...plan.registeredSources.map((source) => source.fileName), outputFile]);
  }
}
