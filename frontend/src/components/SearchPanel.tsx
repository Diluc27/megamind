import React, { useState } from 'react';

interface SearchPanelProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ onSearch, onClear }) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    } else {
      onClear();
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">Search brain</div>
      <div className="search-row">
        <input
          type="text"
          placeholder="Keyword search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e); }}
        />
        <button className="btn-sm accent" onClick={handleSearch}>Search</button>
        <button className="btn-sm" onClick={() => { setQuery(''); onClear(); }}>Clear</button>
      </div>
    </div>
  );
};

export default SearchPanel;
