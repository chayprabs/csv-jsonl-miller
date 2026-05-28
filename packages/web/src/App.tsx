import {
  applyJsonQuery,
  applyReshape,
  buildDelimitedPreview,
  decodeInput,
  detectEncoding,
  executeVerbChain,
  inspectInput,
  SAMPLE_SPECS,
  type DialectDetection,
  type FileFormat,
  type InputInspection,
  type VerbChain,
} from '@csvshape/core';
import { startTransition, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Database, FileCog, Link2, Logs, Rows4, Upload } from 'lucide-react';

import { VERB_PALETTE } from './catalog';
import { getVerbDefinition } from './verb-definitions';

interface LoadedSource {
  id: string;
  name: string;
  sourceType: 'file' | 'sample';
  format: FileFormat;
  text: string;
  inspection: InputInspection;
}

interface ChainStep {
  id: string;
  kind: (typeof VERB_PALETTE)[number];
  mode: 'form' | 'raw';
  opts: Record<string, string>;
  rawExpression: string;
}

interface ReshapeState {
  mode: 'none' | 'longer' | 'wider' | 'explode';
  fields: string;
  namesTo: string;
  valuesTo: string;
  namesFrom: string;
  valuesFrom: string;
  groupBy: string;
  field: string;
}

const WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL ?? 'http://localhost:8787';

