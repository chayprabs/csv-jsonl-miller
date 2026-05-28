import { describe, expect, it } from 'vitest';

import { VERB_PALETTE } from './catalog';
import { VERB_DEFINITIONS } from './verb-definitions';

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

  it('defines form-based configuration for every verb', () => {
    expect(VERB_DEFINITIONS).toHaveLength(VERB_PALETTE.length);
    expect(VERB_DEFINITIONS.every((definition) => definition.fields.length > 0)).toBe(true);
  });
});
