const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const media = require('./media-store.cjs');

const PUBLIC_TRACKS_PATH = path.resolve(__dirname, '../../public/tracks.json');
const SRC_TRACKS_PATH = path.resolve(__dirname, '../../src/data/tracks.json');
const IMAGES_DIR = path.resolve(__dirname, '../../public/images');

function loadCatalogue() {
  const content = fs.readFileSync(PUBLIC_TRACKS_PATH, 'utf8');
  return JSON.parse(content);
}

function saveCatalogue(data) {
  if (data.packs) {
    data.packs.forEach((p) => {
      p.trackCount = p.tracks ? p.tracks.length : 0;
    });
  }
  const formatted = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(PUBLIC_TRACKS_PATH, formatted, 'utf8');
  fs.writeFileSync(SRC_TRACKS_PATH, formatted, 'utf8');
  return data;
}

function deleteTrack(packId, trackId) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);

  const trackIndex = (pack.tracks || []).findIndex((t) => t.id === trackId);
  if (trackIndex === -1) throw new Error(`track ${trackId} not found in pack ${packId}`);

  const [removedTrack] = pack.tracks.splice(trackIndex, 1);
  media.retireTracks([removedTrack], data);

  saveCatalogue(data);
  return { success: true, removedTrack };
}

function moveTrack(sourcePackId, targetPackId, trackId) {
  const data = loadCatalogue();
  const sourcePack = (data.packs || []).find((p) => p.id === sourcePackId);
  if (!sourcePack) throw new Error(`source pack ${sourcePackId} not found`);

  const targetPack = (data.packs || []).find((p) => p.id === targetPackId);
  if (!targetPack) throw new Error(`target pack ${targetPackId} not found`);

  const trackIndex = (sourcePack.tracks || []).findIndex((t) => t.id === trackId);
  if (trackIndex === -1) throw new Error(`track ${trackId} not found in source pack`);

  const [trackToMove] = sourcePack.tracks.splice(trackIndex, 1);
  if (!targetPack.tracks) targetPack.tracks = [];
  targetPack.tracks.push(trackToMove);

  saveCatalogue(data);
  return { success: true, track: trackToMove, from: sourcePackId, to: targetPackId };
}

function reorderTracks(packId, trackIds) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);

  const currentTracks = pack.tracks || [];
  const trackMap = new Map(currentTracks.map((t) => [t.id, t]));

  const reordered = [];
  trackIds.forEach((id) => {
    if (trackMap.has(id)) {
      reordered.push(trackMap.get(id));
      trackMap.delete(id);
    }
  });

  // append any tracks that were not in trackIds list
  trackMap.forEach((t) => reordered.push(t));

  pack.tracks = reordered;
  saveCatalogue(data);
  return { success: true, tracks: reordered };
}

function reorderPacks(packIds) {
  const data = loadCatalogue();
  const currentPacks = data.packs || [];
  const packMap = new Map(currentPacks.map((p) => [p.id, p]));

  const reordered = [];
  packIds.forEach((id) => {
    if (packMap.has(id)) {
      reordered.push(packMap.get(id));
      packMap.delete(id);
    }
  });

  // append any remaining packs
  packMap.forEach((p) => reordered.push(p));

  data.packs = reordered;
  saveCatalogue(data);
  return { success: true, packs: reordered };
}

function deletePack(packId) {
  const data = loadCatalogue();
  const packIndex = (data.packs || []).findIndex((p) => p.id === packId);
  if (packIndex === -1) throw new Error(`pack ${packId} not found`);

  const [pack] = data.packs.splice(packIndex, 1);
  media.retireTracks(pack.tracks || [], data);

  // delete cover if custom
  if (pack.cover && pack.cover.startsWith('/images/custom-')) {
    const coverFile = path.join(IMAGES_DIR, path.basename(pack.cover));
    if (fs.existsSync(coverFile)) {
      try {
        fs.unlinkSync(coverFile);
      } catch (e) {}
    }
  }

  saveCatalogue(data);
  return { success: true, removedPack: pack };
}

function normalizeKey(str) {
  if (!str) return '-';
  let k = str.trim();
  const note = k[0].toUpperCase();
  let acc = '';
  let rest = k.slice(1);
  if (rest.startsWith('#') || rest.toLowerCase().startsWith('b')) {
    acc = rest[0] === '#' ? '#' : 'b';
    rest = rest.slice(1);
  }
  rest = rest.toLowerCase();
  let mode = '';
  if (rest.includes('min') || rest === 'm') mode = 'm';
  else if (rest.includes('maj')) mode = 'Maj';
  return note + acc + mode;
}

function parseAudioMetadataFromFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  let bpm = null;
  let key = null;

  const bpmMatch = nameWithoutExt.match(/(?:^|[\s_#-])(\d{2,3})\s*(?:bpm)?(?:[\s_#-]|$)/i);
  if (bpmMatch) {
    bpm = parseInt(bpmMatch[1], 10);
  }

  const keyMatch = nameWithoutExt.match(/(?:^|[\s_#-])([A-Ga-g][#b]?(?:min(?:or)?|maj(?:or)?|m)?)(?:[\s_#-]|$)/i);
  if (keyMatch) {
    key = normalizeKey(keyMatch[1]);
  }

  // clean title
  let title = nameWithoutExt
    .replace(/_/g, ' ')
    .replace(/(?:^|\s)\d{2,3}\s*(?:bpm)?(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)[A-Ga-g][#b]?(?:min(?:or)?|maj(?:or)?|m)?(?:\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) title = nameWithoutExt;

  return { title, bpm: bpm || 130, key: key || '-', hasBpm: Boolean(bpm), hasKey: Boolean(key) };
}

function probeDuration(filePath) {
  try {
    const stdout = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    );
    const sec = parseFloat(stdout.trim());
    return isNaN(sec) ? 10.0 : Math.round(sec * 100) / 100;
  } catch (err) {
    return 10.0;
  }
}

function encodePreviewAudio(inputFilePath) {
  const outPath = path.join(os.tmpdir(), `preview-${process.pid}-${Date.now()}.opus`);
  try {
    execSync(
      `ffmpeg -y -i "${inputFilePath}" -c:a libopus -b:a 128k -vbr on "${outPath}"`,
      { stdio: 'pipe' }
    );
    return media.addPreview(outPath);
  } finally {
    fs.rmSync(outPath, { force: true });
  }
}

function buildTrack({ id, audioPath, originalName, sourcePath }) {
  const meta = parseAudioMetadataFromFilename(originalName);
  return {
    id,
    title: meta.title,
    bpm: meta.bpm,
    key: meta.key,
    instrument: 'Master Sample',
    duration: probeDuration(audioPath),
    previewUrl: encodePreviewAudio(audioPath),
    master: media.addMaster(audioPath, originalName, sourcePath),
    format: (path.extname(originalName).replace('.', '') || 'WAV').toUpperCase(),
  };
}

function resolveLoopFile(filePath) {
  if (!media.isLoopPath(filePath) || !fs.existsSync(filePath)) {
    throw new Error('That file is not a loop in your Compositions folder');
  }
  return path.resolve(filePath);
}

function listInbox() {
  const { compositionsDir } = media.loadEnvConfig();
  if (!compositionsDir) return { enabled: false, items: [] };

  const state = media.readInboxState();
  const data = loadCatalogue();
  const tracksByKey = new Map();
  (data.packs || []).forEach((p) =>
    (p.tracks || []).forEach((t) => {
      const key = media.masterKey(t.master);
      if (!key) return;
      if (!tracksByKey.has(key)) tracksByKey.set(key, []);
      tracksByKey.get(key).push({ id: t.id, title: t.title, packId: p.id, packName: p.name, size: t.master.size });
    })
  );
  const sourceByPath = new Map(
    Object.entries(media.readSources()).map(([key, s]) => [path.resolve(s.path).toLowerCase(), { key, ...s }])
  );
  const librarySizes = new Set([...tracksByKey.values()].flat().map((t) => t.size));

  const items = [];
  for (const f of media.listLoopFiles()) {
    if (media.isSeenAtStart(state, f.path)) continue;
    if (state.dismissed[f.path] === f.mtimeMs) continue;
    const src = sourceByPath.get(f.path.toLowerCase());
    if (src && src.size === f.size && src.mtimeMs === f.mtimeMs && tracksByKey.has(src.key)) continue;

    const name = path.basename(f.path);
    const meta = parseAudioMetadataFromFilename(name);
    // still being exported if it was touched in the last few seconds
    const writing = Date.now() - f.arrivedMs < 8000;
    const warnings = [];
    if (!meta.hasBpm) warnings.push('No BPM in filename, it will be saved as 130');
    if (!meta.hasKey) warnings.push('No key in filename');
    const tag = path.basename(name, path.extname(name)).match(/@[\w.]+/);
    if (tag && tag[0].toLowerCase() !== '@noluvmusic') warnings.push(`Tag is spelled "${tag[0]}"`);

    const updates = src && tracksByKey.has(src.key) ? tracksByKey.get(src.key) : null;
    if (!updates && !writing && librarySizes.has(f.size)) {
      const same = tracksByKey.get(media.hashFile(f.path));
      if (same) warnings.push(`Exact same file is already in the library as "${same[0].title}" (${same[0].packName})`);
    }

    items.push({
      path: f.path,
      name,
      folder: path.relative(compositionsDir, path.dirname(f.path)),
      size: f.size,
      mtimeMs: f.arrivedMs,
      title: meta.title,
      bpm: meta.bpm,
      key: meta.key,
      warnings,
      writing,
      updates,
    });
  }
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { enabled: true, items };
}

function addTrackFromFile(packId, filePath) {
  const source = resolveLoopFile(filePath);
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);
  if (!pack.tracks) pack.tracks = [];

  const track = buildTrack({
    id: `${pack.id.replace(/^pack-/, '')}-${pack.tracks.length + 1}-${Date.now().toString().slice(-3)}`,
    audioPath: source,
    originalName: path.basename(source),
    sourcePath: source,
  });
  pack.tracks.push(track);
  saveCatalogue(data);
  return { success: true, track, pack };
}

// swaps in a re-exported version of a loop that is already in the library, keeping its place and id
function updateTrackFromFile(filePath) {
  const source = resolveLoopFile(filePath);
  const entry = Object.entries(media.readSources()).find(([, s]) => path.resolve(s.path).toLowerCase() === source.toLowerCase());
  if (!entry) throw new Error('No library sample uses this file');
  const oldKey = entry[0];

  const data = loadCatalogue();
  const targets = (data.packs || []).flatMap((p) => (p.tracks || []).filter((t) => media.masterKey(t.master) === oldKey));
  if (targets.length === 0) throw new Error('No library sample uses this file');

  const previewUrl = encodePreviewAudio(source);
  const master = media.addMaster(source, path.basename(source), source);
  const duration = probeDuration(source);
  const before = targets.map((t) => ({ ...t }));
  targets.forEach((t) => Object.assign(t, { previewUrl, master, duration }));
  saveCatalogue(data);
  media.retireTracks(before, data);
  return { success: true, updated: targets.map((t) => t.title) };
}

function dismissInbox(filePath) {
  media.dismissInboxFile(resolveLoopFile(filePath));
  return { success: true };
}

async function importPackFromStaging({ folderPath, packName, description }) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`staging folder ${folderPath} does not exist`);
  }

  const slug = packName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `pack-${Date.now()}`;

  const files = fs.readdirSync(folderPath);

  // find cover image
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  const coverFile = files.find((f) =>
    imageExtensions.includes(path.extname(f).toLowerCase())
  );

  let coverPath = '/images/pack-cover.jpg';
  if (coverFile) {
    const ext = path.extname(coverFile).toLowerCase();
    const destName = `custom-${slug}${ext}`;
    const destPath = path.join(IMAGES_DIR, destName);
    fs.copyFileSync(path.join(folderPath, coverFile), destPath);
    coverPath = `/images/${destName}`;
  }

  // find audio files
  const audioExtensions = ['.wav', '.mp3', '.flac', '.aiff', '.m4a', '.opus'];
  const audioFiles = files
    .filter((f) => audioExtensions.includes(path.extname(f).toLowerCase()))
    .sort();

  if (audioFiles.length === 0) {
    throw new Error(`no audio files found in ${folderPath}`);
  }

  const tracks = audioFiles.map((file, index) =>
    buildTrack({
      id: `${slug}-${index + 1}`,
      audioPath: path.join(folderPath, file),
      originalName: file,
      sourcePath: path.join(folderPath, file),
    })
  );

  const newPack = {
    id: `pack-${slug}`,
    name: packName.toUpperCase(),
    cover: coverPath,
    trackCount: tracks.length,
    description: description ? description.trim() : '',
    format: 'WAV',
    license: 'Royalty-Free',
    tracks,
  };

  const data = loadCatalogue();
  data.packs = data.packs || [];
  data.packs.unshift(newPack);
  saveCatalogue(data);

  return { success: true, pack: newPack };
}

function updatePack(packId, updates = {}) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);

  if (typeof updates.name === 'string') {
    const trimmed = updates.name.trim();
    if (trimmed) pack.name = trimmed;
  }
  if (typeof updates.description === 'string') {
    pack.description = updates.description.trim();
  }

  saveCatalogue(data);
  return { success: true, pack };
}

