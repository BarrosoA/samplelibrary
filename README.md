# Sample Library

Static catalogue platform for music producers to browse samples, audition in-browser Opus previews, and download lossless WAV/FLAC files directly from Google Drive.

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
                 PRODUCER
                    |
                    v
          STATIC FRONTEND WEBSITE
          GitHub Pages / Vercel
                    |
          +---------+---------+
          |                   |
          v                   v
    AUDIO PREVIEWS       DOWNLOAD BUTTON
          |                   |
          v                   v
   FIREBASE HOSTING       GOOGLE DRIVE
   SPARK PROJECT          FREE ACCOUNT
          |                   |
          v                   v
      OPUS FILES          WAV / FLAC
                          ZIP SAMPLE PACKS
```

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Web interface and audio player |
| Website hosting | GitHub Pages / Vercel Hobby | Serves static assets |
| Preview hosting | Firebase Hosting (Spark plan) | Serves compressed audio |
| Original files | Google Drive (free tier) | Stores WAV/FLAC files and ZIP packs |
| Catalogue | Static JSON (`tracks.json`) | Stores metadata and URLs |
| Audio conversion | FFmpeg | Converts lossless audio to Opus previews |
| Version control | GitHub | Source and catalogue tracking |

## Audio Specifications

### Preview Audio
- Format: Opus (`.opus`)
- Bitrate: 128–160 kbps (144 kbps default in encoding script)
- Hosting: Dedicated Firebase Hosting Spark project
- Playback: HTML5 audio API

### Lossless Audio
- Format: WAV or FLAC (single files or ZIP bundles)
- Hosting: Google Drive (shared with "Anyone with the link can view")
- Download: Direct hyperlink opening Drive destination

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

1. Prepare lossless WAV/FLAC files.
2. Run `scripts/encode-previews.sh` to produce Opus previews.
3. Upload lossless files to Google Drive and configure sharing to "Anyone with the link".
4. Deploy Opus previews to the dedicated Firebase Hosting Spark project.
5. Update `public/tracks.json` with metadata, preview URLs, and Drive download URLs.
6. Commit and deploy static site to GitHub Pages or Vercel.
