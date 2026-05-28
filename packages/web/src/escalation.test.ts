import { describe, expect, it } from 'vitest';

import {
  buildEscalationMessage,
  inferFormat,
  splitFilesForExecution,
  WORKER_ESCALATION_THRESHOLD_BYTES,
} from './escalation';

describe('worker escalation helpers', () => {
  it('splits browser and worker files at the 1 GB threshold', () => {
    const result = splitFilesForExecution([
      { name: 'small.csv', size: 128_000 },
      { name: 'huge.jsonl', size: WORKER_ESCALATION_THRESHOLD_BYTES + 1 },
    ]);

    expect(result.browserFiles).toEqual([{ name: 'small.csv', size: 128_000 }]);
    expect(result.escalationFiles).toEqual([
      {
        name: 'huge.jsonl',
        sizeBytes: WORKER_ESCALATION_THRESHOLD_BYTES + 1,
        format: 'jsonl',
      },
    ]);
  });

  it('builds a clear worker fallback prompt', () => {
    expect(
      buildEscalationMessage({
        name: 'vendor-dump.tsv',
        sizeBytes: 1_200_000_000,
        format: 'tsv',
      }),
    ).toContain('larger than 1 GB');
  });

  it('infers file formats from names used in the intake flow', () => {
    expect(inferFormat('events.ndjson')).toBe('ndjson');
    expect(inferFormat('events.jsonl')).toBe('jsonl');
    expect(inferFormat('events.tsv')).toBe('tsv');
    expect(inferFormat('events.csv')).toBe('csv');
  });
});
