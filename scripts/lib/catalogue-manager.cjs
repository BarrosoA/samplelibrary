const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PUBLIC_TRACKS_PATH = path.resolve(__dirname, '../../public/tracks.json');
const SRC_TRACKS_PATH = path.resolve(__dirname, '../../src/data/tracks.json');
const AUDIO_DIR = path.resolve(__dirname, '../../public/audio');
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

  // remove preview file if local
  if (removedTrack.previewUrl && removedTrack.previewUrl.startsWith('/audio/')) {
    const filename = path.basename(removedTrack.previewUrl);
    const filePath = path.join(AUDIO_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`could not delete preview file ${filePath}:`, err.message);
      }
    }
  }

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

function deletePack(packId) {
  const data = loadCatalogue();
  const packIndex = (data.packs || []).findIndex((p) => p.id === packId);
  if (packIndex === -1) throw new Error(`pack ${packId} not found`);

  const [pack] = data.packs.splice(packIndex, 1);

  // delete preview files
  (pack.tracks || []).forEach((t) => {
    if (t.previewUrl && t.previewUrl.startsWith('/audio/')) {
      const filename = path.basename(t.previewUrl);
      const filePath = path.join(AUDIO_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
      }
    }
  });

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

  return { title, bpm: bpm || 130, key: key || '-' };
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

function encodePreviewMp3(inputFilePath, outputFilename) {
  const outPath = path.join(AUDIO_DIR, outputFilename);
  execSync(
    `ffmpeg -y -i "${inputFilePath}" -c:a libmp3lame -b:a 128k "${outPath}"`,
    { stdio: 'pipe' }
  );
  return `/audio/${outputFilename}`;
}

function importPackFromStaging({ folderPath, packName, description, downloadUrl }) {
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

  let coverPath = '/images/pack-1.png';
  if (coverFile) {
    const ext = path.extname(coverFile).toLowerCase();
    const destName = `custom-${slug}${ext}`;
    const destPath = path.join(IMAGES_DIR, destName);
    fs.copyFileSync(path.join(folderPath, coverFile), destPath);
    coverPath = `/images/${destName}`;
  }

  // find audio files
  const audioExtensions = ['.wav', '.mp3', '.flac', '.aiff', '.m4a'];
  const audioFiles = files
    .filter((f) => audioExtensions.includes(path.extname(f).toLowerCase()))
    .sort();

  if (audioFiles.length === 0) {
    throw new Error(`no audio files found in ${folderPath}`);
  }

  const tracks = [];
  audioFiles.forEach((file, index) => {
    const fullAudioPath = path.join(folderPath, file);
    const meta = parseAudioMetadataFromFilename(file);
    const duration = probeDuration(fullAudioPath);
    const trackSlug = `${slug}-${index + 1}`;
    const previewFilename = `${trackSlug}.mp3`;
    const previewUrl = encodePreviewMp3(fullAudioPath, previewFilename);

    tracks.push({
      id: trackSlug,
      title: meta.title,
      bpm: meta.bpm,
      key: meta.key,
      instrument: 'Master Sample',
      duration,
      previewUrl,
      downloadUrl: downloadUrl || '',
      format: path.extname(file).replace('.', '').toUpperCase(),
    });
  });

  const newPack = {
    id: `pack-${slug}`,
    name: packName.toUpperCase(),
    cover: coverPath,
    trackCount: tracks.length,
    description: description ? description.trim() : '',
    downloadUrl: downloadUrl || '',
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

module.exports = {
  loadCatalogue,
  saveCatalogue,
  deleteTrack,
  moveTrack,
  reorderTracks,
  deletePack,
  updatePack,
  importPackFromStaging,
  parseAudioMetadataFromFilename,
  probeDuration,
  encodePreviewMp3,
};

