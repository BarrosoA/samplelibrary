import React, { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import PackHeader from './PackHeader';
import TrackTable from './TrackTable';
import { postJson, postForm, hasDraggedFiles } from './studioUtils';

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.m4a', '.opus'];

// one pack's page: header plus the samples table, which also takes dropped audio files
export default function PackView({
  pack,
  autoEditTitle,
  player,
  downloads,
  draggedTrack,
  onDragTrack,
  onReorderTracks,
  notify,
  onChanged,
  onDeleted,
}) {
  const [pendingTracks, setPendingTracks] = useState([]);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const audioInputRef = useRef(null);

  const uploadAudioFiles = async (fileList) => {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('audio/') || AUDIO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (files.length === 0) {
      notify('No valid audio files found (WAV, MP3, FLAC, OPUS)', 'error');
      return;
    }

    // placeholder rows while the server encodes previews
    const placeholders = files.map((file, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      title: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      bpm: '...',
      key: '...',
      duration: null,
      isPending: true,
    }));
    setPendingTracks((prev) => [...prev, ...placeholders]);
    setIsUploadingAudio(true);

    try {
      const formData = new FormData();
      formData.append('packId', pack.id);
      files.forEach((file) => formData.append('tracks', file));
      const data = await postForm('upload-tracks', formData, 'Failed to add audio files');
      const count = data.tracks ? data.tracks.length : files.length;
      notify(`Added ${count} sample${count > 1 ? 's' : ''}`);
      await onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setPendingTracks((prev) => prev.filter((p) => !placeholders.includes(p)));
      setIsUploadingAudio(false);
    }
  };

  const handleRenameTrack = async (track, title) => {
    try {
      await postJson('update-track', { packId: pack.id, trackId: track.id, updates: { title } }, 'Failed to rename sample');
      notify(`Renamed to "${title}"`);
      await onChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`Delete "${track.title}" from ${pack.name}? This unlinks its preview MP3.`)) return;
    try {
      await postJson('delete-track', { packId: pack.id, trackId: track.id }, 'Failed to delete sample');
      notify(`Deleted "${track.title}"`);
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeletePack = async () => {
    if (!window.confirm(`Delete entire pack "${pack.name}"? This permanently unlinks all its preview samples.`)) return;
    try {
      await postJson('delete-pack', { packId: pack.id }, 'Failed to delete pack');
      notify(`Deleted pack "${pack.name}"`);
      onDeleted();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // dragging a sample row to reorder must not light up the file drop zone
  const isFileDrag = (e) => !draggedTrack && hasDraggedFiles(e);
  const tracks = [...(pack.tracks || []), ...pendingTracks];

  return (
    <div className="studio-pack-view">
      <input
        type="file"
        ref={audioInputRef}
        style={{ display: 'none' }}
        multiple
        accept="audio/*,.wav,.mp3,.flac,.aiff,.m4a,.opus"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) uploadAudioFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <PackHeader
        pack={pack}
        autoEditTitle={autoEditTitle}
        isUploadingAudio={isUploadingAudio}
        notify={notify}
        onChanged={onChanged}
        onAddSamples={() => audioInputRef.current?.click()}
        onDeletePack={handleDeletePack}
      />

      <div
        className={`studio-table-section ${isDropZoneActive ? 'file-drop-active' : ''}`}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDropZoneActive(true);
        }}
        onDragLeave={(e) => {
          if (draggedTrack) return;
          e.preventDefault();
          setIsDropZoneActive(false);
        }}
        onDrop={(e) => {
          if (draggedTrack) return;
          e.preventDefault();
          setIsDropZoneActive(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadAudioFiles(e.dataTransfer.files);
        }}
      >
        {isDropZoneActive && (
          <div className="studio-audio-drop-overlay">
            <UploadCloud size={28} />
            <span>Drop audio files to add to {pack.name}</span>
          </div>
        )}

        {tracks.length === 0 ? (
          <div className="studio-audio-empty-dropzone" onClick={() => audioInputRef.current?.click()}>
            <UploadCloud size={24} />
            <p className="dropzone-primary-text">Drag & drop audio files here</p>
            <p className="dropzone-sub-text">or click to browse (.wav, .mp3, .flac, .opus)</p>
          </div>
        ) : (
          <TrackTable
            pack={pack}
            tracks={tracks}
            player={player}
            downloads={downloads}
            draggedTrack={draggedTrack}
            onDragTrack={onDragTrack}
            onReorder={onReorderTracks}
            onDelete={handleDeleteTrack}
            onRename={handleRenameTrack}
          />
        )}
      </div>
    </div>
  );
}
