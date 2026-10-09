const cache = new Map();

// average of the cover's colourful, non-dark pixels, brightened to a consistent level
export function getCoverColor(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return Promise.resolve(cache.get(src));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2]);
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          const saturation = max ? (max - min) / max : 0;
          const weight = (saturation * saturation + 0.05) * (max > 30 ? 1 : 0.05);
          r += data[i] * weight;
          g += data[i + 1] * weight;
          b += data[i + 2] * weight;
          total += weight;
        }
        if (!total) return resolve(null);

        const avg = [r / total, g / total, b / total];
        const peak = Math.max(...avg) || 1;
        const color = avg.map((v) => Math.round((v * 200) / peak));
        cache.set(src, color);
        resolve(color);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
