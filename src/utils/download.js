export function triggerDirectDownload(url) {
  if (!url) return;
  // silent download via hidden iframe avoids opening blank browser tabs
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
