import { useState } from 'react';
import type { Session } from '../types';
import { api } from '../api';
import { formatNoteTime, isPermanent, getExpiryLabel } from '../types';

interface Props {
  sessions: Session[];
  totalCount: number;
  onEdit: (session: Session) => void;
  onView: (session: Session) => void;
  onDelete: () => void;
}

export default function SessionList({ sessions, totalCount, onEdit, onView, onDelete }: Props) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this session?')) return;
    try {
      await api.deleteSession(id);
      setOpenMenuId(null);
      onDelete();
    } catch (err) {
      alert('Failed to delete session');
    }
  };

  const handleMakePermanent = async (id: number) => {
    try {
      await api.makeSessionPermanent(id);
      setOpenMenuId(null);
      onDelete();
    } catch (err) {
      alert('Failed to make session permanent');
    }
  };

  return (
    <div className="notes-section">
      <div className="notes-section-header">
        <div className="notes-section-title">MegaCode Entries</div>
        <div className="notes-count">{sessions.length}{sessions.length !== totalCount ? ` of ${totalCount}` : ''} entry{sessions.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="note-list">
        {sessions.map(s => {
          const permanent = isPermanent(s.tags);
          const expiryLabel = getExpiryLabel(s.tags);
          return (
            <div className="note-card" key={s.id} onClick={() => onView(s)} style={{ cursor: 'pointer' }}>
              <div className="note-card-header">
                <div className="note-title">{s.title}</div>
                <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
                  <button className="btn-dots" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}>&#8942;</button>
                  {openMenuId === s.id && (
                    <div className="dropdown-menu">
                      <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onView(s); }}>View</div>
                      {permanent ? (
                        <div className="dropdown-item">Read-only</div>
                      ) : (
                        <>
                          <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onEdit(s); }}>Edit</div>
                          <div className="dropdown-item" onClick={() => handleMakePermanent(s.id)}>Make permanent</div>
                          <div className="dropdown-item dropdown-danger" onClick={() => handleDelete(s.id)}>Delete</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="note-meta">
                <span className={`megacode-badge ${permanent ? 'badge-permanent' : 'badge-context'}`}>
                  {permanent ? 'Permanent' : 'Context'}
                </span>
                {expiryLabel && !permanent && (
                  <span className="megacode-expiry">{expiryLabel}</span>
                )}
                {s.agent && <span className="note-meta-chip">{s.agent}</span>}
                {s.project && <span className="note-category-tag">{s.project}</span>}
                <span className="note-meta-chip">{formatNoteTime(s.created_at)}</span>
              </div>
              <div className="note-preview">{s.content.slice(0, 200)}</div>
              <div className="note-actions">
                <button className="btn-view" onClick={e => { e.stopPropagation(); onView(s); }}>View</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
