const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const media = require('./lib/media-store.cjs');
const manager = require('./lib/catalogue-manager.cjs');

const LEGACY_PREVIEW_DIR = path.resolve(__dirname, '../public/audio');

function driveDirectUrl(url) {
  const id = (url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/) || [])[1];
  if (!id || !url.includes('drive.google.com')) return url;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

async function downloadToTemp(url) {
  const res = await fetch(driveDirectUrl(url), { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if ((res.headers.get('content-type') || '').includes('text/html')) {
    throw new Error(`got a web page instead of a file for ${url} (link may be private or quota-limited)`);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const name = decodeURIComponent(
    (disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i) || [])[1] || ''
  );
  const tmp = path.join(os.tmpdir(), `media-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  return { tmp, name };
}

async function migrate() {
  const data = manager.loadCatalogue();
  let migrated = 0;

  for (const pack of data.packs || []) {
    for (const track of pack.tracks || []) {
      if (track.master) continue;
      console.log(`\n${pack.name} / ${track.title}`);
      const temps = [];
      try {
        const localPreview = track.previewUrl && path.join(LEGACY_PREVIEW_DIR, path.basename(track.previewUrl.split('?')[0]));
        if (localPreview && fs.existsSync(localPreview)) {
          track.previewUrl = media.addPreview(localPreview);
        } else if (track.previewUrl) {
          const dl = await downloadToTemp(track.previewUrl);
          temps.push(dl.tmp);
          track.previewUrl = media.addPreview(dl.tmp);
        }
        console.log(`  preview -> ${track.previewUrl}`);

        if (!track.downloadUrl) throw new Error('no master download link to migrate from');
        const dl = await downloadToTemp(track.downloadUrl);
        temps.push(dl.tmp);
        const filename = dl.name || `${track.title}.${(track.format || 'wav').toLowerCase()}`;
        track.master = media.addMaster(dl.tmp, filename);
        delete track.downloadUrl;
        console.log(`  master  -> ${filename} (${(track.master.size / 1048576).toFixed(1)} MB, ${track.master.parts.length} part(s))`);
        migrated++;
      } catch (err) {
        console.warn(`  skipped: ${err.message}`);
      } finally {
        temps.forEach((t) => fs.rmSync(t, { force: true }));
      }
    }
    if ((pack.tracks || []).every((t) => t.master)) delete pack.downloadUrl;
  }

  manager.saveCatalogue(data);
  console.log(`\nMigrated ${migrated} track(s) into ${media.loadEnvConfig().mediaRoot}`);
  console.log('Run "npm run media:deploy" (or PUBLISH TO LIVE in Studio Manager) to upload them.');
}

function rebase() {
  const { baseUrl } = media.loadEnvConfig();
  const data = manager.loadCatalogue();
  const fix = (url) => (typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+\/(?=[pm]\/[0-9a-f]{24}\.)/, `${baseUrl}/`) : url);
  let changed = 0;
  (data.packs || []).forEach((p) =>
    (p.tracks || []).forEach((t) => {
      const before = JSON.stringify(t);
      t.previewUrl = fix(t.previewUrl);
      if (t.master) t.master.parts = t.master.parts.map(fix);
      if (JSON.stringify(t) !== before) changed++;
    })
  );
  manager.saveCatalogue(data);
  console.log(`Pointed ${changed} track(s) at ${baseUrl}`);
}

function adopt() {
  const { adopted, kept } = media.adoptKeptMasters(manager.loadCatalogue());
  adopted.forEach((a) => console.log(`  now uses original: ${a}`));
  kept.forEach((k) => console.log(`  keeping stored copy (original not found in Compositions): ${k}`));
  console.log(`\n${adopted.length} stored copies removed, ${kept.length} kept.`);
}

// adds player waveforms to samples added before waveforms existed, from their local preview copy;
// --force recalculates every one (after the waveform calculation changes)
function peaks() {
  const force = process.argv.includes('--force');
  const data = manager.loadCatalogue();
  const { deploy } = media.ensureMediaDir();
  let added = 0;
  for (const track of (data.packs || []).flatMap((p) => p.tracks || [])) {
    if (!force && Array.isArray(track.peaks) && track.peaks.length) continue;
    const rel = media.relPathFromUrl(track.previewUrl);
    const file = rel && path.join(deploy, rel);
    if (!file || !fs.existsSync(file)) {
      console.log(`  no local preview for "${track.title}", skipped`);
      continue;
    }
    track.peaks = manager.computePeaks(file);
    if (track.peaks) added += 1;
  }
  manager.saveCatalogue(data);
  console.log(`Added waveforms to ${added} sample(s).`);
}

// re-encodes previews with loudness normalization so quieter samples audition at standard volume
async function normalize() {
  const data = manager.loadCatalogue();
  const { deploy } = media.ensureMediaDir();
  const sources = media.readSources();

  let normalized = 0;
  const oldPreviews = [];

  for (const pack of data.packs || []) {
    for (const track of pack.tracks || []) {
      const oldUrl = track.previewUrl;
      const key = media.masterKey(track.master);
      const sourceInfo = sources[key];
      const sourcePath = sourceInfo && sourceInfo.path;

      let tempMaster = null;
      let inputPath = null;

      try {
        if (sourcePath && fs.existsSync(sourcePath)) {
          inputPath = sourcePath;
        } else if (track.master && track.master.parts && track.master.parts.length) {
          const partFiles = track.master.parts.map((p) => {
            const rel = media.relPathFromUrl(p);
            return rel && path.join(deploy, rel);
          });
          const allExist = partFiles.every((f) => f && fs.existsSync(f));
          if (allExist) {
            if (partFiles.length === 1) {
              inputPath = partFiles[0];
            } else {
              tempMaster = path.join(os.tmpdir(), `norm-master-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
              const outStream = fs.createWriteStream(tempMaster);
              for (const pf of partFiles) {
                outStream.write(fs.readFileSync(pf));
              }
              await new Promise((resolve) => outStream.end(resolve));
              inputPath = tempMaster;
            }
          }
        }

        // fallback to existing preview if master source unavailable
        if (!inputPath) {
          const previewRel = media.relPathFromUrl(track.previewUrl);
          const previewFile = previewRel && path.join(deploy, previewRel);
          if (previewFile && fs.existsSync(previewFile)) {
            inputPath = previewFile;
          }
        }

        if (!inputPath) {
          console.warn(`  skipped "${track.title}": no audio source found`);
          continue;
        }

        console.log(`Normalizing preview: ${pack.name} / ${track.title}`);
        const newPreviewUrl = manager.encodePreviewAudio(inputPath);
        if (newPreviewUrl) {
          if (newPreviewUrl !== oldUrl && oldUrl) {
            oldPreviews.push({ previewUrl: oldUrl });
          }
          track.previewUrl = newPreviewUrl;
          const newRel = media.relPathFromUrl(newPreviewUrl);
          const newFile = newRel && path.join(deploy, newRel);
          if (newFile && fs.existsSync(newFile)) {
            track.peaks = manager.computePeaks(newFile) || track.peaks;
          }
          normalized++;
        }
      } catch (err) {
        console.warn(`  skipped "${track.title}": ${err.message}`);
      } finally {
        if (tempMaster) fs.rmSync(tempMaster, { force: true });
      }
    }
  }

  manager.saveCatalogue(data);
  if (oldPreviews.length) {
    media.retireTracks(oldPreviews, data);
  }
  console.log(`\nNormalized ${normalized} preview(s).`);
  console.log('Master WAV files remain untouched.');
}

const commands = {
  migrate,
  rebase,
  adopt,
  peaks,
  normalize,
  deploy: () => console.log(media.deploy({ catalogue: manager.loadCatalogue(), force: process.argv.includes('--force') }).message),
};

const cmd = commands[process.argv[2]];
if (!cmd) {
  console.log('Usage: node scripts/media.cjs <migrate|deploy|rebase|adopt|peaks|normalize> [--force]');
  process.exit(1);
}
Promise.resolve()
  .then(cmd)
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
