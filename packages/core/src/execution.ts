import type { DialectDetection, PreviewTable } from './input';
import { buildDelimitedPreview, sniffDialect } from './input';
import type { FileFormat, Verb, VerbChain } from './index';

export type DataValue =
  | string
  | number
  | boolean
  | null
  | DataValue[]
  | { [key: string]: DataValue };

export type DataRow = Record<string, DataValue>;

export interface ChainSource {
  name: string;
  format: FileFormat;
  text: string;
  dialect?: DialectDetection | null;
}

export interface ExecutionResult {
  columns: string[];
  rows: DataRow[];
  preview: PreviewTable;
  warnings: string[];
}

interface DataSet {
  columns: string[];
  rows: DataRow[];
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

function normalizeScalar(value: string): DataValue {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
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

function parseDelimitedSource(text: string, dialect?: DialectDetection | null): DataSet {
  const resolvedDialect = dialect ?? sniffDialect(text);
  const preview = buildDelimitedPreview(text, resolvedDialect, Number.MAX_SAFE_INTEGER);

  return {
    columns: preview.columns,
    rows: preview.rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeScalar(value)])),
    ),
  };
}

function parseJsonLinesSource(text: string): DataSet {
  const rows = splitLines(text).map((line) => JSON.parse(line) as DataRow);

  return {
    columns: collectColumns(rows),
    rows,
  };
}

function parseSource(source: ChainSource): DataSet {
  if (source.format === 'jsonl' || source.format === 'ndjson') {
    return parseJsonLinesSource(source.text);
  }

  return parseDelimitedSource(source.text, source.dialect);
}

function compileExpression(expression: string): (row: DataRow) => unknown {
  const normalized = expression
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\$([A-Za-z_][\w.]*)/g, (_, field: string) => `get(${JSON.stringify(field)})`);

  const fn = new Function(
    'row',
    `
    const get = (field) => row[field];
    return (${normalized});
  `,
  ) as (row: DataRow) => unknown;

  return fn;
}

function applyFilter(rows: DataRow[], expression: string): DataRow[] {
  const predicate = compileExpression(expression);
  return rows.filter((row) => Boolean(predicate(row)));
}

function applyPut(rows: DataRow[], statement: string): DataRow[] {
  const assignments = statement
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\$?([A-Za-z_][\w.]*)\s*=\s*(.+)$/);

      if (!match) {
        return null;
      }

      return {
        field: match[1],
        evaluate: compileExpression(match[2]),
      };
    })
    .filter((entry): entry is { field: string; evaluate: (row: DataRow) => unknown } => Boolean(entry));

  return rows.map((row) => {
    const next = { ...row };

    for (const assignment of assignments) {
      next[assignment.field] = assignment.evaluate(next) as DataValue;
    }

    return next;
  });
}

