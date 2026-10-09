import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search } from 'lucide-react';
import PackCard from '../components/PackCard';
import PackDetail from './PackDetail';
import AudioPlayer from '../components/AudioPlayer';
import defaultCatalogue from '../data/tracks.json';

export default function Library() {
  const [data, setData] = useState({
    packs: defaultCatalogue.packs || [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPack, setSelectedPack] = useState(null);
  const [activeTrack, setActiveTrack] = useState(null);
  const [activeTrackPack, setActiveTrackPack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const fetchCatalogue = useCallback(() => {
    fetch('/tracks.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const packs = json.packs || [];
        setData({ packs });
        setLoading(false);

        // sync selectedPack if currently open
        setSelectedPack((current) => {
          if (!current) return null;
          return packs.find((p) => p.id === current.id) || null;
        });
      })
      .catch((err) => {
        console.error('Failed to load catalogue:', err);
        setError('Failed to load catalogue.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  // sync url path and hash with selected pack for browser back/forward navigation
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;

      let packId = null;
      if (path.startsWith('/pack/')) {
        packId = decodeURIComponent(path.replace('/pack/', '').replace(/\/$/, ''));
      } else if (hash.startsWith('#/pack/')) {
        packId = decodeURIComponent(hash.replace('#/pack/', ''));
      }

      if (packId) {
        const found = (data.packs || []).find((p) => p.id === packId);
        if (found) setSelectedPack(found);
      } else {
        setSelectedPack(null);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [data.packs]);

  const handleSelectPack = (pack) => {
    setSelectedPack(pack);
    window.history.pushState(null, '', `/pack/${pack.id}`);
  };

  const handleBackToPacks = () => {
    setSelectedPack(null);
    window.history.pushState(null, '', '/');
  };

  const filteredPacks = useMemo(() => {
    let list = data.packs || [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => {
        const nameMatch = p.name?.toLowerCase().includes(q);
        const descMatch = p.description?.toLowerCase().includes(q);
        const trackMatch = p.tracks?.some((t) =>
          t.title?.toLowerCase().includes(q) ||
          t.instrument?.toLowerCase().includes(q) ||
          t.key?.toLowerCase().includes(q)
        );
        return nameMatch || descMatch || trackMatch;
      });
    }

    return list;
  }, [data.packs, searchQuery]);

  // flattened list of all tracks currently available for traversal
  const activeNavigationTracks = useMemo(() => {
    if (selectedPack && selectedPack.tracks) {
      return selectedPack.tracks.map((t) => ({ track: t, pack: selectedPack }));
    }
    const list = [];
    filteredPacks.forEach((p) => {
      (p.tracks || []).forEach((t) => {
        list.push({ track: t, pack: p });
      });
    });
    return list;
  }, [selectedPack, filteredPacks]);

  const handlePlayTrack = (track, pack) => {
    if (activeTrack && activeTrack.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setActiveTrack(track);
      setActiveTrackPack(pack);
      setIsPlaying(true);
    }
  };

  const handleQuickPlayPack = (pack) => {
    if (!pack.tracks || pack.tracks.length === 0) return;
    const firstTrack = pack.tracks[0];
    if (activeTrack && activeTrack.id === firstTrack.id) {
      setIsPlaying(!isPlaying);
    } else {
      setActiveTrack(firstTrack);
      setActiveTrackPack(pack);
      setIsPlaying(true);
    }
  };

  const handleNext = () => {
    if (!activeTrack || activeNavigationTracks.length === 0) return;
    const idx = activeNavigationTracks.findIndex((item) => item.track.id === activeTrack.id);
    const nextIdx = (idx + 1) % activeNavigationTracks.length;
    setActiveTrack(activeNavigationTracks[nextIdx].track);
    setActiveTrackPack(activeNavigationTracks[nextIdx].pack);
    setIsPlaying(true);
  };

  const handlePrevious = () => {
    if (!activeTrack || activeNavigationTracks.length === 0) return;
    const idx = activeNavigationTracks.findIndex((item) => item.track.id === activeTrack.id);
    const prevIdx = (idx - 1 + activeNavigationTracks.length) % activeNavigationTracks.length;
    setActiveTrack(activeNavigationTracks[prevIdx].track);
    setActiveTrackPack(activeNavigationTracks[prevIdx].pack);
    setIsPlaying(true);
  };

  return (
    <div className="app-wrapper">
      <header className="top-nav">
        <div
          className="brand-title"
          onClick={handleBackToPacks}
          style={{ cursor: 'pointer' }}
          title="Return to library overview"
        >
          <span>NO LUV LIBRARY</span>
        </div>

        <div className="search-mini">
          <Search size={14} className="search-mini-icon" />
          <input
            type="text"
            className="search-mini-input"
            placeholder="Search packs & sounds..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedPack) setSelectedPack(null);
            }}
          />
        </div>
      </header>

      {selectedPack ? (
        /* album / pack page view */
        <PackDetail
          pack={selectedPack}
          onBack={handleBackToPacks}
          activeTrack={activeTrack}
          isPlaying={isPlaying}
          onPlayTrack={handlePlayTrack}
        />
      ) : (
        /* main packs catalogue view */
        <>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
              Loading packs...
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
              {error}
            </div>
          )}

          {!loading && !error && filteredPacks.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
              No packs found.
            </div>
          )}

          <section className="packs-grid">
            {filteredPacks.map((pack) => {
              const isPlayingThisPack =
                isPlaying && activeTrackPack?.id === pack.id;

              return (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  onSelectPack={handleSelectPack}
                  isPlayingThisPack={isPlayingThisPack}
                  onQuickPlay={handleQuickPlayPack}
                />
              );
            })}
          </section>
        </>
      )}

      {/* persistent bottom audio player */}
      <AudioPlayer
        currentTrack={activeTrack}
        currentPack={activeTrackPack}
        isPlaying={isPlaying}
        onPlayPause={(track, pack) => handlePlayTrack(track, pack)}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />
    </div>
  );
}
