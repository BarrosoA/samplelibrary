import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, HardDriveUpload, Camera, Loader2 } from 'lucide-react';
import { postJson, postForm, hasDraggedFiles } from './studioUtils';

// cover, click-to-edit title and description, and pack actions
export default function PackHeader({ pack, autoEditTitle, isUploadingAudio, notify, onChanged, onAddSamples, onDeletePack }) {
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(autoEditTitle);
  const [titleValue, setTitleValue] = useState(pack.name || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(pack.description || '');
  const coverInputRef = useRef(null);

  useEffect(() => {
    setTitleValue(pack.name || '');
    setDescValue(pack.description || '');
  }, [pack.name, pack.description]);

  const uploadCover = async (file) => {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file (PNG, JPG, WEBP)', 'error');
      return;
    }
    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('packId', pack.id);
      formData.append('cover', file);
      await postForm('upload-cover', formData, 'Failed to upload cover');
      notify('Cover image updated');
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const saveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === pack.name) {
      setTitleValue(pack.name || '');
      return;
    }
    try {
      await postJson('update-pack', { packId: pack.id, updates: { name: trimmed } }, 'Failed to update title');
      notify(`Updated title to "${trimmed}"`);
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
      setTitleValue(pack.name || '');
    }
  };

  const saveDesc = async () => {
    setIsEditingDesc(false);
    const trimmed = descValue.trim();
    if (trimmed === (pack.description || '')) return;
    try {
      await postJson('update-pack', { packId: pack.id, updates: { description: trimmed } }, 'Failed to update description');
      notify('Updated description');
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
      setDescValue(pack.description || '');
    }
  };

  return (
    <div className="studio-pack-hero">
      <input
        type="file"
        ref={coverInputRef}
        style={{ display: 'none' }}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) uploadCover(e.target.files[0]);
          e.target.value = '';
        }}
      />

      <div
        className={`studio-hero-art-wrap ${isCoverDragOver ? 'drag-over' : ''} ${isUploadingCover ? 'loading' : ''}`}
        onDragOver={(e) => {
          if (hasDraggedFiles(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsCoverDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsCoverDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsCoverDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadCover(e.dataTransfer.files[0]);
        }}
        onClick={() => coverInputRef.current?.click()}
        title="Click or drag & drop image here to change cover"
      >
        <img src={pack.cover} alt={pack.name} className="studio-hero-art" />
        <div className="studio-cover-overlay">
          {isUploadingCover ? (
            <Loader2 size={18} className="spin-icon" />
          ) : (
            <>
              <Camera size={16} />
              <span>DRAG IMAGE</span>
            </>
          )}
        </div>
      </div>

      <div className="studio-hero-info">
        <span className="studio-hero-id">{pack.id}</span>
        {isEditingTitle ? (
          <input
            type="text"
            className="studio-hero-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') {
                setIsEditingTitle(false);
                setTitleValue(pack.name || '');
              }
            }}
            autoFocus
          />
        ) : (
          <h1 className="studio-hero-title" onClick={() => setIsEditingTitle(true)} title="Click to edit album title">
            {pack.name}
          </h1>
        )}

        {isEditingDesc ? (
          <textarea
            className="studio-hero-desc-input"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDesc();
              if (e.key === 'Escape') {
                setIsEditingDesc(false);
                setDescValue(pack.description || '');
              }
            }}
            placeholder="Write album description..."
            rows={2}
            autoFocus
          />
        ) : (
          <p
            className={`studio-hero-desc ${!pack.description ? 'is-empty' : ''}`}
            onClick={() => setIsEditingDesc(true)}
            title="Click to edit description"
          >
            {pack.description || 'Click to add album description...'}
          </p>
        )}

        <div className="studio-hero-actions">
          <button className="studio-btn-subtle" onClick={onAddSamples} disabled={isUploadingAudio} title="Add audio samples via file picker">
            {isUploadingAudio ? <Loader2 size={14} className="spin-icon" /> : <Plus size={14} />}
            <span>{isUploadingAudio ? 'PROCESSING AUDIO...' : 'ADD SAMPLES'}</span>
          </button>

          {pack.downloadUrl && (
            <a
              href={pack.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="studio-btn-subtle"
              title="Open storage folder/repository"
            >
              <HardDriveUpload size={14} />
              <span>STORAGE LINK</span>
            </a>
          )}
          <button className="studio-btn-delete-pack" onClick={onDeletePack} title="Delete this pack">
            <Trash2 size={14} />
            <span>DELETE PACK</span>
          </button>
        </div>
      </div>
    </div>
  );
}
