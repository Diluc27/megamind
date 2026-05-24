import { useState, useEffect } from 'react';
import './styles.css';
import type { Note, SearchResult } from './types';
import { api } from './api';
import Sidebar from './components/Sidebar';
import NoteForm from './components/NoteForm';
import NoteList from './components/NoteList';
import NoteViewModal from './components/NoteViewModal';
import CoreNotesViewer from './components/CoreNotesViewer';
import SearchPanel from './components/SearchPanel';
import AskBrain from './components/AskBrain';

function App() {
  const [activeSpace, setActiveSpace] = useState<'window' | 'core'>('window');
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [coreToken, setCoreToken] = useState<string | null>(null);
  const [corePassword, setCorePassword] = useState('');
  const [coreError, setCoreError] = useState('');
  const [coreUnlocking, setCoreUnlocking] = useState(false);

  const loadNotes = async () => {
    try {
      const data = await api.fetchNotes();
      setNotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleSearch = async (query: string) => {
    try {
      const data = await api.searchNotes(query);
      setSearchResults(data);
    } catch (err) {
      alert('Search failed');
    }
  };

  const handleClearSearch = () => {
    setSearchResults(null);
  };

  const handleEdit = async (note: Note) => {
    try {
      const fullNote = await api.fetchNote(note.id);
      setEditingNote(fullNote);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert('Failed to load full note');
    }
  };

  const handleView = (note: Note) => {
    setViewingNote(note);
  };

  const handleEditFromView = (note: Note) => {
    setViewingNote(null);
    setEditingNote(note);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const switchSpace = (space: 'window' | 'core') => {
    if (space === 'core') {
      setSearchResults(null);
      setEditingNote(null);
      setViewingNote(null);
      setCorePassword('');
      setCoreError('');
    }
    setActiveSpace(space);
  };

  const handleCoreUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCoreError('');
    setCoreUnlocking(true);
    try {
      const token = await api.coreUnlock(corePassword);
      setCoreToken(token);
      setCorePassword('');
    } catch (err: any) {
      setCoreError(err.message || 'Failed to unlock Core');
    } finally {
      setCoreUnlocking(false);
    }
  };

  const handleLockCore = () => {
    setCoreToken(null);
    setCorePassword('');
    setCoreError('');
  };

  const filteredNotes = activeCategory 
    ? notes.filter(n => n.category === activeCategory)
    : notes;

  const renderCoreContent = () => {
    if (!coreToken) {
      return (
        <form className="core-password-form" onSubmit={handleCoreUnlock}>
          <span className="core-lock-icon">🔒</span>
          <h2>Core Space</h2>
          <p className="core-prompt">Enter Core password to access.</p>
          <input
            type="password"
            className="core-password-input"
            placeholder="Core password"
            value={corePassword}
            onChange={(e) => { setCorePassword(e.target.value); setCoreError(''); }}
          />
          {coreError && <p className="core-error">{coreError}</p>}
          <button type="submit" className="btn-primary" disabled={coreUnlocking || !corePassword}>
            {coreUnlocking ? 'Unlocking\u2026' : 'Unlock Core'}
          </button>
        </form>
      );
    }

    return <CoreNotesViewer token={coreToken} onLock={handleLockCore} />;
  };

  return (
    <div className="app-container">
      <Sidebar 
        activeCategory={activeCategory} 
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setSearchResults(null);
          setEditingNote(null);
        }} 
      />
      
      <main className="main-content">
        <div className="space-switcher">
          <span className="space-label">Space</span>
          <div className="space-tabs">
            <button
              className={`space-tab${activeSpace === 'window' ? ' active' : ''}`}
              onClick={() => switchSpace('window')}
            >
              Window Space
            </button>
            <button
              className={`space-tab${activeSpace === 'core' ? ' active' : ''}`}
              onClick={() => switchSpace('core')}
            >
              Core Space {coreToken ? '🔓' : '🔒'}
            </button>
          </div>
          <span className="space-description">Window Space — Agent-safe project memory. Notes here can be accessed by OpenClaude, OpenCode, Gemini CLI, and tools/brain.py.</span>
        </div>

        {activeSpace === 'window' ? (
          <div className="content-scroll">
            <div className="panels">
              <NoteForm 
                editingNote={editingNote} 
                onSuccess={() => {
                  loadNotes();
                  setEditingNote(null);
                }}
                onCancel={() => setEditingNote(null)}
              />
              <div className="right-column">
                <SearchPanel onSearch={handleSearch} onClear={handleClearSearch} />
                <AskBrain />
              </div>
            </div>

            <NoteList 
              notes={searchResults || filteredNotes}
              isSearch={!!searchResults}
              onEdit={handleEdit}
              onView={handleView}
              onDelete={loadNotes}
            />
          </div>
        ) : (
          <div className="content-scroll">
            {renderCoreContent()}
          </div>
        )}
      </main>

      {viewingNote && (
        <NoteViewModal
          note={viewingNote}
          onClose={() => setViewingNote(null)}
          onEdit={handleEditFromView}
        />
      )}
    </div>
  );
}

export default App;
