import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { executeVerbChain, type DataRow, type VerbChain } from '../src/index';

const mlrBinary =
  process.env.MLR_BIN?.trim() ||
  (process.platform === 'win32'
    ? path.join(process.env.TEMP ?? '', 'csvshape-tools', 'bin', 'mlr.exe')
    : 'mlr');

const hasMlr =
  (process.platform !== 'win32' || existsSync(mlrBinary)) &&
  spawnSync(mlrBinary, ['--version'], {
    encoding: 'utf8',
    shell: false,
    timeout: 2_000,
    windowsHide: true,
  }).status === 0;

const describeIfMlr = hasMlr ? describe : describe.skip;

interface FixtureFile {
  name: string;
  text: string;
}

type AliasMap = Record<string, string>;

function splitLines(text: string): string[] {
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

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return String(Number(text));
  }

  return text;
}

function normalizeRows(rows: DataRow[], aliasMap: AliasMap = {}): Array<Record<string, string>> {
  const normalized = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [aliasMap[key] ?? key, normalizeValue(value)]),
    ),
  );
  const columns = Array.from(
    normalized.reduce((seen, row) => {
      Object.keys(row).forEach((key) => seen.add(key));
      return seen;
    }, new Set<string>()),
  );

  return normalized.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? ''])),
  );
}

function parseCsv(text: string, aliasMap: AliasMap = {}): Array<Record<string, string>> {
  const lines = splitLines(text);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitDelimitedRow(lines[0], ',');

  return lines.slice(1).map((line) => {
    const cells = splitDelimitedRow(line, ',');
    return Object.fromEntries(
      headers.map((header, index) => [aliasMap[header] ?? header, normalizeValue(cells[index] ?? '')]),
    );
  });
}

function parseJson(text: string, aliasMap: AliasMap = {}): Array<Record<string, string>> {
  const parsed = JSON.parse(text) as DataRow[];
  return normalizeRows(parsed, aliasMap);
}

