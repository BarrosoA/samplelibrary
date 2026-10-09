import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, Pause, Download, FolderArchive, Loader2, Check } from 'lucide-react';
import { canDownloadTrack, downloadPack, downloadTrack } from '../utils/download';
import { getCoverColor } from '../utils/coverColor';
import FadeImage from '../components/FadeImage';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PackDetail({
  pack,
  onBack,
  activeTrack,
  isPlaying,
  onPlayTrack,
}) {
  if (!pack) return null;

  const tracks = pack.tracks || [];
  const [downloadStates, setDownloadStates] = useState({});
  const [downloadAllState, setDownloadAllState] = useState('idle');
  const [glowColor, setGlowColor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setGlowColor(null);
    getCoverColor(pack.cover).then((color) => {
      if (!cancelled) setGlowColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [pack.cover]);

  const clearTrackState = (trackId) =>
    setDownloadStates((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });

  const handleDownloadTrack = async (e, track) => {
    e.stopPropagation();
    if (!canDownloadTrack(track) || downloadStates[track.id]) return;

    setDownloadStates((prev) => ({ ...prev, [track.id]: 'loading' }));
    try {
      await Promise.all([downloadTrack(pack, track), wait(2400)]);
      setDownloadStates((prev) => ({ ...prev, [track.id]: 'done' }));
      setTimeout(() => clearTrackState(track.id), 1400);
    } catch (err) {
      console.error('Download failed:', err);
      clearTrackState(track.id);
    }
  };

  const handleDownloadAll = async () => {
    if (downloadAllState !== 'idle' || tracks.length === 0) return;

    setDownloadAllState('loading');
    try {
      await Promise.all([downloadPack(pack), wait(2400)]);
      setDownloadAllState('done');
      setTimeout(() => setDownloadAllState('idle'), 1400);
    } catch (err) {
      console.error('Pack download failed:', err);
      setDownloadAllState('idle');
    }
  };

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
      <div
        className={`pack-glow ${glowColor ? 'is-visible' : ''}`}
        style={glowColor ? { '--glow-rgb': glowColor.join(', ') } : undefined}
        aria-hidden="true"
      />

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
          <FadeImage src={pack.cover} alt={pack.name} className="album-hero-cover" />
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

            <button
              type="button"
              className={`action-download-zip-btn ${downloadAllState !== 'idle' ? `is-${downloadAllState}` : ''}`}
              onClick={handleDownloadAll}
              disabled={downloadAllState !== 'idle'}
              title="Download all samples in this pack"
            >
              {downloadAllState === 'loading' ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>STARTING...</span>
                </>
              ) : downloadAllState === 'done' ? (
                <>
                  <Check size={16} />
                  <span>STARTED</span>
                </>
              ) : (
                <>
                  <FolderArchive size={16} />
                  <span>DOWNLOAD ALL</span>
                </>
              )}
            </button>
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
                    className={`row-play-btn ${isThisTrackPlaying ? 'is-playing' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayTrack(track, pack);
                    }}
                    title={isThisTrackPlaying ? 'Pause' : 'Play'}
                  >
                    {isThisTrackPlaying ? (
                      <>
                        <span className="eq-icon" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <Pause size={13} className="row-pause-icon" />
                      </>
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
                  <span className="row-track-meta-mobile">
                    {[
                      track.bpm ? `${track.bpm} BPM` : null,
                      track.key && track.key !== '-' ? track.key : null,
                      formatSeconds(track.duration),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
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
                    className={`row-download-btn ${downloadStates[track.id] ? `is-${downloadStates[track.id]}` : ''}`}
                    onClick={(e) => handleDownloadTrack(e, track)}
                    title={
                      downloadStates[track.id] === 'loading'
                        ? 'Download starting...'
                        : downloadStates[track.id] === 'done'
                        ? 'Download started'
                        : `Download lossless ${track.format || 'WAV'}`
                    }
                    disabled={Boolean(downloadStates[track.id])}
                  >
                    {downloadStates[track.id] === 'loading' ? (
                      <>
                        <Loader2 size={13} className="spin-icon" />
                        <span>STARTING</span>
                      </>
                    ) : downloadStates[track.id] === 'done' ? (
                      <>
                        <Check size={13} />
                        <span>STARTED</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} />
                        <span>{track.format || 'WAV'}</span>
                      </>
                    )}
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
