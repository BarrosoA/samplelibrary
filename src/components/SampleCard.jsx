import React from 'react';
import { Play, Pause, Download, Music2 } from 'lucide-react';

export default function SampleCard({ track, isActive, isPlaying, onPlayPause }) {
  const formatSeconds = (sec) => {
    if (!sec && sec !== 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <article className={`sample-card ${isActive ? 'is-active' : ''}`}>
      <div className="card-top">
        <button
          className={`play-button ${isActive && isPlaying ? 'playing' : ''}`}
          onClick={() => onPlayPause(track)}
          aria-label={isActive && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isActive && isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
        </button>

        <div className="card-info">
          <h3 className="sample-title" title={track.title}>{track.title}</h3>
          <div className="sample-subtitle">
            <span>{track.instrument}</span>
            <span>•</span>
            <span>{formatSeconds(track.duration)}</span>
          </div>
        </div>
      </div>

      <div className="badges-row">
        {track.bpm && <span className="badge badge-bpm">{track.bpm} BPM</span>}
        {track.key && track.key !== '-' && <span className="badge badge-key">{track.key}</span>}
        {track.format && <span className="badge badge-format">{track.format}</span>}
        {Array.isArray(track.genre) &&
          track.genre.map((g) => (
            <span key={g} className="badge">
              {g}
            </span>
          ))}
      </div>

      <div className="card-actions">
        <span className="license-info" title={track.license || 'Free sample license'}>
          {track.license || 'Free sample license'}
        </span>

        <a
          href={track.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="download-link"
          title={`Download lossless ${track.format || 'file'}`}
        >
          <Download size={14} />
          <span>Lossless</span>
        </a>
      </div>
    </article>
  );
}

