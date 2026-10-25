import React, { useState, useEffect, useRef } from 'react';
import { X, Film, Loader2 } from 'lucide-react';
import { postForm } from './studioUtils';

// video cover converter dialog for mp4/webm to animated webp
export default function VideoCoverModal({ file, pack, isOpen, onClose, onSuccess, notify }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoResolution, setVideoResolution] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [loopDuration, setLoopDuration] = useState(3.5);
  const [fps, setFps] = useState(15);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setStartTime(0);
    setError(null);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!isOpen || !file) return null;

  const handleMetadataLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration || 0;
    setVideoDuration(dur);
    if (dur > 0 && dur < loopDuration) {
      setLoopDuration(Math.max(0.5, Math.round(dur * 10) / 10));
    }
    if (video.videoWidth && video.videoHeight) {
      setVideoResolution(`${video.videoWidth}x${video.videoHeight}`);
    }
  };

  const handleStartTimeChange = (val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setStartTime(num);
    if (videoRef.current) {
      videoRef.current.currentTime = num;
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (isConverting) return;
    setIsConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('packId', pack.id);
      formData.append('cover', file);
      formData.append('startTime', startTime);
      formData.append('duration', loopDuration);
      formData.append('fps', fps);
      formData.append('size', '480');
      formData.append('quality', '75');

      await postForm('upload-cover', formData, 'Failed to convert video cover');
      notify('Video converted to animated cover');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  const maxStartTime = Math.max(0, Math.round((videoDuration - loopDuration) * 10) / 10);

  return (
    <div className="modal-backdrop" onClick={!isConverting ? onClose : undefined}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Film size={16} />
            <span className="modal-title">CONVERT VIDEO COVER</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} disabled={isConverting}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleConvert} className="modal-form">
          {error && <div className="modal-error-box">{error}</div>}

          <div className="video-preview-wrap">
            <video
              ref={videoRef}
              src={videoUrl}
              className="video-preview-player"
              playsInline
              muted
              autoPlay
              loop
              controls
              onLoadedMetadata={handleMetadataLoaded}
            />
            {videoResolution && (
              <span className="video-meta-badge">
                {videoResolution} {videoDuration ? `| ${videoDuration.toFixed(1)}s` : ''}
              </span>
            )}
          </div>

          <div className="video-controls-grid">
            <div className="modal-field">
              <div className="video-range-row">
                <label className="modal-label">START TIME</label>
                <span className="video-range-val">{startTime.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                className="modal-range"
                min="0"
                max={maxStartTime > 0 ? maxStartTime : videoDuration || 10}
                step="0.1"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                disabled={isConverting}
              />
            </div>

            <div className="modal-field">
              <div className="video-range-row">
                <label className="modal-label">LOOP DURATION</label>
                <span className="video-range-val">{loopDuration}s</span>
              </div>
              <input
                type="range"
                className="modal-range"
                min="1"
                max={Math.min(6, Math.max(1, Math.round(videoDuration) || 6))}
                step="0.5"
                value={loopDuration}
                onChange={(e) => setLoopDuration(parseFloat(e.target.value) || 3)}
                disabled={isConverting}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">FRAME RATE</label>
              <div className="video-fps-pills">
                {[12, 15, 20].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`video-fps-pill ${fps === rate ? 'is-active' : ''}`}
                    onClick={() => setFps(rate)}
                    disabled={isConverting}
                  >
                    {rate} FPS {rate === 15 ? '(recommended)' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="video-crop-notice">
              Center-crops to 1:1 square (480x480) animated WebP. Lightweight, loops infinitely, compatible with all browsers and ambient glows.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isConverting}>
              CANCEL
            </button>
            <button type="submit" className="btn-primary" disabled={isConverting}>
              {isConverting ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>CONVERTING...</span>
                </>
              ) : (
                <>
                  <Film size={14} />
                  <span>CONVERT & SET COVER</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
