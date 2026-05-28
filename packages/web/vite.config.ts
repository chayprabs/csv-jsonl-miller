import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

function normalizeBasePath(value?: string) {
  if (!value || value === '/') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const base = normalizeBasePath(env.VITE_APP_BASE_PATH);

  return {
    base,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          csvFilterOnline: resolve(__dirname, 'csv-filter-online/index.html'),
          csvJoinOnline: resolve(__dirname, 'csv-join-online/index.html'),
          csvPivotOnline: resolve(__dirname, 'csv-pivot-online/index.html'),
          jsonlTools: resolve(__dirname, 'jsonl-tools/index.html'),
          millerOnline: resolve(__dirname, 'miller-online/index.html'),
        },
      },
    },
    server: {
      port: 4173,
    },
  };
});
