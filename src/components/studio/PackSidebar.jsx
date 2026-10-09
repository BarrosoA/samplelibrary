import React, { useState, useEffect } from 'react';
import { FolderInput, Inbox } from 'lucide-react';
import { NEW_LOOPS_ID, setDragPill } from './studioUtils';

// pack list: click to select, drag to reorder, and a drop target for samples and new loops
export default function PackSidebar({
  packs,
  selectedPackId,
  onSelect,
  inbox,
  draggedTrack,
  draggedLoop,
  onReorderPacks,
  onMoveTrack,
  onAddLoop,
}) {
  const [draggedPack, setDraggedPack] = useState(null);
  const [reorderTargetId, setReorderTargetId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  // a sample or loop drag that ended outside the sidebar leaves no highlight behind
  useEffect(() => {
    if (!draggedTrack && !draggedLoop) setDropTargetId(null);
  }, [draggedTrack, draggedLoop]);

  const canDropOn = (pack) => (draggedTrack ? pack.id !== selectedPackId : Boolean(draggedLoop));

  const handleDragStart = (e, pack) => {
    setDraggedPack(pack);
    e.dataTransfer.setData('text/plain', JSON.stringify({ packId: pack.id }));
    e.dataTransfer.effectAllowed = 'move';
    setDragPill(e, pack.name, false);
  };

  const handleDragEnd = () => {
    setDraggedPack(null);
    setReorderTargetId(null);
  };

  const handleDragOver = (e, pack) => {
    if (draggedPack) {
      if (draggedPack.id === pack.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setReorderTargetId(pack.id);
    } else if (canDropOn(pack)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = draggedLoop ? 'copy' : 'move';
      setDropTargetId(pack.id);
    }
  };

  const handleDragLeave = (pack) => {
    if (reorderTargetId === pack.id) setReorderTargetId(null);
    if (dropTargetId === pack.id) setDropTargetId(null);
  };

  const handleDrop = (e, pack) => {
    e.preventDefault();
    setReorderTargetId(null);
    setDropTargetId(null);

    if (draggedPack) {
      if (draggedPack.id === pack.id) return;
      const sourceIdx = packs.findIndex((p) => p.id === draggedPack.id);
      const targetIdx = packs.findIndex((p) => p.id === pack.id);
      if (sourceIdx === -1 || targetIdx === -1) return;
      const reordered = [...packs];
      const [moved] = reordered.splice(sourceIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      onReorderPacks(reordered);
    } else if (draggedTrack && pack.id !== selectedPackId) {
      onMoveTrack(draggedTrack, pack);
    } else if (draggedLoop) {
      onAddLoop(draggedLoop, pack);
    }
  };

  return (
    <aside className="studio-sidebar">
      <div className="studio-sidebar-header">
        <span>PACKS ({packs.length})</span>
        {draggedTrack && <span className="studio-drop-tip">DROP SAMPLE TO MOVE</span>}
        {draggedLoop && <span className="studio-drop-tip">DROP ON A PACK TO ADD</span>}
      </div>

      {inbox.enabled && (
        <div
          className={`studio-pack-item studio-new-loops-item ${selectedPackId === NEW_LOOPS_ID ? 'active' : ''}`}
          onClick={() => onSelect(NEW_LOOPS_ID)}
          title="Loops you exported to your Compositions folder that are not in the library yet. Only you see this."
        >
          <div className="studio-pack-thumb studio-new-loops-icon">
            <Inbox size={18} />
          </div>
          <div className="studio-pack-meta">
            <span className="studio-pack-title">NEW LOOPS</span>
            <span className="studio-pack-sub">{inbox.items.length} waiting • only you see this</span>
          </div>
          {inbox.items.length > 0 && <span className="studio-new-loops-count">{inbox.items.length}</span>}
        </div>
      )}

      <div className="studio-sidebar-packs">
        {packs.map((pack) => {
          const isDropTarget = pack.id === dropTargetId;
          const classes = [
            'studio-pack-item',
            pack.id === selectedPackId && 'active',
            isDropTarget && 'drop-target',
            pack.id === reorderTargetId && 'reorder-target',
            draggedPack?.id === pack.id && 'is-dragging',
          ];
          const count = pack.tracks ? pack.tracks.length : pack.trackCount || 0;

          return (
            <div
              key={pack.id}
              className={classes.filter(Boolean).join(' ')}
              draggable
              onDragStart={(e) => handleDragStart(e, pack)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(pack.id)}
              onDragOver={(e) => handleDragOver(e, pack)}
              onDragLeave={() => handleDragLeave(pack)}
              onDrop={(e) => handleDrop(e, pack)}
              title="Drag to rearrange pack order"
            >
              <img src={pack.cover} alt={pack.name} className="studio-pack-thumb" />
              <div className="studio-pack-meta">
                <span className="studio-pack-title">{pack.name}</span>
                <span className="studio-pack-sub">
                  {count} samples • {pack.format || 'WAV'}
                </span>
              </div>
              {isDropTarget && (
                <div className="studio-drop-indicator">
                  <FolderInput size={14} />
                </div>
              )}
            </div>
          );
        })}
      </div>

    </aside>
  );
}
