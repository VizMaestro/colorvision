import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content scripts cannot be ES modules: bundle into one self-contained IIFE.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'ColorVisionContent',
      fileName: () => 'content.js',
    },
  },
});
