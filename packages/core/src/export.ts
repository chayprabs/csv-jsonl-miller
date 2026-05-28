import type { DataRow, DataValue } from './execution';
import type { FileFormat, VerbChain } from './index';

function collectColumns(rows: DataRow[]): string[] {
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      seen.add(key);
    }
  }

  return Array.from(seen);
}

function toCell(value: DataValue): string {
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

function quoteDelimited(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function serializeDelimited(rows: DataRow[], delimiter: ',' | '\t'): string {
  const columns = collectColumns(rows);
  const lines = [
    columns.join(delimiter),
    ...rows.map((row) =>
      columns.map((column) => quoteDelimited(toCell(row[column] ?? ''), delimiter)).join(delimiter),
    ),
  ];

  return lines.join('\n');
}

function serializeJsonLines(rows: DataRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

function serializePseudoParquet(rows: DataRow[]): string {
  return JSON.stringify(
    {
      format: 'parquet-preview',
      columns: collectColumns(rows),
      rows,
    },
    null,
    2,
  );
}

export function serializeRows(rows: DataRow[], format: FileFormat): string {
  switch (format) {
    case 'csv':
      return serializeDelimited(rows, ',');
    case 'tsv':
      return serializeDelimited(rows, '\t');
    case 'jsonl':
    case 'ndjson':
      return serializeJsonLines(rows);
    case 'parquet':
      return serializePseudoParquet(rows);
    default:
      return serializeDelimited(rows, ',');
  }
}

function formatVerbOptions(opts: Record<string, unknown>): string {
  const entries = Object.entries(opts).filter(([, value]) => value !== undefined && value !== '');

  if (entries.length === 0) {
    return '{}';
  }

  return `{ ${entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`)
    .join(', ')} }`;
}

export function buildReplayableChainScript(chain: VerbChain): string {
  const lines = [
    '# CSVShape replayable chain script',
    `input ${chain.input.map((entry) => `${entry.ref}:${entry.format}`).join(', ')}`,
    ...chain.verbs.map((verb, index) => {
      const expression = verb.rawExpression ? ` raw=${JSON.stringify(verb.rawExpression)}` : '';
      return `${index + 1}. ${verb.kind} ${formatVerbOptions(verb.opts)}${expression}`;
    }),
    `output ${chain.output.format}`,
  ];

  return lines.join('\n');
}
