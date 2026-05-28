import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyJsonQuery, applyReshape, executeVerbChain, type VerbChain } from '../src/index';

const samplesDir = path.resolve(
  process.cwd(),
  '..',
  'web',
  'public',
  'samples',
);

function readSample(filename: string): string {
  return readFileSync(path.join(samplesDir, filename), 'utf8');
}

describe('acceptance fixtures', () => {
  it('A1 sample ecommerce CSV produces expected aggregate output', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'ecommerce-events.csv' }],
      verbs: [
        { kind: 'filter', opts: { expression: '$status == "paid"' } },
        { kind: 'stats1', opts: { spec: 'sum,total;count,* then group-by category' } },
        { kind: 'sort', opts: { fields: 'category' } },
      ],
      output: { format: 'csv' },
    };

    const result = executeVerbChain(chain, [
      {
        name: 'ecommerce-events.csv',
        format: 'csv',
        text: readSample('ecommerce-events.csv'),
      },
    ]);

    expect(result.preview.rows).toEqual([
      { category: 'books', sum_total: '42.5', 'count_*': '1' },
      { category: 'electronics', sum_total: '129.99', 'count_*': '1' },
      { category: 'home', sum_total: '77.1', 'count_*': '1' },
    ]);
  });

  it('A1 sample access-log JSONL produces expected jq output', () => {
    const result = applyJsonQuery(
      readSample('access-log.jsonl'),
      'select(.status == 500) | {request_id:.request_id,path:.path,duration_ms:.duration_ms}',
    );

    expect(result.preview.rows).toEqual([
      { request_id: 'r2', path: '/cart', duration_ms: '983' },
    ]);
  });

  it('A1 sample wide-form CSV pivots longer as expected', () => {
    const source = executeVerbChain(
      {
        input: [{ format: 'csv', ref: 'wide-sales.csv' }],
        verbs: [],
        output: { format: 'csv' },
      },
      [
        {
          name: 'wide-sales.csv',
          format: 'csv',
          text: readSample('wide-sales.csv'),
        },
      ],
    );
    const reshaped = applyReshape(source.rows, {
      mode: 'longer',
      fields: 'jan,feb,mar',
      namesTo: 'month',
      valuesTo: 'sales',
    });

    expect(reshaped.preview.rows.slice(0, 3)).toEqual([
      { region: 'north', month: 'jan', sales: '120' },
      { region: 'north', month: 'feb', sales: '140' },
      { region: 'north', month: 'mar', sales: '150' },
    ]);
    expect(reshaped.rows).toHaveLength(9);
  });
});