function updateTrack(packId, trackId, updates = {}) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);
  const track = (pack.tracks || []).find((t) => t.id === trackId);
  if (!track) throw new Error(`sample ${trackId} not found`);

  if (typeof updates.title === 'string') {
    const trimmed = updates.title.trim();
    if (trimmed) track.title = trimmed;
  }

  saveCatalogue(data);
  return { success: true, track };
}

function createBlankPack({ name = 'UNTITLED PACK' } = {}) {
  const data = loadCatalogue();
  data.packs = data.packs || [];

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pack';
  const idSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

  const newPack = {
    id: `pack-${idSlug}`,
    name: name.toUpperCase(),
    cover: '/images/pack-cover.jpg',
    trackCount: 0,
    description: '',
    format: 'WAV',
    license: 'Royalty-Free',
    tracks: [],
  };

  data.packs.unshift(newPack);
  saveCatalogue(data);
  return { success: true, pack: newPack };
}

function updatePackCover(packId, tempFilePath, originalFilename) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);

  const ext = (path.extname(originalFilename || '') || '.png').toLowerCase();
  const destName = `custom-${pack.id}-${Date.now()}${ext}`;
  const destPath = path.join(IMAGES_DIR, destName);

  fs.copyFileSync(tempFilePath, destPath);

  // remove previous custom cover if present
  if (pack.cover && pack.cover.startsWith('/images/custom-')) {
    const oldCoverFile = path.join(IMAGES_DIR, path.basename(pack.cover));
    if (fs.existsSync(oldCoverFile)) {
      try {
        fs.unlinkSync(oldCoverFile);
      } catch (e) {}
    }
  }

  pack.cover = `/images/${destName}`;
  saveCatalogue(data);
  return { success: true, cover: pack.cover, pack };
}

