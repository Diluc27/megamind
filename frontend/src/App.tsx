import { useState, useEffect, useRef } from 'react';
import './styles.css';
import type { Note, SearchResult, Session, Shelfd, Claud, ClaudPage, CustomSpace } from './types';
import { api, checkOnline, syncQueue } from './api';
import { offlineStore } from './offlineStore';
import Sidebar from './components/Sidebar';
import NoteForm from './components/NoteForm';
import NoteList from './components/NoteList';
import NoteViewModal from './components/NoteViewModal';
import CoreNotesViewer from './components/CoreNotesViewer';
import SearchPanel from './components/SearchPanel';
import AskBrain from './components/AskBrain';
import SessionForm from './components/SessionForm';
import SessionList from './components/SessionList';
import ShelfdForm from './components/ShelfdForm';
import ShelfdList from './components/ShelfdList';
import ClaudForm from './components/ClaudForm';
import ClaudList from './components/ClaudList';
import AdminPanel from './components/AdminPanel';
import PagedViewModal from './components/PagedViewModal';
import { isPermanent, getExpiryLabel, isContext, formatNoteTime } from './types';

const BUILT_IN_CUSTOM_SPACES: CustomSpace[] = [
  { name: 'Stuff', icon: '', slug: 'stuff' },
  { name: 'Finance', icon: '', slug: 'finance' },
];

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('megamind-theme') as 'light' | 'dark') || 'light';
  });
  const [activeSpace, setActiveSpace] = useState<string>(() => {
    return localStorage.getItem('megamind-active-space') || 'window';
  });
  const [spaceDropdown, setSpaceDropdown] = useState(false);
  const [showNewSpaceDialog, setShowNewSpaceDialog] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [shelfdItems, setShelfdItems] = useState<Shelfd[]>([]);
  const [claudItems, setClaudItems] = useState<Claud[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editingShelfd, setEditingShelfd] = useState<Shelfd | null>(null);
  const [editingClaud, setEditingClaud] = useState<Claud | null>(null);
  const [sessionQuery, setSessionQuery] = useState('');
  const [shelfdQuery, setShelfdQuery] = useState('');
  const [customSpaces, setCustomSpaces] = useState<CustomSpace[]>(() => {
    const saved = localStorage.getItem('megamind-custom-spaces');
    return saved ? JSON.parse(saved) : [];
  });
  const [viewingClaud, setViewingClaud] = useState<Claud | null>(null);
  const [claudPages, setClaudPages] = useState<ClaudPage[]>([]);
  const [selectedClaudPageId, setSelectedClaudPageId] = useState<number | 'main'>('main');
  const [showClaudPageForm, setShowClaudPageForm] = useState(false);
  const [editingClaudPage, setEditingClaudPage] = useState<ClaudPage | null>(null);
  const [claudPageTitle, setClaudPageTitle] = useState('');
  const [claudPageTags, setClaudPageTags] = useState('');
  const [claudPageContent, setClaudPageContent] = useState('');
  const [claudPageSaving, setClaudPageSaving] = useState(false);
  const [claudPageError, setClaudPageError] = useState('');
  const [claudPageMenuOpen, setClaudPageMenuOpen] = useState(false);
  const [megacodeCategory, setMegacodeCategory] = useState<'all' | 'permanent' | 'context'>('all');
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [viewingShelfd, setViewingShelfd] = useState<Shelfd | null>(null);
  const [coreToken, setCoreToken] = useState<string | null>(null);
  const [corePassword, setCorePassword] = useState('');
  const [coreError, setCoreError] = useState('');
  const [coreUnlocking, setCoreUnlocking] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncPending, setSyncPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('megamind-sidebar-collapsed') === 'true';
  });
  const spaceRef = useRef<HTMLDivElement>(null);
  const allCustomSpaces = [
    ...BUILT_IN_CUSTOM_SPACES,
    ...customSpaces.filter(space => !BUILT_IN_CUSTOM_SPACES.some(builtIn => builtIn.slug === space.slug)),
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (spaceRef.current && !spaceRef.current.contains(e.target as Node)) {
        setSpaceDropdown(false);
      }
    };
    if (spaceDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [spaceDropdown]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('megamind-theme', theme);
  }, [theme]);

  useEffect(() => {
    const check = async () => {
      const online = await checkOnline();
      setIsOnline(online);
      const count = await offlineStore.getQueueCount();
      setSyncPending(count);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const result = await syncQueue();
    setSyncing(false);
    setIsOnline(true);
    const remaining = await offlineStore.getQueueCount();
    setSyncPending(remaining);
    if (result.synced > 0) {
      loadNotes();
      loadSessions();
    }
  };

  const loadNotes = async () => {
    try {
      const data = await api.fetchNotes();
      setNotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await api.fetchSessions();
      setSessions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadShelfd = async () => {
    try {
      const data = await api.fetchShelfdItems();
      setShelfdItems(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadClaud = async () => {
    try {
      const data = await api.fetchClaudItems();
      setClaudItems(data);
    } catch (err) {
      console.error(err);
    }
  };

  const resetClaudPageForm = () => {
    setShowClaudPageForm(false);
    setEditingClaudPage(null);
    setClaudPageTitle('');
    setClaudPageTags('');
    setClaudPageContent('');
    setClaudPageError('');
    setClaudPageMenuOpen(false);
  };

  const loadClaudPages = async (claudId: number) => {
    try {
      const data = await api.fetchClaudPages(claudId);
      setClaudPages(data);
    } catch (err) {
      console.error(err);
      setClaudPages([]);
    }
  };

  const closeClaudView = () => {
    setViewingClaud(null);
    setClaudPages([]);
    setSelectedClaudPageId('main');
    setClaudPageMenuOpen(false);
    resetClaudPageForm();
  };

  const startNewClaudPage = () => {
    setClaudPageMenuOpen(false);
    setEditingClaudPage(null);
    setClaudPageTitle('');
    setClaudPageTags('');
    setClaudPageContent('');
    setClaudPageError('');
    setShowClaudPageForm(true);
  };

  const startEditClaudPage = (page: ClaudPage) => {
    setClaudPageMenuOpen(false);
    setEditingClaudPage(page);
    setClaudPageTitle(page.title);
    setClaudPageTags(page.tags ?? '');
    setClaudPageContent(page.content);
    setClaudPageError('');
    setShowClaudPageForm(true);
  };

  const saveClaudPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingClaud || !claudPageTitle.trim() || !claudPageContent.trim()) return;
    setClaudPageSaving(true);
    setClaudPageError('');
    try {
      const payload = {
        title: claudPageTitle.trim(),
        tags: claudPageTags.trim() || null,
        content: claudPageContent,
      };
      const saved = editingClaudPage
        ? await api.updateClaudPage(viewingClaud.id, editingClaudPage.id, payload)
        : await api.createClaudPage(viewingClaud.id, payload);
      await loadClaudPages(viewingClaud.id);
      setSelectedClaudPageId(saved.id);
      resetClaudPageForm();
    } catch (err: any) {
      setClaudPageError(err.message || 'Failed to save page');
    } finally {
      setClaudPageSaving(false);
    }
  };

  const deleteClaudPage = async (page: ClaudPage) => {
    setClaudPageMenuOpen(false);
    if (!viewingClaud || !confirm(`Delete page "${page.title}"?`)) return;
    try {
      await api.deleteClaudPage(viewingClaud.id, page.id);
      await loadClaudPages(viewingClaud.id);
      setSelectedClaudPageId('main');
      resetClaudPageForm();
    } catch (err: any) {
      alert(err.message || 'Failed to delete page');
    }
  };

  const makeClaudPagePermanent = async (page: ClaudPage) => {
    if (!viewingClaud) return;
    setClaudPageMenuOpen(false);
    const updated = await api.makeClaudPagePermanent(viewingClaud.id, page.id);
    await loadClaudPages(viewingClaud.id);
    setSelectedClaudPageId(updated.id);
    resetClaudPageForm();
  };

  const editMainClaud = () => {
    if (!viewingClaud) return;
    setClaudPageMenuOpen(false);
    setEditingClaud(viewingClaud);
    closeClaudView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMainClaud = async () => {
    if (!viewingClaud || !confirm(`Delete Claud note "${viewingClaud.title}"?`)) return;
    try {
      setClaudPageMenuOpen(false);
      await api.deleteClaudItem(viewingClaud.id);
      closeClaudView();
      loadClaud();
    } catch (err: any) {
      alert(err.message || 'Failed to delete Claud note');
    }
  };

  const makeMainClaudPermanent = async () => {
    if (!viewingClaud) return;
    setClaudPageMenuOpen(false);
    const updated = await api.makeClaudPermanent(viewingClaud.id);
    setViewingClaud(updated);
    loadClaud();
  };

  const editMainSession = () => {
    if (!viewingSession) return;
    setEditingSession(viewingSession);
    setViewingSession(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMainSession = async () => {
    if (!viewingSession || !confirm(`Delete session "${viewingSession.title}"?`)) return;
    await api.deleteSession(viewingSession.id);
    setViewingSession(null);
    loadSessions();
  };

  const makeMainSessionPermanent = async () => {
    if (!viewingSession) return;
    const updated = await api.makeSessionPermanent(viewingSession.id);
    setViewingSession(updated);
    loadSessions();
  };

  const editMainShelfd = () => {
    if (!viewingShelfd) return;
    setEditingShelfd(viewingShelfd);
    setViewingShelfd(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMainShelfd = async () => {
    if (!viewingShelfd || !confirm(`Delete Shelfd item "${viewingShelfd.title}"?`)) return;
    await api.deleteShelfdItem(viewingShelfd.id);
    setViewingShelfd(null);
    loadShelfd();
  };

  const makeMainShelfdPermanent = async () => {
    if (!viewingShelfd) return;
    const updated = await api.makeShelfdPermanent(viewingShelfd.id);
    setViewingShelfd(updated);
    loadShelfd();
  };

  const shelfdMainContent = (item: Shelfd) => {
    const sections = item.sections && item.sections.length > 0
      ? item.sections.map(section => `${section.title}\n${section.items.map(v => `- ${v}`).join('\n')}`).join('\n\n')
      : '';
    const ideas = item.key_ideas?.length ? `Key Ideas\n${item.key_ideas.map(v => `- ${v}`).join('\n')}` : '';
    const actions = item.action_items?.length ? `Action Items\n${item.action_items.map(v => `- ${v}`).join('\n')}` : '';
    return [sections || ideas, actions, item.content].filter(Boolean).join('\n\n');
  };

  useEffect(() => {
    loadNotes();
    loadSessions();
    loadShelfd();
    loadClaud();
  }, []);

  useEffect(() => {
    if (!viewingClaud) return;
    setSelectedClaudPageId('main');
    resetClaudPageForm();
    loadClaudPages(viewingClaud.id);
  }, [viewingClaud]);

  useEffect(() => {
    if (activeSpace === 'window') {
      loadNotes();
    } else if (activeSpace === 'sessions') {
      loadSessions();
    } else if (activeSpace === 'shelfd') {
      loadShelfd();
    } else if (activeSpace === 'claud') {
      loadClaud();
    }
  }, [activeSpace]);

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

  const switchSpace = (space: string) => {
    setSearchResults(null);
    setEditingNote(null);
    setViewingNote(null);
    setCorePassword('');
    setCoreError('');
    setEditingSession(null);
    setViewingSession(null);
    setSessionQuery('');
    setEditingShelfd(null);
    setViewingShelfd(null);
    setShelfdQuery('');
    setEditingClaud(null);
    setViewingClaud(null);
    setClaudPages([]);
    setSelectedClaudPageId('main');
    resetClaudPageForm();
    setMegacodeCategory('all');
    if (space === 'window') {
      setActiveCategory(null);
    }
    setActiveSpace(space);
    localStorage.setItem('megamind-active-space', space);
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

  const handleExport = async () => {
    const allNotes = await offlineStore.getAllNotes();
    const allSessions = await offlineStore.getAllSessions();
    const queue = await offlineStore.getQueuedActions();
    const blob = new Blob([JSON.stringify({ notes: allNotes, sessions: allSessions, sync_queue: queue }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megamind-offline-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLockCore = async () => {
    if (!coreToken) return;
    try {
      await api.lockCore(coreToken);
    } catch (err) {
      console.error('Lock Core failed:', err);
    }
    setCoreToken(null);
    setCorePassword('');
    setCoreError('');
  };

  const handleToggleTheme = () => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  };

  const filteredNotes = activeCategory 
    ? notes.filter(n => n.category === activeCategory)
    : notes;

  const filteredSessions = (() => {
    let list = sessionQuery.trim()
      ? sessions.filter(s => {
          const q = sessionQuery.toLowerCase();
          return (s.title.toLowerCase().includes(q) ||
            (s.agent && s.agent.toLowerCase().includes(q)) ||
            (s.project && s.project.toLowerCase().includes(q)) ||
            (s.tags && s.tags.toLowerCase().includes(q)) ||
            (s.content && s.content.toLowerCase().includes(q)));
        })
      : sessions;
    if (megacodeCategory === 'permanent') {
      list = list.filter(s => isPermanent(s.tags));
    } else if (megacodeCategory === 'context') {
      list = list.filter(s => isContext(s.tags));
    }
    return list;
  })();

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

    return (
      <>
        <CoreNotesViewer token={coreToken} onLock={handleLockCore} />
        <AdminPanel coreToken={coreToken} />
      </>
    );
  };

  const shelfdStorageBadge = (mode: Shelfd['storage_mode']) => {
    if (mode === 'local_only') return { label: '⊘ Local', color: '#a8a8a8', bg: 'rgba(168,168,168,0.1)', border: 'rgba(168,168,168,0.25)' };
    if (mode === 'cloud_only') return { label: '☁ Cloud', color: '#64c8ff', bg: 'rgba(100,200,255,0.1)', border: 'rgba(100,200,255,0.25)' };
    return { label: '⟳ Synced', color: '#7edc8a', bg: 'rgba(126,220,138,0.1)', border: 'rgba(126,220,138,0.25)' };
  };

  return (
    <div className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setSearchResults(null);
          setEditingNote(null);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => {
          const next = !sidebarCollapsed;
          setSidebarCollapsed(next);
          localStorage.setItem('megamind-sidebar-collapsed', String(next));
        }}
        onExportOffline={handleExport}
      />
      
      <main className="main-content">
        {!isOnline && (
          <div className="offline-banner">
            <span>Offline Mode — changes saved locally</span>
            {syncPending > 0 && (
              <button className="offline-sync-btn" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing\u2026' : `Sync ${syncPending} pending`}
              </button>
            )}
          </div>
        )}
        {isOnline && syncPending > 0 && (
          <div className="offline-banner sync-ready">
            <span>{syncPending} change{syncPending !== 1 ? 's' : ''} ready to sync</span>
            <button className="offline-sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing\u2026' : 'Sync Now'}
            </button>
          </div>
        )}
        <div className="space-switcher">
          <div className="dropdown-wrapper" ref={spaceRef}>
            <span
              className="space-label"
              onClick={() => setSpaceDropdown(!spaceDropdown)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              SPACE
            </span>
            {spaceDropdown && (
              <div className="dropdown-menu" style={{ left: 0, right: 'auto', top: 'calc(100% + 4px)', minWidth: 180 }}>
                <div className="dropdown-item" onClick={() => { switchSpace('window'); setSpaceDropdown(false); }}>
                  {activeSpace === 'window' ? '✓ ' : ''}Window Space
                </div>
                <div className="dropdown-item" onClick={() => { switchSpace('sessions'); setSpaceDropdown(false); }}>
                  {activeSpace === 'sessions' ? '✓ ' : ''}MegaCode
                </div>
                <div className="dropdown-item" onClick={() => { switchSpace('shelfd'); setSpaceDropdown(false); }}>
                  {activeSpace === 'shelfd' ? '✓ ' : ''}Shelfd
                </div>
                <div className="dropdown-item" onClick={() => { switchSpace('claud'); setSpaceDropdown(false); }}>
                  {activeSpace === 'claud' ? '✓ ' : ''}Claud
                </div>
                <div className="dropdown-item" onClick={() => { switchSpace('core'); setSpaceDropdown(false); }}>
                  {activeSpace === 'core' ? '✓ ' : ''}{coreToken ? '🔓' : '🔒'}
                </div>
                {allCustomSpaces.map(cs => (
                  <div key={cs.slug} className="dropdown-item" onClick={() => { switchSpace(cs.slug); setSpaceDropdown(false); }}>
                    {activeSpace === cs.slug ? '✓ ' : ''}{cs.icon ? `${cs.icon} ` : ''}{cs.name}
                  </div>
                ))}
                <div className="dropdown-item" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 10, color: 'var(--accent)' }} onClick={() => { setSpaceDropdown(false); setShowNewSpaceDialog(true); }}>
                  + New Space
                </div>
              </div>
            )}
          </div>
          <div className="space-tabs">
            <button
              className={`space-tab${activeSpace === 'window' ? ' active' : ''}`}
              onClick={() => switchSpace('window')}
            >
              Window
            </button>
            <button
              className={`space-tab${activeSpace === 'sessions' ? ' active' : ''}`}
              onClick={() => switchSpace('sessions')}
            >
              MegaCode
            </button>
            <button
              className={`space-tab${activeSpace === 'shelfd' ? ' active' : ''}`}
              onClick={() => switchSpace('shelfd')}
            >
              Shelfd
            </button>
            <button
              className={`space-tab${activeSpace === 'claud' ? ' active' : ''}`}
              onClick={() => switchSpace('claud')}
            >
              Claud
            </button>
            {allCustomSpaces.map(cs => (
              <button
                key={cs.slug}
                className={`space-tab${activeSpace === cs.slug ? ' active' : ''}`}
                onClick={() => switchSpace(cs.slug)}
              >
                {cs.icon ? `${cs.icon} ` : ''}{cs.name}
              </button>
            ))}
            <button
              className={`space-tab${activeSpace === 'core' ? ' active' : ''}`}
              onClick={() => switchSpace('core')}
            >
              {coreToken ? '🔓' : '🔒'}
            </button>
          </div>
          <span className="space-description">
            {activeSpace === 'window' ? 'Window Space — Agent-safe notes.' :
             activeSpace === 'sessions' ? 'MegaCode — Permanent sessions and context.' :
             activeSpace === 'shelfd' ? 'Shelfd — Code snippets and references.' :
             activeSpace === 'claud' ? 'Claud — Agent-accessible notes.' :
             activeSpace === 'core' ? 'Private. Unlock with password.' :
             allCustomSpaces.find(c => c.slug === activeSpace) ? `${allCustomSpaces.find(c => c.slug === activeSpace)!.name} — Custom space.` :
             ''}
          </span>
          <button className="offline-sync-btn" onClick={() => location.reload()} title="Refresh page">↻</button>
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
        ) : activeSpace === 'sessions' ? (
          <div className="content-scroll">
            <div className="megacode-tabs">
              <button className={`megacode-tab${megacodeCategory === 'all' ? ' active' : ''}`} onClick={() => setMegacodeCategory('all')}>All</button>
              <button className={`megacode-tab${megacodeCategory === 'permanent' ? ' active' : ''}`} onClick={() => setMegacodeCategory('permanent')}>Permanent</button>
              <button className={`megacode-tab${megacodeCategory === 'context' ? ' active' : ''}`} onClick={() => setMegacodeCategory('context')}>Context</button>
            </div>
            <div className="panels">
              <SessionForm
                editingSession={editingSession}
                onSuccess={() => {
                  loadSessions();
                  setEditingSession(null);
                }}
                onCancel={() => setEditingSession(null)}
              />
              <div className="right-column">
                <div className="panel">
                  <div className="panel-header">Search Sessions</div>
                  <input
                    placeholder="Search by title, agent, project, tags\u2026"
                    value={sessionQuery}
                    onChange={e => setSessionQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <SessionList
              sessions={filteredSessions}
              totalCount={sessions.length}
              onEdit={(s) => setEditingSession(s)}
              onView={(s) => setViewingSession(s)}
              onDelete={loadSessions}
            />
          </div>
        ) : activeSpace === 'shelfd' ? (
          <div className="content-scroll">
            <div className="panels">
              <ShelfdForm
                editingItem={editingShelfd}
                onSuccess={() => {
                  loadShelfd();
                  setEditingShelfd(null);
                }}
                onCancel={() => setEditingShelfd(null)}
              />
              <div className="right-column">
                <div className="panel">
                  <div className="panel-header">Search Shelfd</div>
                  <input
                    placeholder="Search by title, tags, content\u2026"
                    value={shelfdQuery}
                    onChange={e => setShelfdQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <ShelfdList
              items={shelfdQuery.trim()
                ? shelfdItems.filter(s => {
                    const q = shelfdQuery.toLowerCase();
                    return (s.title.toLowerCase().includes(q) ||
                      (s.tags && s.tags.toLowerCase().includes(q)) ||
                      (s.content && s.content.toLowerCase().includes(q)));
                  })
                : shelfdItems}
              totalCount={shelfdItems.length}
              onEdit={(s) => setEditingShelfd(s)}
              onView={(s) => setViewingShelfd(s)}
              onDelete={loadShelfd}
            />
          </div>
        ) : activeSpace === 'claud' ? (
          <div className="content-scroll">
            <div className="panels">
              <ClaudForm
                editingItem={editingClaud}
                onSuccess={() => {
                  loadClaud();
                  setEditingClaud(null);
                }}
                onCancel={() => setEditingClaud(null)}
              />
              <div className="right-column">
                <div className="panel">
                  <div className="panel-header">About Claud</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    Agent-accessible notes space. Create notes here for other agents to reference.
                  </div>
                </div>
              </div>
            </div>
            <ClaudList
              items={claudItems}
              totalCount={claudItems.length}
              onEdit={(item) => setEditingClaud(item)}
              onView={(item) => setViewingClaud(item)}
              onDelete={loadClaud}
            />
          </div>
        ) : allCustomSpaces.some(c => c.slug === activeSpace) ? (
          <div className="content-scroll">
            <div className="panels">
              <div className="panel">
                <div className="panel-header">{allCustomSpaces.find(c => c.slug === activeSpace)?.icon ? `${allCustomSpaces.find(c => c.slug === activeSpace)?.icon} ` : ''}{allCustomSpaces.find(c => c.slug === activeSpace)?.name}</div>
                <div className="form-group">
                  <textarea
                    placeholder="Write notes here..."
                    rows={8}
                    value={localStorage.getItem(`megamind-custom-${activeSpace}`) || ''}
                    onChange={e => localStorage.setItem(`megamind-custom-${activeSpace}`, e.target.value)}
                    style={{ minHeight: 200 }}
                  />
                </div>
              </div>
            </div>
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
          onDelete={loadNotes}
        />
      )}

      {viewingSession && (
        <PagedViewModal
          title={viewingSession.title}
          mainLabel="Main"
          mainContent={viewingSession.content}
          mainTags={viewingSession.tags}
          onClose={() => setViewingSession(null)}
          onEditMain={editMainSession}
          onDeleteMain={deleteMainSession}
          onMakeMainPermanent={makeMainSessionPermanent}
          meta={(
            <>
              <span className={`megacode-badge ${isPermanent(viewingSession.tags) ? 'badge-permanent' : 'badge-context'}`}>
                {isPermanent(viewingSession.tags) ? 'Permanent' : 'Context'}
              </span>
              {!isPermanent(viewingSession.tags) && (() => {
                const label = getExpiryLabel(viewingSession.tags);
                return label ? <span className={`megacode-expiry ${label === 'Expired' ? 'expired' : ''}`}>{label}</span> : null;
              })()}
              {viewingSession.agent && <span className="note-meta-chip" style={{ color: 'var(--accent)' }}>via {viewingSession.agent}</span>}
              {viewingSession.project && <span className="note-category-tag">{viewingSession.project}</span>}
              <span className="note-meta-chip">{viewingSession.tags}</span>
            </>
          )}
          fetchPages={() => api.fetchSessionPages(viewingSession.id)}
          createPage={(data) => api.createSessionPage(viewingSession.id, data)}
          updatePage={(pageId, data) => api.updateSessionPage(viewingSession.id, pageId, data)}
          deletePage={(pageId) => api.deleteSessionPage(viewingSession.id, pageId)}
          makePagePermanent={(pageId) => api.makeSessionPagePermanent(viewingSession.id, pageId)}
        />
      )}

      {viewingShelfd && (
        <PagedViewModal
          title={viewingShelfd.title}
          mainLabel="Main"
          mainContent={shelfdMainContent(viewingShelfd)}
          mainTags={viewingShelfd.storage_mode === 'saved' ? 'memory-permanent,protected' : viewingShelfd.tags}
          onClose={() => setViewingShelfd(null)}
          onEditMain={editMainShelfd}
          onDeleteMain={deleteMainShelfd}
          onMakeMainPermanent={makeMainShelfdPermanent}
          meta={(() => {
            const badge = shelfdStorageBadge(viewingShelfd.storage_mode);
            return (
              <>
                <span className="megacode-badge" style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>
                  {viewingShelfd.storage_mode === 'saved' ? 'Permanent' : badge.label}
                </span>
                {viewingShelfd.tags && <span className="note-meta-chip">{viewingShelfd.tags}</span>}
                <span className="note-meta-chip">{formatNoteTime(viewingShelfd.created_at)}</span>
              </>
            );
          })()}
          fetchPages={() => api.fetchShelfdPages(viewingShelfd.id)}
          createPage={(data) => api.createShelfdPage(viewingShelfd.id, data)}
          updatePage={(pageId, data) => api.updateShelfdPage(viewingShelfd.id, pageId, data)}
          deletePage={(pageId) => api.deleteShelfdPage(viewingShelfd.id, pageId)}
          makePagePermanent={(pageId) => api.makeShelfdPagePermanent(viewingShelfd.id, pageId)}
        />
      )}

      {viewingClaud && (() => {
        const selectedPage = typeof selectedClaudPageId === 'number'
          ? claudPages.find(page => page.id === selectedClaudPageId) ?? null
          : null;
        return (
          <div className="modal-overlay" onClick={closeClaudView}>
            <div className="note-view-modal" onClick={e => e.stopPropagation()}>
              <div className="view-modal-header">
                <div className="view-modal-title">{viewingClaud.title}</div>
                <div className="view-modal-actions">
                  <button className="btn-close-modal" title="Add page" onClick={startNewClaudPage}>+</button>
                  <button className="btn-close-modal" onClick={closeClaudView}>&times;</button>
                </div>
              </div>
              <div className="view-modal-meta">
                {isPermanent(viewingClaud.tags) && <span className="megacode-badge badge-permanent">Permanent</span>}
                {viewingClaud.agent && <span className="note-meta-chip" style={{ color: 'var(--accent)' }}>via {viewingClaud.agent}</span>}
                {viewingClaud.tags && <span className="note-meta-chip">{viewingClaud.tags}</span>}
                <span className="note-meta-chip">{formatNoteTime(viewingClaud.created_at)}</span>
              </div>

              <div className="claud-page-tabs">
                <button
                  className={`claud-page-tab${selectedClaudPageId === 'main' || !selectedPage ? ' active' : ''}`}
                  onClick={() => { setSelectedClaudPageId('main'); resetClaudPageForm(); }}
                >
                  Main
                </button>
                {claudPages.map(page => (
                  <button
                    key={page.id}
                    className={`claud-page-tab${selectedClaudPageId === page.id ? ' active' : ''}`}
                    onClick={() => { setSelectedClaudPageId(page.id); resetClaudPageForm(); }}
                  >
                    {page.title}
                  </button>
                ))}
              </div>

              {showClaudPageForm && (
                <form className="claud-page-form" onSubmit={saveClaudPage}>
                  <div className="panel-header">{editingClaudPage ? 'Edit Sub Page' : 'New Sub Page'}</div>
                  {claudPageError && <div className="claud-page-error">{claudPageError}</div>}
                  <input
                    placeholder="Sub title"
                    value={claudPageTitle}
                    onChange={e => setClaudPageTitle(e.target.value)}
                    autoFocus
                  />
                  <input
                    placeholder="Tags (optional)"
                    value={claudPageTags}
                    onChange={e => setClaudPageTags(e.target.value)}
                  />
                  <textarea
                    placeholder="Page content"
                    value={claudPageContent}
                    onChange={e => setClaudPageContent(e.target.value)}
                    rows={7}
                  />
                  <div className="claud-page-form-actions">
                    <button type="submit" className="btn-primary" disabled={claudPageSaving || !claudPageTitle.trim() || !claudPageContent.trim()}>
                      {claudPageSaving ? 'Saving...' : editingClaudPage ? 'Update Sub Page' : 'Create Sub Page'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={resetClaudPageForm}>Cancel</button>
                  </div>
                </form>
              )}

              {selectedPage ? (
                <>
                  <div className="claud-page-toolbar">
                    <div className="claud-page-title-row">
                      <span>{selectedPage.title}</span>
                      {isPermanent(selectedPage.tags) && <span className="megacode-badge badge-permanent">Permanent</span>}
                    </div>
                    <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
                      <button className="btn-dots" onClick={() => setClaudPageMenuOpen(v => !v)}>&#8942;</button>
                      {claudPageMenuOpen && (
                        <div className="dropdown-menu">
                          {isPermanent(selectedPage.tags) ? (
                            <div className="dropdown-item">Read-only</div>
                          ) : (
                            <>
                              <div className="dropdown-item" onClick={() => startEditClaudPage(selectedPage)}>Edit</div>
                              <div className="dropdown-item" onClick={() => makeClaudPagePermanent(selectedPage)}>Make permanent</div>
                              <div className="dropdown-item dropdown-danger" onClick={() => deleteClaudPage(selectedPage)}>Delete</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="view-modal-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedPage.content}
                  </div>
                </>
              ) : (
                <>
                  <div className="claud-page-toolbar">
                    <div className="claud-page-title-row">
                      <span>Main</span>
                      {isPermanent(viewingClaud.tags) && <span className="megacode-badge badge-permanent">Permanent</span>}
                    </div>
                    <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
                      <button className="btn-dots" onClick={() => setClaudPageMenuOpen(v => !v)}>&#8942;</button>
                      {claudPageMenuOpen && (
                        <div className="dropdown-menu">
                          {isPermanent(viewingClaud.tags) ? (
                            <div className="dropdown-item">Read-only</div>
                          ) : (
                            <>
                              <div className="dropdown-item" onClick={editMainClaud}>Edit</div>
                              <div className="dropdown-item" onClick={makeMainClaudPermanent}>Make permanent</div>
                              <div className="dropdown-item dropdown-danger" onClick={deleteMainClaud}>Delete</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="view-modal-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {viewingClaud.content}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {showNewSpaceDialog && (
        <div className="modal-overlay" onClick={() => { setShowNewSpaceDialog(false); setNewSpaceName(''); }}>
          <div className="note-view-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="view-modal-header">
              <div className="view-modal-title">New Space</div>
              <div className="view-modal-actions">
                <button className="btn-close-modal" onClick={() => { setShowNewSpaceDialog(false); setNewSpaceName(''); }}>&times;</button>
              </div>
            </div>
            <div className="form-group" style={{ padding: '8px 0' }}>
              <input
                placeholder="Space name"
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn-primary"
                  disabled={!newSpaceName.trim()}
                  onClick={() => {
                    const name = newSpaceName.trim();
                    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    if (!slug) return;
                    if (allCustomSpaces.some(space => space.slug === slug)) {
                      switchSpace(slug);
                      setShowNewSpaceDialog(false);
                      setNewSpaceName('');
                      return;
                    }
                    const updated: CustomSpace[] = [...customSpaces, { name, icon: '📄', slug }];
                    setCustomSpaces(updated);
                    localStorage.setItem('megamind-custom-spaces', JSON.stringify(updated));
                    setShowNewSpaceDialog(false);
                    setNewSpaceName('');
                    switchSpace(slug);
                  }}
                >
                  Create
                </button>
                <button className="btn-secondary" onClick={() => { setShowNewSpaceDialog(false); setNewSpaceName(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
