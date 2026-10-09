import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Repeat, Volume2, VolumeX, Download, SkipBack, SkipForward, Loader2, Check } from 'lucide-react';
import { triggerDirectDownload } from '../utils/download';

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

  const handlePlayerDownload = () => {
    if (!currentTrack?.downloadUrl || downloadState !== 'idle') return;

    setDownloadState('loading');
    triggerDirectDownload(currentTrack.downloadUrl);

    setTimeout(() => {
      setDownloadState('done');
      setTimeout(() => {
        setDownloadState('idle');
      }, 1400);
    }, 2400);
  };

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    audioRef.current.src = currentTrack.previewUrl;
    audioRef.current.load();

    if (isPlaying) {
      audioRef.current.play().catch((err) => {
        console.warn('Playback error:', err);
      });
    }
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
    setDuration(audioRef.current.duration || currentTrack?.duration || 0);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percent * (duration || currentTrack?.duration || 1);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleEnded = () => {
    if (!isLooping && onNext) {
      onNext();
    }
  };

  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!currentTrack) return null;

  const totalDuration = duration || currentTrack.duration || 0;
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

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
            <span className="time-label">{formatTime(currentTime)}</span>
            <div
              className="progress-bar-wrap"
              ref={progressBarRef}
              onClick={handleSeek}
            >
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
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
                : `Download lossless ${currentTrack.format || 'file'} from Google Drive`
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
