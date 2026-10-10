const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, '.env.local');

// cloudflare pages rejects files over 25 MiB
const PART_SIZE = 24 * 1024 * 1024;
const LOOP_EXTENSIONS = ['.wav', '.aif', '.aiff', '.flac'];
const COUNTER_SOURCE = path.join(__dirname, '../cloudflare/download-counter.js');

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
  const get = (k) => process.env[k] || env[k] || '';
  const projectName = get('CF_PAGES_PROJECT') || 'musicportfolio';
  return {
    env,
    projectName,
    mediaRoot: path.resolve(PROJECT_ROOT, get('MEDIA_DIR') || '../samplelibrary-media'),
    baseUrl: (get('MEDIA_BASE_URL') || `https://${projectName}.pages.dev`).replace(/\/+$/, ''),
    compositionsDir: get('COMPOSITIONS_DIR') ? path.resolve(get('COMPOSITIONS_DIR')) : '',
  };
}

function dirs() {
  const { mediaRoot } = loadEnvConfig();
  return {
    root: mediaRoot,
    deploy: path.join(mediaRoot, 'deploy'),
    removed: path.join(mediaRoot, 'removed'),
    staging: path.join(mediaRoot, 'staging'),
    state: path.join(mediaRoot, 'last-deploy.json'),
    sources: path.join(mediaRoot, 'sources.json'),
    inbox: path.join(mediaRoot, 'inbox.json'),
    telegram: path.join(mediaRoot, 'telegram.json'),
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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

const hashCache = new Map();

function hashFile(filePath) {
  const st = fs.statSync(filePath);
  const cacheKey = `${filePath}|${st.size}|${st.mtimeMs}`;
  if (hashCache.has(cacheKey)) return hashCache.get(cacheKey);

  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  const digest = hash.digest('hex').slice(0, 24);
  hashCache.set(cacheKey, digest);
  return digest;
}

function urlFor(relPath) {
  return `${loadEnvConfig().baseUrl}/${relPath}`;
}

function relPathFromUrl(url) {
  const { baseUrl } = loadEnvConfig();
  if (typeof url !== 'string' || !url.startsWith(`${baseUrl}/`)) return null;
  return url.slice(baseUrl.length + 1);
}

function masterKey(master) {
  const rel = master && master.parts && relPathFromUrl(master.parts[0]);
  return rel ? path.basename(rel).split('.')[0] : null;
}

// loops are files directly inside <compositions>/<year>/<month>/; deeper folders are project audio
function isLoopPath(absPath) {
  const { compositionsDir } = loadEnvConfig();
  if (!compositionsDir || !absPath) return false;
  const rel = path.relative(compositionsDir, path.resolve(absPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const segments = rel.split(path.sep);
  return segments.length === 3 && /^\d{4}$/.test(segments[0]) && LOOP_EXTENSIONS.includes(path.extname(rel).toLowerCase());
}

function listLoopFiles() {
  const { compositionsDir } = loadEnvConfig();
  if (!compositionsDir || !fs.existsSync(compositionsDir)) return [];
  const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  const loops = [];
  for (const yearDir of subdirs(compositionsDir).filter((d) => /^\d{4}$/.test(path.basename(d)))) {
    for (const monthDir of subdirs(yearDir)) {
      for (const e of fs.readdirSync(monthDir, { withFileTypes: true })) {
        const full = path.join(monthDir, e.name);
        if (e.isFile() && isLoopPath(full)) {
          const st = fs.statSync(full);
          // windows keeps the old modified date on copied files, so creation time marks when it arrived
          loops.push({ path: full, size: st.size, mtimeMs: st.mtimeMs, arrivedMs: Math.max(st.mtimeMs, st.birthtimeMs) });
        }
      }
    }
  }
  return loops;
}

function findSource(key, size) {
  const match = listLoopFiles().find((f) => f.size === size && hashFile(f.path) === key);
  return match || null;
}

function addPreview(localOpusPath) {
  const d = ensureMediaDir();
  const rel = `p/${hashFile(localOpusPath)}.opus`;
  const dest = path.join(d.deploy, rel);
  if (!fs.existsSync(dest)) fs.copyFileSync(localOpusPath, dest);
  return urlFor(rel);
}

function writeParts(sourcePath, key, size, destDir) {
  const fd = fs.openSync(sourcePath, 'r');
  const hash = crypto.createHash('sha256');
  try {
    const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
    for (let i = 0; i < partCount; i++) {
      const len = Math.min(PART_SIZE, size - i * PART_SIZE);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, i * PART_SIZE);
      hash.update(buf);
      fs.writeFileSync(path.join(destDir, `${key}.${i}`), buf);
    }
  } finally {
    fs.closeSync(fd);
  }
  if (hash.digest('hex').slice(0, 24) !== key) throw new Error(`${sourcePath} changed while it was being read`);
}

function partUrls(key, size) {
  const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
  return Array.from({ length: partCount }, (_, i) => urlFor(`m/${key}.${i}`));
}

// originals inside the compositions folder are referenced, not copied; anything else is kept as parts
function addMaster(localFilePath, filename, sourceHint) {
  const d = ensureMediaDir();
  const key = hashFile(localFilePath);
  const size = fs.statSync(localFilePath).size;

  const source = isLoopPath(sourceHint) ? { path: path.resolve(sourceHint) } : findSource(key, size);
  if (source) {
    const sources = readJson(d.sources, {});
    sources[key] = { path: source.path, size, mtimeMs: fs.statSync(source.path).mtimeMs };
    writeJson(d.sources, sources);
  } else if (!fs.existsSync(path.join(d.deploy, 'm', `${key}.0`))) {
    writeParts(localFilePath, key, size, path.join(d.deploy, 'm'));
  }

  return { filename, size, parts: partUrls(key, size) };
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
  const keysInUse = new Set();
  (catalogue.packs || []).forEach((p) =>
    (p.tracks || []).forEach((t) => {
      trackMediaUrls(t).forEach((u) => stillUsed.add(u));
      keysInUse.add(masterKey(t.master));
    })
  );

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

  const sources = readJson(d.sources, {});
  let changed = false;
  removedTracks.forEach((t) => {
    const key = masterKey(t.master);
    if (key && sources[key] && !keysInUse.has(key)) {
      delete sources[key];
      changed = true;
    }
  });
  if (changed) writeJson(d.sources, sources);
}

// the download counter only accepts ids listed here and uses the names in its telegram messages
function counterNames(catalogue) {
  const names = { tracks: {}, packs: {} };
  for (const p of catalogue.packs || []) {
    names.packs[p.id] = p.name;
    for (const t of p.tracks || []) names.tracks[t.id] = t.title;
  }
  return names;
}

function catalogueMasters(catalogue) {
  const masters = new Map();
  (catalogue.packs || []).forEach((p) =>
    (p.tracks || []).forEach((t) => {
      const key = masterKey(t.master);
      if (key && !masters.has(key)) masters.set(key, { key, size: t.master.size, title: t.title, pack: p.name });
    })
  );
  return [...masters.values()];
}

// confirms the original still matches; follows it if it was moved or renamed
function resolveSource(key, size, sources) {
  const entry = sources[key];
  if (entry && fs.existsSync(entry.path)) {
    const st = fs.statSync(entry.path);
    if (st.size === size && (st.mtimeMs === entry.mtimeMs || hashFile(entry.path) === key)) {
      entry.mtimeMs = st.mtimeMs;
      return { path: entry.path };
    }
  }
  const found = findSource(key, size);
  if (found) {
    sources[key] = { path: found.path, size, mtimeMs: found.mtimeMs };
    return { path: found.path, relinked: true };
  }
  return { problem: entry && fs.existsSync(entry.path) ? 'changed' : 'missing', path: entry && entry.path };
}

function hasKeptParts(key, size) {
  const d = dirs();
  return partUrls(key, size).every((u) => fs.existsSync(path.join(d.deploy, relPathFromUrl(u))));
}

function checkSources(catalogue) {
  const d = dirs();
  const sources = readJson(d.sources, {});
  const problems = [];
  const resolved = [];
  for (const m of catalogueMasters(catalogue)) {
    if (hasKeptParts(m.key, m.size)) continue;
    const r = resolveSource(m.key, m.size, sources);
    if (r.problem) problems.push({ ...m, ...r });
    else resolved.push({ ...m, ...r });
  }
  writeJson(d.sources, sources);
  return { problems, resolved };
}

function describeProblems(problems) {
  return problems
    .map((p) =>
      p.problem === 'changed'
        ? `"${p.title}" (${p.pack}): the original file changed since it was added (${p.path}). Use UPDATE in NEW LOOPS, or restore the old export.`
        : `"${p.title}" (${p.pack}): the original file can't be found${p.path ? ` (was ${p.path})` : ''}. Put it back in your Compositions folder.`
    )
    .join(' ');
}

function linkOrCopy(src, dest) {
  try {
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
}

function buildStaging(catalogue) {
  const d = ensureMediaDir();
  const { problems, resolved } = checkSources(catalogue);
  if (problems.length) throw new Error(`Publish stopped, nothing was uploaded. ${describeProblems(problems)}`);

  fs.rmSync(d.staging, { recursive: true, force: true });
  const mirror = (srcDir, destDir) => {
    fs.mkdirSync(destDir, { recursive: true });
    for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const s = path.join(srcDir, e.name);
      const t = path.join(destDir, e.name);
      if (e.isDirectory()) mirror(s, t);
      else linkOrCopy(s, t);
    }
  };
  mirror(d.deploy, d.staging);
  for (const m of resolved) writeParts(m.path, m.key, m.size, path.join(d.staging, 'm'));
  fs.copyFileSync(COUNTER_SOURCE, path.join(d.staging, '_worker.js'));
  fs.mkdirSync(path.join(d.staging, 'meta'), { recursive: true });
  writeJson(path.join(d.staging, 'meta/names.json'), counterNames(catalogue));
  writeJson(path.join(d.staging, '_routes.json'), { version: 1, include: ['/api/*'], exclude: [] });
  return d.staging;
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

// called by path so it also runs from the media folder, where npx can't see this project's wrangler
const WRANGLER_BIN = path.join(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js');

function wranglerOptions(cwd) {
  const { env } = loadEnvConfig();
  const childEnv = { ...process.env };
  for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (env[k]) childEnv[k] = env[k];
  }
  return { cwd, env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
}

function wrangler(args, cwd = PROJECT_ROOT) {
  return execSync(`node "${WRANGLER_BIN}" ${args}`, { ...wranglerOptions(cwd), stdio: ['ignore', 'pipe', 'pipe'] });
}

// for reads from the dev server, which would otherwise freeze while wrangler talks to cloudflare
function wranglerAsync(args) {
  return new Promise((resolve, reject) => {
    exec(`node "${WRANGLER_BIN}" ${args}`, wranglerOptions(PROJECT_ROOT), (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
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

const AGE_UNITS = { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };

// wrangler only reports age as text such as "3 days ago"; anything unreadable counts as brand new
function parseAgeDays(text) {
  const m = /^(\d+|an?|a few)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(String(text || '').trim());
  if (!m) return 0;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  return n * AGE_UNITS[m[2].toLowerCase()];
}

function keepSettings() {
  const { env } = loadEnvConfig();
  return {
    keepCount: Math.max(1, Number(env.CF_KEEP_DEPLOYMENTS || process.env.CF_KEEP_DEPLOYMENTS) || 5),
    keepDays: Math.max(1, Number(env.CF_KEEP_DAYS || process.env.CF_KEEP_DAYS) || 14),
  };
}

// old deployments keep serving retired files at their own URLs, so prune ones that are both old and not recent
function pruneDeployments() {
  const { projectName } = loadEnvConfig();
  const { keepCount, keepDays } = keepSettings();

  const deployments = JSON.parse(wrangler(`pages deployment list --project-name=${projectName} --json`))
    .map((dep) => ({ id: dep.Id, ageDays: parseAgeDays(dep.Status) }))
    .filter((dep) => dep.id)
    .sort((a, b) => a.ageDays - b.ageDays);

  const doomed = deployments.slice(keepCount).filter((dep) => dep.ageDays > keepDays);
  let removed = 0;
  for (const dep of doomed) {
    try {
      // no --force: cloudflare refuses to delete a deployment that is still live
      wrangler(`pages deployment delete ${dep.id} --project-name=${projectName}`);
      removed++;
    } catch (err) {
      console.warn(`[media] kept deployment ${dep.id}: ${(err.stderr || err.message).trim().split('\n').pop()}`);
    }
  }
  return { removed, kept: deployments.length - removed, keepCount, keepDays };
}

// a changed counter has to be uploaded even when no media changed
function deploySnapshot(catalogue) {
  const d = dirs();
  return [
    ...listDeployFiles(d.deploy),
    ...catalogueMasters(catalogue).map((m) => `master:${m.key}:${m.size}`),
    `counter:${hashFile(COUNTER_SOURCE)}`,
    `counter:names:${crypto.createHash('sha256').update(JSON.stringify(counterNames(catalogue))).digest('hex').slice(0, 24)}`,
    // pages secrets only reach the counter on the next deployment
    ...(fs.existsSync(d.telegram) ? [`counter:telegram:${fs.statSync(d.telegram).mtimeMs}`] : []),
  ].sort();
}

// free plan allows 20,000 files per deployment and has no total size cap
const PAGES_FILE_LIMIT = 20000;

function measureSnapshot(snapshot, sizeByKey) {
  const stored = new Set();
  let files = 0;
  let bytes = 0;
  for (const entry of snapshot.filter((e) => !e.startsWith('master:') && !e.startsWith('counter:'))) {
    const idx = entry.lastIndexOf(':');
    stored.add(entry.slice(0, idx));
    files += 1;
    bytes += Number(entry.slice(idx + 1)) || 0;
  }
  // masters rebuilt from originals at publish time; ones kept as parts were already counted above
  for (const entry of snapshot.filter((e) => e.startsWith('master:'))) {
    const [, key, size] = entry.split(':');
    if (stored.has(`m/${key}.0`)) continue;
    const n = Number(size) || sizeByKey.get(key) || 0;
    files += Math.max(1, Math.ceil(n / PART_SIZE));
    bytes += n;
  }
  return { files, bytes };
}

// older snapshots recorded masters without their size
function readLastSnapshot(catalogue) {
  const d = dirs();
  if (!fs.existsSync(d.state)) return null;
  const sizeByKey = new Map(catalogueMasters(catalogue).map((m) => [m.key, m.size]));
  return readJson(d.state, [])
    .map((e) => (/^master:[0-9a-f]+$/.test(e) && sizeByKey.has(e.slice(7)) ? `${e}:${sizeByKey.get(e.slice(7))}` : e))
    .sort();
}

function cloudUsage(catalogue) {
  const d = ensureMediaDir();
  const sizeByKey = new Map(catalogueMasters(catalogue).map((m) => [m.key, m.size]));
  const current = deploySnapshot(catalogue);
  const live = readLastSnapshot(catalogue);
  return {
    fileLimit: PAGES_FILE_LIMIT,
    fileSizeLimit: PART_SIZE + 1024 * 1024,
    ...keepSettings(),
    live: live ? { ...measureSnapshot(live, sizeByKey), publishedAt: fs.statSync(d.state).mtimeMs } : null,
    afterPublish: measureSnapshot(current, sizeByKey),
    unpublishedChanges: !live || JSON.stringify(current) !== JSON.stringify(live),
  };
}

function deploy({ catalogue, force = false }) {
  const d = ensureMediaDir();
  const { projectName } = loadEnvConfig();
  const snapshot = deploySnapshot(catalogue);
  const previous = readLastSnapshot(catalogue) || [];

  let message;
  let deployed = false;
  if (!force && JSON.stringify(snapshot) === JSON.stringify(previous)) {
    // still catch originals that were deleted or edited since the last upload
    const { problems } = checkSources(catalogue);
    message = 'Media already up to date on Cloudflare.';
    if (problems.length) message += ` Warning: ${describeProblems(problems)}`;
  } else {
    const staging = buildStaging(catalogue);
    try {
      ensureProject();
      writePagesConfig(ensureCounterDb());
      wrangler(`pages deploy staging --project-name=${projectName} --branch=main --commit-dirty=true`, d.root);
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    writeJson(d.state, snapshot);
    deployed = true;
    message = 'Uploaded media to Cloudflare Pages.';
  }

  try {
    const pruned = pruneDeployments();
    if (pruned.removed) message += ` Removed ${pruned.removed} old snapshot(s).`;
  } catch (err) {
    console.warn(`[media] snapshot cleanup skipped: ${err.message.split('\n')[0]}`);
  }
  return { deployed, message };
}

const counterDbName = () => `${loadEnvConfig().projectName}-downloads`;

// the D1 database the download counter writes to, created on first publish
function ensureCounterDb() {
  const name = counterDbName();
  const find = () => JSON.parse(wrangler('d1 list --json')).find((db) => db.name === name);
  let db = find();
  if (!db) {
    wrangler(`d1 create ${name}`);
    db = find();
    if (!db) throw new Error(`Created the "${name}" database on Cloudflare but could not find it afterwards.`);
  }
  wrangler(
    `d1 execute ${name} --remote --command "CREATE TABLE IF NOT EXISTS counts (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS notify_log (hour TEXT PRIMARY KEY, sent INTEGER NOT NULL DEFAULT 0)"`
  );
  return { name, id: db.uuid };
}

// value goes in through stdin so it never shows up in a command line or a file
function setPagesSecret(name, value) {
  const { projectName } = loadEnvConfig();
  execSync(`node "${WRANGLER_BIN}" pages secret put ${name} --project-name=${projectName}`, {
    ...wranglerOptions(PROJECT_ROOT),
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// remembers that telegram is set up (never the token), which makes the next publish redeploy the counter
function markTelegramSetUp(chatId) {
  writeJson(dirs().telegram, { chatId, setUpAt: new Date().toISOString() });
}

// pages only reads its config from the folder wrangler runs in, so it lives next to the staging folder
function writePagesConfig(db) {
  const { projectName } = loadEnvConfig();
  const toml = [
    `name = "${projectName}"`,
    'pages_build_output_dir = "staging"',
    'compatibility_date = "2025-09-01"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    `database_name = "${db.name}"`,
    `database_id = "${db.id}"`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dirs().root, 'wrangler.toml'), toml);
}

// counts stay off until a publish has uploaded the counter
async function downloadCounts() {
  const live = readJson(dirs().state, []);
  if (!live.some((e) => e.startsWith('counter:'))) return { live: false };

  const out = await wranglerAsync(`d1 execute ${counterDbName()} --remote --json --command "SELECT key, n FROM counts"`);
  const tracks = {};
  const packs = {};
  for (const { key, n } of JSON.parse(out)[0]?.results || []) {
    const split = key.indexOf(':');
    const kind = key.slice(0, split);
    const id = key.slice(split + 1);
    if (kind === 'p') {
      packs[id] = n;
      continue;
    }
    tracks[id] = tracks[id] || { single: 0, inPack: 0 };
    tracks[id][kind === 't' ? 'single' : 'inPack'] = n;
  }
  return { live: true, tracks, packs };
}

// drops stored parts for masters whose original is found in the compositions folder
function adoptKeptMasters(catalogue) {
  const d = ensureMediaDir();
  const sources = readJson(d.sources, {});
  const result = { adopted: [], kept: [] };
  for (const m of catalogueMasters(catalogue)) {
    if (!hasKeptParts(m.key, m.size)) continue;
    const found = findSource(m.key, m.size);
    if (!found) {
      result.kept.push(m.title);
      continue;
    }
    sources[m.key] = { path: found.path, size: m.size, mtimeMs: found.mtimeMs };
    writeJson(d.sources, sources);
    partUrls(m.key, m.size).forEach((u) => fs.rmSync(path.join(d.deploy, relPathFromUrl(u))));
    result.adopted.push(`${m.title} -> ${found.path}`);
  }
  return result;
}

function readSources() {
  return readJson(dirs().sources, {});
}

const pathKey = (p) => path.resolve(p).toLowerCase();

// files already in the folder when the feature started count as seen; dates can't tell,
// because moving a file into the folder keeps its old creation and modified dates
function readInboxState() {
  const d = dirs();
  let state = readJson(d.inbox, null);
  if (!state) {
    state = { baselineMs: Date.now(), seen: listLoopFiles().map((f) => pathKey(f.path)), dismissed: {} };
    writeJson(d.inbox, state);
  } else if (!Array.isArray(state.seen)) {
    state.seen = listLoopFiles()
      .filter((f) => f.arrivedMs <= state.baselineMs)
      .map((f) => pathKey(f.path));
    writeJson(d.inbox, state);
  }
  return state;
}

function isSeenAtStart(state, filePath) {
  if (!state.seenSet) state.seenSet = new Set(state.seen);
  return state.seenSet.has(pathKey(filePath));
}

function dismissInboxFile(filePath) {
  const d = dirs();
  const state = readInboxState();
  state.dismissed[path.resolve(filePath)] = fs.statSync(filePath).mtimeMs;
  writeJson(d.inbox, state);
}

module.exports = {
  PART_SIZE,
  loadEnvConfig,
  ensureMediaDir,
  hashFile,
  addPreview,
  addMaster,
  masterKey,
  isLoopPath,
  listLoopFiles,
  retireTracks,
  relPathFromUrl,
  checkSources,
  describeProblems,
  adoptKeptMasters,
  readSources,
  readInboxState,
  isSeenAtStart,
  dismissInboxFile,
  parseAgeDays,
  pruneDeployments,
  cloudUsage,
  downloadCounts,
  ensureProject,
  setPagesSecret,
  markTelegramSetUp,
  deploy,
};
