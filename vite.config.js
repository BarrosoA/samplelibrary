import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
// vite restarts in the same process, so without this Studio Manager keeps running stale script code
for (const id of Object.keys(require.cache)) {
  if (/[\\/]scripts[\\/]lib[\\/]/.test(id)) delete require.cache[id];
}
const { studioApi } = require('./scripts/lib/studio-api.cjs');

// the service worker loads client-zip's classic-script build via importScripts
const CLIENT_ZIP_WORKER = fileURLToPath(new URL('./node_modules/client-zip/worker.js', import.meta.url));

function clientZipWorkerPlugin() {
  return {
    name: 'client-zip-worker',
    configureServer(server) {
      server.middlewares.use('/vendor/client-zip.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(fs.readFileSync(CLIENT_ZIP_WORKER));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'vendor/client-zip.js',
        source: fs.readFileSync(CLIENT_ZIP_WORKER, 'utf8'),
      });
    },
  };
}

function catalogueDevPlugin() {
  return {
    name: 'catalogue-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/manage', studioApi);
    },
  };
}

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  plugins: [react(), catalogueDevPlugin(), clientZipWorkerPlugin()],
});
