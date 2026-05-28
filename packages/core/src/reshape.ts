import type { DataRow, DataValue } from './execution';
import type { PreviewTable } from './input';

export interface ReshapeConfig {
  mode: 'none' | 'longer' | 'wider' | 'explode';
  fields?: string;
  namesTo?: string;
  valuesTo?: string;
  namesFrom?: string;
  valuesFrom?: string;
  groupBy?: string;
  field?: string;
}

export interface ReshapeResult {
  rows: DataRow[];
  preview: PreviewTable;
}

function parseFields(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
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

function toDisplayValue(value: DataValue): string {
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

function previewFromRows(rows: DataRow[]): PreviewTable {
  const columns = collectColumns(rows);

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

export function pivotLonger(
  rows: DataRow[],
  fields: string[],
  namesTo = 'name',
  valuesTo = 'value',
): DataRow[] {
  return rows.flatMap((row) => {
    const baseEntries = Object.entries(row).filter(([key]) => !fields.includes(key));
    const base = Object.fromEntries(baseEntries);

    return fields.map((field) => ({
      ...base,
      [namesTo]: field,
      [valuesTo]: row[field] ?? '',
    }));
  });
}

export function pivotWider(
  rows: DataRow[],
  namesFrom: string,
  valuesFrom: string,
  groupByFields: string[],
): DataRow[] {
  const groups = new Map<string, DataRow>();

  for (const row of rows) {
    const keyFields =
      groupByFields.length > 0
        ? groupByFields
        : Object.keys(row).filter((key) => key !== namesFrom && key !== valuesFrom);
    const groupKey = JSON.stringify(keyFields.map((field) => row[field] ?? ''));
    const existing = groups.get(groupKey) ?? {};

    for (const field of keyFields) {
      existing[field] = row[field] ?? '';
    }

    const wideColumn = String(row[namesFrom] ?? '');
    existing[wideColumn] = row[valuesFrom] ?? '';
    groups.set(groupKey, existing);
  }

  return Array.from(groups.values());
}

export function explodeField(rows: DataRow[], field: string): DataRow[] {
  return rows.flatMap((row) => {
    const value = row[field];

    if (Array.isArray(value)) {
      return value.map((item) => ({ ...row, [field]: item }));
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed) as DataValue[];
        return parsed.map((item) => ({ ...row, [field]: item }));
      }

      if (trimmed.includes(',')) {
        return trimmed.split(',').map((item) => ({ ...row, [field]: item.trim() }));
      }
    }

    return [row];
  });
}

export function applyReshape(rows: DataRow[], config: ReshapeConfig): ReshapeResult {
  let nextRows = rows;

  switch (config.mode) {
    case 'longer':
      nextRows = pivotLonger(
        rows,
        parseFields(config.fields),
        config.namesTo || 'name',
        config.valuesTo || 'value',
      );
      break;
    case 'wider':
      nextRows = pivotWider(
        rows,
        config.namesFrom || 'name',
        config.valuesFrom || 'value',
        parseFields(config.groupBy),
      );
      break;
    case 'explode':
      nextRows = explodeField(rows, config.field || '');
      break;
    case 'none':
    default:
      nextRows = rows;
      break;
  }

  return {
    rows: nextRows,
    preview: previewFromRows(nextRows),
  };
}
