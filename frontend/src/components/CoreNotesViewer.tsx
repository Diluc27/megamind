import React, { useState, useEffect, useCallback } from 'react';
import type { CoreNote, CoreNoteDetail } from '../types';
import { api } from '../api';

interface CoreNotesViewerProps {
  token: string;
  onLock: () => void;
}

const CoreNotesViewer: React.FC<CoreNotesViewerProps> = ({ token, onLock }) => {
  const [notes, setNotes] = useState<CoreNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [selectedNote, setSelectedNote] = useState<CoreNoteDetail | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const handleTokenError = (err: any) => {
    if (err.message?.includes('401') || err.message?.includes('Failed to fetch')) {
      onLock();
      return true;
    }
    return false;
  };

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchCoreNotes(token);
      setNotes(data);
      if (data.length > 0) {
        setSelectedNoteId(data[0].id);
      }
    } catch (err: any) {
      if (!handleTokenError(err)) {
        setError(err.message || 'Failed to load Core notes');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (selectedNoteId === null) {
      setSelectedNote(null);
      return;
    }
    setLoadingContent(true);
    api.fetchCoreNote(selectedNoteId, token)
      .then(setSelectedNote)
      .catch((err: any) => {
        if (!handleTokenError(err)) {
          setSelectedNote(null);
        }
      })
      .finally(() => setLoadingContent(false));
  }, [selectedNoteId, token]);

  const handleSelectNote = (note: CoreNote) => {
    setSelectedNoteId(note.id);
  };

  return (
    <div className="core-viewer">
      <div className="core-viewer-header">
        <div className="core-viewer-title-row">
          <h2>Core Space</h2>
          <div className="core-viewer-actions">
            <button className="btn-sm" onClick={loadNotes} disabled={loading}>
              {loading ? 'Loading\u2026' : 'Refresh'}
            </button>
            <button className="btn-secondary btn-sm" onClick={onLock}>Lock Core</button>
          </div>
        </div>
        <p className="core-viewer-subtitle">
          Private read-only vault. Agents cannot access this layer.
        </p>
      </div>

      {error && <p className="core-viewer-error">{error}</p>}

      {loading && notes.length === 0 ? (
        <p className="core-viewer-loading">Loading Core notes\u2026</p>
      ) : notes.length === 0 ? (
        <div className="core-viewer-empty">
          <p>No Core notes found.</p>
        </div>
      ) : (
        <div className="core-layout">
          <div className="core-list-pane">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`core-note-item${selectedNoteId === note.id ? ' selected' : ''}`}
                onClick={() => handleSelectNote(note)}
              >
                <div className="core-note-item-header">
                  <span className="core-note-item-title">{note.title}</span>
                </div>
                <div className="core-note-item-meta">
                  <span className="note-category-tag">{note.category}</span>
                  <span className="note-meta-sep" />
                  <span className="note-meta-chip">{note.tags || ''}</span>
                </div>
                <div className="core-note-item-date">
                  {note.updated_at || note.imported_at || ''}
                </div>
              </div>
            ))}
          </div>

          <div className="core-content-pane">
            {loadingContent ? (
              <p className="core-content-loading">Loading note\u2026</p>
            ) : selectedNote ? (
              <div className="core-content-card">
                <div className="core-content-header">
                  <div className="core-content-title">{selectedNote.title}</div>
                </div>
                <div className="core-content-meta">
                  <span className="note-category-tag">{selectedNote.category}</span>
                  <span className="note-meta-sep" />
                  <span className="note-meta-chip">{selectedNote.tags || ''}</span>
                  <span className="note-meta-sep" />
                  <span className="note-meta-chip">
                    {selectedNote.updated_at || selectedNote.imported_at || ''}
                  </span>
                  {selectedNote.migration_batch_id && (
                    <>
                      <span className="note-meta-sep" />
                      <span className="note-meta-chip">{selectedNote.migration_batch_id}</span>
                    </>
                  )}
                  <span className="note-meta-sep" />
                  <span className="note-meta-chip">Core</span>
                </div>
                <div className="core-content-body">
                  {selectedNote.content || ''}
                </div>
              </div>
            ) : (
              <div className="core-content-empty">
                <p>Select a note to view its content.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoreNotesViewer;
