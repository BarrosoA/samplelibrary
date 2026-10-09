import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FolderInput,
  Camera,
  UploadCloud,
  Loader2,
  Inbox,
  RefreshCw,
  X
} from 'lucide-react';
import AddPackModal from '../components/AddPackModal';

const NEW_LOOPS_ID = '__new_loops__';
const inboxAudioUrl = (filePath) => `/api/manage/inbox-audio?path=${encodeURIComponent(filePath)}`;

export default function StudioManager() {
  const [catalogue, setCatalogue] = useState({ packs: [] });
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [audioObj, setAudioObj] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [pendingTracks, setPendingTracks] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);

  // drag state
  const [draggedTrack, setDraggedTrack] = useState(null);
  const [dragOverPackId, setDragOverPackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  const [draggedPack, setDraggedPack] = useState(null);
  const [dragOverPackReorderId, setDragOverPackReorderId] = useState(null);
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const [isAudioZoneDragOver, setIsAudioZoneDragOver] = useState(false);

  // loops exported to the compositions folder that are not in the library yet
  const [inbox, setInbox] = useState({ enabled: false, items: [] });
  const [inboxBusy, setInboxBusy] = useState({});
  const [draggedLoop, setDraggedLoop] = useState(null);

  const coverInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const fetchInbox = useCallback(() => {
    fetch('/api/manage/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((res) => res.json())
      .then((data) => data && Array.isArray(data.items) && setInbox(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchInbox();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchInbox();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

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
    setTimeout(() => setNotification(null), type === 'error' ? Math.max(6000, msg.length * 60) : 3500);
  };

  const currentPack = (catalogue.packs || []).find((p) => p.id === selectedPackId) || null;

  // clear pending tracks when switching packs
  useEffect(() => {
    setPendingTracks([]);
  }, [selectedPackId]);

  // inline editing state for title and description
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');

  useEffect(() => {
    if (currentPack) {
      setTitleValue(currentPack.name || '');
      setDescValue(currentPack.description || '');
      setIsEditingTitle(false);
      setIsEditingDesc(false);
    }
  }, [currentPack?.id, currentPack?.name, currentPack?.description]);

  // spawn blank pack immediately
  const handleCreateNewPack = async () => {
    try {
      const res = await fetch('/api/manage/create-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'UNTITLED PACK' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to spawn new pack');
      
      notify('Spawned new pack with default cover. Click title to rename.');
      await fetchCatalogue();
      if (data.pack) {
        setSelectedPackId(data.pack.id);
        // focus title editing immediately
        setTimeout(() => setIsEditingTitle(true), 100);
      }
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const uploadCoverFile = async (file) => {
    if (!currentPack) return;
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file (PNG, JPG, WEBP)', 'error');
      return;
    }

    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('packId', currentPack.id);
      formData.append('cover', file);

      const res = await fetch('/api/manage/upload-cover', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload cover');

      notify('Cover image updated');
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const uploadAudioFiles = async (fileList) => {
    if (!currentPack) return;
    const files = Array.from(fileList).filter((f) => {
      const ext = f.name.toLowerCase();
      return (
        f.type.startsWith('audio/') ||
        ext.endsWith('.wav') ||
        ext.endsWith('.mp3') ||
        ext.endsWith('.flac') ||
        ext.endsWith('.aiff') ||
        ext.endsWith('.m4a') ||
        ext.endsWith('.opus')
      );
    });

    if (files.length === 0) {
      notify('No valid audio files found (WAV, MP3, FLAC, OPUS)', 'error');
      return;
    }

    // create optimistic pending rows immediately
    const tempPending = files.map((file, idx) => {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      return {
        id: `pending-${Date.now()}-${idx}`,
        title: cleanName,
        bpm: '...',
        key: '...',
        duration: null,
        isPending: true,
      };
    });

    setPendingTracks((prev) => [...prev, ...tempPending]);
    setIsUploadingAudio(true);

    try {
      const formData = new FormData();
      formData.append('packId', currentPack.id);
      files.forEach((file) => formData.append('tracks', file));

      const res = await fetch('/api/manage/upload-tracks', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add audio files');

      const count = data.tracks ? data.tracks.length : files.length;
      notify(`Added ${count} sample${count > 1 ? 's' : ''}`);
      await fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setPendingTracks((prev) => prev.filter((p) => !tempPending.some((t) => t.id === p.id)));
      setIsUploadingAudio(false);
    }
  };


  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === currentPack?.name) {
      setTitleValue(currentPack?.name || '');
      return;
    }

    try {
      const res = await fetch('/api/manage/update-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: currentPack.id,
          updates: { name: trimmed },
        }),
      });
      if (!res.ok) throw new Error('Failed to update title');
      notify(`Updated title to "${trimmed}"`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
      setTitleValue(currentPack?.name || '');
    }
  };

  const handleSaveDesc = async () => {
    setIsEditingDesc(false);
    const trimmed = descValue.trim();
    if (trimmed === (currentPack?.description || '')) {
      return;
    }

    try {
      const res = await fetch('/api/manage/update-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: currentPack.id,
          updates: { description: trimmed },
        }),
      });
      if (!res.ok) throw new Error('Failed to update description');
      notify('Updated description');
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
      setDescValue(currentPack?.description || '');
    }
  };

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

  // Drag handlers for sidebar packs reordering
  const handlePackDragStart = (e, pack) => {
    setDraggedPack(pack);
    e.dataTransfer.setData('text/plain', JSON.stringify({ packId: pack.id }));
    e.dataTransfer.effectAllowed = 'move';

    const ghost = document.createElement('div');
    ghost.className = 'studio-drag-ghost-pill';
    ghost.innerHTML = `<span class="ghost-title">${pack.name}</span>`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 14, 14);

    setTimeout(() => {
      if (document.body.contains(ghost)) {
        document.body.removeChild(ghost);
      }
    }, 0);
  };

  const handlePackDragEnd = () => {
    setDraggedPack(null);
    setDragOverPackReorderId(null);
  };

  const handlePackReorderDragOver = (e, packId) => {
    if (!draggedPack || draggedPack.id === packId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverPackReorderId !== packId) {
      setDragOverPackReorderId(packId);
    }
  };

  const handlePackReorderDragLeave = (e, packId) => {
    if (dragOverPackReorderId === packId) {
      setDragOverPackReorderId(null);
    }
  };

  const handlePackReorderDrop = async (e, targetPack) => {
    e.preventDefault();
    setDragOverPackReorderId(null);
    if (!draggedPack || draggedPack.id === targetPack.id) return;

    const packs = catalogue.packs || [];
    const sourceIdx = packs.findIndex((p) => p.id === draggedPack.id);
    const targetIdx = packs.findIndex((p) => p.id === targetPack.id);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newPacks = [...packs];
    const [moved] = newPacks.splice(sourceIdx, 1);
    newPacks.splice(targetIdx, 0, moved);

    // optimistic update
    setCatalogue((prev) => ({
      ...prev,
      packs: newPacks,
    }));

    try {
      const res = await fetch('/api/manage/reorder-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packIds: newPacks.map((p) => p.id),
        }),
      });
      if (!res.ok) throw new Error('Failed to save pack order');
      notify('Reordered packs');
    } catch (err) {
      notify(err.message, 'error');
      fetchCatalogue();
    }
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

  const inboxRequest = async (endpoint, item, payload, busyLabel) => {
    setInboxBusy((prev) => ({ ...prev, [item.path]: busyLabel }));
    try {
      const res = await fetch(`/api/manage/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      return data;
    } finally {
      setInboxBusy((prev) => {
        const next = { ...prev };
        delete next[item.path];
        return next;
      });
      fetchInbox();
    }
  };

  const handleAddLoopToPack = async (item, targetPack) => {
    if (item.writing || inboxBusy[item.path]) return;
    try {
      await inboxRequest('inbox-add', item, { packId: targetPack.id }, 'adding');
      notify(`Added "${item.title}" to ${targetPack.name}`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleUpdateLoop = async (item) => {
    const names = item.updates.map((t) => `"${t.title}" (${t.packName})`).join(', ');
    if (!window.confirm(`Replace ${names} with this new export? The site will get the new version when you publish.`)) return;
    try {
      await inboxRequest('inbox-update', item, {}, 'updating');
      notify(`Updated ${names}`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDismissLoop = async (item) => {
    try {
      await inboxRequest('inbox-dismiss', item, {}, 'dismissing');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleLoopDragStart = (e, item) => {
    setDraggedLoop(item);
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleLoopDragEnd = () => {
    setDraggedLoop(null);
    setDragOverPackId(null);
  };

  const handlePublishToGit = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const res = await fetch('/api/manage/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to publish');
      notify(data.message || 'Pushed to GitHub successfully!');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setIsPublishing(false);
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
            className="studio-btn-publish"
            onClick={handlePublishToGit}
            disabled={isPublishing}
            title="Commit and push all changes to GitHub for live Vercel deployment"
          >
            {isPublishing ? <Loader2 size={14} className="spin-icon" /> : <UploadCloud size={14} />}
            <span>{isPublishing ? 'PUBLISHING...' : 'PUBLISH TO LIVE'}</span>
          </button>

          <button 
            className="studio-btn-import"
            onClick={handleCreateNewPack}
            title="Create blank pack with default cover"
          >
            <Plus size={15} />
            <span>NEW PACK</span>
          </button>

          <button 
            className="studio-btn-subtle"
            onClick={() => setIsAddModalOpen(true)}
            title="Import existing folder with WAVs and cover"
          >
            <FolderInput size={14} />
            <span>IMPORT FOLDER</span>
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

      {/* hidden file inputs for click-to-upload fallback */}
      <input
        type="file"
        ref={coverInputRef}
        style={{ display: 'none' }}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            uploadCoverFile(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={audioInputRef}
        style={{ display: 'none' }}
        multiple
        accept="audio/*,.wav,.mp3,.flac,.aiff,.m4a,.opus"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            uploadAudioFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* 2-column workspace layout */}
      <div className="studio-layout">
        {/* sidebar packs list (acts as drop targets) */}
        <aside className="studio-sidebar">
          <div className="studio-sidebar-header">
            <span>PACKS ({(catalogue.packs || []).length})</span>
            {draggedTrack && <span className="studio-drop-tip">DROP SAMPLE TO MOVE</span>}
            {draggedLoop && <span className="studio-drop-tip">DROP ON A PACK TO ADD</span>}
          </div>

          {inbox.enabled && (
            <div
              className={`studio-pack-item studio-new-loops-item ${selectedPackId === NEW_LOOPS_ID ? 'active' : ''}`}
              onClick={() => setSelectedPackId(NEW_LOOPS_ID)}
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
            {(catalogue.packs || []).map((pack) => {
              const isSelected = pack.id === selectedPackId;
              const isDropTarget = pack.id === dragOverPackId;
              const isReorderTarget = pack.id === dragOverPackReorderId;
              const isBeingDragged = draggedPack?.id === pack.id;
              const count = pack.tracks ? pack.tracks.length : (pack.trackCount || 0);

              return (
                <div
                  key={pack.id}
                  className={`studio-pack-item ${isSelected ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''} ${isReorderTarget ? 'reorder-target' : ''} ${isBeingDragged ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handlePackDragStart(e, pack)}
                  onDragEnd={handlePackDragEnd}
                  onClick={() => setSelectedPackId(pack.id)}
                  onDragOver={(e) => {
                    if (draggedPack) {
                      handlePackReorderDragOver(e, pack.id);
                    } else if (draggedTrack) {
                      handlePackDragOver(e, pack.id);
                    } else if (draggedLoop) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      if (dragOverPackId !== pack.id) setDragOverPackId(pack.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (draggedPack) {
                      handlePackReorderDragLeave(e, pack.id);
                    } else if (draggedTrack || draggedLoop) {
                      handlePackDragLeave(e, pack.id);
                    }
                  }}
                  onDrop={(e) => {
                    if (draggedPack) {
                      handlePackReorderDrop(e, pack);
                    } else if (draggedTrack) {
                      handlePackDrop(e, pack);
                    } else if (draggedLoop) {
                      e.preventDefault();
                      setDragOverPackId(null);
                      handleAddLoopToPack(draggedLoop, pack);
                      setDraggedLoop(null);
                    }
                  }}
                  title="Drag to rearrange pack order"
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
          {selectedPackId === NEW_LOOPS_ID ? (
            <div className="studio-pack-view">
              <div className="studio-new-loops-header">
                <h1 className="studio-hero-title">NEW LOOPS</h1>
                <p className="studio-hero-desc">
                  Loops you exported to your Compositions folder that aren't in the library yet. Drag one onto a pack
                  on the left to add it. Nothing here is on the website, and nothing is added until you drag it.
                </p>
              </div>

              {inbox.items.length === 0 ? (
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

                  {inbox.items.map((item) => {
                    const busy = inboxBusy[item.path];
                    const isPlaying = playingTrackId === item.path;
                    const blocked = item.writing || Boolean(busy);
                    return (
                      <div
                        key={item.path}
                        className={`studio-table-row ${blocked ? 'is-pending' : ''} ${isPlaying ? 'playing' : ''} ${draggedLoop?.path === item.path ? 'is-dragging' : ''}`}
                        draggable={!blocked && !item.updates}
                        onDragStart={(e) => handleLoopDragStart(e, item)}
                        onDragEnd={handleLoopDragEnd}
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
                              onClick={() => handlePlayPreview({ id: item.path, previewUrl: inboxAudioUrl(item.path) })}
                              title={isPlaying ? 'Pause' : 'Listen'}
                            >
                              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                          )}
                        </div>

                        <div className="st-col-title">
                          <span className="st-track-title">{item.title}</span>
                          <span className="st-track-id">
                            {busy ? `${busy}...` : item.writing ? 'still exporting...' : `${item.folder} • ${item.name}`}
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
                            <button className="st-btn-update" onClick={() => handleUpdateLoop(item)} title="Replace the library version with this export">
                              <RefreshCw size={13} />
                            </button>
                          )}
                          {!blocked && (
                            <button className="st-btn-trash" onClick={() => handleDismissLoop(item)} title="Hide this loop from the list">
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
          ) : currentPack ? (
            <div className="studio-pack-view">
              {/* pack detail header banner */}
              <div className="studio-pack-hero">
                {/* cover wrapper with drag and drop */}
                <div 
                  className={`studio-hero-art-wrap ${isCoverDragOver ? 'drag-over' : ''} ${isUploadingCover ? 'loading' : ''}`}
                  onDragOver={(e) => {
                    // check if dragging external files
                    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
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
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      uploadCoverFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => coverInputRef.current?.click()}
                  title="Click or drag & drop image here to change cover"
                >
                  <img src={currentPack.cover} alt={currentPack.name} className="studio-hero-art" />
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
                  <span className="studio-hero-id">{currentPack.id}</span>
                  {isEditingTitle ? (
                    <input
                      type="text"
                      className="studio-hero-title-input"
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') {
                          setIsEditingTitle(false);
                          setTitleValue(currentPack.name || '');
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <h1
                      className="studio-hero-title"
                      onClick={() => setIsEditingTitle(true)}
                      title="Click to edit album title"
                    >
                      {currentPack.name}
                    </h1>
                  )}

                  {isEditingDesc ? (
                    <textarea
                      className="studio-hero-desc-input"
                      value={descValue}
                      onChange={(e) => setDescValue(e.target.value)}
                      onBlur={handleSaveDesc}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveDesc();
                        if (e.key === 'Escape') {
                          setIsEditingDesc(false);
                          setDescValue(currentPack.description || '');
                        }
                      }}
                      placeholder="Write album description..."
                      rows={2}
                      autoFocus
                    />
                  ) : (
                    <p
                      className={`studio-hero-desc ${!currentPack.description ? 'is-empty' : ''}`}
                      onClick={() => setIsEditingDesc(true)}
                      title="Click to edit description"
                    >
                      {currentPack.description || 'Click to add album description...'}
                    </p>
                  )}
                  
                  <div className="studio-hero-actions">
                    <button
                      className="studio-btn-subtle"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={isUploadingAudio}
                      title="Add audio samples via file picker"
                    >
                      {isUploadingAudio ? <Loader2 size={14} className="spin-icon" /> : <Plus size={14} />}
                      <span>{isUploadingAudio ? 'PROCESSING AUDIO...' : 'ADD SAMPLES'}</span>
                    </button>

                    {currentPack.downloadUrl && (
                      <a
                        href={currentPack.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="studio-btn-subtle"
                        title="Open storage folder/repository"
                      >
                        <HardDriveUpload size={14} />
                        <span>STORAGE LINK</span>
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

              {/* samples table with reordering & external audio drag-and-drop zone */}
              <div 
                className={`studio-table-section ${isAudioZoneDragOver ? 'file-drop-active' : ''}`}
                onDragOver={(e) => {
                  if (draggedTrack) return; // ignore internal track reordering
                  if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setIsAudioZoneDragOver(true);
                  }
                }}
                onDragLeave={(e) => {
                  if (draggedTrack) return;
                  e.preventDefault();
                  setIsAudioZoneDragOver(false);
                }}
                onDrop={(e) => {
                  if (draggedTrack) return;
                  e.preventDefault();
                  setIsAudioZoneDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    uploadAudioFiles(e.dataTransfer.files);
                  }
                }}
              >
                {isAudioZoneDragOver && (
                  <div className="studio-audio-drop-overlay">
                    <UploadCloud size={28} />
                    <span>Drop audio files to add to {currentPack.name}</span>
                  </div>
                )}

                {(currentPack.tracks || []).length === 0 && pendingTracks.length === 0 ? (
                  <div 
                    className="studio-audio-empty-dropzone"
                    onClick={() => audioInputRef.current?.click()}
                  >
                    <UploadCloud size={24} />
                    <p className="dropzone-primary-text">Drag & drop audio files here</p>
                    <p className="dropzone-sub-text">or click to browse (.wav, .mp3, .flac, .opus)</p>
                  </div>
                ) : (
                  <div className="studio-table">
                    <div className="studio-table-row studio-table-head">
                      <span className="st-col-play">#</span>
                      <span className="st-col-title">SAMPLE NAME</span>
                      <span className="st-col-meta">BPM</span>
                      <span className="st-col-meta">KEY</span>
                      <span className="st-col-dur">LENGTH</span>
                      <span className="st-col-del">REMOVE</span>
                    </div>

                    {[...(currentPack.tracks || []), ...pendingTracks].map((track, idx) => {
                      const isPending = track.isPending;
                      const isPlaying = !isPending && playingTrackId === track.id;
                      const isDragging = !isPending && draggedTrack?.id === track.id;
                      const isDragOver = !isPending && dragOverTrackId === track.id;

                      return (
                        <div 
                          key={track.id} 
                          className={`studio-table-row ${isPending ? 'is-pending' : ''} ${isPlaying ? 'playing' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                          draggable={!isPending}
                          onDragStart={(e) => !isPending && handleDragStart(e, track)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => !isPending && handleTrackDragOver(e, track.id)}
                          onDragLeave={(e) => !isPending && handleTrackDragLeave(e, track.id)}
                          onDrop={(e) => !isPending && handleTrackDrop(e, track)}
                          title={isPending ? 'Processing audio and uploading to storage...' : 'Drag to reorder or drag onto a sidebar pack'}
                        >
                          <div className="st-col-play">
                            {isPending ? (
                              <Loader2 size={13} className="spin-icon pending-spinner" />
                            ) : (
                              <button 
                                className="st-btn-audition"
                                onClick={() => handlePlayPreview(track)}
                                title={isPlaying ? 'Pause' : 'Audition preview'}
                              >
                                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                              </button>
                            )}
                          </div>

                          <div className="st-col-title">
                            <span className="st-track-title">{track.title}</span>
                            <span className="st-track-id">
                              {isPending ? 'processing & uploading...' : track.id}
                            </span>
                          </div>

                          <div className="st-col-meta">
                            <span className="st-badge">{track.bpm || '-'}</span>
                          </div>

                          <div className="st-col-meta">
                            <span className="st-badge">{track.key || '-'}</span>
                          </div>

                          <div className="st-col-dur">
                            <span>
                              {isPending
                                ? '...'
                                : track.duration
                                ? `${Math.round(track.duration)}s`
                                : '-'}
                            </span>
                          </div>

                          <div className="st-col-del">
                            {!isPending && (
                              <button
                                className="st-btn-trash"
                                onClick={() => handleDeleteTrack(track)}
                                title="Delete sample"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