function parseFieldsSpec(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function applyCut(rows: DataRow[], fieldsSpec: string): DataRow[] {
  const fields = parseFieldsSpec(fieldsSpec);

  return rows.map((row) =>
    fields.reduce<DataRow>((next, field) => {
      next[field] = row[field] ?? '';
      return next;
    }, {}),
  );
}

function applyJoin(
  rows: DataRow[],
  opts: Record<string, unknown>,
  sources: Map<string, DataSet>,
  warnings: string[],
): DataRow[] {
  const rightSourceName = String(opts.rightSource ?? '').trim();
  const leftKey = String(opts.leftKey ?? '').trim();
  const rightKey = String(opts.rightKey ?? '').trim();

  if (!rightSourceName || !leftKey || !rightKey) {
    warnings.push('Join skipped because right source or keys were missing.');
    return rows;
  }

  const right = sources.get(rightSourceName);

  if (!right) {
    warnings.push(`Join skipped because source "${rightSourceName}" was not loaded.`);
    return rows;
  }

  const index = new Map<string, DataRow[]>();

  for (const row of right.rows) {
    const key = toDisplayValue(row[rightKey] ?? '');
    const matches = index.get(key) ?? [];
    matches.push(row);
    index.set(key, matches);
  }

  return rows.flatMap((row) => {
    const matches = index.get(toDisplayValue(row[leftKey] ?? '')) ?? [];

    if (matches.length === 0) {
      return [row];
    }

    return matches.map((match) => {
      const next: DataRow = { ...row };

      for (const [key, value] of Object.entries(match)) {
        if (key === rightKey) {
          continue;
        }

        const outputKey = Object.prototype.hasOwnProperty.call(next, key)
          ? `${rightSourceName}.${key}`
          : key;
        next[outputKey] = value;
      }

      return next;
    });
  });
}

function applySort(rows: DataRow[], fieldsSpec: string): DataRow[] {
  const sorters = parseFieldsSpec(fieldsSpec).map((field) => ({
    field: field.startsWith('-') ? field.slice(1) : field,
    descending: field.startsWith('-'),
  }));

  return [...rows].sort((left, right) => {
    for (const sorter of sorters) {
      const leftValue = left[sorter.field];
      const rightValue = right[sorter.field];

      if (leftValue === rightValue) {
        continue;
      }

      const ordered =
        toDisplayValue(leftValue ?? '').localeCompare(toDisplayValue(rightValue ?? ''), undefined, {
          numeric: true,
        }) || 0;

      return sorter.descending ? -ordered : ordered;
    }

    return 0;
  });
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function applyStats(rows: DataRow[], spec: string): DataRow[] {
  const [aggregationPart, groupByPart] = spec.split(/\s+then\s+group-by\s+/i);
  const aggregations = aggregationPart
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [fn, field] = part.split(',').map((token) => token.trim());
      return { fn, field };
    });
  const groupBy = groupByPart ? parseFieldsSpec(groupByPart) : [];
  const groups = new Map<string, DataRow[]>();

  for (const row of rows) {
    const key = JSON.stringify(groupBy.map((field) => row[field] ?? ''));
    const matches = groups.get(key) ?? [];
    matches.push(row);
    groups.set(key, matches);
  }

  return Array.from(groups.values()).map((groupRows) => {
    const next: DataRow = {};

    for (const field of groupBy) {
      next[field] = groupRows[0]?.[field] ?? '';
    }

    for (const aggregation of aggregations) {
      const values = groupRows
        .map((row) => row[aggregation.field])
        .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number');
      const numbers = values
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => !Number.isNaN(value));
      const outputKey = `${aggregation.fn}_${aggregation.field}`;

      switch (aggregation.fn) {
        case 'sum':
          next[outputKey] = numbers.reduce((total, value) => total + value, 0);
          break;
        case 'mean':
          next[outputKey] = numbers.length
            ? numbers.reduce((total, value) => total + value, 0) / numbers.length
            : 0;
          break;
        case 'count':
          next[outputKey] = aggregation.field === '*' ? groupRows.length : values.length;
          break;
        case 'p95':
          next[outputKey] = percentile(numbers, 0.95);
          break;
        case 'distinct':
          next[outputKey] = new Set(values.map((value) => toDisplayValue(value))).size;
          break;
        default:
          next[outputKey] = '';
          break;
      }
    }

    return next;
  });
}

function applyReorder(rows: DataRow[], fieldsSpec: string): DataRow[] {
  const leadFields = parseFieldsSpec(fieldsSpec);

  return rows.map((row) => {
    const next: DataRow = {};

    for (const field of leadFields) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        next[field] = row[field];
      }
    }

    for (const [key, value] of Object.entries(row)) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        next[key] = value;
      }
    }

    return next;
  });
}

function applyUnsparsify(rows: DataRow[], fillWith: string): DataRow[] {
  const carryForward: DataRow = {};

  return rows.map((row) => {
    const next: DataRow = {};

    for (const key of collectColumns([carryForward, row])) {
      const value = row[key];

      if (value === '' || value === undefined || value === null) {
        next[key] = carryForward[key] ?? fillWith;
      } else {
        next[key] = value;
        carryForward[key] = value;
      }
    }

    return next;
  });
}

