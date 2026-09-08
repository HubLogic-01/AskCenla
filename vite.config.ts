import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `@` points at /src so imports stay readable as the app grows
// (e.g. `import { Button } from '@/components/ui/Button'`).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: {
        // Split vendor code out of the app bundle. React and supabase-js change
        // far less often than our own code, so keeping them in separate chunks
        // means a normal deploy only invalidates the small app chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
