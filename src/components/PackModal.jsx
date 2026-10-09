import React, { useEffect } from 'react';
import { X, Play, Pause, Download, FolderArchive } from 'lucide-react';

export default function PackModal({
  pack,
  onClose,
  activeTrack,
  isPlaying,
  onPlayTrack,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!pack) return null;

  const tracks = pack.tracks || [];

  const formatSeconds = (sec) => {
    if (!sec && sec !== 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pack-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <img src={pack.cover} alt={pack.name} className="modal-cover" />
          <div className="modal-header-text">
            <h2 className="modal-title">{pack.name}</h2>
            {pack.description && <p className="modal-desc">{pack.description}</p>}
            <div className="modal-tags">
              {pack.genre &&
                pack.genre.map((g) => (
                  <span key={g} className="modal-tag">
                    {g}
                  </span>
                ))}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-actions-bar">
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {tracks.length} lossless sample{tracks.length === 1 ? '' : 's'}
          </span>
          <a
            href={pack.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="download-pack-btn"
          >
            <FolderArchive size={14} />
            <span>Download Lossless Pack (ZIP)</span>
          </a>
        </div>

        <div className="tracks-list-container">
          {tracks.map((track) => {
            const isThisTrackActive = activeTrack?.id === track.id;
            return (
              <div
                key={track.id}
                className={`track-row ${isThisTrackActive ? 'is-active' : ''}`}
              >
                <div className="track-left">
                  <button
                    className="track-play-btn"
                    onClick={() => onPlayTrack(track, pack)}
                    title={isThisTrackActive && isPlaying ? 'Pause' : 'Play'}
                  >
                    {isThisTrackActive && isPlaying ? (
                      <Pause size={13} />
                    ) : (
                      <Play size={13} style={{ marginLeft: '1px' }} />
                    )}
                  </button>
                  <div className="track-meta">
                    <span className="track-name">{track.title}</span>
                    <div className="track-badges">
                      {track.bpm && <span>{track.bpm} BPM</span>}
                      {track.key && track.key !== '-' && <span>• {track.key}</span>}
                      {track.duration && <span>• {formatSeconds(track.duration)}</span>}
                    </div>
                  </div>
                </div>

                <a
                  href={track.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="track-download-link"
                  title="Download lossless WAV"
                >
                  <Download size={12} />
                  <span>{track.format || 'WAV'}</span>
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

