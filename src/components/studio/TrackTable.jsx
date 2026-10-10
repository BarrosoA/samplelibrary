import React, { useState } from 'react';
import { Trash2, Play, Loader2 } from 'lucide-react';
import PauseIcon from '../PauseIcon';
import { setDragPill, previewAudioUrl } from './studioUtils';

// samples in a pack: drag rows to reorder, or onto a sidebar pack to move them
export default function TrackTable({ pack, tracks, player, downloads, draggedTrack, onDragTrack, onReorder, onDelete, onRename, onEditMeta }) {
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  // one cell at a time: { id, field } where field is title, bpm or key
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (track, field) => {
    setEditing({ id: track.id, field });
    const current = track[field];
    setEditValue(current && current !== '-' ? String(current) : '');
  };

  const saveEdit = (track) => {
    if (!editing) return;
    const { field } = editing;
    setEditing(null);
    const trimmed = editValue.trim();

    if (field === 'title') {
      if (trimmed && trimmed !== track.title) onRename(track, trimmed);
    } else if (field === 'bpm') {
      if (trimmed && Number(trimmed) !== track.bpm) onEditMeta(track, { bpm: Number(trimmed) });
    } else if ((trimmed || '-') !== (track.key || '-')) {
      onEditMeta(track, { key: trimmed });
    }
  };

  const editInput = (track, className, extra = {}) => (
    <input
      className={className}
      value={editValue}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={() => saveEdit(track)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') setEditing(null);
      }}
      {...extra}
    />
  );

  const handleDragStart = (e, track) => {
    onDragTrack(track);
    e.dataTransfer.setData('text/plain', JSON.stringify({ trackId: track.id, sourcePackId: pack.id }));
    e.dataTransfer.effectAllowed = 'move';
    setDragPill(e, track.title);
  };

  const handleDragEnd = () => {
    onDragTrack(null);
    setDragOverTrackId(null);
  };

  const handleDragOver = (e, trackId) => {
    if (!draggedTrack || draggedTrack.id === trackId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTrackId(trackId);
  };

  const handleDrop = (e, targetTrack) => {
    e.preventDefault();
    setDragOverTrackId(null);
    if (!draggedTrack || draggedTrack.id === targetTrack.id) return;

    const current = pack.tracks || [];
    const sourceIndex = current.findIndex((t) => t.id === draggedTrack.id);
    const targetIndex = current.findIndex((t) => t.id === targetTrack.id);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
  };

  return (
    <div className="studio-table">
      <div className="studio-table-row studio-table-head">
        <span className="st-col-play">#</span>
        <span className="st-col-title">SAMPLE NAME</span>
        <span className="st-col-meta">BPM</span>
        <span className="st-col-meta">KEY</span>
        <span className="st-col-dur">LENGTH</span>
        <span className="st-col-dur">DOWNLOADS</span>
        <span className="st-col-del">REMOVE</span>
      </div>

      {tracks.map((track) => {
        const isPending = track.isPending;
        const isPlaying = !isPending && player.playingId === track.id;
        const isDragging = !isPending && draggedTrack?.id === track.id;
        const isDragOver = !isPending && dragOverTrackId === track.id;
        const isEditing = !isPending && editing?.id === track.id;
        const editingField = isEditing ? editing.field : null;
        const dl = downloads && (downloads.tracks[track.id] || { single: 0, inPack: 0 });

        return (
          <div
            key={track.id}
            className={`studio-table-row ${isPending ? 'is-pending' : ''} ${isPlaying ? 'playing' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
            draggable={!isPending && !isEditing}
            onDragStart={(e) => !isPending && handleDragStart(e, track)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => !isPending && handleDragOver(e, track.id)}
            onDragLeave={() => dragOverTrackId === track.id && setDragOverTrackId(null)}
            onDrop={(e) => !isPending && handleDrop(e, track)}
            title={isPending ? 'Processing audio and uploading to storage...' : 'Drag to reorder or drag onto a sidebar pack'}
          >
            <div className="st-col-play">
              {isPending ? (
                <Loader2 size={13} className="spin-icon pending-spinner" />
              ) : (
                <button
                  className="st-btn-audition"
                  onClick={() => player.toggle(track.id, previewAudioUrl(track.previewUrl))}
                  title={isPlaying ? 'Pause' : 'Audition preview'}
                >
                  {isPlaying ? <PauseIcon size={12} /> : <Play size={12} />}
                </button>
              )}
            </div>

            <div className="st-col-title">
              {editingField === 'title' ? (
                editInput(track, 'st-track-title-input')
              ) : (
                <span
                  className={`st-track-title ${isPending ? '' : 'is-editable'}`}
                  onClick={() => !isPending && startEdit(track, 'title')}
                  title={isPending ? undefined : 'Click to rename'}
                >
                  {track.title}
                </span>
              )}
              <span className="st-track-id">{isPending ? 'processing & uploading...' : track.id}</span>
            </div>

            <div className="st-col-meta">
              {editingField === 'bpm' ? (
                editInput(track, 'st-meta-input', {
                  inputMode: 'numeric',
                  maxLength: 3,
                  onChange: (e) => setEditValue(e.target.value.replace(/\D/g, '')),
                })
              ) : (
                <span
                  className={`st-badge ${isPending ? '' : 'is-editable'}`}
                  onClick={() => !isPending && startEdit(track, 'bpm')}
                  title={isPending ? undefined : 'Click to edit BPM'}
                >
                  {track.bpm || '-'}
                </span>
              )}
            </div>

            <div className="st-col-meta">
              {editingField === 'key' ? (
                editInput(track, 'st-meta-input', { placeholder: 'e.g. C#m' })
              ) : (
                <span
                  className={`st-badge ${isPending ? '' : 'is-editable'}`}
                  onClick={() => !isPending && startEdit(track, 'key')}
                  title={isPending ? undefined : 'Click to edit key'}
                >
                  {track.key || '-'}
                </span>
              )}
            </div>

            <div className="st-col-dur">
              <span>{isPending ? '...' : track.duration ? `${Math.round(track.duration)}s` : '-'}</span>
            </div>

            <div
              className="st-col-dur"
              title={dl ? `${dl.single} on its own, ${dl.inPack} in pack downloads` : 'Counts appear after the next publish'}
            >
              <span>{dl && !isPending ? (dl.single + dl.inPack).toLocaleString() : '-'}</span>
            </div>

            <div className="st-col-del">
              {!isPending && (
                <button className="st-btn-trash" onClick={() => onDelete(track)} title="Delete sample">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
