const hf = require('./lib/hf-uploader.cjs');

async function testConnection() {
  console.log('\n=== HUGGING FACE CONNECTION TEST ===');
  const config = hf.loadEnvConfig();

  if (!config.token) {
    console.error('Missing: HF_TOKEN in .env.local');
  } else {
    console.log(`HF_TOKEN: Present (${config.token.slice(0, 5)}...${config.token.slice(-4)})`);
  }

  if (!config.repoId) {
    console.error('Missing: HF_REPO_ID in .env.local');
  } else {
    console.log(`HF_REPO_ID: ${config.repoId}`);
  }

  if (!hf.isConfigured()) {
    console.log('\nStatus: Not configured. Add HF_TOKEN and HF_REPO_ID to .env.local.');
    return;
  }

  try {
    console.log('\nTesting API access and repository existence...');
    const hub = await import('@huggingface/hub');
    const repo = { type: 'dataset', name: config.repoId };
    const exists = await hub.repoExists({ repo, accessToken: config.token });

    if (exists) {
      console.log(`Success! Dataset repository "${config.repoId}" exists and is accessible.`);
    } else {
      console.log(`Repository "${config.repoId}" does not exist yet. It will be created automatically on first upload.`);
    }
  } catch (err) {
    console.error('Connection error:', err.message);
  }
}

testConnection();

