import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds everything into one self-contained dist/index.html
// that opens by double-click (no server needed).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
});
