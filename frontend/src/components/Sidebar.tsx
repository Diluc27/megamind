import React from 'react';
import { api } from '../api';

const CATEGORIES = [
  "Projects", "Errors-Fixes", "Prompts", "Tools-Models", 
  "Ideas", "Learning-Logs", "Commands"
];

interface SidebarProps {
  activeCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onSelectCategory }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">M</span>
          <span>MegaMind</span>
        </div>
        <div className="sidebar-subtitle">Digital Brain</div>
      </div>
      <div className="sidebar-section-label">Library</div>
      <div className="category-list">
        <div
          className={`category-item ${activeCategory === null ? 'active' : ''}`}
          onClick={() => onSelectCategory(null)}
        >
          All Notes
        </div>
        {CATEGORIES.map(cat => (
          <div
            key={cat}
            className={`category-item ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => onSelectCategory(cat)}
          >
            {cat}
          </div>
        ))}
      </div>
      <button className="export-btn" onClick={api.exportBackup}>
        Export Backup
      </button>
    </div>
  );
};

export default Sidebar;
