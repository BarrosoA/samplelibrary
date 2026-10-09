/* global downloadZip */
importScripts('/vendor/client-zip.js');

const DL_PREFIX = '/_dl/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// cloudflare pages ignores Range headers, which breaks seeking (and Safari playback) for previews
const PREVIEW_PATH = /^\/p\/[0-9a-f]{24}\.opus$/;
const PREVIEW_CACHE = 'previews-v1';
const PREVIEW_CACHE_LIMIT = 40;
const previewFetches = new Map();

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && PREVIEW_PATH.test(url.pathname)) {
    event.respondWith(servePreview(event.request).catch(() => fetch(event.request)));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(DL_PREFIX)) return;

  let finish;
  const done = new Promise((resolve) => (finish = resolve));
  // keep the worker alive until the whole file has streamed out
  event.waitUntil(done);
  event.respondWith(
    handleDownload(url, finish).catch((err) => {
      finish();
      return new Response(`Download failed: ${err.message}`, { status: 500 });
    })
  );
});

async function loadPreview(url) {
  const cache = await caches.open(PREVIEW_CACHE);
  const cached = await cache.match(url);
  if (cached) return cached.blob();

  if (!previewFetches.has(url)) {
    const pending = (async () => {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(url, res.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - PREVIEW_CACHE_LIMIT)).map((k) => cache.delete(k)));
      return res.blob();
    })().finally(() => previewFetches.delete(url));
    previewFetches.set(url, pending);
  }
  return previewFetches.get(url);
}

async function servePreview(request) {
  const blob = await loadPreview(request.url);
  const size = blob.size;
  const headers = { 'Content-Type': blob.type || 'audio/ogg', 'Accept-Ranges': 'bytes' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');

  if (!match || (!match[1] && !match[2])) {
    return new Response(blob, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  }

  let start;
  let end;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  } else {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim() || 'download';
}

function attachmentHeaders(filename, type, length) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const headers = {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };
  if (length != null) headers['Content-Length'] = String(length);
  return headers;
}

function joinParts(parts, onEndOnce) {
  let index = 0;
  let reader = null;
  let ended = false;
  const onEnd = () => {
    if (!ended) {
      ended = true;
      onEndOnce();
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          if (!reader) {
            if (index >= parts.length) {
              controller.close();
              onEnd();
              return;
            }
            const res = await fetch(parts[index++], { mode: 'cors' });
            if (!res.ok) throw new Error(`part ${index} returned HTTP ${res.status}`);
            reader = res.body.getReader();
          }
          const { done, value } = await reader.read();
          if (done) {
            reader = null;
            continue;
          }
          controller.enqueue(value);
          return;
        }
      } catch (err) {
        onEnd();
        throw err;
      }
    },
    cancel(reason) {
      onEnd();
      if (reader) reader.cancel(reason);
    },
  });
}

async function loadPack(packId) {
  const res = await fetch('/tracks.json', { cache: 'no-cache' });
  const catalogue = await res.json();
  const pack = (catalogue.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error('pack not found');
  return pack;
}

function packEntries(pack) {
  const folder = safeName(pack.name);
  const used = new Set();
  return (pack.tracks || [])
    .filter((t) => t.master && t.master.parts && t.master.parts.length)
    .map((t) => {
      const base = safeName(t.master.filename);
      let name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = base.replace(/(\.[^.]*)?$/, ` (${n})$1`);
      used.add(name.toLowerCase());
      return { track: t, name: `${folder}/${name}`, size: t.master.size };
    });
}

async function handleDownload(url, finish) {
  const [kind, ...ids] = url.pathname.slice(DL_PREFIX.length).split('/').map(decodeURIComponent);
  const pack = await loadPack(ids[0]);

  if (kind === 't') {
    const track = (pack.tracks || []).find((t) => t.id === ids[1]);
    if (!track || !track.master) throw new Error('sample not found');
    return new Response(
      joinParts(track.master.parts, finish),
      { headers: attachmentHeaders(safeName(track.master.filename), 'audio/wav', track.master.size) }
    );
  }

  if (kind === 'p') {
    const entries = packEntries(pack);
    if (!entries.length) throw new Error('pack has no downloadable samples');
    let remaining = entries.length;
    const onEntryEnd = () => {
      if (--remaining === 0) finish();
    };
    const files = entries.map((e) => ({
      name: e.name,
      size: e.size,
      lastModified: new Date(),
      input: joinParts(e.track.master.parts, onEntryEnd),
    }));
    const zip = downloadZip(files, { metadata: entries.map(({ name, size }) => ({ name, size })) });
    return new Response(zip.body, {
      headers: attachmentHeaders(`${safeName(pack.name)}.zip`, 'application/zip', zip.headers.get('Content-Length')),
    });
  }

  throw new Error('unknown download type');
}
