import React from 'react';
import { Play, Pause, AlertCircle, Loader2, Inbox, RefreshCw, X } from 'lucide-react';
import { inboxAudioUrl, setDragPill } from './studioUtils';

export default function NewLoopsPanel({ items, busy, player, draggedLoop, onDragLoop, onUpdate, onDismiss }) {
  const handleDragStart = (e, item) => {
    onDragLoop(item);
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.effectAllowed = 'copy';
    setDragPill(e, item.title);
  };

  return (
    <div className="studio-pack-view">
      <div className="studio-new-loops-header">
        <h1 className="studio-hero-title">NEW LOOPS</h1>
        <p className="studio-hero-desc">
          Loops you exported to your Compositions folder that aren't in the library yet. Drag one onto a pack on the
          left to add it. Nothing here is on the website, and nothing is added until you drag it.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="studio-empty-prompt">
          <Inbox size={32} />
          <p>No new loops. Export one to a month folder in Compositions and it will show up here.</p>
        </div>
      ) : (
        <div className="studio-table">
          <div className="studio-table-row studio-table-head">
            <span className="st-col-play">#</span>
            <span className="st-col-title">LOOP</span>
            <span className="st-col-meta">BPM</span>
            <span className="st-col-meta">KEY</span>
            <span className="st-col-dur">SIZE</span>
            <span className="st-col-del" />
          </div>

          {items.map((item) => {
            const busyLabel = busy[item.path];
            const isPlaying = player.playingId === item.path;
            const blocked = item.writing || Boolean(busyLabel);
            return (
              <div
                key={item.path}
                className={`studio-table-row ${blocked ? 'is-pending' : ''} ${isPlaying ? 'playing' : ''} ${draggedLoop?.path === item.path ? 'is-dragging' : ''}`}
                draggable={!blocked && !item.updates}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragEnd={() => onDragLoop(null)}
                title={
                  item.writing
                    ? 'Still being exported...'
                    : item.updates
                    ? 'New export of a loop that is already in the library'
                    : 'Drag onto a pack on the left to add it'
                }
              >
                <div className="st-col-play">
                  {blocked ? (
                    <Loader2 size={13} className="spin-icon pending-spinner" />
                  ) : (
                    <button
                      className="st-btn-audition"
                      onClick={() => player.toggle(item.path, inboxAudioUrl(item.path))}
                      title={isPlaying ? 'Pause' : 'Listen'}
                    >
                      {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                  )}
                </div>

                <div className="st-col-title">
                  <span className="st-track-title">{item.title}</span>
                  <span className="st-track-id">
                    {busyLabel ? `${busyLabel}...` : item.writing ? 'still exporting...' : `${item.folder} • ${item.name}`}
                  </span>
                  {item.updates && (
                    <span className="studio-loop-note">
                      New export of {item.updates.map((t) => `"${t.title}" (${t.packName})`).join(', ')}
                    </span>
                  )}
                  {item.warnings.map((w) => (
                    <span key={w} className="studio-loop-warning">
                      <AlertCircle size={11} /> {w}
                    </span>
                  ))}
                </div>

                <div className="st-col-meta">
                  <span className="st-badge">{item.bpm || '-'}</span>
                </div>

                <div className="st-col-meta">
                  <span className="st-badge">{item.key || '-'}</span>
                </div>

                <div className="st-col-dur">
                  <span>{(item.size / 1048576).toFixed(0)} MB</span>
                </div>

                <div className="st-col-del studio-loop-actions">
                  {item.updates && !blocked && (
                    <button className="st-btn-update" onClick={() => onUpdate(item)} title="Replace the library version with this export">
                      <RefreshCw size={13} />
                    </button>
                  )}
                  {!blocked && (
                    <button className="st-btn-trash" onClick={() => onDismiss(item)} title="Hide this loop from the list">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
