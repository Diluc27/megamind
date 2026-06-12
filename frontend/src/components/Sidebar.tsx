import React, { useState } from 'react';
import { api } from '../api';

const CATEGORIES = [
  "Projects", "Errors-Fixes", "Prompts", "Tools-Models", 
  "Ideas", "Learning-Logs", "Commands"
];

interface SidebarProps {
  activeCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onExportOffline: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onSelectCategory, theme, onToggleTheme, collapsed, onToggleCollapse, onExportOffline }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        {collapsed ? (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Expand sidebar">☰</button>
        ) : (
          <>
            <div className="sidebar-logo">
              <span className="sidebar-logo-icon">M</span>
              <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700 }}>MegaMind</span>
            </div>
            <div className="sidebar-subtitle">Digital Brain</div>
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar">◀</button>
          </>
        )}
      </div>
      {!collapsed && (
        <>
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
        </>
      )}
      <div className="sidebar-bottom">
        <div className="dropdown-wrapper" style={{ position: 'relative' }}>
          <button
            className="sidebar-settings-btn"
            onClick={() => setSettingsOpen(v => !v)}
            title="Settings"
          >
            ⚙
          </button>
          {settingsOpen && (
            <div className="dropdown-menu" style={{ bottom: '100%', top: 'auto', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, zIndex: 200, minWidth: 140 }}>
              <div className="dropdown-item" onClick={() => { setSettingsOpen(false); onToggleTheme(); }}>
                {theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
              </div>
              <div className="dropdown-item" onClick={() => { setSettingsOpen(false); api.exportBackup(); }}>
                💾 Export Backup
              </div>
              <div className="dropdown-item" onClick={() => { setSettingsOpen(false); onExportOffline(); }}>
                📄 Export Offline Cache
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
