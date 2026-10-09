import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const manager = require('./scripts/lib/catalogue-manager.cjs');

const formidablePkg = require('formidable');
const formidable = typeof formidablePkg === 'function' ? formidablePkg : (formidablePkg.formidable || formidablePkg.default);

function catalogueDevPlugin() {
  return {
    name: 'catalogue-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/manage', (req, res, next) => {
        if (req.method !== 'POST') return next();

        const url = req.url;

        // multipart file uploads
        if (url === '/upload-cover' || url === '/upload-tracks') {
          const form = formidable({ multiples: true });
          form.parse(req, async (err, fields, files) => {
            if (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }

            try {
              const packId = Array.isArray(fields.packId) ? fields.packId[0] : fields.packId;
              if (!packId) throw new Error('packId is required');

              if (url === '/upload-cover') {
                const coverFile = Array.isArray(files.cover) ? files.cover[0] : files.cover;
                if (!coverFile) throw new Error('No cover file uploaded');
                const result = manager.updatePackCover(packId, coverFile.filepath, coverFile.originalFilename);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(result));
              }

              if (url === '/upload-tracks') {
                let trackFiles = files.tracks || files.file || [];
                if (!Array.isArray(trackFiles)) trackFiles = [trackFiles];
                if (trackFiles.length === 0) throw new Error('No audio files uploaded');
                const result = await manager.addTracksToPack(packId, trackFiles);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(result));
              }
            } catch (handleErr) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: handleErr.message }));
            }
          });
          return;
        }

        // json payloads
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');

            if (url === '/create-pack') {
              const result = manager.createBlankPack(payload);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/delete-track') {
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
            } else if (url === '/reorder-packs') {
              const result = manager.reorderPacks(payload.packIds);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/delete-pack') {
              const result = manager.deletePack(payload.packId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/update-pack') {
              const result = manager.updatePack(payload.packId, payload.updates);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/import-staging') {
              const result = manager.importPackFromStaging(payload);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/publish') {
              const result = manager.publishToGit();
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
  plugins: [react(), catalogueDevPlugin()],
});
