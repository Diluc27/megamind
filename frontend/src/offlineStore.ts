const DB_NAME = 'megamind-offline';
const DB_VERSION = 2;
type StoreName = 'notes' | 'sessions' | 'sync_queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('updated_at', 'updated_at');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('updated_at', 'updated_at');
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(name: StoreName, fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readwrite'): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface SyncAction {
  id?: number;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  createdAt: number;
}

export const offlineStore = {
  // ── Notes ──
  async getAllNotes() {
    const db = await openDB();
    return new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getNote(id: number) {
    return withStore<any>('notes', store => store.get(id), 'readonly');
  },

  async putNote(note: any) {
    return withStore<IDBValidKey>('notes', store => store.put(note));
  },

  async deleteNote(id: number) {
    return withStore<undefined>('notes', store => store.delete(id));
  },

  async populateNotes(notes: any[]) {
    const db = await openDB();
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    for (const n of notes) store.put(n);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // ── Sessions ──
  async getAllSessions() {
    const db = await openDB();
    return new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getSession(id: number) {
    return withStore<any>('sessions', store => store.get(id), 'readonly');
  },

  async putSession(session: any) {
    return withStore<IDBValidKey>('sessions', store => store.put(session));
  },

  async deleteSession(id: number) {
    return withStore<undefined>('sessions', store => store.delete(id));
  },

  async populateSessions(sessions: any[]) {
    const db = await openDB();
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    for (const s of sessions) store.put(s);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // ── Sync Queue ──
  async queueAction(action: Omit<SyncAction, 'id' | 'createdAt'>) {
    const id = await withStore<IDBValidKey>('sync_queue', store => {
      return store.add({ ...action, createdAt: Date.now() });
    });
    return Number(id);
  },

  async getQueuedActions(): Promise<SyncAction[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error);
    });
  },

  async clearQueue() {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async removeQueuedAction(id: number) {
    return withStore<undefined>('sync_queue', store => store.delete(id));
  },

  async getQueueCount(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
};
