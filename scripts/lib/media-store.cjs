const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, '.env.local');

// cloudflare pages rejects files over 25 MiB
const PART_SIZE = 24 * 1024 * 1024;

function loadEnvConfig() {
  const env = {};
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    });
  }
  const get = (k) => env[k] || process.env[k] || '';
  const projectName = get('CF_PAGES_PROJECT') || 'musicportfolio';
  return {
    env,
    projectName,
    mediaRoot: path.resolve(PROJECT_ROOT, get('MEDIA_DIR') || '../samplelibrary-media'),
    baseUrl: (get('MEDIA_BASE_URL') || `https://${projectName}.pages.dev`).replace(/\/+$/, ''),
  };
}

function dirs() {
  const { mediaRoot } = loadEnvConfig();
  return {
    root: mediaRoot,
    deploy: path.join(mediaRoot, 'deploy'),
    removed: path.join(mediaRoot, 'removed'),
    state: path.join(mediaRoot, 'last-deploy.json'),
  };
}

const HEADERS_FILE = `/*
  Access-Control-Allow-Origin: *
  X-Robots-Tag: noindex, nofollow, noarchive, noai, noimageai
  Cache-Control: public, max-age=31536000, immutable

/robots.txt
  Cache-Control: public, max-age=3600
`;

const ROBOTS_FILE = `User-agent: *
Disallow: /
`;

function ensureMediaDir() {
  const d = dirs();
  for (const sub of [d.deploy, path.join(d.deploy, 'p'), path.join(d.deploy, 'm'), d.removed]) {
    fs.mkdirSync(sub, { recursive: true });
  }
  fs.writeFileSync(path.join(d.deploy, '_headers'), HEADERS_FILE);
  fs.writeFileSync(path.join(d.deploy, 'robots.txt'), ROBOTS_FILE);
  // without a 404.html pages falls back to single-page-app routing
  fs.writeFileSync(path.join(d.deploy, '404.html'), 'Not found\n');
  return d;
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return hash.digest('hex').slice(0, 24);
}

function urlFor(relPath) {
  return `${loadEnvConfig().baseUrl}/${relPath}`;
}

function relPathFromUrl(url) {
  const { baseUrl } = loadEnvConfig();
  if (typeof url !== 'string' || !url.startsWith(`${baseUrl}/`)) return null;
  return url.slice(baseUrl.length + 1);
}

function addPreview(localOpusPath) {
  const d = ensureMediaDir();
  const rel = `p/${hashFile(localOpusPath)}.opus`;
  const dest = path.join(d.deploy, rel);
  if (!fs.existsSync(dest)) fs.copyFileSync(localOpusPath, dest);
  return urlFor(rel);
}

function addMaster(localFilePath, filename) {
  const d = ensureMediaDir();
  const key = hashFile(localFilePath);
  const size = fs.statSync(localFilePath).size;
  const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
  const parts = [];

  const fd = fs.openSync(localFilePath, 'r');
  try {
    for (let i = 0; i < partCount; i++) {
      const rel = `m/${key}.${i}`;
      const dest = path.join(d.deploy, rel);
      if (!fs.existsSync(dest)) {
        const len = Math.min(PART_SIZE, size - i * PART_SIZE);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, i * PART_SIZE);
        fs.writeFileSync(dest, buf);
      }
      parts.push(urlFor(rel));
    }
  } finally {
    fs.closeSync(fd);
  }

  return { filename, size, parts };
}

function trackMediaUrls(track) {
  const urls = [];
  if (track.previewUrl) urls.push(track.previewUrl);
  if (track.master && Array.isArray(track.master.parts)) urls.push(...track.master.parts);
  return urls;
}

// moves files out of the deploy folder (never deletes) unless the catalogue still uses them
function retireTracks(removedTracks, catalogue) {
  const d = dirs();
  const stillUsed = new Set();
  (catalogue.packs || []).forEach((p) => (p.tracks || []).forEach((t) => trackMediaUrls(t).forEach((u) => stillUsed.add(u))));

  removedTracks.flatMap(trackMediaUrls).forEach((url) => {
    if (stillUsed.has(url)) return;
    const rel = relPathFromUrl(url);
    if (!rel) return;
    const src = path.join(d.deploy, rel);
    if (!fs.existsSync(src)) return;
    const dest = path.join(d.removed, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
  });
}

function listDeployFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listDeployFiles(full, base);
    const st = fs.statSync(full);
    return [`${path.relative(base, full).split(path.sep).join('/')}:${st.size}`];
  });
}

function wrangler(args, extraEnv) {
  const { env } = loadEnvConfig();
  const childEnv = { ...process.env };
  for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (env[k]) childEnv[k] = env[k];
  }
  return execSync(`npx wrangler ${args}`, {
    cwd: PROJECT_ROOT,
    env: { ...childEnv, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ensureProject() {
  const { projectName, baseUrl } = loadEnvConfig();
  let projects;
  try {
    projects = JSON.parse(wrangler('pages project list --json'));
  } catch (err) {
    throw new Error(`Could not reach Cloudflare. Run "npx wrangler login" once, then try again. (${(err.stderr || err.message).trim().split('\n').pop()})`);
  }
  let project = projects.find((p) => (p['Project Name'] || p.name) === projectName);
  if (!project) {
    // --force keeps it a classic Pages project; newer wrangler otherwise tries to create a Worker and fails on a plain folder
    wrangler(`pages project create ${projectName} --production-branch=main --force`);
    projects = JSON.parse(wrangler('pages project list --json'));
    project = projects.find((p) => (p['Project Name'] || p.name) === projectName);
  }
  const domains = String((project && (project['Project Domains'] || project.domains)) || '');
  const host = new URL(baseUrl).host;
  if (domains && !domains.includes(host)) {
    throw new Error(`Cloudflare project "${projectName}" is served at ${domains}, but MEDIA_BASE_URL is ${baseUrl}. Set MEDIA_BASE_URL in .env.local to the right address and run "npm run media:rebase".`);
  }
}

function deploy({ force = false } = {}) {
  const d = ensureMediaDir();
  const { projectName } = loadEnvConfig();
  const snapshot = listDeployFiles(d.deploy).sort();
  const previous = fs.existsSync(d.state) ? JSON.parse(fs.readFileSync(d.state, 'utf8')) : [];

  if (!force && JSON.stringify(snapshot) === JSON.stringify(previous)) {
    return { deployed: false, message: 'Media already up to date on Cloudflare.' };
  }

  ensureProject();
  wrangler(`pages deploy "${d.deploy}" --project-name=${projectName} --branch=main --commit-dirty=true`);
  fs.writeFileSync(d.state, JSON.stringify(snapshot, null, 2));
  return { deployed: true, message: `Uploaded media to Cloudflare Pages (${snapshot.length} files).` };
}

module.exports = {
  PART_SIZE,
  loadEnvConfig,
  ensureMediaDir,
  addPreview,
  addMaster,
  retireTracks,
  relPathFromUrl,
  deploy,
};
