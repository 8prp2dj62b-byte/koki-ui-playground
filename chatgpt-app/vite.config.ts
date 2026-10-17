import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  resolve: {
    alias: {
      '@modelcontextprotocol/ext-apps/react': fileURLToPath(new URL('./src/widget/mcp-react.ts', import.meta.url)),
    },
  },
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
