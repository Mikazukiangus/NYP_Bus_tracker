import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { readEnvironment } from './config/env.ts';
import { createConfig } from './config/schema.ts';

export default defineConfig(({ mode }) => {
  const config = createConfig(readEnvironment(mode));
  return {
    // Do not expose arbitrary VITE_* variables. Only this validated public branch reaches browser code.
    envPrefix: [],
    define: { __PUBLIC_CONFIG__: JSON.stringify(config.public) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            // React in a file of its own: it changes far less often than the app, so after a deploy returning
            // visitors' browsers keep it and only fetch the app's own code again
            groups: [{ name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !config.server.disableHmr,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: config.server.disableHmr ? null : {},
    },
  };
});
