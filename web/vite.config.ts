import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is "/" for a custom domain and "/<repo>/" for a project Pages site.
// The deploy workflow sets it; local dev keeps "/".
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
