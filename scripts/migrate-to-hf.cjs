const fs = require('fs');
const path = require('path');
const hf = require('./lib/hf-uploader.cjs');
const manager = require('./lib/catalogue-manager.cjs');

const AUDIO_DIR = path.resolve(__dirname, '../public/audio');

async function migrateCatalogue() {
  console.log('\n=== HUGGING FACE CATALOGUE MIGRATION ===');

  if (!hf.isConfigured()) {
    const config = hf.loadEnvConfig();
    console.error('\nError: Hugging Face credentials not configured.');
    console.error('Please configure the following in .env.local:');
    console.error('  HF_TOKEN=hf_your_write_token_here');
    console.error('  HF_REPO_ID=your_username/your_dataset_repo_name\n');
    process.exit(1);
  }

  const { repoId } = hf.loadEnvConfig();
  console.log(`Target Dataset: ${repoId}`);

  console.log('Ensuring dataset repository exists...');
  await hf.ensureRepo();

  const data = manager.loadCatalogue();
  const packs = data.packs || [];
  let migratedPreviews = 0;

  for (const pack of packs) {
    console.log(`\nProcessing pack: ${pack.name} (${pack.id})`);

    // set pack dataset folder url if empty
    if (!pack.downloadUrl || pack.downloadUrl.includes('drive.google.com')) {
      const packSlug = pack.id.replace(/^pack-/, '');
      pack.downloadUrl = `https://huggingface.co/datasets/${repoId}/tree/main/masters/${encodeURIComponent(packSlug)}`;
    }

    const tracks = pack.tracks || [];
    for (const track of tracks) {
      if (track.previewUrl && track.previewUrl.startsWith('/audio/')) {
        const filename = path.basename(track.previewUrl);
        const localPath = path.join(AUDIO_DIR, filename);

        if (fs.existsSync(localPath)) {
          console.log(`Uploading preview for "${track.title}" (${filename})...`);
          const uploadRes = await hf.uploadFileToHub({
            localFilePath: localPath,
            remotePath: `audio/${filename}`,
            commitTitle: `Migrate preview ${filename}`,
          });

          if (uploadRes.success) {
            track.previewUrl = uploadRes.streamUrl;
            migratedPreviews++;
            console.log(`  -> Stream URL: ${uploadRes.streamUrl}`);
          } else {
            console.warn(`  x Failed to upload ${filename}:`, uploadRes.error);
          }
        } else {
          console.warn(`  ! Local file not found: ${localPath}`);
        }
      }
    }
  }

  manager.saveCatalogue(data);
  console.log(`\nMigration complete. Updated ${migratedPreviews} audio preview URLs to Hugging Face CDN.`);
  console.log('Catalogue files updated in public/tracks.json and src/data/tracks.json.');
}

if (require.main === module) {
  migrateCatalogue().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateCatalogue };

