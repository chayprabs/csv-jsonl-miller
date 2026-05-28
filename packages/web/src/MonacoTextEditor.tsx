import Editor from '@monaco-editor/react';

interface MonacoTextEditorProps {
  height?: number;
  language: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export default function MonacoTextEditor({
  height = 200,
  language,
  onChange,
  placeholder,
  value,
}: MonacoTextEditorProps) {
  return (
    <div className="monaco-shell" data-editor-language={language}>
      <Editor
        height={height}
        defaultLanguage={language}
        language={language}
        loading={<div className="monaco-loading">Loading editor...</div>}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          automaticLayout: true,
          fontFamily: 'Consolas, "Courier New", monospace',
          fontSize: 13,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { top: 14, bottom: 14 },
          roundedSelection: false,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
        theme="vs-dark"
        value={value}
      />
      {placeholder && !value.trim() ? <span className="monaco-placeholder">{placeholder}</span> : null}
    </div>
  );
}
