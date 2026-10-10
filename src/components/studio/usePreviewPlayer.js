import { useState, useRef, useEffect, useCallback } from 'react';

// one audition at a time, shared by the samples table and the New Loops list
export default function usePreviewPlayer() {
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const toggle = useCallback(
    (id, url) => {
      if (audioRef.current) audioRef.current.pause();
      if (playingId === id) {
        setPlayingId(null);
        return;
      }
      const audio = new Audio(url);
      audio.volume = 0.25;
      const stop = (err) => {
        console.warn('Preview playback failed:', err);
        if (audioRef.current === audio) setPlayingId(null);
      };
      audio.onerror = () => stop(audio.error);
      audio.play().catch((err) => err.name !== 'AbortError' && stop(err));
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(id);
    },
    [playingId]
  );

  useEffect(() => () => audioRef.current?.pause(), []);

  return { playingId, toggle };
}
