import React from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';

export default function FilterPanel({
  instruments,
  genres,
  selectedInstrument,
  onSelectInstrument,
  selectedGenre,
  onSelectGenre,
  selectedKey,
  onSelectKey,
  availableKeys,
  sortBy,
  onSortChange,
  onReset,
  hasActiveFilters,
}) {
  return (
    <div className="filter-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <SlidersHorizontal size={15} />
        <span>Filters:</span>
      </div>

      <select
        className="filter-select"
        value={selectedInstrument}
        onChange={(e) => onSelectInstrument(e.target.value)}
      >
        <option value="">All Instruments</option>
        {instruments.map((inst) => (
          <option key={inst} value={inst}>
            {inst}
          </option>
        ))}
      </select>

      <select
        className="filter-select"
        value={selectedGenre}
        onChange={(e) => onSelectGenre(e.target.value)}
      >
        <option value="">All Genres</option>
        {genres.map((genre) => (
          <option key={genre} value={genre}>
            {genre}
          </option>
        ))}
      </select>

      <select
        className="filter-select"
        value={selectedKey}
        onChange={(e) => onSelectKey(e.target.value)}
      >
        <option value="">All Keys</option>
        {availableKeys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      <select
        className="filter-select"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
      >
        <option value="default">Default Order</option>
        <option value="bpm-asc">BPM (Low to High)</option>
        <option value="bpm-desc">BPM (High to Low)</option>
        <option value="title-asc">Title (A-Z)</option>
        <option value="duration-desc">Duration (Longest)</option>
      </select>

      {hasActiveFilters && (
        <button className="filter-reset-btn" onClick={onReset} title="Reset all filters">
          <RotateCcw size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
          Reset
        </button>
      )}
    </div>
  );
}

