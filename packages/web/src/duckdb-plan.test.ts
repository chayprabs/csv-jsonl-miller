import { describe, expect, it } from 'vitest';

import type { VerbChain } from '@csvshape/core';

import { buildDuckDbQueryPlan } from './duckdb-plan';

describe('duckdb query planner', () => {
  it('builds a SQL plan for join and grouped stats chains', () => {
    const chain: VerbChain = {
      input: [{ format: 'jsonl', ref: 'access-log.jsonl' }],
      verbs: [
        {
          kind: 'join',
          opts: {
            leftKey: 'user_id',
            rightKey: 'user_id',
            rightSource: 'users.csv',
          },
        },
        {
          kind: 'stats1',
          opts: {
            spec: 'count,*;distinct,team then group-by path',
          },
        },
      ],
      output: { format: 'csv' },
    };

    const plan = buildDuckDbQueryPlan(chain, [
      {
        format: 'jsonl',
        name: 'access-log.jsonl',
        text: '{"user_id":"u1","path":"/login"}\n',
      },
      {
        dialect: {
          columnCount: 2,
          delimiter: ',',
          escape: '"',
          hasHeader: true,
          lineEnding: 'lf',
          quote: '"',
        },
        format: 'csv',
        name: 'users.csv',
        text: 'user_id,team\nu1,alpha\n',
      },
    ]);

    expect(plan.supported).toBe(true);
    expect(plan.sql).toContain('LEFT JOIN input_1 AS joined_stream');
    expect(plan.sql).toContain('count(*) AS "count_*"');
    expect(plan.sql).toContain('count(DISTINCT "team") AS "distinct_team"');
  });

  it('falls back when a non-sql verb is present', () => {
    const chain: VerbChain = {
      input: [{ format: 'csv', ref: 'wide-sales.csv' }],
      verbs: [
        {
          kind: 'nest',
          opts: {
            fields: 'jan,feb',
            into: 'payload',
          },
        },
      ],
      output: { format: 'csv' },
    };

    const plan = buildDuckDbQueryPlan(chain, [
      {
        dialect: {
          columnCount: 3,
          delimiter: ',',
          escape: '"',
          hasHeader: true,
          lineEnding: 'lf',
          quote: '"',
        },
        format: 'csv',
        name: 'wide-sales.csv',
        text: 'region,jan,feb\nnorth,120,140\n',
      },
    ]);

    expect(plan.supported).toBe(false);
    expect(plan.reason).toContain('TypeScript fallback');
  });
});
