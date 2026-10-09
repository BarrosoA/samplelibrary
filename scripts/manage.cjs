const readline = require('readline');
const path = require('path');
const manager = require('./lib/catalogue-manager.cjs');

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

async function handleInteractive() {
  const rl = createPrompt();
  console.log('\n=== NO LUV - CATALOGUE MANAGER ===');
  console.log('1. Add new pack from staging folder');
  console.log('2. Delete a sample');
  console.log('3. Move sample to another pack');
  console.log('4. Delete an entire pack');
  console.log('5. Sync sample counts');
  console.log('6. Migrate existing audio to Hugging Face');
  console.log('7. Test Hugging Face connection');
  console.log('8. Exit');

  const choice = await ask(rl, '\nSelect an option [1-8]: ');

  try {
    const data = manager.loadCatalogue();
    const packs = data.packs || [];

    if (choice === '1') {
      const folderPath = await ask(rl, 'Staging folder path (e.g. C:/samples/pack1): ');
      if (!folderPath) {
        console.log('Aborted: path required.');
        rl.close();
        return;
      }
      const packName = await ask(rl, 'Pack name (e.g. DARK VOID): ');
      const description = await ask(rl, 'Description (optional): ');
      const downloadUrl = await ask(rl, 'Storage / Download URL (optional, blank for auto-HF): ');

      console.log('\nProcessing audio files and generating previews...');
      const res = await manager.importPackFromStaging({
        folderPath,
        packName: packName || 'NEW PACK',
        description,
        downloadUrl,
      });
      console.log(`\nPack imported: ${res.pack.name} with ${res.pack.tracks.length} tracks.`);
    } else if (choice === '2') {
      console.log('\nPacks:');
      packs.forEach((p, idx) => console.log(`  [${idx + 1}] ${p.name} (${p.tracks ? p.tracks.length : 0} tracks)`));
      const pIdx = parseInt(await ask(rl, '\nSelect pack number: '), 10) - 1;
      const pack = packs[pIdx];
      if (!pack || !pack.tracks || pack.tracks.length === 0) {
        console.log('No valid tracks found.');
        rl.close();
        return;
      }

      console.log(`\nTracks in ${pack.name}:`);
      pack.tracks.forEach((t, idx) => console.log(`  [${idx + 1}] ${t.title} (${t.bpm} BPM, ${t.key})`));
      const tIdx = parseInt(await ask(rl, 'Select track number to delete: '), 10) - 1;
      const track = pack.tracks[tIdx];
      if (!track) {
        console.log('Invalid track.');
        rl.close();
        return;
      }

      const confirm = await ask(rl, `Confirm deletion of "${track.title}"? [y/N]: `);
      if (confirm.toLowerCase() === 'y') {
        manager.deleteTrack(pack.id, track.id);
        console.log(`Deleted "${track.title}" from ${pack.name}.`);
      } else {
        console.log('Canceled.');
      }
    } else if (choice === '3') {
      console.log('\nSelect source pack:');
      packs.forEach((p, idx) => console.log(`  [${idx + 1}] ${p.name} (${p.tracks ? p.tracks.length : 0} tracks)`));
      const spIdx = parseInt(await ask(rl, 'Source pack number: '), 10) - 1;
      const sourcePack = packs[spIdx];
      if (!sourcePack || !sourcePack.tracks || sourcePack.tracks.length === 0) {
        console.log('No valid tracks in selected pack.');
        rl.close();
        return;
      }

      console.log(`\nTracks in ${sourcePack.name}:`);
      sourcePack.tracks.forEach((t, idx) => console.log(`  [${idx + 1}] ${t.title}`));
      const tIdx = parseInt(await ask(rl, 'Select track number to move: '), 10) - 1;
      const track = sourcePack.tracks[tIdx];
      if (!track) {
        console.log('Invalid track.');
        rl.close();
        return;
      }

      console.log('\nSelect destination pack:');
      packs.forEach((p, idx) => {
        if (p.id !== sourcePack.id) {
          console.log(`  [${idx + 1}] ${p.name}`);
        }
      });
      const dpIdx = parseInt(await ask(rl, 'Destination pack number: '), 10) - 1;
      const destPack = packs[dpIdx];
      if (!destPack || destPack.id === sourcePack.id) {
        console.log('Invalid destination pack.');
        rl.close();
        return;
      }

      manager.moveTrack(sourcePack.id, destPack.id, track.id);
      console.log(`Moved "${track.title}" from ${sourcePack.name} to ${destPack.name}.`);
    } else if (choice === '4') {
      console.log('\nPacks:');
      packs.forEach((p, idx) => console.log(`  [${idx + 1}] ${p.name}`));
      const pIdx = parseInt(await ask(rl, 'Select pack number to delete: '), 10) - 1;
      const pack = packs[pIdx];
      if (!pack) {
        console.log('Invalid pack.');
        rl.close();
        return;
      }

      const confirm = await ask(rl, `Confirm deletion of entire pack "${pack.name}"? [y/N]: `);
      if (confirm.toLowerCase() === 'y') {
        manager.deletePack(pack.id);
        console.log(`Deleted pack "${pack.name}".`);
      } else {
        console.log('Canceled.');
      }
    } else if (choice === '5') {
      manager.saveCatalogue(data);
      console.log('Catalogue sample counts synchronized.');
    } else if (choice === '6') {
      const migrate = require('./migrate-to-hf.cjs');
      await migrate.migrateCatalogue();
    } else if (choice === '7') {
      require('./test-hf.cjs');
    } else {
      console.log('Exiting.');
    }
  } catch (err) {
    console.error('Operation failed:', err.message);
  } finally {
    rl.close();
  }
}

// CLI args dispatcher
const args = process.argv.slice(2);
if (args.length === 0) {
  handleInteractive();
} else {
  const cmd = args[0];
  (async () => {
    try {
      if (cmd === '--delete-track') {
        const [_, packId, trackId] = args;
        manager.deleteTrack(packId, trackId);
        console.log(`Deleted track ${trackId} from ${packId}.`);
      } else if (cmd === '--move-track') {
        const [_, sourcePackId, targetPackId, trackId] = args;
        manager.moveTrack(sourcePackId, targetPackId, trackId);
        console.log(`Moved track ${trackId} from ${sourcePackId} to ${targetPackId}.`);
      } else if (cmd === '--delete-pack') {
        const [_, packId] = args;
        manager.deletePack(packId);
        console.log(`Deleted pack ${packId}.`);
      } else if (cmd === '--import') {
        const [_, folderPath, packName, driveUrl] = args;
        const res = await manager.importPackFromStaging({
          folderPath,
          packName: packName || 'NEW PACK',
          downloadUrl: driveUrl || '',
        });
        console.log(`Imported ${res.pack.name} with ${res.pack.tracks.length} tracks.`);
    } else {
      console.log('Unknown command. Use npm run manage for interactive mode.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  })();
}

