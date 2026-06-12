import React, { useState } from 'react';
import type { Note } from '../types';
import { api } from '../api';
import { formatNoteTime, isPermanent } from '../types';
import PagedViewModal from './PagedViewModal';

interface NoteViewModalProps {
  note: Note;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onDelete?: () => void;
}

const NoteViewModal: React.FC<NoteViewModalProps> = ({ note, onClose, onEdit, onDelete }) => {
  const [currentNote, setCurrentNote] = useState(note);

  const deleteMain = async () => {
    if (!confirm(`Delete note "${currentNote.title}"?`)) return;
    await api.deleteNote(currentNote.id);
    onClose();
    onDelete?.();
  };

  return (
    <PagedViewModal
      title={currentNote.title}
      mainLabel="Main"
      mainContent={currentNote.content || ''}
      mainTags={currentNote.tags}
      onClose={onClose}
      onEditMain={() => onEdit(currentNote)}
      onDeleteMain={deleteMain}
      onMakeMainPermanent={async () => {
        setCurrentNote(await api.makeNotePermanent(currentNote.id));
        onDelete?.();
      }}
      meta={(
        <>
          {isPermanent(currentNote.tags) && <span className="megacode-badge badge-permanent">Permanent</span>}
          <span className="note-category-tag">{currentNote.category}</span>
          {currentNote.source && <><span className="note-meta-sep" /><span className="note-meta-chip" style={{ color: 'var(--accent)' }}>via {currentNote.source}</span></>}
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{currentNote.tags}</span>
          <span className="note-meta-sep" />
          <span className="note-meta-chip">{formatNoteTime(currentNote.created_at)}</span>
        </>
      )}
      fetchPages={() => api.fetchNotePages(currentNote.id)}
      createPage={(data) => api.createNotePage(currentNote.id, data)}
      updatePage={(pageId, data) => api.updateNotePage(currentNote.id, pageId, data)}
      deletePage={(pageId) => api.deleteNotePage(currentNote.id, pageId)}
      makePagePermanent={(pageId) => api.makeNotePagePermanent(currentNote.id, pageId)}
    />
  );
};

export default NoteViewModal;
