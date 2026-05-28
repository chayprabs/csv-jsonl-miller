import type { DataRow } from './execution';
import type { PreviewTable } from './input';

export interface JsonQueryResult {
  rows: DataRow[];
  preview: PreviewTable;
  warnings: string[];
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
}

function collectColumns(rows: DataRow[]): string[] {
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      seen.add(key);
    }
  }

  return Array.from(seen);
}

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

function getPathValue(row: DataRow, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return (value as Record<string, unknown>)[segment];
  }, row);
}

function compilePredicate(source: string): (row: DataRow) => boolean {
  const normalized = source
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\.([A-Za-z_][\w.]*)/g, (_, path: string) => `get(${JSON.stringify(path)})`);

  const fn = new Function(
    'row',
    `
    const get = (path) => row && path ? ${getPathValue.toString()}(row, path) : undefined;
    return Boolean(${normalized});
  `,
  ) as (row: DataRow) => boolean;

  return fn;
}

function parseObjectProjection(source: string): Array<{ key: string; expression: string }> {
  return source
    .slice(1, -1)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const [left, right] = entry.split(':').map((part) => part.trim());
      return {
        key: left.replace(/^["']|["']$/g, ''),
        expression: right,
      };
    });
}

function evaluateProjection(row: DataRow, expression: string): unknown {
  if (expression === '.') {
    return row;
  }

  if (expression.startsWith('.')) {
    return getPathValue(row, expression.slice(1));
  }

  if (/^["'].*["']$/.test(expression)) {
    return expression.slice(1, -1);
  }

  if (/^-?\d+(\.\d+)?$/.test(expression)) {
    return Number(expression);
  }

  return expression;
}

function previewFromRows(rows: DataRow[]): PreviewTable {
  const columns = collectColumns(rows);

  return {
    columns,
    rows: rows.slice(0, 25).map((row) =>
      columns.reduce<Record<string, string>>((next, column) => {
        next[column] = toDisplayValue(row[column]);
        return next;
      }, {}),
    ),
  };
}

export function applyJsonQuery(text: string, query: string): JsonQueryResult {
  const rows = splitLines(text).map((line) => JSON.parse(line) as DataRow);
  const warnings: string[] = [];
  const operations = query
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  let current = rows;

  for (const operation of operations) {
    if (operation === '.') {
      continue;
    }

    if (operation.startsWith('select(') && operation.endsWith(')')) {
      const predicate = compilePredicate(operation.slice(7, -1));
      current = current.filter((row) => predicate(row));
      continue;
    }

    if (operation.startsWith('{') && operation.endsWith('}')) {
      const projection = parseObjectProjection(operation);
      current = current.map((row) =>
        projection.reduce<DataRow>((next, field) => {
          next[field.key] = evaluateProjection(row, field.expression) as DataRow[string];
          return next;
        }, {}),
      );
      continue;
    }

    if (operation.startsWith('.')) {
      current = current.map((row) => ({ value: evaluateProjection(row, operation) as DataRow[string] }));
      continue;
    }

    warnings.push(`Unsupported jq fragment skipped: ${operation}`);
  }

  return {
    rows: current,
    preview: previewFromRows(current),
    warnings,
  };
}
