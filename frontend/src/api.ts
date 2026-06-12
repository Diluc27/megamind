import type { Note, NoteBase, NotePage, NotePageBase, SearchResult, AskBrainResponse, CoreNote, CoreNoteDetail, Session, SessionBase, SessionPage, SessionPageBase, Shelfd, ShelfdBase, ShelfdPage, ShelfdPageBase, ShelfdSearchResult, Claud, ClaudBase, ClaudPage, ClaudPageBase } from './types';
import { offlineStore, type SyncAction } from './offlineStore';

const API_HOST = window.location.hostname;
const API_BASE = `http://${API_HOST}:8000/api`;
const ROOT_BASE = API_BASE.replace('/api', '');
const API_KEY = window.localStorage.getItem('MEGAMIND_API_KEY') || '';

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return API_KEY ? { 'X-API-Key': API_KEY, ...extra } : extra;
}

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'notes', 'sessions', 'results', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

function toShelfd(project: any): Shelfd {
  return {
    id: project.id,
    title: project.title,
    tags: project.summary ?? null,
    file_path: null,
    content: project.raw_text ?? '',
    created_at: project.created_at,
    updated_at: project.server_updated_at ?? project.updated_at,
    storage_mode: project.storage_mode ?? 'synced',
    key_ideas: project.key_ideas ?? [],
    action_items: project.action_items ?? [],
    sections: project.sections ?? [],
  };
}

function newProjectId(): string {
  return window.crypto?.randomUUID?.() || `shelfd-${Date.now()}`;
}

let onlineListeners: Array<(online: boolean) => void> = [];
export function onOnlineChange(fn: (online: boolean) => void) {
  onlineListeners.push(fn);
}
function notifyOnline(online: boolean) {
  for (const fn of onlineListeners) fn(online);
}

async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE.replace('/api', ''), { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const online = await checkBackend();
  if (!online) return { synced: 0, failed: 0 };
  const actions = await offlineStore.getQueuedActions();
  let synced = 0;
  let failed = 0;
  for (const action of actions) {
    try {
      const opts: RequestInit = { method: action.method };
      if (action.body) {
        opts.headers = apiHeaders({ 'Content-Type': 'application/json' });
        opts.body = JSON.stringify(action.body);
      } else {
        opts.headers = apiHeaders();
      }
      const res = await fetch(`${API_BASE}${action.url}`, opts);
      if (!res.ok) { failed++; continue; }
      if (action.method === 'POST' && (action.url === '/notes' || action.url === '/sessions')) {
        const created = await res.json();
        if (action.url === '/notes' && created.id) {
          await offlineStore.putNote(created);
        }
        if (action.url === '/sessions' && created.id) {
          await offlineStore.putSession(created);
        }
      }
      await offlineStore.removeQueuedAction(action.id!);
      synced++;
    } catch {
      failed++;
    }
  }
  const remaining = await offlineStore.getQueueCount();
  if (remaining === 0) {
    await refreshOfflineCache();
  }
  return { synced, failed };
}

