import React from 'react';
import type { Note } from '../types';
import { formatNoteTime } from '../types';

interface NoteViewModalProps {
  note: Note;
  onClose: () => void;
  onEdit: (note: Note) => void;
}

const NoteViewModal: React.FC<NoteViewModalProps> = ({ note, onClose, onEdit }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="note-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="view-modal-header">
          <div className="view-modal-title">{note.title}</div>
          <div className="view-modal-actions">
            <button className="btn-secondary btn-sm" onClick={() => onEdit(note)}>Edit</button>
            <button className="btn-close-modal" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="view-modal-meta">
          <span className="note-category-tag">{note.category}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{note.tags}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{formatNoteTime(note.created_at)}</span>
        </div>
        <div className="view-modal-content">
          {note.content || ''}
        </div>
      </div>
    </div>
  );
};

export default NoteViewModal;
