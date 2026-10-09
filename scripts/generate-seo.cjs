const fs = require('fs');
const path = require('path');

// generate seo meta tags and static pack html pages for social scrapers
function generateSeo() {
  const distDir = path.resolve(__dirname, '../dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  const tracksJsonPath = path.resolve(__dirname, '../src/data/tracks.json');

  if (!fs.existsSync(indexHtmlPath)) {
    console.warn('[SEO] dist/index.html not found, skipping SEO generation.');
    return;
  }

  if (!fs.existsSync(tracksJsonPath)) {
    console.warn('[SEO] tracks.json not found, skipping SEO generation.');
    return;
  }

  const rawJson = fs.readFileSync(tracksJsonPath, 'utf-8');
  const data = JSON.parse(rawJson);
  const packs = data.packs || [];

  let baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

  // use latest pack for default homepage social image
  const latestPack = packs.length > 0 ? packs[0] : null;
  if (latestPack && latestPack.cover) {
    baseHtml = baseHtml
      .replace(
        /<meta property="og:image" content=".*?"\s*\/?>/,
        `<meta property="og:image" content="${latestPack.cover}" />`
      )
      .replace(
        /<meta name="twitter:image" content=".*?"\s*\/?>/,
        `<meta name="twitter:image" content="${latestPack.cover}" />`
      );

    fs.writeFileSync(indexHtmlPath, baseHtml, 'utf-8');
    console.log(`[SEO] Updated root index.html with latest pack cover: ${latestPack.cover}`);
  }

  // generate pre-rendered html for each individual pack
  packs.forEach((pack) => {
    const packDir = path.join(distDir, 'pack', pack.id);
    fs.mkdirSync(packDir, { recursive: true });

    const packTitle = `${pack.name} — NO LUV`;
    const packDesc = pack.description || `Original master samples by @noluvmusic. ${pack.tracks ? pack.tracks.length : 0} samples included.`;
    const packCover = pack.cover || (latestPack ? latestPack.cover : '/images/pack-cover.jpg');

    let packHtml = baseHtml
      .replace(/<title>.*?<\/title>/, `<title>${packTitle}</title>`)
      .replace(
        /<meta property="og:title" content=".*?"\s*\/?>/,
        `<meta property="og:title" content="${packTitle}" />`
      )
      .replace(
        /<meta property="og:description" content=".*?"\s*\/?>/,
        `<meta property="og:description" content="${packDesc}" />`
      )
      .replace(
        /<meta property="og:image" content=".*?"\s*\/?>/,
        `<meta property="og:image" content="${packCover}" />`
      )
      .replace(
        /<meta name="twitter:title" content=".*?"\s*\/?>/,
        `<meta name="twitter:title" content="${packTitle}" />`
      )
      .replace(
        /<meta name="twitter:description" content=".*?"\s*\/?>/,
        `<meta name="twitter:description" content="${packDesc}" />`
      )
      .replace(
        /<meta name="twitter:image" content=".*?"\s*\/?>/,
        `<meta name="twitter:image" content="${packCover}" />`
      );

    const outPath = path.join(packDir, 'index.html');
    fs.writeFileSync(outPath, packHtml, 'utf-8');
    console.log(`[SEO] Generated pre-rendered social page for pack: ${pack.id} (${packTitle})`);
  });

  console.log('[SEO] SEO pre-rendering complete.');
}

generateSeo();