async function refreshOfflineCache() {
  const online = await checkBackend();
  if (!online) return;
  try {
    const [notes, sessions] = await Promise.all([
      fetch(`${API_BASE}/notes`, { headers: apiHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/sessions`, { headers: apiHeaders() }).then(r => r.json()),
    ]);
    await Promise.all([
      offlineStore.populateNotes(asArray<Note>(notes)),
      offlineStore.populateSessions(asArray<Session>(sessions)),
    ]);
  } catch { /* swallow */ }
}

export async function checkOnline(): Promise<boolean> {
  const ok = await checkBackend();
  notifyOnline(ok);
  return ok;
}

async function onlineFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...init,
      headers: apiHeaders((init?.headers as Record<string, string>) || {}),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function queueWrite(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) {
  await offlineStore.queueAction({ method, url, body } as SyncAction);
}

export const api = {
  // ── Notes ──
  fetchNotes: async (): Promise<Note[]> => {
    const online = await checkBackend();
    if (online) {
      const data = await onlineFetch<unknown>('/notes');
      if (data) {
        const notes = asArray<Note>(data);
        await offlineStore.populateNotes(notes);
        return notes;
      }
    }
    notifyOnline(false);
    return offlineStore.getAllNotes();
  },

  fetchNote: async (id: number): Promise<Note> => {
    const online = await checkBackend();
    if (online) {
      const data = await onlineFetch<Note>(`/notes/${id}`);
      if (data) return data;
    }
    notifyOnline(false);
    const offline = await offlineStore.getNote(id);
    if (!offline) throw new Error('Note not found');
    return offline;
  },

  createNote: async (data: NoteBase): Promise<Note> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const responseData = await res.json();
        if (responseData.status === 'duplicate') throw new Error('duplicate');
        await offlineStore.putNote(responseData);
        return responseData;
      }
    }
    notifyOnline(false);
    const tempId = -(Date.now());
    const offline: Note = {
      id: tempId,
      title: data.title,
      category: data.category ?? null,
      tags: data.tags ?? null,
      source: null,
      file_path: null,
      content: data.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await offlineStore.putNote(offline);
    await queueWrite('POST', '/notes', data);
    return offline;
  },

  updateNote: async (id: number, data: NoteBase): Promise<Note> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'PUT',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        await offlineStore.putNote(updated);
        return updated;
      }
    }
    notifyOnline(false);
    const existing = await offlineStore.getNote(id) || {};
    const offline: Note = {
      ...existing,
      title: data.title,
      category: data.category ?? null,
      tags: data.tags ?? null,
      content: data.content,
      updated_at: new Date().toISOString(),
    };
    await offlineStore.putNote(offline);
    await queueWrite('PUT', `/notes/${id}`, data);
    return offline;
  },

  deleteNote: async (id: number): Promise<void> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) {
        await offlineStore.deleteNote(id);
        return;
      }
    }
    notifyOnline(false);
    await offlineStore.deleteNote(id);
    await queueWrite('DELETE', `/notes/${id}`);
  },

  makeNotePermanent: async (id: number): Promise<Note> => {
    const res = await fetch(`${API_BASE}/notes/${id}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make note permanent');
    const updated = await res.json();
    await offlineStore.putNote(updated);
    return updated;
  },

  fetchNotePages: async (noteId: number): Promise<NotePage[]> => {
    const data = await onlineFetch<NotePage[]>(`/notes/${noteId}/pages`);
    if (data) return data as NotePage[];
    return [];
  },

  createNotePage: async (noteId: number, data: NotePageBase): Promise<NotePage> => {
    const res = await fetch(`${API_BASE}/notes/${noteId}/pages`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create note page');
    return res.json();
  },

  updateNotePage: async (noteId: number, pageId: number, data: NotePageBase): Promise<NotePage> => {
    const res = await fetch(`${API_BASE}/notes/${noteId}/pages/${pageId}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update note page');
    return res.json();
  },

  deleteNotePage: async (noteId: number, pageId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/notes/${noteId}/pages/${pageId}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete note page');
  },

  makeNotePagePermanent: async (noteId: number, pageId: number): Promise<NotePage> => {
    const res = await fetch(`${API_BASE}/notes/${noteId}/pages/${pageId}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make note page permanent');
    return res.json();
  },

  searchNotes: async (query: string): Promise<SearchResult[]> => {
    const online = await checkBackend();
    if (online) {
      const data = await onlineFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
      if (data) return data;
    }
    notifyOnline(false);
    const all = await offlineStore.getAllNotes();
    const q = query.toLowerCase();
    return all
      .filter(n => (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q)) ||
        (n.tags && n.tags.toLowerCase().includes(q)))
      .map(n => ({
        id: n.id,
        title: n.title,
        category: n.category,
        tags: n.tags,
        score: 1,
        preview: (n.content || '').slice(0, 200),
        created_at: n.created_at,
        updated_at: n.updated_at,
      }));
  },

  askBrain: async (question: string): Promise<AskBrainResponse> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question }),
      });
      if (res.ok) return res.json();
    }
    notifyOnline(false);
    return { mode: 'offline', answer: 'Backend unavailable. Question cannot be answered offline.', matched_notes: [] };
  },

  exportBackup: () => {
    window.location.href = `${API_BASE}/export`;
  },

  // ── Core (online only) ──
  coreUnlock: async (password: string): Promise<string> => {
    const online = await checkBackend();
    if (!online) throw new Error('Core Space unavailable offline');
    const res = await fetch(`${API_BASE}/core/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (res.status === 503) throw new Error('Core password is not configured');
    if (res.status === 401) throw new Error('Invalid Core password');
    if (!res.ok) throw new Error('Failed to unlock Core');
    const data = await res.json();
    return data.token;
  },

  checkCoreStatus: async (token: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/core/status`, {
      headers: { 'X-Core-Token': token },
    });
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) return false;
    const data = await res.json();
    return data.unlocked === true;
  },

  fetchCoreNotes: async (token: string): Promise<CoreNote[]> => {
    const res = await fetch(`${API_BASE}/core/notes`, {
      headers: { 'X-Core-Token': token },
    });
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) throw new Error('Failed to fetch Core notes');
    return res.json();
  },

  fetchCoreNote: async (id: number, token: string): Promise<CoreNoteDetail> => {
    const res = await fetch(`${API_BASE}/core/notes/${id}`, {
      headers: { 'X-Core-Token': token },
    });
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) throw new Error('Failed to fetch Core note');
    return res.json();
  },

  lockCore: async (token: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/core/lock`, {
      method: 'POST',
      headers: { 'X-Core-Token': token },
    });
    if (!res.ok) throw new Error('Failed to lock Core');
  },

  getApiKeyStatus: async (coreToken: string): Promise<{ key_configured: boolean; key_preview: string }> => {
    const res = await fetch(`${ROOT_BASE}/admin/api-key`, {
      headers: { 'X-Core-Token': coreToken },
    });
    if (!res.ok) throw new Error('Failed to fetch key status');
    return res.json();
  },

  rotateApiKey: async (coreToken: string): Promise<{ new_key: string; key_preview: string }> => {
    const res = await fetch(`${ROOT_BASE}/admin/api-key/rotate`, {
      method: 'POST',
      headers: { 'X-Core-Token': coreToken, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to rotate API key');
    return res.json();
  },

  getNgrokUrl: async (coreToken: string): Promise<{ url: string | null; running: boolean }> => {
    const res = await fetch(`${ROOT_BASE}/admin/ngrok-url`, {
      headers: { 'X-Core-Token': coreToken },
    });
    if (!res.ok) return { url: null, running: false };
    return res.json();
  },

  getAdminStatus: async (coreToken: string): Promise<any> => {
    const res = await fetch(`${ROOT_BASE}/admin/status`, {
      headers: { 'X-Core-Token': coreToken },
    });
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  },

  // ── Sessions ──
  fetchSessions: async (): Promise<Session[]> => {
    const online = await checkBackend();
    if (online) {
      const data = await onlineFetch<unknown>('/sessions');
      if (data) {
        const sessions = asArray<Session>(data);
        await offlineStore.populateSessions(sessions);
        return sessions;
      }
    }
    notifyOnline(false);
    return offlineStore.getAllSessions();
  },

  fetchSession: async (id: number): Promise<Session> => {
    const online = await checkBackend();
    if (online) {
      const data = await onlineFetch<Session>(`/sessions/${id}`);
      if (data) return data;
    }
    notifyOnline(false);
    const offline = await offlineStore.getSession(id);
    if (!offline) throw new Error('Session not found');
    return offline;
  },

  createSession: async (data: SessionBase): Promise<Session> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        await offlineStore.putSession(created);
        return created;
      }
    }
    notifyOnline(false);
    const tempId = -(Date.now());
    const offline: Session = {
      id: tempId,
      title: data.title,
      agent: data.agent ?? null,
      project: data.project ?? null,
      tags: data.tags ?? null,
      file_path: null,
      content: data.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await offlineStore.putSession(offline);
    await queueWrite('POST', '/sessions', data);
    return offline;
  },

  updateSession: async (id: number, data: SessionBase): Promise<Session> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'PUT',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        await offlineStore.putSession(updated);
        return updated;
      }
    }
    notifyOnline(false);
    const existing = await offlineStore.getSession(id) || {};
    const offline: Session = {
      ...existing,
      title: data.title,
      agent: data.agent ?? null,
      project: data.project ?? null,
      tags: data.tags ?? null,
      content: data.content,
      updated_at: new Date().toISOString(),
    };
    await offlineStore.putSession(offline);
    await queueWrite('PUT', `/sessions/${id}`, data);
    return offline;
  },

  deleteSession: async (id: number): Promise<void> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) {
        await offlineStore.deleteSession(id);
        return;
      }
    }
    notifyOnline(false);
    await offlineStore.deleteSession(id);
    await queueWrite('DELETE', `/sessions/${id}`);
  },

  makeSessionPermanent: async (id: number): Promise<Session> => {
    const res = await fetch(`${API_BASE}/sessions/${id}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make session permanent');
    const updated = await res.json();
    await offlineStore.putSession(updated);
    return updated;
  },

  fetchSessionPages: async (sessionId: number): Promise<SessionPage[]> => {
    const data = await onlineFetch<SessionPage[]>(`/sessions/${sessionId}/pages`);
    if (data) return data as SessionPage[];
    return [];
  },

  createSessionPage: async (sessionId: number, data: SessionPageBase): Promise<SessionPage> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/pages`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create session page');
    return res.json();
  },

  updateSessionPage: async (sessionId: number, pageId: number, data: SessionPageBase): Promise<SessionPage> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/pages/${pageId}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update session page');
    return res.json();
  },

  deleteSessionPage: async (sessionId: number, pageId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/pages/${pageId}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete session page');
  },

  makeSessionPagePermanent: async (sessionId: number, pageId: number): Promise<SessionPage> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/pages/${pageId}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make session page permanent');
    return res.json();
  },

  // ── Shelfd ──
  fetchShelfdItems: async (): Promise<Shelfd[]> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${ROOT_BASE}/shelfd/projects`, { headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.map(toShelfd);
      }
    }
    notifyOnline(false);
    return [];
  },

  fetchShelfdItem: async (id: string): Promise<Shelfd> => {
    const online = await checkBackend();
    if (online) {
      const res = await fetch(`${ROOT_BASE}/shelfd/projects/${id}`, { headers: apiHeaders() });
      if (res.ok) return toShelfd(await res.json());
    }
    notifyOnline(false);
    throw new Error('Shelfd item not found');
  },

  createShelfdItem: async (data: ShelfdBase): Promise<Shelfd> => {
    const now = new Date().toISOString();
    const res = await fetch(`${ROOT_BASE}/shelfd/projects`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: newProjectId(),
        title: data.title,
        summary: data.tags,
        key_ideas: [],
        action_items: [],
        raw_text: data.content,
        storage_mode: 'synced',
        updated_at: now,
      }),
    });
    if (!res.ok) throw new Error('Failed to create Shelfd item');
    return toShelfd(await res.json());
  },

  updateShelfdItem: async (id: string, data: ShelfdBase): Promise<Shelfd> => {
    const now = new Date().toISOString();
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${id}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id,
        title: data.title,
        summary: data.tags,
        key_ideas: [],
        action_items: [],
        raw_text: data.content,
        storage_mode: 'synced',
        updated_at: now,
      }),
    });
    if (!res.ok) throw new Error('Failed to update Shelfd item');
    return toShelfd(await res.json());
  },

  saveShelfdItem: async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${id}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id,
        storage_mode: 'saved',
        updated_at: now,
      }),
    });
    if (!res.ok) throw new Error('Failed to save Shelfd item');
  },

  makeShelfdPermanent: async (id: string): Promise<Shelfd> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${id}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make Shelfd item permanent');
    return toShelfd(await res.json());
  },

  deleteShelfdItem: async (id: string): Promise<void> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${id}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete Shelfd item');
  },

  fetchShelfdPages: async (projectId: string): Promise<ShelfdPage[]> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${projectId}/pages`, { headers: apiHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  createShelfdPage: async (projectId: string, data: ShelfdPageBase): Promise<ShelfdPage> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${projectId}/pages`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create Shelfd page');
    return res.json();
  },

  updateShelfdPage: async (projectId: string, pageId: number, data: ShelfdPageBase): Promise<ShelfdPage> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${projectId}/pages/${pageId}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update Shelfd page');
    return res.json();
  },

  deleteShelfdPage: async (projectId: string, pageId: number): Promise<void> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${projectId}/pages/${pageId}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete Shelfd page');
  },

  makeShelfdPagePermanent: async (projectId: string, pageId: number): Promise<ShelfdPage> => {
    const res = await fetch(`${ROOT_BASE}/shelfd/projects/${projectId}/pages/${pageId}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make Shelfd page permanent');
    return res.json();
  },

  searchShelfd: async (query: string): Promise<ShelfdSearchResult[]> => {
    const items = await api.fetchShelfdItems();
    const q = query.toLowerCase();
    return items
      .filter(item => item.title.toLowerCase().includes(q) || (item.tags || '').toLowerCase().includes(q) || item.content.toLowerCase().includes(q))
      .map(item => ({ id: item.id, title: item.title, tags: item.tags, score: 1, preview: item.content.slice(0, 200) }));
  },

  // ── Claud ──
  fetchClaudItems: async (): Promise<Claud[]> => {
    const data = await onlineFetch<Claud[]>('/claud');
    if (data) return data as Claud[];
    return [];
  },

  fetchClaudItem: async (id: number): Promise<Claud> => {
    const data = await onlineFetch<Claud>(`/claud/${id}`);
    if (data) return data as Claud;
    throw new Error('Claud note not found');
  },

  createClaudItem: async (data: ClaudBase): Promise<Claud> => {
    const res = await fetch(`${API_BASE}/claud`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create Claud note');
    return res.json();
  },

  updateClaudItem: async (id: number, data: ClaudBase): Promise<Claud> => {
    const res = await fetch(`${API_BASE}/claud/${id}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update Claud note');
    return res.json();
  },

  deleteClaudItem: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/claud/${id}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete Claud note');
  },

  makeClaudPermanent: async (id: number): Promise<Claud> => {
    const res = await fetch(`${API_BASE}/claud/${id}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make Claud note permanent');
    return res.json();
  },

  fetchClaudPages: async (claudId: number): Promise<ClaudPage[]> => {
    const data = await onlineFetch<ClaudPage[]>(`/claud/${claudId}/pages`);
    if (data) return data as ClaudPage[];
    return [];
  },

  createClaudPage: async (claudId: number, data: ClaudPageBase): Promise<ClaudPage> => {
    const res = await fetch(`${API_BASE}/claud/${claudId}/pages`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create Claud page');
    return res.json();
  },

  updateClaudPage: async (claudId: number, pageId: number, data: ClaudPageBase): Promise<ClaudPage> => {
    const res = await fetch(`${API_BASE}/claud/${claudId}/pages/${pageId}`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update Claud page');
    return res.json();
  },

  deleteClaudPage: async (claudId: number, pageId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/claud/${claudId}/pages/${pageId}`, { method: 'DELETE', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to delete Claud page');
  },

  makeClaudPagePermanent: async (claudId: number, pageId: number): Promise<ClaudPage> => {
    const res = await fetch(`${API_BASE}/claud/${claudId}/pages/${pageId}/make-permanent`, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to make Claud page permanent');
    return res.json();
  },
};
