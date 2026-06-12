import { useState } from 'react';
import type { Claud } from '../types';
import { api } from '../api';
import { formatNoteTime, isPermanent } from '../types';

interface Props {
  items: Claud[];
  totalCount: number;
  onEdit: (item: Claud) => void;
  onView: (item: Claud) => void;
  onDelete: () => void;
}

export default function ClaudList({ items, totalCount, onEdit, onView, onDelete }: Props) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this Claud note?')) return;
    try {
      await api.deleteClaudItem(id);
      setOpenMenuId(null);
      onDelete();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleMakePermanent = async (id: number) => {
    try {
      await api.makeClaudPermanent(id);
      setOpenMenuId(null);
      onDelete();
    } catch (err) {
      alert('Failed to make Claud note permanent');
    }
  };

  return (
    <div className="notes-section">
      <div className="notes-section-header">
        <div className="notes-section-title">Claud Notes</div>
        <div className="notes-count">{items.length}{items.length !== totalCount ? ` of ${totalCount}` : ''} note{items.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="note-list">
        {items.map(item => {
          const permanent = isPermanent(item.tags);
          return (
            <div className="note-card" key={item.id} onClick={() => onView(item)} style={{ cursor: 'pointer' }}>
              <div className="note-card-header">
                <div className="note-title">{item.title}</div>
                <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
                  <button className="btn-dots" onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}>&#8942;</button>
                  {openMenuId === item.id && (
                    <div className="dropdown-menu">
                      <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onView(item); }}>View</div>
                      {!permanent && (
                        <div className="dropdown-item" onClick={() => { setOpenMenuId(null); onEdit(item); }}>Edit</div>
                      )}
                      {!permanent && (
                        <div className="dropdown-item" onClick={() => handleMakePermanent(item.id)}>Make permanent</div>
                      )}
                      {!permanent && (
                        <div className="dropdown-item dropdown-danger" onClick={() => handleDelete(item.id)}>Delete</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="note-meta">
                {permanent && <span className="megacode-badge badge-permanent">Permanent</span>}
                {item.agent && <span className="note-meta-chip">{item.agent}</span>}
                {item.tags && <><span className="note-meta-sep" /><span className="note-meta-chip">{item.tags}</span></>}
                <span className="note-meta-sep" />
                <span className="note-meta-chip">{formatNoteTime(item.created_at)}</span>
              </div>
              <div className="note-preview">{item.content.slice(0, 300)}</div>
              <div className="note-actions">
                <button className="btn-view" onClick={e => { e.stopPropagation(); onView(item); }}>View</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
