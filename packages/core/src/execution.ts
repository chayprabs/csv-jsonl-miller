import type { DialectDetection, PreviewTable } from './input';
import { sniffDialect } from './input';
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
  const lines = splitLines(text);

  if (lines.length === 0) {
    return {
      columns: [],
      rows: [],
    };
  }

  const headerCells = splitDelimitedRow(lines[0], resolvedDialect.delimiter);
  const columns = resolvedDialect.hasHeader
    ? headerCells
    : Array.from({ length: resolvedDialect.columnCount }, (_, index) => `column_${index + 1}`);
  const startIndex = resolvedDialect.hasHeader ? 1 : 0;

  return {
    columns,
    rows: lines.slice(startIndex).map((line) => {
      const cells = splitDelimitedRow(line, resolvedDialect.delimiter);
      const row: DataRow = {};

      for (let index = 0; index < columns.length; index += 1) {
        row[columns[index]] = normalizeScalar(cells[index] ?? '');
      }

      return row;
    }),
  };
}

function parseComparisonValue(rawValue: string): DataValue {
  if (rawValue.startsWith('"')) {
    return JSON.parse(rawValue) as DataValue;
  }

  if (rawValue.startsWith("'")) {
    return rawValue.slice(1, -1).replace(/\\'/g, "'");
  }

  return normalizeScalar(rawValue);
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
  const trimmed = expression.trim();

  if (!trimmed) {
    return () => undefined;
  }

  const simpleComparison = trimmed.match(
    /^\$?([A-Za-z_][\w.]*)\s*(==|!=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null)\s*$/,
  );

  if (simpleComparison) {
    const [, field, operator, rawValue] = simpleComparison;
    const comparisonValue = parseComparisonValue(rawValue);

    return (row) =>
      operator === '=='
        ? row[field] === comparisonValue
        : row[field] !== comparisonValue;
  }

  const normalized = trimmed
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
  if (!expression.trim()) {
    return rows;
  }

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

interface ParsedAggregation {
  field: string;
  fn: string;
}

interface GroupAccumulator {
  distinct?: Set<string>;
  numbers?: number[];
  sampleRow: DataRow;
  valueCount: number;
  rowCount: number;
  sum: number;
}

function parseAggregationSpec(spec: string): { aggregations: ParsedAggregation[]; groupBy: string[] } {
  const [aggregationPart, groupByPart] = spec.split(/\s+then\s+group-by\s+/i);
  const aggregations = aggregationPart
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [fn, field] = part.split(',').map((token) => token.trim());
      return { fn, field };
    });

  return {
    aggregations,
    groupBy: groupByPart ? parseFieldsSpec(groupByPart) : [],
  };
}

function applyStats(rows: DataRow[], spec: string): DataRow[] {
  const { aggregations, groupBy } = parseAggregationSpec(spec);
  const groups = new Map<string, GroupAccumulator[]>();

  for (const row of rows) {
    const key = JSON.stringify(groupBy.map((field) => row[field] ?? ''));
    const groupAccumulators =
      groups.get(key) ??
      aggregations.map((aggregation) => ({
        distinct: aggregation.fn === 'distinct' ? new Set<string>() : undefined,
        numbers: aggregation.fn === 'p95' ? [] : undefined,
        sampleRow: row,
        sum: 0,
        valueCount: 0,
        rowCount: 0,
      }));

    for (let index = 0; index < aggregations.length; index += 1) {
      const aggregation = aggregations[index];
      const accumulator = groupAccumulators[index];
      const value = row[aggregation.field];

      accumulator.rowCount += 1;

      if (aggregation.fn === 'count' && aggregation.field === '*') {
        continue;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        continue;
      }

      accumulator.valueCount += 1;

      if (aggregation.fn === 'distinct' && accumulator.distinct) {
        accumulator.distinct.add(toDisplayValue(value));
        continue;
      }

      const numericValue = typeof value === 'number' ? value : Number(value);

      if (Number.isNaN(numericValue)) {
        continue;
      }

      accumulator.sum += numericValue;

      if (aggregation.fn === 'p95' && accumulator.numbers) {
        accumulator.numbers.push(numericValue);
      }
    }

    groups.set(key, groupAccumulators);
  }

  return Array.from(groups.values()).map((groupAccumulators) => {
    const next: DataRow = {};
    const sampleRow = groupAccumulators[0]?.sampleRow ?? {};

    for (const field of groupBy) {
      next[field] = sampleRow[field] ?? '';
    }

    for (let index = 0; index < aggregations.length; index += 1) {
      const aggregation = aggregations[index];
      const accumulator = groupAccumulators[index];
      const outputKey = `${aggregation.fn}_${aggregation.field}`;

      switch (aggregation.fn) {
        case 'sum':
          next[outputKey] = accumulator.sum;
          break;
        case 'mean':
          next[outputKey] = accumulator.valueCount
            ? accumulator.sum / accumulator.valueCount
            : 0;
          break;
        case 'count':
          next[outputKey] =
            aggregation.field === '*' ? accumulator.rowCount : accumulator.valueCount;
          break;
        case 'p95':
          next[outputKey] = percentile(accumulator.numbers ?? [], 0.95);
          break;
        case 'distinct':
          next[outputKey] = accumulator.distinct?.size ?? 0;
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
