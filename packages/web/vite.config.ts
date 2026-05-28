import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
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
});
