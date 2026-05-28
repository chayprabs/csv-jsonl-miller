import { describe, expect, it } from 'vitest';

import {
  detectEncoding,
  executeVerbChain,
  inspectInput,
  SAMPLE_SPECS,
  sniffDialect,
  type VerbChain,
} from '../src/index';

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

  it('executes filter, put, cut, and sort over CSV rows', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'events.csv' }],
      verbs: [
        { kind: 'filter', opts: { expression: '$status == "paid"' } },
        { kind: 'put', opts: { statement: '$gross = $total * 2' } },
        { kind: 'cut', opts: { fields: 'order_id,gross' } },
        { kind: 'sort', opts: { fields: '-gross' } },
      ],
      output: { format: 'csv' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'events.csv',
        format: 'csv',
        text: 'order_id,total,status\n1001,42.5,paid\n1002,7,refunded\n1003,12,paid\n',
      },
    ]);

    expect(result.preview.columns).toEqual(['order_id', 'gross']);
    expect(result.preview.rows).toEqual([
      { order_id: '1001', gross: '85' },
      { order_id: '1003', gross: '24' },
    ]);
  });

  it('executes joins and grouped stats across loaded sources', () => {
    const chain: VerbChain = {
      input: [{ format: 'jsonl', ref: 'logs.jsonl' }],
      verbs: [
        {
          kind: 'join',
          opts: { rightSource: 'users.csv', leftKey: 'user_id', rightKey: 'id' },
        },
        {
          kind: 'stats2',
          opts: { spec: 'count,*;p95,duration_ms then group-by plan' },
        },
      ],
      output: { format: 'jsonl' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'logs.jsonl',
        format: 'jsonl',
        text: '{"user_id":"u1","duration_ms":100}\n{"user_id":"u2","duration_ms":200}\n{"user_id":"u1","duration_ms":180}\n',
      },
      {
        name: 'users.csv',
        format: 'csv',
        text: 'id,plan\nu1,pro\nu2,free\n',
      },
    ]);

    expect(result.preview.columns).toEqual(['plan', 'count_*', 'p95_duration_ms']);
    expect(result.preview.rows).toEqual([
      { plan: 'pro', 'count_*': '2', p95_duration_ms: '180' },
      { plan: 'free', 'count_*': '1', p95_duration_ms: '200' },
    ]);
  });

  it('executes unsparsify, nest, and unnest', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'sparse.csv' }],
      verbs: [
        { kind: 'unsparsify', opts: { fillWith: 'carry' } },
        { kind: 'nest', opts: { into: 'payload', fields: 'value,city' } },
        { kind: 'unnest', opts: { field: 'payload' } },
      ],
      output: { format: 'csv' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'sparse.csv',
        format: 'csv',
        text: 'id,value,city\n1,10,\n2,,Delhi\n3,,\n',
      },
    ]);

    expect(result.preview.rows[1]).toEqual({
      id: '2',
      value: '10',
      city: 'Delhi',
    });
    expect(result.preview.rows[2]).toEqual({
      id: '3',
      value: '10',
      city: 'Delhi',
    });
  });
});
