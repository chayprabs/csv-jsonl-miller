import { describe, expect, it } from 'vitest';

import {
  applyJsonQuery,
  applyReshape,
  buildReplayableChainScript,
  decodeReplayState,
  detectEncoding,
  encodeReplayState,
  executeVerbChain,
  inspectInput,
  SAMPLE_SPECS,
  serializeRows,
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

  it('keeps the preview stable when a filter step has not been configured yet', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'events.csv' }],
      verbs: [{ kind: 'filter', opts: { expression: '' } }],
      output: { format: 'csv' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'events.csv',
        format: 'csv',
        text: 'order_id,total,status\n1001,42.5,paid\n1002,7,refunded\n',
      },
    ]);

    expect(result.preview.rows).toEqual([
      { order_id: '1001', total: '42.5', status: 'paid' },
      { order_id: '1002', total: '7', status: 'refunded' },
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

  it('executes Miller-style unsparsify, nest, and unnest', () => {
    const chain: VerbChain = {
      input: [{ format: 'jsonl', ref: 'sparse.jsonl' }],
      verbs: [
        { kind: 'unsparsify', opts: { fillWith: 'missing' } },
        { kind: 'nest', opts: { into: 'payload', fields: 'value,city' } },
        { kind: 'unnest', opts: { field: 'payload' } },
      ],
      output: { format: 'jsonl' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'sparse.jsonl',
        format: 'jsonl',
        text: '{"id":"1","value":10}\n{"id":"2","city":"Delhi"}\n{"id":"3"}\n',
      },
    ]);

    expect(result.preview.rows[0]).toEqual({
      id: '1',
      value: '10',
      city: 'missing',
    });
    expect(result.preview.rows[1]).toEqual({
      id: '2',
      value: 'missing',
      city: 'Delhi',
    });
    expect(result.preview.rows[2]).toEqual({
      id: '3',
      value: 'missing',
      city: 'missing',
    });
  });

  it('applies jq-style select and projection over jsonl rows', () => {
    const result = applyJsonQuery(
      '{"user":"u1","status":200,"latency":90}\n{"user":"u2","status":500,"latency":300}\n',
      'select(.status == 500) | {user:.user,ms:.latency}',
    );

    expect(result.preview.columns).toEqual(['user', 'ms']);
    expect(result.preview.rows).toEqual([{ user: 'u2', ms: '300' }]);
  });

  it('reshapes rows longer, wider, and explode', () => {
    const longer = applyReshape(
      [
        { region: 'north', jan: 120, feb: 140 },
        { region: 'south', jan: 98, feb: 111 },
      ],
      { mode: 'longer', fields: 'jan,feb', namesTo: 'month', valuesTo: 'sales' },
    );
    const wider = applyReshape(longer.rows, {
      mode: 'wider',
      namesFrom: 'month',
      valuesFrom: 'sales',
      groupBy: 'region',
    });
    const exploded = applyReshape(
      [{ id: '1', tags: 'auth,error' }],
      { mode: 'explode', field: 'tags' },
    );

    expect(longer.preview.rows[0]).toEqual({ region: 'north', month: 'jan', sales: '120' });
    expect(wider.preview.rows[1]).toEqual({ region: 'south', jan: '98', feb: '111' });
    expect(exploded.preview.rows).toEqual([{ id: '1', tags: 'auth' }, { id: '1', tags: 'error' }]);
  });

  it('serializes exports and replay state', () => {
    const rows = [{ order_id: 1001, status: 'paid' }];
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [{ kind: 'cut', opts: { fields: 'order_id,status' } }],
      output: { format: 'csv' },
    };
    const replay = {
      selectedSourceName: 'orders.csv',
      jsonQuery: '.',
      reshape: {
        mode: 'none' as const,
        fields: '',
        namesTo: '',
        valuesTo: '',
        namesFrom: '',
        valuesFrom: '',
        groupBy: '',
        field: '',
      },
      chain: [
        {
          id: '1',
          kind: 'cut',
          mode: 'form' as const,
          opts: { fields: 'order_id,status' },
          rawExpression: '',
        },
      ],
      outputFormat: 'csv' as const,
    };

    expect(serializeRows(rows, 'csv')).toContain('order_id,status');
    expect(serializeRows(rows, 'jsonl')).toContain('"status":"paid"');
    expect(buildReplayableChainScript(chain)).toContain('1. cut');
    expect(decodeReplayState(encodeReplayState(replay))).toEqual(replay);
  });
});