async function runMlr(
  args: string[],
  files: FixtureFile[],
  aliasMap: AliasMap = {},
  inputFormat: 'csv' | 'json' = 'csv',
  outputFormat: 'csv' | 'json' = 'csv',
  appendStagedFiles = true,
): Promise<Array<Record<string, string>>> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'csvshape-mlr-parity-'));

  try {
    const filePaths: string[] = [];
    const pathByName = new Map<string, string>();

    for (const [index, file] of files.entries()) {
      const filePath = path.join(tempDir, `${index}-${file.name}`);
      await writeFile(filePath, file.text, 'utf8');
      filePaths.push(filePath);
      pathByName.set(file.name, filePath);
    }

    const resolvedArgs = args.map((arg) => pathByName.get(arg) ?? arg);

    const result = spawnSync(
      mlrBinary,
      [
        inputFormat === 'json' ? '--ijson' : '--csv',
        outputFormat === 'json' ? '--ojson' : '--ocsv',
        ...resolvedArgs,
        ...(appendStagedFiles ? filePaths : []),
      ],
      {
      encoding: 'utf8',
      shell: false,
      timeout: 10_000,
      windowsHide: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `mlr exited with code ${result.status ?? 'null'}`);
    }

    return outputFormat === 'json'
      ? parseJson(result.stdout, aliasMap)
      : normalizeRows(parseCsv(result.stdout, aliasMap));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

describeIfMlr('Miller reference parity', () => {
  const ordersCsv = [
    'order_id,user_id,category,total,status',
    '1001,u1,books,42.5,paid',
    '1002,u2,electronics,129.99,paid',
    '1003,u3,home,77.1,refunded',
    '',
  ].join('\n');
  const moreOrdersCsv = [
    'order_id,user_id,category,total,status',
    '1004,u2,books,14,paid',
    '1005,u1,home,11,paid',
    '',
  ].join('\n');

  it('matches Miller for cat', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'cat', opts: { inputs: 'more-orders.csv' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [
        { name: 'orders.csv', format: 'csv', text: ordersCsv },
        { name: 'more-orders.csv', format: 'csv', text: moreOrdersCsv },
      ]).rows,
    );
    const expected = await runMlr(['cat'], [
      { name: 'orders.csv', text: ordersCsv },
      { name: 'more-orders.csv', text: moreOrdersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for filter', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'filter', opts: { expression: '$status == "paid"' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(['filter', '$status == "paid"'], [
      { name: 'orders.csv', text: ordersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for put', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'put', opts: { statement: '$gross = $total * 2' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(['put', '$gross = $total * 2'], [
      { name: 'orders.csv', text: ordersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for cut', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'cut', opts: { fields: 'order_id,total' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(['cut', '-f', 'order_id,total'], [
      { name: 'orders.csv', text: ordersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for join', async () => {
    const usersCsv = ['user_id,team', 'u1,alpha', 'u2,beta', ''].join('\n');
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'join', opts: { rightSource: 'users.csv', leftKey: 'user_id', rightKey: 'user_id' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [
        { name: 'orders.csv', format: 'csv', text: ordersCsv },
        { name: 'users.csv', format: 'csv', text: usersCsv },
      ]).rows,
    );
    const expected = await runMlr(
      ['join', '-f', 'orders.csv', '-j', 'user_id', '--ul', 'users.csv'],
      [
        { name: 'orders.csv', text: ordersCsv },
        { name: 'users.csv', text: usersCsv },
      ],
      {},
      'csv',
      'json',
      false,
    );

    expect(actual).toEqual(expected);
  });

  it('matches Miller for sort', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'sort', opts: { fields: '-total' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(['sort', '-nr', 'total'], [
      { name: 'orders.csv', text: ordersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for stats1', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'stats1', opts: { spec: 'sum,total;count,total then group-by category' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(
      ['stats1', '-a', 'sum,count', '-f', 'total', '-g', 'category'],
      [{ name: 'orders.csv', text: ordersCsv }],
      { total_count: 'count_total', total_sum: 'sum_total' },
      'csv',
    );

    expect(actual).toEqual(expected);
  });

  it('matches Miller for stats2', async () => {
    const pairsCsv = ['x,y,segment', '1,2,a', '2,4,a', '3,7,a', '4,8,b', '5,10,b', '6,13,b', ''].join('\n');
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'pairs.csv' }],
      verbs: [{ kind: 'stats2', opts: { spec: 'corr,x,y;cov,x,y then group-by segment' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'pairs.csv', format: 'csv', text: pairsCsv }]).rows,
    );
    const expected = await runMlr(
      ['stats2', '-a', 'corr,cov', '-f', 'x,y', '-g', 'segment'],
      [{ name: 'pairs.csv', text: pairsCsv }],
    );

    expect(actual).toEqual(expected);
  });

  it('matches Miller for reorder', async () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'reorder', opts: { fields: 'total,category' } }],
      output: { format: 'csv' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'orders.csv', format: 'csv', text: ordersCsv }]).rows,
    );
    const expected = await runMlr(['reorder', '-f', 'total,category'], [
      { name: 'orders.csv', text: ordersCsv },
    ]);

    expect(actual).toEqual(expected);
  });

  it('matches Miller for unsparsify', async () => {
    const sparseJsonl = '{"id":"1","value":10}\n{"id":"2","city":"Delhi"}\n{"id":"3"}\n';
    const chain: VerbChain = {
      input: [{ format: 'jsonl', ref: 'sparse.jsonl' }],
      verbs: [{ kind: 'unsparsify', opts: { fillWith: 'missing' } }],
      output: { format: 'jsonl' },
    };

    const actual = normalizeRows(
      executeVerbChain(chain, [{ name: 'sparse.jsonl', format: 'jsonl', text: sparseJsonl }]).rows,
    );
    const expected = await runMlr(
      ['unsparsify', '--fill-with', 'missing'],
      [{ name: 'sparse.jsonl', text: sparseJsonl }],
      {},
      'json',
      'json',
    );

    expect(actual).toEqual(expected);
  });
});
