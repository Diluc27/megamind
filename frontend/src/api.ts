import type { Note, NoteBase, SearchResult, AskBrainResponse, CoreNote, CoreNoteDetail } from './types';

const API_HOST = window.location.hostname;
const API_BASE = `http://${API_HOST}:8000/api`;

export const api = {
  fetchNotes: async (): Promise<Note[]> => {
    const res = await fetch(`${API_BASE}/notes`);
    if (!res.ok) throw new Error('Failed to fetch notes');
    return res.json();
  },

  fetchNote: async (id: number): Promise<Note> => {
    const res = await fetch(`${API_BASE}/notes/${id}`);
    if (!res.ok) throw new Error('Failed to fetch note');
    return res.json();
  },

  createNote: async (data: NoteBase): Promise<Note> => {
    const res = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create note');
    const responseData = await res.json();
    if (responseData.status === 'duplicate') {
      throw new Error('duplicate');
    }
    return responseData;
  },

  updateNote: async (id: number, data: NoteBase): Promise<Note> => {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update note');
    return res.json();
  },

  deleteNote: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete note');
  },

  searchNotes: async (query: string): Promise<SearchResult[]> => {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Failed to search');
    return res.json();
  },

  askBrain: async (question: string): Promise<AskBrainResponse> => {
    const res = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error('Failed to ask brain');
    return res.json();
  },

  exportBackup: () => {
    window.location.href = `${API_BASE}/export`;
  },

  coreUnlock: async (password: string): Promise<string> => {
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
    const res = await fetch(`${API_BASE}/core/status?token=${encodeURIComponent(token)}`);
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) return false;
    const data = await res.json();
    return data.unlocked === true;
  },

  fetchCoreNotes: async (token: string): Promise<CoreNote[]> => {
    const res = await fetch(`${API_BASE}/core/notes?token=${encodeURIComponent(token)}`);
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) throw new Error('Failed to fetch Core notes');
    return res.json();
  },

  fetchCoreNote: async (id: number, token: string): Promise<CoreNoteDetail> => {
    const res = await fetch(`${API_BASE}/core/notes/${id}?token=${encodeURIComponent(token)}`);
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.detail || 'Core Space is only available from this PC.');
    }
    if (!res.ok) throw new Error('Failed to fetch Core note');
    return res.json();
  },
};
