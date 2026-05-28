import { describe, expect, it } from 'vitest';

import { SAMPLE_SPECS } from '../src/index';

describe('sample registry', () => {
  it('exposes the acceptance fixture samples', () => {
    expect(SAMPLE_SPECS).toHaveLength(3);
    expect(SAMPLE_SPECS.map((sample) => sample.id)).toEqual([
      'ecommerce-events',
      'access-log',
      'wide-sales',
    ]);
  });
});
