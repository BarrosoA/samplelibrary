export function triggerDirectDownload(url) {
  if (!url) return;
  // silent iframe download, no blank tab
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }, 30000);
}

export function registerDownloadWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Download worker unavailable, using in-page fallback:', err);
    });
  }
}

export const hasMaster = (track) => Boolean(track?.master?.parts?.length);

export const canDownloadTrack = (track) => hasMaster(track) || Boolean(track?.downloadUrl);

const workerReady = () => Boolean(navigator.serviceWorker?.controller);

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim() || 'download';
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function fetchMaster(track) {
  const parts = [];
  for (const partUrl of track.master.parts) {
    const res = await fetch(partUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parts.push(await res.blob());
  }
  return new Blob(parts, { type: 'audio/wav' });
}

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// best-effort ping to the download counter; never holds up the download.
// it goes to this site (vercel.json forwards it to cloudflare) because blockers like brave drop cross-site pings
function countDownload(tracks, packId) {
  const ids = tracks.filter(hasMaster).map((t) => t.id);
  if (ids.length === 0 || isLocalhost()) return;
  fetch('/api/downloaded', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(packId ? { pack: packId, tracks: ids } : { tracks: ids }),
    keepalive: true,
  }).catch(() => {
    // counting is optional
  });
}

// resolves once the browser has the download (worker path) or the file is saved (fallback path)
export async function downloadTrack(pack, track) {
  countDownload([track]);
  if (!hasMaster(track)) {
    triggerDirectDownload(track?.downloadUrl);
    return;
  }
  if (workerReady() && pack) {
    triggerDirectDownload(`/_dl/t/${encodeURIComponent(pack.id)}/${encodeURIComponent(track.id)}`);
    return;
  }
  saveBlob(await fetchMaster(track), safeName(track.master.filename));
}

export async function downloadPack(pack) {
  const tracks = (pack.tracks || []).filter(hasMaster);
  countDownload(tracks, pack.id);
  if (tracks.length === 0) {
    (pack.tracks || []).forEach((t, i) => setTimeout(() => triggerDirectDownload(t.downloadUrl), i * 600));
    return;
  }
  if (workerReady()) {
    triggerDirectDownload(`/_dl/p/${encodeURIComponent(pack.id)}`);
    return;
  }

  const { downloadZip } = await import('client-zip');
  const folder = safeName(pack.name);
  const used = new Set();
  const files = [];
  for (const t of tracks) {
    const base = safeName(t.master.filename);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base.replace(/(\.[^.]*)?$/, ` (${n})$1`);
    used.add(name.toLowerCase());
    files.push({ name: `${folder}/${name}`, input: await fetchMaster(t), lastModified: new Date() });
  }
  saveBlob(await downloadZip(files).blob(), `${folder}.zip`);
}
