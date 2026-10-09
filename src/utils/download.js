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

