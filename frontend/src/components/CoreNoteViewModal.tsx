import React from 'react';
import type { CoreNoteDetail } from '../types';

interface CoreNoteViewModalProps {
  note: CoreNoteDetail;
  onClose: () => void;
}

const CoreNoteViewModal: React.FC<CoreNoteViewModalProps> = ({ note, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="note-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="view-modal-header">
          <div className="view-modal-title">{note.title}</div>
          <div className="view-modal-actions">
            <button className="btn-close-modal" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="view-modal-meta">
          <span className="note-category-tag">{note.category}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{note.tags || ''}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{note.updated_at || note.imported_at || ''}</span>
        </div>
        <div className="view-modal-content">
          {note.content || ''}
        </div>
      </div>
    </div>
  );
};

export default CoreNoteViewModal;
