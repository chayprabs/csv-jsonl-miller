import type {
  DialectDetection,
  FileFormat,
  Verb,
  VerbChain,
} from '@csvshape/core';

export interface DuckDbPlanSource {
  dialect?: DialectDetection | null;
  format: FileFormat;
  name: string;
  text: string;
}

export interface DuckDbQueryPlan {
  primarySourceName: string;
  reason?: string;
  registeredSources: Array<{
    dialect?: DialectDetection | null;
    fileName: string;
    format: FileFormat;
    sourceName: string;
    tableName: string;
    text: string;
  }>;
  sql: string;
  supported: boolean;
}

function parseFieldsSpec(value: string): string[] {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeStringLiterals(expression: string): string {
  return expression.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_, value: string) => {
    return `'${escapeSqlLiteral(value.replace(/\\"/g, '"'))}'`;
  });
}

function compileScalarExpression(expression: string): string {
  return normalizeStringLiterals(expression)
    .replace(/\band\b/gi, 'AND')
    .replace(/\bor\b/gi, 'OR')
    .replace(/!=/g, '<>')
    .replace(/==/g, '=')
    .replace(/\$([A-Za-z_][\w.]*)/g, (_, field: string) => quoteIdentifier(field));
}

function getStepText(step: Verb, key: string): string {
  const optionValue = step.opts[key];

  if (typeof optionValue === 'string' && optionValue.trim()) {
    return optionValue;
  }

  return typeof step.rawExpression === 'string' ? step.rawExpression : '';
}

function compileCatStep(currentSql: string, step: Verb, tableMap: Map<string, string>): string | null {
  const inputNames = parseFieldsSpec(getStepText(step, 'inputs'));

  if (inputNames.length === 0) {
    return currentSql;
  }

  const tableRefs = inputNames
    .map((name) => tableMap.get(name))
    .filter((value): value is string => Boolean(value));

  if (tableRefs.length !== inputNames.length) {
    return null;
  }

  return [
    `SELECT * FROM (${currentSql})`,
    ...tableRefs.map((tableName) => `SELECT * FROM ${tableName}`),
  ].join(' UNION ALL BY NAME ');
}

function compileFilterStep(currentSql: string, step: Verb): string {
  return `SELECT * FROM (${currentSql}) AS current_stream WHERE ${compileScalarExpression(
    getStepText(step, 'expression'),
  )}`;
}

function compilePutStep(currentSql: string, step: Verb): string | null {
  const assignments = getStepText(step, 'statement')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\$?([A-Za-z_][\w.]*)\s*=\s*(.+)$/);

      if (!match) {
        return null;
      }

      return {
        expression: compileScalarExpression(match[2]),
        field: match[1],
      };
    });

  if (assignments.some((entry) => entry === null)) {
    return null;
  }

  let nextSql = currentSql;

  for (const assignment of assignments) {
    if (!assignment) {
      continue;
    }

    nextSql = `SELECT current_stream.* EXCLUDE (${quoteIdentifier(
      assignment.field,
    )}), ${assignment.expression} AS ${quoteIdentifier(assignment.field)} FROM (${nextSql}) AS current_stream`;
  }

  return nextSql;
}

function compileCutStep(currentSql: string, step: Verb): string {
  const fields = parseFieldsSpec(getStepText(step, 'fields'));

  return `SELECT ${fields.map((field) => quoteIdentifier(field)).join(', ')} FROM (${currentSql}) AS current_stream`;
}

function compileJoinStep(currentSql: string, step: Verb, tableMap: Map<string, string>): string | null {
  const rightSource = String(step.opts.rightSource ?? '').trim();
  const leftKey = String(step.opts.leftKey ?? '').trim();
  const rightKey = String(step.opts.rightKey ?? '').trim();
  const rightTable = tableMap.get(rightSource);

  if (!rightTable || !leftKey || !rightKey) {
    return null;
  }

  return `SELECT current_stream.*, joined_stream.* EXCLUDE (${quoteIdentifier(
    rightKey,
  )}) FROM (${currentSql}) AS current_stream LEFT JOIN ${rightTable} AS joined_stream ON current_stream.${quoteIdentifier(
    leftKey,
  )} = joined_stream.${quoteIdentifier(rightKey)}`;
}

function compileSortStep(currentSql: string, step: Verb): string {
  const sortFields = parseFieldsSpec(getStepText(step, 'fields')).map((field) => ({
    descending: field.startsWith('-'),
    field: field.startsWith('-') ? field.slice(1) : field,
  }));

  return `SELECT * FROM (${currentSql}) AS current_stream ORDER BY ${sortFields
    .map((field) => `${quoteIdentifier(field.field)} ${field.descending ? 'DESC' : 'ASC'}`)
    .join(', ')}`;
}

function compileAggregate(fn: string, field: string): string | null {
  switch (fn) {
    case 'sum':
      return `sum(${quoteIdentifier(field)})`;
    case 'mean':
      return `avg(${quoteIdentifier(field)})`;
    case 'count':
      return field === '*' ? 'count(*)' : `count(${quoteIdentifier(field)})`;
    case 'p95':
      return `quantile_cont(${quoteIdentifier(field)}, 0.95)`;
    case 'distinct':
      return `count(DISTINCT ${quoteIdentifier(field)})`;
    default:
      return null;
  }
}

