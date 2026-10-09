import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const manager = require('./scripts/lib/catalogue-manager.cjs');

function catalogueDevPlugin() {
  return {
    name: 'catalogue-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/manage', (req, res, next) => {
        if (req.method !== 'POST') return next();

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const url = req.url;

            if (url === '/delete-track') {
              const result = manager.deleteTrack(payload.packId, payload.trackId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/move-track') {
              const result = manager.moveTrack(payload.sourcePackId, payload.targetPackId, payload.trackId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/reorder-tracks') {
              const result = manager.reorderTracks(payload.packId, payload.trackIds);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/delete-pack') {
              const result = manager.deletePack(payload.packId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/import-staging') {
              const result = manager.importPackFromStaging(payload);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Endpoint not found' }));
            }
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  root: fs.realpathSync(process.cwd()),
  plugins: [react(), catalogueDevPlugin()],
});
