import React from 'react';
import { ArrowLeft, Play, Pause, Download, FolderArchive } from 'lucide-react';
import { triggerDirectDownload } from '../utils/download';

export default function PackDetail({
  pack,
  onBack,
  activeTrack,
  isPlaying,
  onPlayTrack,
}) {
  if (!pack) return null;

  const tracks = pack.tracks || [];

  const formatSeconds = (sec) => {
    if (!sec && sec !== 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isCurrentPackPlaying =
    isPlaying && activeTrack && tracks.some((t) => t.id === activeTrack.id);

  const handlePlayFirst = () => {
    if (tracks.length === 0) return;
    if (isCurrentPackPlaying) {
      onPlayTrack(activeTrack, pack);
    } else {
      onPlayTrack(tracks[0], pack);
    }
  };

  return (
    <div className="pack-detail-page">
      {/* back navigation */}
      <nav className="detail-nav">
        <button className="back-btn" onClick={onBack} title="Back to all packs">
          <ArrowLeft size={16} />
          <span>BACK TO PACKS</span>
        </button>
      </nav>

      {/* album hero banner */}
      <section className="album-hero">
        <div className="album-hero-cover-wrap">
          <img src={pack.cover} alt={pack.name} className="album-hero-cover" />
        </div>

        <div className="album-hero-content">
          <h1 className="album-hero-title">{pack.name}</h1>

          {pack.description && (
            <p className="album-hero-desc">{pack.description}</p>
          )}

          <div className="album-actions-group">
            <button
              className="action-play-album-btn"
              onClick={handlePlayFirst}
              title={isCurrentPackPlaying ? 'Pause preview' : 'Play preview'}
            >
              <span className="btn-icon-wrap">
                {isCurrentPackPlaying ? <Pause size={15} /> : <Play size={15} />}
              </span>
              <span>PREVIEW</span>
            </button>

            {pack.downloadUrl && (
              <a
                href={pack.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="action-download-zip-btn"
                title="Download entire pack from Google Drive"
              >
                <FolderArchive size={16} />
                <span>DOWNLOAD ALL</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* tracklist table section */}
      <section className="tracklist-section">
        <div className="tracklist-header-row">
          <span className="col-idx">#</span>
          <span className="col-title">TITLE</span>
          <span className="col-bpm">BPM</span>
          <span className="col-key">KEY</span>
          <span className="col-duration">DURATION</span>
          <span className="col-download">DOWNLOAD</span>
        </div>

        <div className="tracklist-body">
          {tracks.map((track, index) => {
            const isThisTrackActive = activeTrack?.id === track.id;
            const isThisTrackPlaying = isThisTrackActive && isPlaying;

            return (
              <div
                key={track.id}
                className={`track-table-row ${isThisTrackActive ? 'is-active' : ''}`}
                onClick={() => onPlayTrack(track, pack)}
              >
                <div className="col-idx">
                  <button
                    className="row-play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTrack(track, pack);
                    }}
                    title={isThisTrackPlaying ? 'Pause' : 'Play'}
                  >
                    {isThisTrackPlaying ? (
                      <Pause size={13} />
                    ) : (
                      <Play size={13} style={{ marginLeft: '1px' }} />
                    )}
                  </button>
                  <span className="row-number-text">{index + 1}</span>
                </div>

                <div className="col-title">
                  <span className="row-track-name">{track.title}</span>
                  {track.instrument && (
                    <span className="row-track-instrument">{track.instrument}</span>
                  )}
                </div>

                <div className="col-bpm">
                  <span className="meta-badge">{track.bpm ? `${track.bpm}` : '-'}</span>
                </div>

                <div className="col-key">
                  <span className="meta-badge">{track.key && track.key !== '-' ? track.key : '-'}</span>
                </div>

                <div className="col-duration">
                  <span className="duration-text">{formatSeconds(track.duration)}</span>
                </div>

                <div className="col-download" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="row-download-btn"
                    onClick={() => triggerDirectDownload(track.downloadUrl)}
                    title={`Download lossless ${track.format || 'WAV'} from Google Drive`}
                  >
                    <Download size={13} />
                    <span>{track.format || 'WAV'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
