import React, { useState, useEffect } from 'react';
import type { Note, SearchResult } from '../types';
import { formatNoteTime } from '../types';
import { api } from '../api';

interface NoteListProps {
  notes: Note[] | SearchResult[];
  onEdit: (note: Note) => void;
  onView: (note: Note) => void;
  onDelete: () => void;
  isSearch: boolean;
}

const NoteList: React.FC<NoteListProps> = ({ notes, onEdit, onView, onDelete, isSearch }) => {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (openMenuId === null) return;
      const el = document.querySelector(`[data-dropdown="${openMenuId}"]`);
      if (el && !el.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  const handleDelete = async (id: number) => {
    setOpenMenuId(null);
    if (window.confirm('Delete this note?')) {
      try {
        await api.deleteNote(id);
        onDelete();
      } catch (err) {
        alert('Error deleting note');
      }
    }
  };

  const handleView = async (item: Note | SearchResult) => {
    try {
      const fullNote = await api.fetchNote(item.id);
      onView(fullNote);
    } catch (err) {
      alert('Failed to load note');
    }
  };

  const handleEditClick = async (item: Note | SearchResult) => {
    setOpenMenuId(null);
    try {
      const fullNote = await api.fetchNote(item.id);
      onEdit(fullNote);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert('Failed to load full note');
    }
  };

  const renderNoteCard = (item: Note | SearchResult) => {
    if (!item) return null;

    const noteId = item.id;
    const title = item.title || 'Untitled';
    const score = 'score' in item ? item.score : null;
    const category = item.category || '';
    const tags = item.tags || '';
    const createdAt = 'created_at' in item ? item.created_at : null;
    const content = 'content' in item ? item.content || '' : '';
    const preview = 'preview' in item ? item.preview || '' : '';

    return (
      <div key={noteId} className="note-card">
        <div className="note-card-header">
          <div className="note-title">
            {title}
            {score !== null && <span className="score-badge">{score}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="note-category-tag">{category}</span>
            <div className="dropdown-wrapper" data-dropdown={noteId}>
              <button className="btn-dots" onClick={() => setOpenMenuId(openMenuId === noteId ? null : noteId)}>···</button>
              {openMenuId === noteId && (
                <div className="dropdown-menu">
                  <div className="dropdown-item" onClick={() => handleEditClick(item)}>Edit</div>
                  <div className="dropdown-item dropdown-danger" onClick={() => handleDelete(noteId)}>Delete</div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="note-meta">
          <span className="note-meta-chip">{tags}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{formatNoteTime(createdAt)}</span>
        </div>
        <div className="note-preview">
          {preview || content}
        </div>
        <div className="note-actions">
          <span />
          <button className="btn-view" onClick={() => handleView(item)}>
            View →
          </button>
        </div>
      </div>
    );
  };

  const safeNotes = notes || [];

  return (
    <div>
      <div className="notes-section-header">
        <span className="notes-section-title">{isSearch ? 'Search results' : 'Notes'}</span>
        <span className="notes-count">{safeNotes.length} entries</span>
      </div>
      <div className="note-list">
        {safeNotes.length === 0 ? <p style={{ color: 'var(--text-3)', fontStyle: 'italic', padding: '8px 0' }}>{isSearch ? 'No matching notes found.' : 'No notes found.'}</p> : safeNotes.map(renderNoteCard)}
      </div>
    </div>
  );
};

export default NoteList;
