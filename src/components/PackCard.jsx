import React from 'react';
import FadeImage from './FadeImage';

export default function PackCard({ pack, onSelectPack }) {
  const count = pack.tracks ? pack.tracks.length : (pack.trackCount || 0);

  return (
    <div
      className="pack-item"
      onClick={() => onSelectPack(pack)}
      title={`${pack.name} (${count} tracks)`}
    >
      <div className="pack-artwork-wrap">
        <FadeImage
          src={pack.cover}
          alt={pack.name}
          className="pack-artwork-img"
          loading="lazy"
        />
      </div>

      <div className="pack-info">
        <span className="pack-name">{pack.name}</span>
        <span className="pack-sub">{count} samples</span>
      </div>
    </div>
  );
}

