import type { VERB_PALETTE } from './catalog';

export interface VerbFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
}

export interface VerbDefinition {
  kind: (typeof VERB_PALETTE)[number];
  summary: string;
  fields: VerbFieldDefinition[];
}

export const VERB_DEFINITIONS: VerbDefinition[] = [
  {
    kind: 'cat',
    summary: 'Concatenate selected inputs in order.',
    fields: [{ key: 'inputs', label: 'Inputs', placeholder: 'orders.csv, refunds.csv' }],
  },
  {
    kind: 'filter',
    summary: 'Keep rows matching a boolean expression.',
    fields: [{ key: 'expression', label: 'Expression', placeholder: '$status == "paid"' }],
  },
  {
    kind: 'put',
    summary: 'Create or mutate fields with Miller expressions.',
    fields: [{ key: 'statement', label: 'Statement', placeholder: '$net = $total - $discount' }],
  },
  {
    kind: 'cut',
    summary: 'Project a subset of fields.',
    fields: [{ key: 'fields', label: 'Fields', placeholder: 'order_id,total,status' }],
  },
  {
    kind: 'join',
    summary: 'Join the current stream against another input.',
    fields: [
      { key: 'leftKey', label: 'Left key', placeholder: 'user_id' },
      { key: 'rightKey', label: 'Right key', placeholder: 'id' },
    ],
  },
  {
    kind: 'sort',
    summary: 'Sort by one or more fields.',
    fields: [{ key: 'fields', label: 'Fields', placeholder: 'timestamp,-duration_ms' }],
  },
  {
    kind: 'stats1',
    summary: 'Single-pass grouped stats.',
    fields: [{ key: 'spec', label: 'Stats', placeholder: 'sum,total then group-by category' }],
  },
  {
    kind: 'stats2',
    summary: 'Multi-pass grouped stats with percentiles.',
    fields: [{ key: 'spec', label: 'Stats', placeholder: 'p95,duration_ms then group-by path' }],
  },
  {
    kind: 'reorder',
    summary: 'Move selected columns to a new order.',
    fields: [{ key: 'fields', label: 'Fields', placeholder: 'customer,region,total' }],
  },
  {
    kind: 'unsparsify',
    summary: 'Fill sparse rows into regular records.',
    fields: [{ key: 'fillWith', label: 'Fill with', placeholder: '(empty)' }],
  },
  {
    kind: 'nest',
    summary: 'Nest multiple fields under a single object.',
    fields: [{ key: 'into', label: 'Into field', placeholder: 'payload' }],
  },
  {
    kind: 'unnest',
    summary: 'Expand nested objects into columns.',
    fields: [{ key: 'field', label: 'Field', placeholder: 'payload' }],
  },
];

export function getVerbDefinition(kind: VerbDefinition['kind']): VerbDefinition {
  return VERB_DEFINITIONS.find((definition) => definition.kind === kind) ?? VERB_DEFINITIONS[0];
}
