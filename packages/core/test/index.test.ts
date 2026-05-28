import { describe, expect, it } from 'vitest';

import { detectEncoding, inspectInput, SAMPLE_SPECS, sniffDialect } from '../src/index';

describe('sample registry', () => {
  it('exposes the acceptance fixture samples', () => {
    expect(SAMPLE_SPECS).toHaveLength(3);
    expect(SAMPLE_SPECS.map((sample) => sample.id)).toEqual([
      'ecommerce-events',
      'access-log',
      'wide-sales',
    ]);
  });

  it('sniffs comma-separated files with headers', () => {
    const dialect = sniffDialect('name,age\nAsha,30\nRavi,28\n');

    expect(dialect).toMatchObject({
      delimiter: ',',
      hasHeader: true,
      columnCount: 2,
      lineEnding: 'lf',
    });
  });

  it('detects BOM-based UTF-16LE content', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);

    expect(detectEncoding(bytes)).toMatchObject({
      encoding: 'utf-16le',
      bom: 'utf-16le',
    });
  });

  it('builds previews for jsonl rows', () => {
    const inspection = inspectInput(
      new TextEncoder().encode('{"user":"u1","status":200}\n{"user":"u2","status":500}\n'),
      'jsonl',
    );

    expect(inspection.preview.columns).toEqual(['user', 'status']);
    expect(inspection.preview.rows[1]).toEqual({
      user: 'u2',
      status: '500',
    });
  });
});
