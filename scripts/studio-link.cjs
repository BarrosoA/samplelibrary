// registers noluvstudio:// for the current Windows user, so the site's STUDIO button runs start-studio.bat
// `npm run studio:link -- --remove` takes it away again
const { execFileSync } = require('child_process');
const path = require('path');

if (process.platform !== 'win32') {
  console.error('The STUDIO button link only works on Windows.');
  process.exit(1);
}

const KEY = 'HKCU\\Software\\Classes\\noluvstudio';
const bat = path.resolve(__dirname, '../start-studio.bat');
const reg = (...args) => execFileSync('reg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

try {
  if (process.argv.includes('--remove')) {
    reg('delete', KEY, '/f');
    console.log('Removed. The STUDIO button no longer opens anything on this PC.');
  } else {
    reg('add', KEY, '/ve', '/d', 'URL:NO LUV Studio', '/f');
    reg('add', KEY, '/v', 'URL Protocol', '/d', '', '/f');
    // the link's own text is never passed on, so a page can't feed arguments to the script
    reg('add', `${KEY}\\shell\\open\\command`, '/ve', '/d', `"${bat}"`, '/f');
    console.log('Done. The STUDIO button on your site now opens Studio Manager on this PC.');
    console.log(`It runs: ${bat}`);
    console.log('If you move the project folder, run this again.');
  }
} catch (err) {
  console.error(`Failed: ${(err.stderr || err.message).toString().trim()}`);
  process.exit(1);
}