function compileStatsStep(currentSql: string, step: Verb): string | null {
  const spec = getStepText(step, 'spec');
  const [aggregationPart, groupByPart] = spec.split(/\s+then\s+group-by\s+/i);
  const aggregations = aggregationPart
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [fn, field] = part.split(',').map((token) => token.trim());
      return { fn, field };
    });
  const groupByFields = groupByPart ? parseFieldsSpec(groupByPart) : [];
  const selectClauses = [
    ...groupByFields.map((field) => quoteIdentifier(field)),
    ...aggregations.map((aggregation) => {
      const compiled = compileAggregate(aggregation.fn, aggregation.field);

      if (!compiled) {
        return null;
      }

      return `${compiled} AS ${quoteIdentifier(`${aggregation.fn}_${aggregation.field}`)}`;
    }),
  ];

  if (selectClauses.some((clause) => clause === null)) {
    return null;
  }

  const groupBySql = groupByFields.length
    ? ` GROUP BY ${groupByFields.map((field) => quoteIdentifier(field)).join(', ')}`
    : '';

  return `SELECT ${(selectClauses as string[]).join(', ')} FROM (${currentSql}) AS current_stream${groupBySql}`;
}

function compileReorderStep(currentSql: string, step: Verb): string {
  const fields = parseFieldsSpec(getStepText(step, 'fields'));
  const excludes = fields.map((field) => quoteIdentifier(field)).join(', ');

  return `SELECT ${fields.map((field) => quoteIdentifier(field)).join(', ')}, * EXCLUDE (${excludes}) FROM (${currentSql}) AS current_stream`;
}

function compileStep(currentSql: string, step: Verb, tableMap: Map<string, string>): string | null {
  if (step.rawExpression?.trim()) {
    return null;
  }

  switch (step.kind) {
    case 'cat':
      return compileCatStep(currentSql, step, tableMap);
    case 'filter':
      return compileFilterStep(currentSql, step);
    case 'put':
      return compilePutStep(currentSql, step);
    case 'cut':
      return compileCutStep(currentSql, step);
    case 'join':
      return compileJoinStep(currentSql, step, tableMap);
    case 'sort':
      return compileSortStep(currentSql, step);
    case 'stats1':
    case 'stats2':
      return compileStatsStep(currentSql, step);
    case 'reorder':
      return compileReorderStep(currentSql, step);
    default:
      return null;
  }
}

function outputExtension(format: FileFormat): string {
  switch (format) {
    case 'jsonl':
    case 'ndjson':
      return 'jsonl';
    default:
      return format;
  }
}

export function buildReadExpression(
  source: Pick<DuckDbPlanSource, 'dialect' | 'format'>,
  fileName: string,
): string {
  const quotedFile = `'${escapeSqlLiteral(fileName)}'`;

  switch (source.format) {
    case 'csv':
    case 'tsv': {
      const delimiter =
        source.format === 'tsv' ? '\t' : source.dialect?.delimiter ?? ',';
      const quote = source.dialect?.quote ?? '"';
      const escape = source.dialect?.escape ?? quote;
      const header = source.dialect?.hasHeader ?? true;

      return `read_csv_auto(${quotedFile}, delim='${escapeSqlLiteral(
        delimiter,
      )}', quote='${escapeSqlLiteral(quote)}', escape='${escapeSqlLiteral(
        escape,
      )}', header=${header ? 'true' : 'false'})`;
    }
    case 'jsonl':
    case 'ndjson':
      return `read_ndjson_auto(${quotedFile})`;
    case 'parquet':
      return `read_parquet(${quotedFile})`;
    default:
      return `read_csv_auto(${quotedFile})`;
  }
}

export function buildDuckDbQueryPlan(
  chain: VerbChain,
  sources: DuckDbPlanSource[],
): DuckDbQueryPlan {
  const primarySourceName = chain.input[0]?.ref ?? sources[0]?.name ?? '';
  const primaryIndex = sources.findIndex((source) => source.name === primarySourceName);

  if (primaryIndex < 0) {
    return {
      primarySourceName,
      registeredSources: [],
      reason: 'Selected source was not available for DuckDB-WASM execution.',
      sql: '',
      supported: false,
    };
  }

  const registeredSources = sources.map((source, index) => ({
    dialect: source.dialect ?? null,
    fileName: `csvshape-source-${index}.${outputExtension(source.format)}`,
    format: source.format,
    sourceName: source.name,
    tableName: `input_${index}`,
    text: source.text,
  }));
  const tableMap = new Map(
    registeredSources.map((source) => [source.sourceName, source.tableName]),
  );

  let currentSql = `SELECT * FROM ${registeredSources[primaryIndex].tableName}`;

  for (const step of chain.verbs) {
    const nextSql = compileStep(currentSql, step, tableMap);

    if (!nextSql) {
      return {
        primarySourceName,
        registeredSources,
        reason: `Verb ${step.kind} is currently using the TypeScript fallback path.`,
        sql: '',
        supported: false,
      };
    }

    currentSql = nextSql;
  }

  return {
    primarySourceName,
    registeredSources,
    sql: currentSql,
    supported: true,
  };
}
