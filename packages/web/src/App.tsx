import {
  buildDelimitedPreview,
  decodeInput,
  detectEncoding,
  inspectInput,
  SAMPLE_SPECS,
  type DialectDetection,
  type FileFormat,
  type InputInspection,
} from '@csvshape/core';
import { startTransition, useDeferredValue, useRef, useState } from 'react';
import { Database, FileCog, Link2, Logs, Rows4, Upload } from 'lucide-react';

import { VERB_PALETTE } from './catalog';

interface LoadedSource {
  id: string;
  name: string;
  sourceType: 'file' | 'sample';
  format: FileFormat;
  text: string;
  inspection: InputInspection;
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

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const deferredSource = useDeferredValue(selectedSource);

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

  const previewRows = deferredSource?.inspection.preview.rows ?? [];
  const previewColumns = deferredSource?.inspection.preview.columns ?? [];

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
                <span>
                  {source.sourceType} · {source.format.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <Rows4 size={18} />
            <h2>Verb palette</h2>
          </div>
          <p>Chain building starts here. Verb execution wiring lands in the next pass.</p>
          <div className="verb-grid">
            {VERB_PALETTE.map((verb) => (
              <button key={verb} type="button" className="verb-chip">
                {verb}
              </button>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <Database size={18} />
            <h2>Result preview</h2>
          </div>
          {!deferredSource ? (
            <div className="preview-state">{isLoading ? 'Loading source…' : 'Load a source to inspect preview data.'}</div>
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
              </div>

              {deferredSource.inspection.dialect ? (
                <div className="dialect-controls">
                  <div className="dialect-pill">Delimiter: {deferredSource.inspection.dialect.delimiter === '\t' ? 'TAB' : deferredSource.inspection.dialect.delimiter}</div>
                  <div className="dialect-pill">Quote: {deferredSource.inspection.dialect.quote}</div>
                  <div className="dialect-pill">Escape: {deferredSource.inspection.dialect.escape}</div>
                  <div className="dialect-pill">Line ending: {deferredSource.inspection.dialect.lineEnding}</div>
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
        {deferredSource?.inspection.warnings.length ? (
          <ul className="warning-list">
            {deferredSource.inspection.warnings.map((warning) => (
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
