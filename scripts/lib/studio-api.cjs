const fs = require('fs');
const manager = require('./catalogue-manager.cjs');
const media = require('./media-store.cjs');

const formidablePkg = require('formidable');
const formidable = typeof formidablePkg === 'function' ? formidablePkg : (formidablePkg.formidable || formidablePkg.default);

const AUDIO_TYPES = { '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac' };

// json endpoints: each receives the parsed request body
const ROUTES = {
  '/create-pack': (p) => manager.createBlankPack(p),
  '/update-pack': (p) => manager.updatePack(p.packId, p.updates),
  '/delete-pack': (p) => manager.deletePack(p.packId),
  '/reorder-packs': (p) => manager.reorderPacks(p.packIds),
  '/delete-track': (p) => manager.deleteTrack(p.packId, p.trackId),
  '/move-track': (p) => manager.moveTrack(p.sourcePackId, p.targetPackId, p.trackId),
  '/reorder-tracks': (p) => manager.reorderTracks(p.packId, p.trackIds),
  '/import-staging': (p) => manager.importPackFromStaging(p),
  '/publish': () => manager.publishToGit(),
  '/storage-stats': () => media.cloudUsage(manager.loadCatalogue()),
  '/download-stats': () => media.downloadCounts(),
  '/inbox': () => manager.listInbox(),
  '/inbox-add': (p) => manager.addTrackFromFile(p.packId, p.path),
  '/inbox-update': (p) => manager.updateTrackFromFile(p.path),
  '/inbox-dismiss': (p) => manager.dismissInbox(p.path),
};

// multipart endpoints: each receives the form fields, the uploaded files and the pack id
const UPLOAD_ROUTES = {
  '/upload-cover': (packId, files) => {
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : files.cover;
    if (!coverFile) throw new Error('No cover file uploaded');
    return manager.updatePackCover(packId, coverFile.filepath, coverFile.originalFilename);
  },
  '/upload-tracks': (packId, files) => {
    let trackFiles = files.tracks || files.file || [];
    if (!Array.isArray(trackFiles)) trackFiles = [trackFiles];
    if (trackFiles.length === 0) throw new Error('No audio files uploaded');
    return manager.addTracksToPack(packId, trackFiles);
  },
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

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

// browsers send these cross-site without preflight, so other websites could drive the studio
function isFromThisComputer(req) {
  const isLocal = (value) => {
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
    } catch {
      return false;
    }
  };
  const origin = req.headers.origin;
  return isLocal(`http://${req.headers.host}`) && (!origin || isLocal(origin)) && req.headers['sec-fetch-site'] !== 'cross-site';
}

function serveLoopAudio(req, res) {
  try {
    const file = manager.resolveLoopFile(new URL(req.url, 'http://localhost').searchParams.get('path'));
    sendFileWithRanges(req, res, file);
  } catch (err) {
    res.statusCode = 404;
    res.end(err.message);
  }
}

function handleUpload(req, res, handler) {
  const form = formidable({ multiples: true });
  form.parse(req, async (err, fields, files) => {
    // formidable never deletes its temp copies, which leaked a full WAV per upload
    const cleanup = () =>
      Object.values(files || {})
        .flat()
        .forEach((f) => f && f.filepath && fs.rmSync(f.filepath, { force: true }));

    try {
      if (err) throw err;
      const packId = Array.isArray(fields.packId) ? fields.packId[0] : fields.packId;
      if (!packId) throw new Error('packId is required');
      sendJson(res, 200, await handler(packId, files));
    } catch (handleErr) {
      sendJson(res, 500, { error: handleErr.message });
    } finally {
      cleanup();
    }
  });
}

function handleJson(req, res, handler) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      sendJson(res, 200, await handler(JSON.parse(body || '{}')));
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

// connect middleware for /api/manage, used by Studio Manager in the vite dev server
function studioApi(req, res, next) {
  const isAudio = req.method === 'GET' && req.url.startsWith('/inbox-audio?');
  if (req.method !== 'POST' && !isAudio) return next();

  if (!isFromThisComputer(req)) {
    return sendJson(res, 403, { error: 'Studio Manager only accepts requests from this computer' });
  }

  if (isAudio) return serveLoopAudio(req, res);
  if (UPLOAD_ROUTES[req.url]) return handleUpload(req, res, UPLOAD_ROUTES[req.url]);
  if (ROUTES[req.url]) return handleJson(req, res, ROUTES[req.url]);
  sendJson(res, 404, { error: 'Endpoint not found' });
}

module.exports = { studioApi };