function inferFormat(name: string): FileFormat {
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

function withHeaderOverride(source: LoadedSource, hasHeader: boolean): LoadedSource {
  if (!source.inspection.dialect) {
    return source;
  }

  const dialect: DialectDetection = {
    ...source.inspection.dialect,
    hasHeader,
  };

  return {
    ...source,
    inspection: {
      ...source.inspection,
      dialect,
      preview: buildDelimitedPreview(source.text, dialect),
    },
  };
}

export function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sources, setSources] = useState<LoadedSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [workerUrl, setWorkerUrl] = useState('');
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chain, setChain] = useState<ChainStep[]>([]);
  const [jsonQuery, setJsonQuery] = useState('select(.status == 500) | {user_id:.user_id,status:.status}');
  const [reshape, setReshape] = useState<ReshapeState>({
    mode: 'none',
    fields: 'jan,feb,mar',
    namesTo: 'month',
    valuesTo: 'value',
    namesFrom: 'month',
    valuesFrom: 'value',
    groupBy: 'region',
    field: 'tags',
  });
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const deferredSource = useDeferredValue(selectedSource);
  const deferredChain = useDeferredValue(chain);
  const deferredJsonQuery = useDeferredValue(jsonQuery);

  async function loadBytes(name: string, sourceType: LoadedSource['sourceType'], bytes: Uint8Array) {
    const format = inferFormat(name);
    const encoding = detectEncoding(bytes);
    const text = decodeInput(bytes, encoding);
    const inspection = inspectInput(bytes, format);
    const nextSource: LoadedSource = {
      id: `${name}-${crypto.randomUUID()}`,
      name,
      sourceType,
      format,
      text,
      inspection,
    };

    startTransition(() => {
      setSources((current) => [nextSource, ...current]);
      setSelectedSourceId(nextSource.id);
    });
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    setIsLoading(true);

    try {
      await Promise.all(
        Array.from(fileList).map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await loadBytes(file.name, 'file', bytes);
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSample(sampleId: string) {
    const sample = SAMPLE_SPECS.find((entry) => entry.id === sampleId);

    if (!sample) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/samples/${sample.filename}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await loadBytes(sample.filename, 'sample', bytes);
    } finally {
      setIsLoading(false);
    }
  }

  async function queueWorkerUrl() {
    if (!workerUrl) {
      return;
    }

    setWorkerMessage('Queueing worker fetch...');

    try {
      const response = await fetch(`${WORKER_BASE_URL}/v1/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: {
            kind: 'url',
            url: workerUrl,
          },
        }),
      });
      const payload = (await response.json()) as { message?: string; status?: string };

      setWorkerMessage(payload.message ?? `Worker responded with ${payload.status ?? response.status}.`);
    } catch (error) {
      setWorkerMessage(error instanceof Error ? error.message : 'Unable to reach worker.');
    }
  }

  const execution = useMemo(() => {
    if (!deferredSource) {
      return null;
    }

    let primarySource = deferredSource;
    let jsonWarnings: string[] = [];

    if (
      (deferredSource.format === 'jsonl' || deferredSource.format === 'ndjson') &&
      deferredJsonQuery.trim()
    ) {
      const queried = applyJsonQuery(deferredSource.text, deferredJsonQuery);

      primarySource = {
        ...deferredSource,
        text: queried.rows.map((row) => JSON.stringify(row)).join('\n'),
      };
      jsonWarnings = queried.warnings;
    }

    const chainDefinition: VerbChain = {
      input: [{ format: primarySource.format, ref: primarySource.name }],
      verbs: deferredChain.map((step) => ({
        kind: step.kind,
        opts: step.opts,
        rawExpression: step.mode === 'raw' ? step.rawExpression : undefined,
      })),
      output: { format: primarySource.format },
    };

    const result = executeVerbChain(
      chainDefinition,
      sources.map((source) => ({
        name: source.id === deferredSource.id ? primarySource.name : source.name,
        format: source.id === deferredSource.id ? primarySource.format : source.format,
        text: source.id === deferredSource.id ? primarySource.text : source.text,
        dialect: source.id === deferredSource.id ? null : source.inspection.dialect,
      })),
    );

    return {
      ...result,
      warnings: [...result.warnings, ...jsonWarnings],
    };
  }, [deferredChain, deferredJsonQuery, deferredSource, sources]);

  const reshaped = useMemo(() => {
    if (!execution) {
      return null;
    }

    if (reshape.mode === 'none') {
      return execution;
    }

    const result = applyReshape(execution.rows, reshape);

    return {
      ...execution,
      rows: result.rows,
      preview: result.preview,
    };
  }, [execution, reshape]);

  const previewRows = reshaped?.preview.rows ?? execution?.preview.rows ?? [];
  const previewColumns = reshaped?.preview.columns ?? execution?.preview.columns ?? [];
  const previewWarnings = reshaped?.warnings ?? execution?.warnings ?? [];

  function addVerb(kind: (typeof VERB_PALETTE)[number]) {
    const definition = getVerbDefinition(kind);
    const nextStep: ChainStep = {
      id: crypto.randomUUID(),
      kind,
      mode: 'form',
      opts: definition.fields.reduce<Record<string, string>>((accumulator, field) => {
        accumulator[field.key] = '';
        return accumulator;
      }, {}),
      rawExpression: '',
    };

    setChain((current) => [...current, nextStep]);
  }

  function reorderChain(targetStepId: string) {
    if (!draggedStepId || draggedStepId === targetStepId) {
      return;
    }

    setChain((current) => {
      const draggedIndex = current.findIndex((step) => step.id === draggedStepId);
      const targetIndex = current.findIndex((step) => step.id === targetStepId);

      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [dragged] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    });
    setDraggedStepId(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CSVShape</p>
          <h1>Browser-first CSV and JSONL shaping with Miller-style chains.</h1>
        </div>
        <a href="https://github.com/chayprabs/csv-jsonl-miller" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </header>

      <section className="hero-grid">
        <div className="panel">
          <div className="panel-header">
            <FileCog size={18} />
            <h2>Inputs</h2>
          </div>
          <div
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFiles(event.dataTransfer.files);
            }}
          >
            <Upload size={22} />
            <strong>Drop CSV, TSV, NDJSON, or JSONL files.</strong>
            <span>Multi-file input is supported. Large remote URLs can be sent to the worker.</span>
            <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
              Browse files
            </button>
            <input
              ref={fileInputRef}
              hidden
              multiple
              type="file"
              accept=".csv,.tsv,.jsonl,.ndjson"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          <div className="worker-box">
            <div className="panel-header compact">
              <Link2 size={16} />
              <h3>Worker URL fetch</h3>
            </div>
            <div className="inline-form">
              <input
                type="url"
                value={workerUrl}
                placeholder="https://example.com/large-dataset.csv"
                onChange={(event) => setWorkerUrl(event.target.value)}
              />
              <button type="button" className="secondary-button" onClick={() => void queueWorkerUrl()}>
                Queue
              </button>
            </div>
            {workerMessage ? <p className="worker-message">{workerMessage}</p> : null}
          </div>

          <div className="sample-actions">
            {SAMPLE_SPECS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="sample-card"
                onClick={() => void loadSample(sample.id)}
              >
                <strong>{sample.label}</strong>
                <span>{sample.description}</span>
              </button>
            ))}
          </div>

          <div className="source-list">
            {sources.length === 0 ? <p>No sources loaded yet.</p> : null}
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={source.id === selectedSourceId ? 'source-item active' : 'source-item'}
                onClick={() => setSelectedSourceId(source.id)}
              >
                <strong>{source.name}</strong>
                <span>{`${source.sourceType} · ${source.format.toUpperCase()}`}</span>
              </button>
            ))}
          </div>

          {deferredSource &&
          (deferredSource.format === 'jsonl' || deferredSource.format === 'ndjson') ? (
            <div className="worker-box">
              <div className="panel-header compact">
                <Link2 size={16} />
                <h3>jq for JSONL</h3>
              </div>
              <label className="field">
                <span>jq-style query</span>
                <textarea
                  rows={4}
                  value={jsonQuery}
                  placeholder='select(.status == 500) | {user_id:.user_id,status:.status}'
                  onChange={(event) => setJsonQuery(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="worker-box">
            <div className="panel-header compact">
              <Rows4 size={16} />
              <h3>Reshape</h3>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Mode</span>
                <select
                  value={reshape.mode}
                  onChange={(event) =>
                    setReshape((current) => ({
                      ...current,
                      mode: event.target.value as ReshapeState['mode'],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="longer">Pivot longer</option>
                  <option value="wider">Pivot wider</option>
                  <option value="explode">Explode</option>
                </select>
              </label>
              {reshape.mode === 'longer' ? (
                <>
                  <label className="field">
                    <span>Fields</span>
                    <input
                      type="text"
                      value={reshape.fields}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, fields: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Names to</span>
                    <input
                      type="text"
                      value={reshape.namesTo}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, namesTo: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Values to</span>
                    <input
                      type="text"
                      value={reshape.valuesTo}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, valuesTo: event.target.value }))
                      }
                    />
                  </label>
                </>
              ) : null}
              {reshape.mode === 'wider' ? (
                <>
                  <label className="field">
                    <span>Names from</span>
                    <input
                      type="text"
                      value={reshape.namesFrom}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, namesFrom: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Values from</span>
                    <input
                      type="text"
                      value={reshape.valuesFrom}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, valuesFrom: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Group by</span>
                    <input
                      type="text"
                      value={reshape.groupBy}
                      onChange={(event) =>
                        setReshape((current) => ({ ...current, groupBy: event.target.value }))
                      }
                    />
                  </label>
                </>
              ) : null}
              {reshape.mode === 'explode' ? (
                <label className="field">
                  <span>Field</span>
                  <input
                    type="text"
                    value={reshape.field}
                    onChange={(event) =>
                      setReshape((current) => ({ ...current, field: event.target.value }))
                    }
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <Rows4 size={18} />
            <h2>Chain editor</h2>
          </div>
          <p>Add verbs from the palette, reorder them, and switch each step between form and raw modes.</p>
          <div className="verb-grid">
            {VERB_PALETTE.map((verb) => (
              <button key={verb} type="button" className="verb-chip" onClick={() => addVerb(verb)}>
                {verb}
              </button>
            ))}
          </div>

          <div className="chain-stack">
            {chain.length === 0 ? <div className="preview-state compact">No verbs in the chain yet.</div> : null}
            {chain.map((step, index) => {
              const definition = getVerbDefinition(step.kind);

              return (
                <div
                  key={step.id}
                  className="chain-card"
                  draggable
                  onDragStart={() => setDraggedStepId(step.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderChain(step.id)}
                >
                  <div className="chain-card-header">
                    <div>
                      <span className="chain-index">Step {index + 1}</span>
                      <strong>{step.kind}</strong>
                    </div>
                    <div className="mode-toggle">
                      <button
                        type="button"
                        className={step.mode === 'form' ? 'toggle active' : 'toggle'}
                        onClick={() =>
                          setChain((current) =>
                            current.map((entry) =>
                              entry.id === step.id ? { ...entry, mode: 'form' } : entry,
                            ),
                          )
                        }
                      >
                        Form
                      </button>
                      <button
                        type="button"
                        className={step.mode === 'raw' ? 'toggle active' : 'toggle'}
                        onClick={() =>
                          setChain((current) =>
                            current.map((entry) =>
                              entry.id === step.id ? { ...entry, mode: 'raw' } : entry,
                            ),
                          )
                        }
                      >
                        Raw
                      </button>
                    </div>
                  </div>

                  <p>{definition.summary}</p>

                  {step.mode === 'form' ? (
                    <div className="field-grid">
                      {definition.fields.map((field) => (
                        <label key={field.key} className="field">
                          <span>{field.label}</span>
                          <input
                            type="text"
                            value={step.opts[field.key] ?? ''}
                            placeholder={field.placeholder}
                            onChange={(event) =>
                              setChain((current) =>
                                current.map((entry) =>
                                  entry.id === step.id
                                    ? {
                                        ...entry,
                                        opts: {
                                          ...entry.opts,
                                          [field.key]: event.target.value,
                                        },
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <label className="field">
                      <span>Raw expression</span>
                      <textarea
                        rows={4}
                        value={step.rawExpression}
                        placeholder={`mlr ${step.kind} ...`}
                        onChange={(event) =>
                          setChain((current) =>
                            current.map((entry) =>
                              entry.id === step.id
                                ? { ...entry, rawExpression: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <Database size={18} />
            <h2>Result preview</h2>
          </div>
          {!deferredSource ? (
            <div className="preview-state">
              {isLoading ? 'Loading source...' : 'Load a source to inspect preview data.'}
            </div>
          ) : (
            <div className="preview-stack">
              <div className="metadata-grid">
                <div>
                  <span>Format</span>
                  <strong>{deferredSource.format.toUpperCase()}</strong>
                </div>
                <div>
                  <span>Encoding</span>
                  <strong>{deferredSource.inspection.encoding.encoding}</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>{deferredSource.inspection.encoding.confidence.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Columns</span>
                  <strong>{previewColumns.length}</strong>
                </div>
                <div>
                  <span>Rows</span>
                  <strong>{previewRows.length}</strong>
                </div>
              </div>

              {deferredSource.inspection.dialect ? (
                <div className="dialect-controls">
                  <div className="dialect-pill">
                    Delimiter:{' '}
                    {deferredSource.inspection.dialect.delimiter === '\t'
                      ? 'TAB'
                      : deferredSource.inspection.dialect.delimiter}
                  </div>
                  <div className="dialect-pill">Quote: {deferredSource.inspection.dialect.quote}</div>
                  <div className="dialect-pill">Escape: {deferredSource.inspection.dialect.escape}</div>
                  <div className="dialect-pill">
                    Line ending: {deferredSource.inspection.dialect.lineEnding}
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={deferredSource.inspection.dialect.hasHeader}
                      onChange={(event) => {
                        setSources((current) =>
                          current.map((source) =>
                            source.id === deferredSource.id
                              ? withHeaderOverride(source, event.target.checked)
                              : source,
                          ),
                        );
                      }}
                    />
                    Header row present
                  </label>
                </div>
              ) : (
                <div className="dialect-pill jsonl-pill">JSONL preview uses per-line object fields.</div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {previewColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={`${deferredSource.id}-${rowIndex}`}>
                        {previewColumns.map((column) => (
                          <td key={`${rowIndex}-${column}`}>{row[column]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="log-panel">
        <div className="panel-header">
          <Logs size={18} />
          <h2>Row error log</h2>
        </div>
        {previewWarnings.length ? (
          <ul className="warning-list">
            {previewWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>No row warnings for the current preview.</p>
        )}
      </section>
    </div>
  );
}
