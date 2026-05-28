import type { FileFormat } from './index';

export interface EncodingDetection {
  encoding: string;
  confidence: number;
  bom: 'utf-8' | 'utf-16le' | 'utf-16be' | null;
}

export interface DialectDetection {
  delimiter: ',' | '\t' | ';' | '|';
  quote: '"' | "'" | 'none';
  escape: '"' | '\\' | 'none';
  lineEnding: 'lf' | 'crlf' | 'cr';
  hasHeader: boolean;
  columnCount: number;
}

export interface PreviewTable {
  columns: string[];
  rows: Record<string, string>[];
}

export interface InputInspection {
  format: FileFormat;
  encoding: EncodingDetection;
  dialect: DialectDetection | null;
  preview: PreviewTable;
  warnings: string[];
}

const DELIMITERS = [',', '\t', ';', '|'] as const;

function normalizeEncoding(value: string | undefined): string {
  const encoding = (value ?? 'utf-8').toLowerCase();

  if (encoding === 'ascii') {
    return 'utf-8';
  }

  if (encoding === 'utf16le') {
    return 'utf-16le';
  }

  if (encoding === 'utf16be') {
    return 'utf-16be';
  }

  return encoding;
}

export function detectEncoding(bytes: Uint8Array): EncodingDetection {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', confidence: 1, bom: 'utf-8' };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', confidence: 1, bom: 'utf-16le' };
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', confidence: 1, bom: 'utf-16be' };
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, 32768));
  const evenZeros = sample.filter((_, index) => index % 2 === 0 && sample[index] === 0x00).length;
  const oddZeros = sample.filter((_, index) => index % 2 === 1 && sample[index] === 0x00).length;

  if (oddZeros > sample.length * 0.2) {
    return { encoding: 'utf-16le', confidence: 0.8, bom: null };
  }

  if (evenZeros > sample.length * 0.2) {
    return { encoding: 'utf-16be', confidence: 0.8, bom: null };
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);

    return {
      encoding: 'utf-8',
      confidence: 0.9,
      bom: null,
    };
  } catch {
    return {
      encoding: normalizeEncoding('windows-1252'),
      confidence: 0.6,
      bom: null,
    };
  }
}

export function decodeInput(bytes: Uint8Array, detection: EncodingDetection): string {
  try {
    return new TextDecoder(detection.encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function detectLineEnding(text: string): DialectDetection['lineEnding'] {
  if (text.includes('\r\n')) {
    return 'crlf';
  }

  if (text.includes('\r')) {
    return 'cr';
  }

  return 'lf';
}

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

function inferHeader(rows: string[][]): boolean {
  if (rows.length < 2) {
    return true;
  }

  const firstRow = rows[0];
  const secondRow = rows[1];

  const firstLooksNumeric = firstRow.filter((value) => /^-?\d+(\.\d+)?$/.test(value.trim())).length;
  const secondLooksNumeric = secondRow.filter((value) => /^-?\d+(\.\d+)?$/.test(value.trim())).length;

  if (firstLooksNumeric !== secondLooksNumeric) {
    return firstLooksNumeric < secondLooksNumeric;
  }

  const headerish = /^[A-Za-z_][\w .-]*$/;
  const firstLooksHeaderish =
    new Set(firstRow.map((value) => value.trim())).size === firstRow.length &&
    firstRow.every((value) => headerish.test(value.trim()));
  const secondLooksDataish = secondRow.some(
    (value) => /\d/.test(value.trim()) || !headerish.test(value.trim()),
  );

  return firstLooksHeaderish && secondLooksDataish;
}

export function sniffDialect(text: string): DialectDetection {
  const lines = splitLines(text).slice(0, 20);
  const lineEnding = detectLineEnding(text);

  const ranked = DELIMITERS.map((delimiter) => {
    const widths = lines.map((line) => splitDelimitedRow(line, delimiter).length);
    const columnCount = Math.max(...widths, 1);
    const spread = Math.max(...widths) - Math.min(...widths);
    return { delimiter, columnCount, spread };
  }).sort((left, right) => {
    if (left.spread !== right.spread) {
      return left.spread - right.spread;
    }

    return right.columnCount - left.columnCount;
  });

  const winner = ranked[0];
  const rows = lines.map((line) => splitDelimitedRow(line, winner.delimiter));
  const quoteCount = lines.reduce((total, line) => total + (line.match(/"/g)?.length ?? 0), 0);
  const apostropheCount = lines.reduce((total, line) => total + (line.match(/'/g)?.length ?? 0), 0);
  const quote = quoteCount >= apostropheCount && quoteCount > 0 ? '"' : apostropheCount > 0 ? "'" : 'none';
  const escape =
    quote === '"'
      ? lines.some((line) => line.includes('""'))
        ? '"'
        : lines.some((line) => line.includes('\\"'))
          ? '\\'
          : 'none'
      : 'none';

  return {
    delimiter: winner.delimiter,
    quote,
    escape,
    lineEnding,
    hasHeader: inferHeader(rows),
    columnCount: winner.columnCount,
  };
}

export function buildDelimitedPreview(
  text: string,
  dialect: DialectDetection,
  maxRows = 25,
): PreviewTable {
  const lines = splitLines(text);
  const rowCells = lines.map((line) => splitDelimitedRow(line, dialect.delimiter));
  const headers = dialect.hasHeader
    ? rowCells[0]
    : Array.from({ length: dialect.columnCount }, (_, index) => `column_${index + 1}`);
  const dataRows = (dialect.hasHeader ? rowCells.slice(1) : rowCells).slice(0, maxRows);

  return {
    columns: headers,
    rows: dataRows.map((cells) =>
      headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = cells[index] ?? '';
        return row;
      }, {}),
    ),
  };
}

export function buildJsonLinesPreview(text: string, maxRows = 25): PreviewTable {
  const rows = splitLines(text)
    .slice(0, maxRows)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return {
    columns,
    rows: rows.map((row) =>
      columns.reduce<Record<string, string>>((accumulator, column) => {
        const value = row[column];
        accumulator[column] =
          value === null || value === undefined
            ? ''
            : typeof value === 'string'
              ? value
              : JSON.stringify(value);
        return accumulator;
      }, {}),
    ),
  };
}

export function inspectInput(bytes: Uint8Array, format: FileFormat): InputInspection {
  const encoding = detectEncoding(bytes);
  const text = decodeInput(bytes, encoding);
  const warnings: string[] = [];

  if (encoding.encoding !== 'utf-8') {
    warnings.push(`Normalised ${encoding.encoding} input to UTF-8 for preview.`);
  }

  if (format === 'jsonl' || format === 'ndjson') {
    return {
      format,
      encoding,
      dialect: null,
      preview: buildJsonLinesPreview(text),
      warnings,
    };
  }

  const dialect = sniffDialect(text);

  return {
    format,
    encoding,
    dialect,
    preview: buildDelimitedPreview(text, dialect),
    warnings,
  };
}
