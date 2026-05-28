export interface RouteSeo {
  title: string;
  heading: string;
  description: string;
}

const DEFAULT_ROUTE: RouteSeo = {
  title: 'CSVShape',
  heading: 'Browser-first CSV and JSONL shaping with Miller-style chains.',
  description:
    'Stream-process CSV, TSV, NDJSON and JSONL in your browser with Miller-style verb chains, joins, pivots and dialect sniffing.',
};

const ROUTE_SEO: Record<string, RouteSeo> = {
  '/': DEFAULT_ROUTE,
  '/csv-filter-online/': {
    title: 'CSV Filter Online | CSVShape',
    heading: 'Filter CSV files in the browser with Miller-style expressions.',
    description:
      'Filter CSV online with browser-side verb chains, dialect sniffing, previews, and replayable transformations.',
  },
  '/csv-join-online/': {
    title: 'CSV Join Online | CSVShape',
    heading: 'Join CSV and JSONL files in the browser without a notebook.',
    description:
      'Join CSV online with browser-side file intake, JSONL bridge queries, grouped stats, and replayable chain URLs.',
  },
  '/csv-pivot-online/': {
    title: 'CSV Pivot Online | CSVShape',
    heading: 'Pivot wider, pivot longer, and explode rows without leaving the browser.',
    description:
      'Pivot CSV online with reshape controls for longer, wider, explode, and grouped aggregation workflows.',
  },
  '/jsonl-tools/': {
    title: 'JSONL Tools | CSVShape',
    heading: 'Run jq-style JSONL transformations directly in the browser.',
    description:
      'Use JSONL tools online with jq-style filters, previews, CSV joins, and worker fallback for large files.',
  },
  '/miller-online/': {
    title: 'Miller Online | CSVShape',
    heading: 'Use Miller-style verbs online for CSV, TSV, NDJSON, and JSONL.',
    description:
      'Run Miller-style verb chains online with cat, filter, put, cut, join, sort, stats, reorder, nest, and unnest.',
  },
};

export function getRouteSeo(pathname: string): RouteSeo {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return ROUTE_SEO[normalized] ?? DEFAULT_ROUTE;
}
