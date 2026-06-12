import { useState } from 'react';
import type { Shelfd } from '../types';
import { api } from '../api';
import { formatNoteTime } from '../types';

interface Props {
  items: Shelfd[];
  totalCount: number;
  onEdit: (item: Shelfd) => void;
  onView: (item: Shelfd) => void;
  onDelete: () => void;
}

export default function ShelfdList({ items, totalCount, onEdit, onView, onDelete }: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const storageBadge = (mode: Shelfd['storage_mode']) => {
    if (mode === 'local_only') return { label: '⊘ Local', color: '#a8a8a8', bg: 'rgba(168,168,168,0.1)', border: 'rgba(168,168,168,0.25)' };
    if (mode === 'cloud_only') return { label: '☁ Cloud', color: '#64c8ff', bg: 'rgba(100,200,255,0.1)', border: 'rgba(100,200,255,0.25)' };
    return { label: '⟳ Synced', color: '#7edc8a', bg: 'rgba(126,220,138,0.1)', border: 'rgba(126,220,138,0.25)' };
  };

  const compactLine = (items: string[], limit: number) => {
    const visible = items.slice(0, limit);
    const extra = items.length - visible.length;
    return `${visible.join(' • ')}${extra > 0 ? ` +${extra} more` : ''}`;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Shelfd item?')) return;
    try {
      await api.deleteShelfdItem(id);
      setOpenMenuId(null);
      onDelete();
    } catch (err) {
      alert('Failed to delete Shelfd item');
    }
  };

  const handleSave = async (id: string) => {
    try {
      await api.makeShelfdPermanent(id);
      setSavedIds(prev => new Set([...prev, id]));
      onDelete();
    } catch {
      alert('Failed to save Shelfd item');
    }
  };

  return (
    <div className="notes-section">
      <div className="notes-section-header">
        <div className="notes-section-title">Shelfd Items</div>
        <div className="notes-count">{items.length}{items.length !== totalCount ? ` of ${totalCount}` : ''} item{items.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="note-list">
        {items.map(s => {
          const isSaved = savedIds.has(s.id) || s.storage_mode === 'saved';
          return (
          <div className="note-card" key={s.id} onClick={() => onView(s)} style={{ cursor: 'pointer' }}>
            <div className="note-card-header">
              <div className="note-title">{s.title}</div>
              {(() => {
                const badge = storageBadge(s.storage_mode);
                return (
                  <span
                    className="megacode-badge"
                    style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                );
              })()}
              <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
                <button className="btn-dots" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}>&#8942;</button>
                {openMenuId === s.id && (
                  <div className="dropdown-menu">
                    <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onView(s); }}>View</div>
                    {isSaved ? (
                      <div className="dropdown-item">Read-only</div>
                    ) : (
                      <>
                        <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onEdit(s); }}>Edit</div>
                        <div className="dropdown-item" onClick={() => handleSave(s.id)}>Make permanent</div>
                        <div className="dropdown-item dropdown-danger" onClick={() => handleDelete(s.id)}>Delete</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="note-meta">
              <span className="note-meta-chip">{s.tags}</span>
              <span className="note-meta-sep" />
              <span className="note-meta-chip">{formatNoteTime(s.created_at)}</span>
            </div>
            <div className="note-preview">{s.content.slice(0, 200)}</div>
            {s.sections && s.sections.length > 0 ? (
              s.sections.slice(0, 2).map((section, idx) => (
                <div key={`${section.title}-${idx}`} style={{ fontSize: 11, color: '#8B7A66', marginTop: 4 }}>
                  <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
                    {section.title}
                  </span>
                  <span>{compactLine(section.items, 2)}</span>
                </div>
              ))
            ) : (
              <>
                {s.key_ideas && s.key_ideas.length > 0 && (
                  <div style={{ fontSize: 11, color: '#8B7A66', marginTop: 4 }}>
                    <span style={{ fontWeight: 600, marginRight: 4 }}>IDEAS</span>
                    {compactLine(s.key_ideas, 2)}
                  </div>
                )}
                {s.action_items && s.action_items.length > 0 && (
                  <div style={{ fontSize: 11, color: '#8B7A66', marginTop: 4 }}>
                    <span style={{ fontWeight: 600, marginRight: 4 }}>ACTIONS</span>
                    {compactLine(s.action_items, 2)}
                  </div>
                )}
              </>
            )}
            <div className="note-actions">
              <button className="btn-view" onClick={e => { e.stopPropagation(); onView(s); }}>View</button>
              {isSaved ? (
                <span
                  className="note-meta-chip"
                  style={{ color: '#d4a96a', borderColor: 'rgba(212,169,106,0.35)' }}
                >
                  Saved 🔖
                </span>
              ) : (
                <button
                  className="btn-view"
                  title="Keep this project in MegaMind permanently"
                  onClick={e => { e.stopPropagation(); handleSave(s.id); }}
                >
                  Save
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
