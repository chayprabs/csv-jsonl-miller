import type { FileFormat, VerbChain } from '@csvshape/core';

export type EngineMode = 'auto' | 'duckdb-wasm' | 'typescript';
export type ExecutionEngine = 'duckdb-wasm' | 'typescript';

export interface EngineResolution {
  engine: ExecutionEngine;
  message: string;
}

function hasStep(chain: VerbChain, kinds: string[]): boolean {
  return chain.verbs.some((step) => kinds.includes(step.kind));
}

export function resolveExecutionEngine(
  mode: EngineMode,
  chain: VerbChain,
  sourceCount: number,
  outputFormat: FileFormat,
): EngineResolution {
  if (mode === 'duckdb-wasm') {
    return {
      engine: 'duckdb-wasm',
      message: 'DuckDB-WASM preview is active for the current chain.',
    };
  }

  if (mode === 'typescript') {
    return {
      engine: 'typescript',
      message: 'TypeScript preview is active for the current chain.',
    };
  }

  const needsDuckDb =
    outputFormat === 'parquet' ||
    hasStep(chain, ['join']) ||
    (sourceCount > 1 && hasStep(chain, ['cat']));

  if (needsDuckDb) {
    return {
      engine: 'duckdb-wasm',
      message: 'Auto mode selected DuckDB-WASM for multi-source or Parquet work.',
    };
  }

  return {
    engine: 'typescript',
    message: 'Auto mode is using the fast TypeScript preview path for the current chain.',
  };
}
