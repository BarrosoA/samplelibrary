const fs = require('fs');
const path = require('path');

const ENV_LOCAL_PATH = path.resolve(__dirname, '../../.env.local');

function loadEnvConfig() {
  const envConfig = {};
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    const envContent = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        envConfig[k] = v;
      }
    });
  }
  return {
    token: envConfig.HF_TOKEN || process.env.HF_TOKEN || '',
    repoId: envConfig.HF_REPO_ID || process.env.HF_REPO_ID || '',
  };
}

function isConfigured() {
  const { token, repoId } = loadEnvConfig();
  return Boolean(token && repoId && repoId.includes('/'));
}

async function getHubModule() {
  return await import('@huggingface/hub');
}

async function ensureRepo() {
  const { token, repoId } = loadEnvConfig();
  if (!token || !repoId) {
    throw new Error('HF_TOKEN or HF_REPO_ID not configured in .env.local');
  }

  const hub = await getHubModule();
  const repo = { type: 'dataset', name: repoId };

  try {
    const exists = await hub.repoExists({ repo, accessToken: token });
    if (!exists) {
      console.log(`[HF] Dataset repository ${repoId} does not exist. Creating public dataset...`);
      const repoName = repoId.split('/')[1] || repoId;
      const res = await fetch('https://huggingface.co/api/repos/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          type: 'dataset',
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `HTTP ${res.status}`);
      }
      console.log(`[HF] Dataset repository ${repoId} created successfully.`);
    }
  } catch (err) {
    console.warn(`[HF] Repo existence check warning: ${err.message}`);
  }
}

async function uploadFileToHub({ localFilePath, remotePath, commitTitle }) {
  const { token, repoId } = loadEnvConfig();
  if (!token || !repoId) {
    return { success: false, error: 'Hugging Face credentials missing in .env.local' };
  }

  const hub = await getHubModule();
  const repo = { type: 'dataset', name: repoId };

  const fileBytes = fs.readFileSync(localFilePath);
  const blob = new Blob([fileBytes]);

  await hub.uploadFile({
    repo,
    accessToken: token,
    file: {
      path: remotePath,
      content: blob,
    },
    commitTitle: commitTitle || `Upload ${path.basename(remotePath)}`,
  });

  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
  const streamUrl = `https://huggingface.co/datasets/${repoId}/resolve/main/${encodedPath}`;
  const downloadUrl = `${streamUrl}?download=true`;

  return {
    success: true,
    remotePath,
    streamUrl,
    downloadUrl,
  };
}

async function uploadTrackAssets({
  packSlug,
  originalFilePath,
  originalFileName,
  previewFilePath,
  previewFileName,
}) {
  const { repoId } = loadEnvConfig();
  const result = {
    success: true,
    previewUrl: null,
    downloadUrl: null,
    packUrl: `https://huggingface.co/datasets/${repoId}/tree/main/masters/${encodeURIComponent(packSlug)}`,
  };

  await ensureRepo();

  // upload preview opus
  if (previewFilePath && fs.existsSync(previewFilePath)) {
    const previewRemote = `audio/${previewFileName}`;
    console.log(`[HF] Uploading preview: ${previewRemote}...`);
    const previewRes = await uploadFileToHub({
      localFilePath: previewFilePath,
      remotePath: previewRemote,
      commitTitle: `Upload preview ${previewFileName}`,
    });
    if (previewRes.success) {
      result.previewUrl = previewRes.streamUrl;
    }
  }

  // upload master file (wav, etc.)
  if (originalFilePath && fs.existsSync(originalFilePath)) {
    const masterRemote = `masters/${packSlug}/${originalFileName}`;
    console.log(`[HF] Uploading lossless master: ${masterRemote}...`);
    const masterRes = await uploadFileToHub({
      localFilePath: originalFilePath,
      remotePath: masterRemote,
      commitTitle: `Upload master ${originalFileName}`,
    });
    if (masterRes.success) {
      result.downloadUrl = masterRes.downloadUrl;
    }
  }

  return result;
}

module.exports = {
  loadEnvConfig,
  isConfigured,
  ensureRepo,
  uploadFileToHub,
  uploadTrackAssets,
};

