import React, { useState } from 'react';
import { Trash2, Play, Pause, Loader2 } from 'lucide-react';
import { setDragPill } from './studioUtils';

// samples in a pack: drag rows to reorder, or onto a sidebar pack to move them
export default function TrackTable({ pack, tracks, player, downloads, draggedTrack, onDragTrack, onReorder, onDelete }) {
  const [dragOverTrackId, setDragOverTrackId] = useState(null);

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
        const dl = downloads && (downloads.tracks[track.id] || { single: 0, inPack: 0 });

        return (
          <div
            key={track.id}
            className={`studio-table-row ${isPending ? 'is-pending' : ''} ${isPlaying ? 'playing' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
            draggable={!isPending}
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
                  onClick={() => player.toggle(track.id, track.previewUrl)}
                  title={isPlaying ? 'Pause' : 'Audition preview'}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
              )}
            </div>

            <div className="st-col-title">
              <span className="st-track-title">{track.title}</span>
              <span className="st-track-id">{isPending ? 'processing & uploading...' : track.id}</span>
            </div>

            <div className="st-col-meta">
              <span className="st-badge">{track.bpm || '-'}</span>
            </div>

            <div className="st-col-meta">
              <span className="st-badge">{track.key || '-'}</span>
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
