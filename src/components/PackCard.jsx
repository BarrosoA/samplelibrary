import React from 'react';
import { ListMusic } from 'lucide-react';

export default function PackCard({ pack, onSelectPack }) {
  const count = pack.tracks ? pack.tracks.length : (pack.trackCount || 0);

  return (
    <div
      className="pack-item"
      onClick={() => onSelectPack(pack)}
      title={`${pack.name} (${count} tracks)`}
    >
      <div className="pack-artwork-wrap">
        <img
          src={pack.cover}
          alt={pack.name}
          className="pack-artwork-img"
          loading="lazy"
        />

        <div className="pack-badge">
          <ListMusic size={13} strokeWidth={2.4} />
          <span>{count}</span>
        </div>
      </div>

      <div className="pack-info">
        <span className="pack-name">{pack.name}</span>
        <span className="pack-sub">{count} samples</span>
      </div>
    </div>
  );
}

