import { SAMPLE_SPECS } from '@csvshape/core';
import { Database, FileCog, Logs, Rows4 } from 'lucide-react';
import { VERB_PALETTE } from './catalog';

export function App() {
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
          <p>Multi-file drag-and-drop, worker URL fetches, and sample fixtures land here.</p>
          <ul className="sample-list">
            {SAMPLE_SPECS.map((sample) => (
              <li key={sample.id}>
                <strong>{sample.label}</strong>
                <span>{sample.description}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header">
            <Rows4 size={18} />
            <h2>Verb palette</h2>
          </div>
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
          <p>Preview, downloads, raw JSON, and replayable chain links will render here.</p>
          <div className="preview-state">No run executed yet.</div>
        </div>
      </section>

      <section className="log-panel">
        <div className="panel-header">
          <Logs size={18} />
          <h2>Row error log</h2>
        </div>
        <p>Warnings and malformed rows will be surfaced here once parsing is wired.</p>
      </section>
    </div>
  );
}
