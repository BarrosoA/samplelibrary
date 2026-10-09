import React from 'react';
import { Search, X } from 'lucide-react';

export default function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div className="search-input-group">
      <Search className="search-icon" size={18} />
      <input
        type="text"
        className="search-input"
        placeholder="Search title, instruments, genre, key, tags..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {searchQuery && (
        <button
          onClick={() => onSearchChange('')}
          style={{ position: 'absolute', right: '12px', color: 'var(--text-muted)' }}
          title="Clear search"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

