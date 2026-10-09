# Sample Library

Static catalogue platform for music producers to browse samples, audition in-browser Opus previews, and download lossless WAV files or whole packs as ZIPs.

## Operating Constraints and Cost Architecture

- 0 USD operating cost.
- No credit card or billing account required.
- Hard free-tier quotas with zero automatic paid overages.
- Serverless static delivery without database or backend infrastructure.
- No client-side secret credentials.
- In-browser playback with direct downloads.
- Full sample metadata support (BPM, key, instrument, genre, license terms).

## Architecture Overview

```text
  Visitor's browser
     |
     +--> Vercel (website, tracks.json, service worker)
     |
     +--> Cloudflare Pages project "musicportfolio" (media only)
            p/<hash>.opus     preview streams
            m/<hash>.0, .1..  WAV masters split into <=24 MiB parts
```

- Cloudflare Pages rejects files over 25 MiB, so Studio Manager splits each master into numbered parts. The service worker (`public/sw.js`) fetches the parts and streams them out as one WAV.
- "Download all" is zipped in the visitor's browser by the same service worker using [client-zip](https://github.com/Touffy/client-zip), so no pack ZIPs are stored anywhere. If no service worker is available, `src/utils/download.js` builds the file in memory instead.
- Media file names are content hashes, so files can't be guessed, and they are served with `noindex`/`noai` headers and a deny-all `robots.txt`.

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Web interface and audio player |
| Website hosting | Vercel Hobby | Serves the site and catalogue |
| Media hosting | Cloudflare Pages (free, no card) | Serves Opus previews and WAV parts |
| Catalogue | Static JSON (`tracks.json`) | Stores metadata and media URLs |
| Audio conversion | FFmpeg | Converts lossless audio to 128 kbps Opus previews |
| Version control | GitHub | Source and catalogue tracking |

## Media Storage

Loops are not duplicated on this PC. A loop exported to `<COMPOSITIONS_DIR>/<year>/<month>/` stays the only full copy: the library just remembers where it is (`sources.json` in the media folder, never in the public catalogue). When you publish, the master parts are rebuilt from those originals in a temporary `staging/` folder, uploaded, and the folder is deleted.

- Before every upload each original is checked against its fingerprint. A moved or renamed original is found again automatically. An edited or deleted one stops the publish with a message naming the loop, and nothing is uploaded.
- Loops added from outside the Compositions folder can't be relied on to stay put, so their parts are kept in `deploy/m/`.
- `deploy/` holds the previews (about 5% of the WAV size) and any kept parts. Its contents plus the originals are what Cloudflare mirrors, so a file missing at publish time disappears from the site.
- `removed/` holds files from deleted samples. They are moved there instead of being deleted, and you can empty it by hand.

### NEW LOOPS

Studio Manager lists loops that appear in a month folder after the feature was first opened (project subfolders are ignored). Drag one onto a pack to add it; nothing is added or published automatically. It shows warnings for a missing BPM or key, a misspelled tag, or an exact duplicate. A re-export of a loop that's already in the library gets an UPDATE button, which swaps in the new version. The list only refreshes while Studio Manager is open.

Optional `.env.local` settings:

```ini
COMPOSITIONS_DIR=C:/Users/you/Documents/NO LUV/Compositions
MEDIA_DIR=../samplelibrary-media
CF_PAGES_PROJECT=musicportfolio
MEDIA_BASE_URL=https://musicportfolio.pages.dev
CF_KEEP_DEPLOYMENTS=5
CF_KEEP_DAYS=14
```

Cloudflare keeps every past upload reachable at its own address, which would keep deleted samples downloadable. After each publish, old snapshots are deleted, but only ones that are both outside the newest `CF_KEEP_DEPLOYMENTS` and older than `CF_KEEP_DAYS`. The live snapshot is never deleted.

Run `npx wrangler login` once before the first deploy. If Cloudflare assigns the project a different address (e.g. `musicportfolio-abc.pages.dev`), set `MEDIA_BASE_URL` to it and run `npm run media:rebase`.

| Command | What it does |
|---|---|
| `npm run media:deploy` | Uploads new media to Cloudflare and prunes old snapshots (Studio Manager's PUBLISH TO LIVE does this first) |
| `npm run media:migrate` | Pulls tracks that still have old Drive/HF links into the media folder |
| `npm run media:rebase` | Rewrites catalogue media URLs to the current `MEDIA_BASE_URL` |
| `npm run media:adopt` | Drops stored parts for loops whose original is found in the Compositions folder |

## Repository Layout

```text
sample-library/
│
├── src/
│   ├── components/
│   │   ├── AudioPlayer.jsx
│   │   ├── SampleCard.jsx
│   │   ├── SearchBar.jsx
│   │   └── FilterPanel.jsx
│   │
│   ├── pages/
│   │   └── Library.jsx
│   │
│   ├── styles/
│   │   └── main.css
│   │
│   └── main.jsx
│
├── public/
│   ├── tracks.json
│   ├── images/
│   └── favicon.ico
│
├── scripts/
│   └── encode-previews.sh
│
├── package.json
├── vite.config.js
└── README.md
```

## Local Development

```bash
# install dependencies
npm install

# launch development server
npm run dev

# build static bundle
npm run build
```

## Preview Encoding

Lossless audio files can be encoded to Opus using the script:

```bash
chmod +x scripts/encode-previews.sh
./scripts/encode-previews.sh ./raw-samples ./previews 144k
```

## Publishing Workflow

1. In Studio Manager (`start-studio.bat`), add samples to a pack. Each one gets an Opus preview and split master in the media folder.
2. Click PUBLISH TO LIVE. This uploads new media to Cloudflare first, then commits and pushes `tracks.json` so Vercel redeploys.
