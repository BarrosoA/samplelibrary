import React, { useState, useEffect, useCallback } from 'react';
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Play, 
  Pause, 
  Music4,
  HardDriveUpload,
  AlertCircle,
  CheckCircle2,
  FolderInput
} from 'lucide-react';
import AddPackModal from '../components/AddPackModal';

export default function StudioManager() {
  const [catalogue, setCatalogue] = useState({ packs: [] });
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [audioObj, setAudioObj] = useState(null);
  const [notification, setNotification] = useState(null);

  // drag state
  const [draggedTrack, setDraggedTrack] = useState(null);
  const [dragOverPackId, setDragOverPackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);

  const fetchCatalogue = useCallback(() => {
    fetch('/tracks.json')
      .then((res) => res.json())
      .then((data) => {
        setCatalogue(data);
        if (!selectedPackId && data.packs && data.packs.length > 0) {
          setSelectedPackId(data.packs[0].id);
        }
      })
      .catch((err) => console.error('Failed to load catalogue:', err));
  }, [selectedPackId]);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const currentPack = (catalogue.packs || []).find((p) => p.id === selectedPackId) || null;

  const handlePlayPreview = (track) => {
    if (playingTrackId === track.id) {
      if (audioObj) {
        audioObj.pause();
        setPlayingTrackId(null);
      }
    } else {
      if (audioObj) {
        audioObj.pause();
      }
      const newAudio = new Audio(track.previewUrl);
      newAudio.play();
      newAudio.onended = () => setPlayingTrackId(null);
      setAudioObj(newAudio);
      setPlayingTrackId(track.id);
    }
  };

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`Delete "${track.title}" from ${currentPack.name}? This unlinks its preview MP3.`)) return;

    try {
      const res = await fetch('/api/manage/delete-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: currentPack.id, trackId: track.id }),
      });
      if (!res.ok) throw new Error('Failed to delete sample');
      notify(`Deleted "${track.title}"`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeletePack = async (pack) => {
    if (!window.confirm(`Delete entire pack "${pack.name}"? This permanently unlinks all its preview samples.`)) return;

    try {
      const res = await fetch('/api/manage/delete-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      if (!res.ok) throw new Error('Failed to delete pack');
      notify(`Deleted pack "${pack.name}"`);
      setSelectedPackId(null);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // Drag handlers for sample rows
  const handleDragStart = (e, track) => {
    setDraggedTrack(track);
    e.dataTransfer.setData('text/plain', JSON.stringify({ trackId: track.id, sourcePackId: currentPack.id }));
    e.dataTransfer.effectAllowed = 'move';

    // create a compact, elegant drag badge instead of dragging the entire wide row
    const ghost = document.createElement('div');
    ghost.className = 'studio-drag-ghost-pill';
    ghost.innerHTML = `<span class="ghost-music-icon">♫</span> <span class="ghost-title">${track.title}</span>`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 14, 14);

    // remove temporary ghost element from dom after browser captures screenshot
    setTimeout(() => {
      if (document.body.contains(ghost)) {
        document.body.removeChild(ghost);
      }
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedTrack(null);
    setDragOverPackId(null);
    setDragOverTrackId(null);
  };

  // Drop onto sidebar pack (move sample to another pack)
  const handlePackDragOver = (e, packId) => {
    if (!draggedTrack || packId === currentPack?.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverPackId !== packId) {
      setDragOverPackId(packId);
    }
  };

  const handlePackDragLeave = (e, packId) => {
    if (dragOverPackId === packId) {
      setDragOverPackId(null);
    }
  };

  const handlePackDrop = async (e, targetPack) => {
    e.preventDefault();
    setDragOverPackId(null);
    if (!draggedTrack || !currentPack || targetPack.id === currentPack.id) return;

    try {
      const res = await fetch('/api/manage/move-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePackId: currentPack.id,
          targetPackId: targetPack.id,
          trackId: draggedTrack.id,
        }),
      });
      if (!res.ok) throw new Error('Failed to move sample');
      notify(`Moved "${draggedTrack.title}" to ${targetPack.name}`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // Drop between rows in the same pack (reorder samples)
  const handleTrackDragOver = (e, trackId) => {
    if (!draggedTrack || draggedTrack.id === trackId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTrackId !== trackId) {
      setDragOverTrackId(trackId);
    }
  };

  const handleTrackDragLeave = (e, trackId) => {
    if (dragOverTrackId === trackId) {
      setDragOverTrackId(null);
    }
  };

  const handleTrackDrop = async (e, targetTrack) => {
    e.preventDefault();
    setDragOverTrackId(null);
    if (!draggedTrack || !currentPack || draggedTrack.id === targetTrack.id) return;

    const tracks = currentPack.tracks || [];
    const sourceIndex = tracks.findIndex((t) => t.id === draggedTrack.id);
    const targetIndex = tracks.findIndex((t) => t.id === targetTrack.id);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newTracks = [...tracks];
    const [moved] = newTracks.splice(sourceIndex, 1);
    newTracks.splice(targetIndex, 0, moved);

    // optimistic UI update
    setCatalogue((prev) => ({
      ...prev,
      packs: (prev.packs || []).map((p) => {
        if (p.id === currentPack.id) {
          return { ...p, tracks: newTracks };
        }
        return p;
      }),
    }));

    try {
      const res = await fetch('/api/manage/reorder-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: currentPack.id,
          trackIds: newTracks.map((t) => t.id),
        }),
      });
      if (!res.ok) throw new Error('Failed to save sample reordering');
      notify(`Reordered samples in ${currentPack.name}`);
    } catch (err) {
      notify(err.message, 'error');
      fetchCatalogue();
    }
  };

  return (
    <div className="studio-app-wrapper">
      {/* top studio header */}
      <header className="studio-topbar">
        <div className="studio-topbar-left">
          <div className="studio-logo-wrap">
            <FolderKanban size={18} />
            <span className="studio-logo-text">NO LUV - STUDIO WORKSPACE</span>
          </div>
          <span className="studio-badge-dev">LOCAL MANAGER</span>
        </div>

        <div className="studio-topbar-right">
          <button 
            className="studio-btn-import"
            onClick={() => setIsAddModalOpen(true)}
            title="Import folder with WAVs and cover"
          >
            <Plus size={15} />
            <span>NEW PACK</span>
          </button>

          <a 
            href="#/" 
            className="studio-btn-preview-site"
            title="Open visitor library view"
          >
            <ExternalLink size={14} />
            <span>VIEW VISITOR SITE</span>
          </a>
        </div>
      </header>

      {/* notification toast */}
      {notification && (
        <div className={`studio-toast ${notification.type}`}>
          {notification.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* 2-column workspace layout */}
      <div className="studio-layout">
        {/* sidebar packs list (acts as drop targets) */}
        <aside className="studio-sidebar">
          <div className="studio-sidebar-header">
            <span>PACKS ({(catalogue.packs || []).length})</span>
            {draggedTrack && <span className="studio-drop-tip">DROP SAMPLE TO MOVE</span>}
          </div>

          <div className="studio-sidebar-packs">
            {(catalogue.packs || []).map((pack) => {
              const isSelected = pack.id === selectedPackId;
              const isDropTarget = pack.id === dragOverPackId;
              const count = pack.tracks ? pack.tracks.length : (pack.trackCount || 0);

              return (
                <div
                  key={pack.id}
                  className={`studio-pack-item ${isSelected ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                  onClick={() => setSelectedPackId(pack.id)}
                  onDragOver={(e) => handlePackDragOver(e, pack.id)}
                  onDragLeave={(e) => handlePackDragLeave(e, pack.id)}
                  onDrop={(e) => handlePackDrop(e, pack)}
                >
                  <img src={pack.cover} alt={pack.name} className="studio-pack-thumb" />
                  <div className="studio-pack-meta">
                    <span className="studio-pack-title">{pack.name}</span>
                    <span className="studio-pack-sub">{count} samples • {pack.format || 'WAV'}</span>
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

        {/* main workspace detail panel */}
        <main className="studio-main-panel">
          {currentPack ? (
            <div className="studio-pack-view">
              {/* pack detail header banner */}
              <div className="studio-pack-hero">
                <img src={currentPack.cover} alt={currentPack.name} className="studio-hero-art" />
                <div className="studio-hero-info">
                  <span className="studio-hero-id">{currentPack.id}</span>
                  <h1 className="studio-hero-title">{currentPack.name}</h1>
                  <p className="studio-hero-desc">{currentPack.description || 'No description set.'}</p>
                  
                  <div className="studio-hero-actions">
                    {currentPack.downloadUrl && (
                      <a
                        href={currentPack.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="studio-btn-subtle"
                        title="Open Google Drive folder/ZIP"
                      >
                        <HardDriveUpload size={14} />
                        <span>DRIVE LINK</span>
                      </a>
                    )}
                    <button
                      className="studio-btn-delete-pack"
                      onClick={() => handleDeletePack(currentPack)}
                      title="Delete this pack"
                    >
                      <Trash2 size={14} />
                      <span>DELETE PACK</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* samples table with reordering & drag handle */}
              <div className="studio-table-section">
                <div className="studio-table-heading">
                  <span>SAMPLES ({(currentPack.tracks || []).length})</span>
                  <span className="studio-drag-help">Drag handle to reorder rows or drag to a pack in the sidebar</span>
                </div>

                <div className="studio-table">
                  <div className="studio-table-row studio-table-head">
                    <span className="st-col-play">#</span>
                    <span className="st-col-title">SAMPLE NAME</span>
                    <span className="st-col-meta">BPM</span>
                    <span className="st-col-meta">KEY</span>
                    <span className="st-col-dur">LENGTH</span>
                    <span className="st-col-del">REMOVE</span>
                  </div>

                  {(currentPack.tracks || []).map((track, idx) => {
                    const isPlaying = playingTrackId === track.id;
                    const isDragging = draggedTrack?.id === track.id;
                    const isDragOver = dragOverTrackId === track.id;

                    return (
                      <div 
                        key={track.id} 
                        className={`studio-table-row ${isPlaying ? 'playing' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, track)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleTrackDragOver(e, track.id)}
                        onDragLeave={(e) => handleTrackDragLeave(e, track.id)}
                        onDrop={(e) => handleTrackDrop(e, track)}
                        title="Drag to reorder or drag onto a sidebar pack"
                      >
                        <div className="st-col-play">
                          <button 
                            className="st-btn-audition"
                            onClick={() => handlePlayPreview(track)}
                            title={isPlaying ? 'Pause' : 'Audition preview'}
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                        </div>

                        <div className="st-col-title">
                          <span className="st-track-title">{track.title}</span>
                          <span className="st-track-id">{track.id}</span>
                        </div>

                        <div className="st-col-meta">
                          <span className="st-badge">{track.bpm || '-'}</span>
                        </div>

                        <div className="st-col-meta">
                          <span className="st-badge">{track.key || '-'}</span>
                        </div>

                        <div className="st-col-dur">
                          <span>{track.duration ? `${Math.round(track.duration)}s` : '-'}</span>
                        </div>

                        <div className="st-col-del">
                          <button
                            className="st-btn-trash"
                            onClick={() => handleDeleteTrack(track)}
                            title="Delete sample"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="studio-empty-prompt">
              <Music4 size={32} />
              <p>Select a pack on the left or create a new pack to manage samples.</p>
            </div>
          )}
        </main>
      </div>

      {/* modal for staging import */}
      <AddPackModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newPack) => {
          fetchCatalogue();
          if (newPack) setSelectedPackId(newPack.id);
          notify(`Created pack "${newPack.name}"`);
        }}
      />
    </div>
  );
}
