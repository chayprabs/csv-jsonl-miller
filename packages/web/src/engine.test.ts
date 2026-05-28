import { describe, expect, it } from 'vitest';

import type { VerbChain } from '@csvshape/core';

import { resolveExecutionEngine } from './engine';

describe('engine routing', () => {
  it('keeps simple single-source chains on the fast TypeScript path in auto mode', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [
        { kind: 'filter', opts: { expression: '$status == "paid"' } },
        { kind: 'stats1', opts: { spec: 'sum,total then group-by category' } },
      ],
      output: { format: 'csv' },
    };

    expect(resolveExecutionEngine('auto', chain, 1, 'csv')).toEqual({
      engine: 'typescript',
      message: 'Auto mode is using the fast TypeScript preview path for the current chain.',
    });
  });

  it('uses DuckDB-WASM for joins in auto mode', () => {
    const chain: VerbChain = {
      input: [{ format: 'jsonl', ref: 'logs.jsonl' }],
      verbs: [{ kind: 'join', opts: { rightSource: 'users.csv', leftKey: 'user_id', rightKey: 'id' } }],
      output: { format: 'csv' },
    };

    expect(resolveExecutionEngine('auto', chain, 2, 'csv').engine).toBe('duckdb-wasm');
  });

  it('uses DuckDB-WASM for Parquet output in auto mode', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'orders.csv' }],
      verbs: [],
      output: { format: 'parquet' },
    };

    expect(resolveExecutionEngine('auto', chain, 1, 'parquet').engine).toBe('duckdb-wasm');
  });
});