async function addTracksToPack(packId, files) {
  const data = loadCatalogue();
  const pack = (data.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`pack ${packId} not found`);

  if (!pack.tracks) pack.tracks = [];

  const addedTracks = [];
  for (const file of files) {
    const originalName = file.originalFilename || path.basename(file.filepath || file.path);
    const trackIndex = pack.tracks.length + 1;
    const newTrack = buildTrack({
      id: `${pack.id.replace(/^pack-/, '')}-${trackIndex}-${Date.now().toString().slice(-3)}`,
      audioPath: file.filepath || file.path,
      originalName,
    });
    pack.tracks.push(newTrack);
    addedTracks.push(newTrack);
  }

  saveCatalogue(data);
  return { success: true, tracks: addedTracks, pack };
}

function publishToGit() {
  try {
    const projectRoot = path.resolve(__dirname, '../..');

    // media must be live before the catalogue that points at it
    const mediaResult = media.deploy({ catalogue: loadCatalogue() });

    const statusBefore = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' }).trim();
    if (!statusBefore) {
      return { success: true, message: `${mediaResult.message} Catalogue already up to date on GitHub.` };
    }

    execSync('git add -A', { cwd: projectRoot });
    const statusStaged = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' }).trim();
    if (!statusStaged) {
      return { success: true, message: 'No file changes detected to commit.' };
    }

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    execSync(`git commit -m "update catalogue [studio manager] ${timestamp}"`, { cwd: projectRoot });
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim() || 'main';
    execSync(`git push origin ${currentBranch}`, { cwd: projectRoot });

    return {
      success: true,
      message: `${mediaResult.message} Catalogue pushed to GitHub. Vercel will deploy your live updates in ~60 seconds.`,
    };
  } catch (err) {
    console.error('[Git Publish Error]:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  loadCatalogue,
  saveCatalogue,
  deleteTrack,
  moveTrack,
  reorderTracks,
  reorderPacks,
  deletePack,
  updatePack,
  updateTrack,
  createBlankPack,
  updatePackCover,
  addTracksToPack,
  importPackFromStaging,
  listInbox,
  addTrackFromFile,
  updateTrackFromFile,
  dismissInbox,
  resolveLoopFile,
  parseAudioMetadataFromFilename,
  probeDuration,
  encodePreviewAudio,
  publishToGit,
};


