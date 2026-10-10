import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Repeat, Volume2, VolumeX, Download, SkipBack, SkipForward, Loader2, Check } from 'lucide-react';
import { canDownloadTrack, downloadTrack } from '../utils/download';

export default function AudioPlayer({
  currentTrack,
  currentPack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
}) {
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [downloadState, setDownloadState] = useState('idle');

  useEffect(() => {
    setDownloadState('idle');
  }, [currentTrack?.id]);

  const handlePlayerDownload = async () => {
    if (!canDownloadTrack(currentTrack) || downloadState !== 'idle') return;

    setDownloadState('loading');
    try {
      await Promise.all([
        downloadTrack(currentPack, currentTrack),
        new Promise((resolve) => setTimeout(resolve, 2400)),
      ]);
      setDownloadState('done');
      setTimeout(() => {
        setDownloadState('idle');
      }, 1400);
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadState('idle');
    }
  };

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    let cancelled = false;
    let objectUrl = null;

    const start = (src) => {
      audio.src = src;
      audio.load();
      if (isPlayingRef.current) {
        audio.play().catch((err) => {
          console.warn('Playback error:', err);
        });
      }
    };

    // cloudflare ignores Range requests, so without the service worker (first visit, hard reload) the
    // browser can't find the length or seek; a fully downloaded copy can do both
    if (navigator.serviceWorker?.controller) {
      start(currentTrack.previewUrl);
    } else {
      fetch(currentTrack.previewUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          start(objectUrl);
        })
        .catch(() => !cancelled && start(currentTrack.previewUrl));
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch((err) => {
        console.warn('Playback error:', err);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.loop = isLooping;
  }, [isLooping]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    // streams the browser can't measure report Infinity
    const measured = audioRef.current.duration;
    setDuration(Number.isFinite(measured) && measured > 0 ? measured : currentTrack?.duration || 0);
  };

  const [scrubTime, setScrubTime] = useState(null);

  const timeAtPointer = (e) => {
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return percent * (duration || currentTrack?.duration || 1);
  };

  // while dragging only the bar moves; the audio jumps once on release
  const handleScrubStart = (e) => {
    if (!audioRef.current || !progressBarRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubTime(timeAtPointer(e));
  };

  const handleScrubMove = (e) => {
    if (scrubTime === null) return;
    setScrubTime(timeAtPointer(e));
  };

  const handleScrubEnd = (e) => {
    if (scrubTime === null) return;
    const newTime = timeAtPointer(e);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setScrubTime(null);
  };

  const handleEnded = () => {
    if (!isLooping && onNext) {
      onNext();
    }
  };

  const formatTime = (sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!currentTrack) return null;

  const totalDuration = duration || currentTrack.duration || 0;
  const shownTime = scrubTime ?? currentTime;
  const progressPercent = totalDuration > 0 ? Math.min(100, (shownTime / totalDuration) * 100) : 0;

  return (
    <footer className="audio-player-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="player-inner">
        <div className="player-left">
          {currentPack?.cover && (
            <img
              src={currentPack.cover}
              alt={currentPack.name || 'Album cover'}
              className="player-cover-thumb"
            />
          )}
          <div className="player-track-info">
            <div className="player-track-title">{currentTrack.title}</div>
            <div className="player-track-details">
              {currentPack?.name ? `${currentPack.name} • ` : ''}
              {currentTrack.bpm ? `${currentTrack.bpm} BPM` : ''}
              {currentTrack.key ? ` • ${currentTrack.key}` : ''}
            </div>
          </div>
        </div>

        <div className="player-center">
          <div className="player-controls-row">
            <button className="ctrl-btn" onClick={onPrevious} title="Previous">
              <SkipBack size={15} />
            </button>

            <button
              className="ctrl-btn ctrl-btn-play"
              onClick={() => onPlayPause(currentTrack, currentPack)}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: '1px' }} />}
            </button>

            <button className="ctrl-btn" onClick={onNext} title="Next">
              <SkipForward size={15} />
            </button>

            <button
              className={`ctrl-btn ${isLooping ? 'active' : ''}`}
              onClick={() => setIsLooping(!isLooping)}
              title={isLooping ? 'Loop active' : 'Loop inactive'}
            >
              <Repeat size={14} />
            </button>
          </div>

          <div className="timeline-container">
            <span className="time-label">{formatTime(shownTime)}</span>
            <div
              className={`progress-bar-wrap ${scrubTime !== null ? 'is-scrubbing' : ''}`}
              ref={progressBarRef}
              onPointerDown={handleScrubStart}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubEnd}
              onPointerCancel={() => setScrubTime(null)}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalDuration)}
              aria-valuenow={Math.round(shownTime)}
            >
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
            </div>
            <span className="time-label right">{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="player-right">
          <div className="volume-container">
            <button
              className="ctrl-btn"
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="volume-slider"
              title="Volume"
            />
          </div>

          <button
            type="button"
            onClick={handlePlayerDownload}
            className={`player-download-btn ${downloadState !== 'idle' ? `is-${downloadState}` : ''}`}
            title={
              downloadState === 'loading'
                ? 'Download starting...'
                : downloadState === 'done'
                ? 'Download started'
                : `Download lossless ${currentTrack.format || 'file'}`
            }
            disabled={downloadState !== 'idle'}
          >
            {downloadState === 'loading' ? (
              <Loader2 size={15} className="spin-icon" />
            ) : downloadState === 'done' ? (
              <Check size={15} />
            ) : (
              <Download size={15} />
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
