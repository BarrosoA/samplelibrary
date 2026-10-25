const fs = require('fs');
const manager = require('./catalogue-manager.cjs');
const media = require('./media-store.cjs');

const formidablePkg = require('formidable');
const formidable = typeof formidablePkg === 'function' ? formidablePkg : (formidablePkg.formidable || formidablePkg.default);

const AUDIO_TYPES = { '.wav': 'audio/wav', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac', '.opus': 'audio/ogg' };

// watchdog tracks studio manager activity and auto-stops server when closed
const WATCHDOG_TIMEOUT_MS = 25000;
const STARTUP_GRACE_MS = 30000;
const GOODBYE_GRACE_MS = 5000;

const watchdog = global.__studioWatchdogState || (global.__studioWatchdogState = {
  lastHeartbeat: 0,
  hasConnected: false,
  goodbyeTimer: null,
  timer: null,
  startTime: Date.now(),
});

function ensureWatchdog() {
  if (watchdog.timer) return;
  watchdog.timer = setInterval(() => {
    if (process.env.STUDIO_NO_AUTO_EXIT === '1') return;

    const now = Date.now();
    if (watchdog.hasConnected) {
      if (now - watchdog.lastHeartbeat > WATCHDOG_TIMEOUT_MS) {
        clearInterval(watchdog.timer);
        watchdog.timer = null;
        console.log('\n[studio] no heartbeat received; studio tab closed, stopping server');
        process.exit(0);
      }
    } else if (process.env.STUDIO_AUTO_EXIT === '1') {
      if (now - watchdog.startTime > STARTUP_GRACE_MS) {
        clearInterval(watchdog.timer);
        watchdog.timer = null;
        console.log('\n[studio] no browser session connected within startup grace period; stopping server');
        process.exit(0);
      }
    }
  }, 2000);
  if (watchdog.timer.unref) watchdog.timer.unref();
}

if (process.env.STUDIO_AUTO_EXIT === '1') {
  ensureWatchdog();
}

function handleHeartbeat() {
  watchdog.lastHeartbeat = Date.now();
  watchdog.hasConnected = true;
  if (watchdog.goodbyeTimer) {
    clearTimeout(watchdog.goodbyeTimer);
    watchdog.goodbyeTimer = null;
  }
  ensureWatchdog();
  return { ok: true };
}

function handleGoodbye() {
  if (!watchdog.hasConnected) return { ok: true };
  if (!watchdog.goodbyeTimer) {
    watchdog.goodbyeTimer = setTimeout(() => {
      console.log('\n[studio] studio session closed in browser; stopping server');
      process.exit(0);
    }, GOODBYE_GRACE_MS);
    if (watchdog.goodbyeTimer.unref) watchdog.goodbyeTimer.unref();
  }
  return { ok: true };
}

// json endpoints: each receives the parsed request body
const ROUTES = {
  '/heartbeat': () => handleHeartbeat(),
  '/goodbye': () => handleGoodbye(),
  '/create-pack': (p) => manager.createBlankPack(p),
  '/update-pack': (p) => manager.updatePack(p.packId, p.updates),
  '/delete-pack': (p) => manager.deletePack(p.packId),
  '/reorder-packs': (p) => manager.reorderPacks(p.packIds),
  '/delete-track': (p) => manager.deleteTrack(p.packId, p.trackId),
  '/update-track': (p) => manager.updateTrack(p.packId, p.trackId, p.updates),
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
  '/upload-cover': (packId, files, fields) => {
    const coverFile = Array.isArray(files.cover) ? files.cover[0] : files.cover;
    if (!coverFile) throw new Error('No cover file uploaded');
    const getVal = (val, def) => (Array.isArray(val) ? val[0] : val) ?? def;
    const options = {
      startTime: getVal(fields?.startTime, 0),
      duration: getVal(fields?.duration, 4),
      fps: getVal(fields?.fps, 15),
      size: getVal(fields?.size, 480),
      quality: getVal(fields?.quality, 75),
    };
    return manager.updatePackCover(packId, coverFile.filepath, coverFile.originalFilename, options);
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

// plays the local copy so samples can be auditioned before they are published, otherwise the live file
function servePreviewAudio(req, res) {
  const url = new URL(req.url, 'http://localhost').searchParams.get('url');
  const file = media.localPreviewFile(url);
  if (file) return sendFileWithRanges(req, res, file);
  if (!media.relPathFromUrl(url)) {
    res.statusCode = 404;
    return res.end('Not a preview from the media store');
  }
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
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
      sendJson(res, 200, await handler(packId, files, fields));
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
  const isAudio = req.method === 'GET' && (req.url.startsWith('/inbox-audio?') || req.url.startsWith('/preview-audio?'));
  if (req.method !== 'POST' && !isAudio) return next();

  if (!isFromThisComputer(req)) {
    return sendJson(res, 403, { error: 'Studio Manager only accepts requests from this computer' });
  }

  if (isAudio) return req.url.startsWith('/preview-audio?') ? servePreviewAudio(req, res) : serveLoopAudio(req, res);
  if (UPLOAD_ROUTES[req.url]) return handleUpload(req, res, UPLOAD_ROUTES[req.url]);
  if (ROUTES[req.url]) return handleJson(req, res, ROUTES[req.url]);
  sendJson(res, 404, { error: 'Endpoint not found' });
}

module.exports = { studioApi };
