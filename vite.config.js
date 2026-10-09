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
const manager = require('./scripts/lib/catalogue-manager.cjs');
const media = require('./scripts/lib/media-store.cjs');

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

const formidablePkg = require('formidable');
const formidable = typeof formidablePkg === 'function' ? formidablePkg : (formidablePkg.formidable || formidablePkg.default);

const AUDIO_TYPES = { '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac' };

function sendFileWithRanges(req, res, file) {
  const size = fs.statSync(file).size;
  res.setHeader('Content-Type', AUDIO_TYPES[file.slice(file.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!m || (!m[1] && !m[2])) {
    res.setHeader('Content-Length', size);
    return fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(file, { start, end }).pipe(res);
}

function catalogueDevPlugin() {
  return {
    name: 'catalogue-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/manage', (req, res, next) => {
        if (req.method !== 'POST' && !(req.method === 'GET' && req.url.startsWith('/inbox-audio?'))) return next();

        // browsers send these cross-site without preflight, so other websites could drive the studio
        const isLocal = (value) => {
          try {
            return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
          } catch {
            return false;
          }
        };
        const origin = req.headers.origin;
        if (!isLocal(`http://${req.headers.host}`) || (origin && !isLocal(origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Studio Manager only accepts requests from this computer' }));
        }

        const url = req.url;

        if (req.method === 'GET') {
          try {
            const file = manager.resolveLoopFile(new URL(url, 'http://localhost').searchParams.get('path'));
            sendFileWithRanges(req, res, file);
          } catch (err) {
            res.statusCode = 404;
            res.end(err.message);
          }
          return;
        }

        // multipart file uploads
        if (url === '/upload-cover' || url === '/upload-tracks') {
          const form = formidable({ multiples: true });
          form.parse(req, async (err, fields, files) => {
            // formidable never deletes its temp copies, which leaked a full WAV per upload
            const cleanup = () =>
              Object.values(files || {})
                .flat()
                .forEach((f) => f && f.filepath && fs.rmSync(f.filepath, { force: true }));

            if (err) {
              cleanup();
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
            } finally {
              cleanup();
            }
          });
          return;
        }

        // json payloads
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
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
              const result = await manager.importPackFromStaging(payload);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/publish') {
              const result = manager.publishToGit();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else if (url === '/storage-stats') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(media.cloudUsage(manager.loadCatalogue())));
            } else if (url === '/inbox') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(manager.listInbox()));
            } else if (url === '/inbox-add') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(manager.addTrackFromFile(payload.packId, payload.path)));
            } else if (url === '/inbox-update') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(manager.updateTrackFromFile(payload.path)));
            } else if (url === '/inbox-dismiss') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(manager.dismissInbox(payload.path)));
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
  resolve: {
    preserveSymlinks: true,
  },
  plugins: [react(), catalogueDevPlugin(), clientZipWorkerPlugin()],
});
