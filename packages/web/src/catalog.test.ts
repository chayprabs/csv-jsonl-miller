import { describe, expect, it } from 'vitest';

import { VERB_PALETTE } from './catalog';

describe('verb palette', () => {
  it('contains the full PRD verb set', () => {
    expect(VERB_PALETTE).toEqual([
      'cat',
      'filter',
      'put',
      'cut',
      'join',
      'sort',
      'stats1',
      'stats2',
      'reorder',
      'unsparsify',
      'nest',
      'unnest',
    ]);
  });
});
