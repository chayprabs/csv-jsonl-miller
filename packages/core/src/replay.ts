export interface ReplayState {
  selectedSourceName?: string | null;
  jsonQuery: string;
  reshape: {
    mode: 'none' | 'longer' | 'wider' | 'explode';
    fields: string;
    namesTo: string;
    valuesTo: string;
    namesFrom: string;
    valuesFrom: string;
    groupBy: string;
    field: string;
  };
  chain: Array<{
    id: string;
    kind: string;
    mode: 'form' | 'raw';
    opts: Record<string, string>;
    rawExpression: string;
  }>;
  outputFormat: 'csv' | 'tsv' | 'ndjson' | 'jsonl' | 'parquet';
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function toBase64Url(value: Uint8Array): string {
  let binary = '';

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeReplayState(state: ReplayState): string {
  return toBase64Url(encodeUtf8(JSON.stringify(state)));
}

export function decodeReplayState(encoded: string): ReplayState | null {
  try {
    return JSON.parse(decodeUtf8(fromBase64Url(encoded))) as ReplayState;
  } catch {
    return null;
  }
}
