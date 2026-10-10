export const NEW_LOOPS_ID = '__new_loops__';

export const inboxAudioUrl = (filePath) => `/api/manage/inbox-audio?path=${encodeURIComponent(filePath)}`;
export const previewAudioUrl = (url) => `/api/manage/preview-audio?url=${encodeURIComponent(url)}`;

async function readResponse(res, fallbackError) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallbackError);
  return data;
}

// calls a Studio Manager endpoint and throws the server's error message if it fails
export async function postJson(endpoint, body = {}, fallbackError = 'Something went wrong') {
  const res = await fetch(`/api/manage/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readResponse(res, fallbackError);
}

export async function postForm(endpoint, formData, fallbackError = 'Something went wrong') {
  const res = await fetch(`/api/manage/${endpoint}`, { method: 'POST', body: formData });
  return readResponse(res, fallbackError);
}

export const hasDraggedFiles = (e) => Boolean(e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files'));

// compact drag badge instead of the browser's screenshot of the whole wide row
export function setDragPill(e, title, withIcon = true) {
  const ghost = document.createElement('div');
  ghost.className = 'studio-drag-ghost-pill';
  if (withIcon) {
    const icon = document.createElement('span');
    icon.className = 'ghost-music-icon';
    icon.textContent = '♫';
    ghost.append(icon, ' ');
  }
  const label = document.createElement('span');
  label.className = 'ghost-title';
  label.textContent = title;
  ghost.append(label);
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 14, 14);
  // the browser captures the image synchronously, so the element can go right away
  setTimeout(() => ghost.remove(), 0);
}

export function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