function applyNest(rows: DataRow[], into: string, fieldsSpec: string): DataRow[] {
  const fields = parseFieldsSpec(fieldsSpec);

  return rows.map((row) => {
    const nested: Record<string, DataValue> = {};
    const next: DataRow = {};

    for (const [key, value] of Object.entries(row)) {
      if (fields.includes(key)) {
        nested[key] = value;
      } else {
        next[key] = value;
      }
    }

    next[into] = nested;
    return next;
  });
}

function applyUnnest(rows: DataRow[], field: string): DataRow[] {
  return rows.map((row) => {
    const value = row[field];

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return row;
    }

    const next: DataRow = { ...row };
    delete next[field];

    for (const [key, nestedValue] of Object.entries(value)) {
      next[key] = nestedValue;
    }

    return next;
  });
}

function applyCat(rows: DataRow[], inputSpec: string, sources: Map<string, DataSet>): DataRow[] {
  const names = parseFieldsSpec(inputSpec);

  if (names.length === 0) {
    return rows;
  }

  const merged = [...rows];

  for (const name of names) {
    const source = sources.get(name);

    if (source) {
      merged.push(...source.rows);
    }
  }

  return merged;
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

function getStepText(step: Verb, key: string): string {
  const optionValue = step.opts[key];

  if (typeof optionValue === 'string' && optionValue.trim()) {
    return optionValue;
  }

  return typeof step.rawExpression === 'string' ? step.rawExpression : '';
}

export function executeVerbChain(chain: VerbChain, sources: ChainSource[]): ExecutionResult {
  const parsedSources = new Map<string, DataSet>();

  for (const source of sources) {
    parsedSources.set(source.name, parseSource(source));
  }

  const primarySourceName = chain.input[0]?.ref ?? sources[0]?.name ?? '';
  let current = parsedSources.get(primarySourceName) ?? { columns: [], rows: [] };
  const warnings: string[] = [];

  for (const step of chain.verbs) {
    switch (step.kind) {
      case 'cat':
        current = { columns: current.columns, rows: applyCat(current.rows, getStepText(step, 'inputs'), parsedSources) };
        break;
      case 'filter':
        current = { columns: current.columns, rows: applyFilter(current.rows, getStepText(step, 'expression')) };
        break;
      case 'put':
        current = { columns: current.columns, rows: applyPut(current.rows, getStepText(step, 'statement')) };
        break;
      case 'cut':
        current = { columns: current.columns, rows: applyCut(current.rows, getStepText(step, 'fields')) };
        break;
      case 'join':
        current = { columns: current.columns, rows: applyJoin(current.rows, step.opts, parsedSources, warnings) };
        break;
      case 'sort':
        current = { columns: current.columns, rows: applySort(current.rows, getStepText(step, 'fields')) };
        break;
      case 'stats1':
      case 'stats2':
        current = { columns: current.columns, rows: applyStats(current.rows, getStepText(step, 'spec')) };
        break;
      case 'reorder':
        current = { columns: current.columns, rows: applyReorder(current.rows, getStepText(step, 'fields')) };
        break;
      case 'unsparsify':
        current = {
          columns: current.columns,
          rows: applyUnsparsify(current.rows, String(step.opts.fillWith ?? '')),
        };
        break;
      case 'nest':
        current = {
          columns: current.columns,
          rows: applyNest(
            current.rows,
            String(step.opts.into ?? 'nested'),
            String(step.opts.fields ?? step.rawExpression ?? ''),
          ),
        };
        break;
      case 'unnest':
        current = {
          columns: current.columns,
          rows: applyUnnest(current.rows, String(step.opts.field ?? step.rawExpression ?? '')),
        };
        break;
      default:
        break;
    }
  }

  const columns = collectColumns(current.rows);
  const preview = previewFromRows(current.rows);

  return {
    columns,
    rows: current.rows,
    preview,
    warnings,
  };
}
