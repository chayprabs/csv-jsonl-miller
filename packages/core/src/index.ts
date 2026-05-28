export type FileFormat = 'csv' | 'tsv' | 'ndjson' | 'jsonl' | 'parquet';

export type VerbKind =
  | 'cat'
  | 'filter'
  | 'put'
  | 'cut'
  | 'join'
  | 'sort'
  | 'stats1'
  | 'stats2'
  | 'reorder'
  | 'unsparsify'
  | 'nest'
  | 'unnest';

export interface Verb {
  kind: VerbKind;
  opts: Record<string, unknown>;
  rawExpression?: string;
}

export interface VerbChain {
  input: { format: FileFormat; ref: string }[];
  verbs: Verb[];
  output: { format: FileFormat };
}

export interface SampleSpec {
  id: string;
  label: string;
  description: string;
  format: FileFormat;
  filename: string;
}

export const SAMPLE_SPECS: SampleSpec[] = [
  {
    id: 'ecommerce-events',
    label: 'Ecommerce events CSV',
    description: 'Orders, categories, and order values for aggregation demos.',
    format: 'csv',
    filename: 'ecommerce-events.csv',
  },
  {
    id: 'access-log',
    label: 'Access log JSONL',
    description: 'HTTP access log records for jq filters and joins.',
    format: 'jsonl',
    filename: 'access-log.jsonl',
  },
  {
    id: 'wide-sales',
    label: 'Wide-form CSV',
    description: 'Monthly regional measures for pivot-longer and pivot-wider.',
    format: 'csv',
    filename: 'wide-sales.csv',
  },
];

export * from './input';
