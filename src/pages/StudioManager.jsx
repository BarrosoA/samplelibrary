import React, { useState, useEffect, useCallback } from 'react';
import { Music4, AlertCircle, CheckCircle2 } from 'lucide-react';
import AddPackModal from '../components/AddPackModal';
import StudioHeader from '../components/studio/StudioHeader';
import StorageStrip from '../components/studio/StorageStrip';
import PackSidebar from '../components/studio/PackSidebar';
import NewLoopsPanel from '../components/studio/NewLoopsPanel';
import PackView from '../components/studio/PackView';
import usePreviewPlayer from '../components/studio/usePreviewPlayer';
import useInbox from '../components/studio/useInbox';
import { NEW_LOOPS_ID, postJson } from '../components/studio/studioUtils';

export default function StudioManager() {
  const [catalogue, setCatalogue] = useState({ packs: [] });
  const [selectedPackId, setSelectedPackId] = useState(null);
  // a freshly created pack opens with its title ready to type
  const [titleEditPackId, setTitleEditPackId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [storage, setStorage] = useState(null);

  // shared between the samples table, the New Loops list and the sidebar drop targets
  const [draggedTrack, setDraggedTrack] = useState(null);
  const [draggedLoop, setDraggedLoop] = useState(null);

  const player = usePreviewPlayer();
  const packs = catalogue.packs || [];
  const currentPack = packs.find((p) => p.id === selectedPackId) || null;

  const notify = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), type === 'error' ? Math.max(6000, msg.length * 60) : 3500);
  }, []);

  const fetchCatalogue = useCallback(
    () =>
      fetch('/tracks.json')
        .then((res) => res.json())
        .then((data) => {
          setCatalogue(data);
          if (data.packs && data.packs.length > 0) setSelectedPackId((prev) => prev ?? data.packs[0].id);
        })
        .catch((err) => console.error('Failed to load catalogue:', err)),
    []
  );

  const fetchStorage = useCallback(() => {
    postJson('storage-stats')
      .then((data) => data && setStorage(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  useEffect(() => {
    fetchStorage();
  }, [catalogue, fetchStorage]);

  const inbox = useInbox({ notify, onLibraryChanged: fetchCatalogue });

  const selectPack = (id) => {
    if (id !== titleEditPackId) setTitleEditPackId(null);
    setSelectedPackId(id);
  };

  const handleCreateNewPack = async () => {
    try {
      const data = await postJson('create-pack', { name: 'UNTITLED PACK' }, 'Failed to spawn new pack');
      notify('Spawned new pack with default cover. Click title to rename.');
      await fetchCatalogue();
      if (data.pack) {
        setTitleEditPackId(data.pack.id);
        setSelectedPackId(data.pack.id);
      }
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleReorderPacks = async (reordered) => {
    setCatalogue((prev) => ({ ...prev, packs: reordered }));
    try {
      await postJson('reorder-packs', { packIds: reordered.map((p) => p.id) }, 'Failed to save pack order');
      notify('Reordered packs');
    } catch (err) {
      notify(err.message, 'error');
      fetchCatalogue();
    }
  };

  const handleReorderTracks = async (reordered) => {
    const pack = currentPack;
    setCatalogue((prev) => ({
      ...prev,
      packs: (prev.packs || []).map((p) => (p.id === pack.id ? { ...p, tracks: reordered } : p)),
    }));
    try {
      await postJson('reorder-tracks', { packId: pack.id, trackIds: reordered.map((t) => t.id) }, 'Failed to save sample reordering');
      notify(`Reordered samples in ${pack.name}`);
    } catch (err) {
      notify(err.message, 'error');
      fetchCatalogue();
    }
  };

  const handleMoveTrack = async (track, targetPack) => {
    if (!currentPack) return;
    try {
      await postJson(
        'move-track',
        { sourcePackId: currentPack.id, targetPackId: targetPack.id, trackId: track.id },
        'Failed to move sample'
      );
      notify(`Moved "${track.title}" to ${targetPack.name}`);
      fetchCatalogue();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAddLoop = (item, targetPack) => {
    setDraggedLoop(null);
    inbox.addToPack(item, targetPack);
  };

  let mainContent;
  if (selectedPackId === NEW_LOOPS_ID) {
    mainContent = (
      <NewLoopsPanel
        items={inbox.inbox.items}
        busy={inbox.busy}
        player={player}
        draggedLoop={draggedLoop}
        onDragLoop={setDraggedLoop}
        onUpdate={inbox.update}
        onDismiss={inbox.dismiss}
      />
    );
  } else if (currentPack) {
    mainContent = (
      <PackView
        key={currentPack.id}
        pack={currentPack}
        autoEditTitle={titleEditPackId === currentPack.id}
        player={player}
        draggedTrack={draggedTrack}
        onDragTrack={setDraggedTrack}
        onReorderTracks={handleReorderTracks}
        notify={notify}
        onChanged={fetchCatalogue}
        onDeleted={() => {
          setSelectedPackId(null);
          fetchCatalogue();
        }}
      />
    );
  } else {
    mainContent = (
      <div className="studio-empty-prompt">
        <Music4 size={32} />
        <p>Select a pack on the left or create a new pack to manage samples.</p>
      </div>
    );
  }

  return (
    <div className="studio-app-wrapper">
      <StudioHeader
        notify={notify}
        onNewPack={handleCreateNewPack}
        onImportFolder={() => setIsAddModalOpen(true)}
        onPublished={fetchStorage}
      />

      {storage && <StorageStrip storage={storage} />}

      {notification && (
        <div className={`studio-toast ${notification.type}`}>
          {notification.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{notification.msg}</span>
        </div>
      )}

      <div className="studio-layout">
        <PackSidebar
          packs={packs}
          selectedPackId={selectedPackId}
          onSelect={selectPack}
          inbox={inbox.inbox}
          draggedTrack={draggedTrack}
          draggedLoop={draggedLoop}
          onReorderPacks={handleReorderPacks}
          onMoveTrack={handleMoveTrack}
          onAddLoop={handleAddLoop}
        />

        <main className="studio-main-panel">{mainContent}</main>
      </div>

      <AddPackModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newPack) => {
          fetchCatalogue();
          if (newPack) selectPack(newPack.id);
          notify(`Created pack "${newPack.name}"`);
        }}
      />
    </div>
  );
}
