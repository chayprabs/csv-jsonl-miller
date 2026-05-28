import type { FileFormat } from '@csvshape/core';

export const WORKER_ESCALATION_THRESHOLD_BYTES = 1_000_000_000;

export interface FileLikeMeta {
  name: string;
  size: number;
}

export interface EscalationCandidate {
  name: string;
  sizeBytes: number;
  format: FileFormat;
}

export function inferFormat(name: string): FileFormat {
  const lower = name.toLowerCase();

  if (lower.endsWith('.tsv')) {
    return 'tsv';
  }

  if (lower.endsWith('.ndjson')) {
    return 'ndjson';
  }

  if (lower.endsWith('.jsonl')) {
    return 'jsonl';
  }

  return 'csv';
}

export function splitFilesForExecution<T extends FileLikeMeta>(files: T[]): {
  browserFiles: T[];
  escalationFiles: EscalationCandidate[];
} {
  const browserFiles = files.filter((file) => file.size <= WORKER_ESCALATION_THRESHOLD_BYTES);
  const escalationFiles = files
    .filter((file) => file.size > WORKER_ESCALATION_THRESHOLD_BYTES)
    .map((file) => ({
      name: file.name,
      sizeBytes: file.size,
      format: inferFormat(file.name),
    }));

  return {
    browserFiles,
    escalationFiles,
  };
}

export function buildEscalationMessage(file: EscalationCandidate): string {
  return `${file.name} is larger than 1 GB and will use the native worker fallback.`;
}
