import React, { useState } from 'react';
import { X, FolderPlus, Loader2 } from 'lucide-react';

export default function AddPackModal({ isOpen, onClose, onSuccess }) {
  const [folderPath, setFolderPath] = useState('');
  const [packName, setPackName] = useState('');
  const [description, setDescription] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderPath.trim() || !packName.trim()) {
      setError('Staging folder path and pack name are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/manage/import-staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: folderPath.trim(),
          packName: packName.trim(),
          description: description.trim(),
          downloadUrl: downloadUrl.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import pack');
      }

      onSuccess(data.pack);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <FolderPlus size={16} />
            <span className="modal-title">IMPORT PACK FROM STAGING</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="modal-error-box">{error}</div>}

          <div className="modal-field">
            <label className="modal-label">STAGING FOLDER PATH</label>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. C:/samples/my-pack"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={loading}
              required
            />
            <span className="modal-hint">
              Drop folder containing your cover image and WAV files.
            </span>
          </div>

          <div className="modal-field">
            <label className="modal-label">PACK NAME</label>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. DARK HORIZON"
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">DESCRIPTION (OPTIONAL)</label>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Aggressive analog synths and textures"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">GOOGLE DRIVE DOWNLOAD URL (OPTIONAL)</label>
            <input
              type="url"
              className="modal-input"
              placeholder="https://drive.google.com/..."
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              CANCEL
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>PROCESSING...</span>
                </>
              ) : (
                <span>IMPORT PACK</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

