(function (globalScope) {
  'use strict';

  const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
  const DEFAULT_API_KEY = 'xK9mP2nQvR8tL5wJ3hF7yD4cA6bE1iN0';
  const STORAGE_KEYS = {
    apiBase: 'megamindApiBase',
    apiKey: 'megamindApiKey',
    cachedClaudTiles: 'megamindCachedClaudTiles',
    online: 'megamindOnline',
  };

  function getExtensionApi() {
    if (typeof browser !== 'undefined' && browser.storage) {
      return browser;
    }
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome;
    }
    return null;
  }

  function storageGet(keys) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve({});
    }

    try {
      const result = api.storage.local.get(keys);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      // Firefox MV2 and older Chrome builds use callback-based storage APIs.
    }

    return new Promise((resolve) => {
      api.storage.local.get(keys, (items) => resolve(items || {}));
    });
  }

  function storageSet(items) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve();
    }

    try {
      const result = api.storage.local.set(items);
      if (result && typeof result.then === 'function') {
        return result;
      }
    } catch (error) {
      // Firefox MV2 and older Chrome builds use callback-based storage APIs.
    }

    return new Promise((resolve) => {
      api.storage.local.set(items, () => resolve());
    });
  }

  function normalizeApiBase(apiBase) {
    return (apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  }

  function buildUrl(apiBase, path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizeApiBase(apiBase)}${normalizedPath}`;
  }

  async function getConfig(options) {
    const opts = options || {};
    const stored = await storageGet([STORAGE_KEYS.apiBase, STORAGE_KEYS.apiKey]);
    return {
      apiBase: normalizeApiBase(opts.apiBase || stored[STORAGE_KEYS.apiBase] || DEFAULT_API_BASE),
      apiKey: opts.apiKey || stored[STORAGE_KEYS.apiKey] || DEFAULT_API_KEY,
    };
  }

  async function request(path, options) {
    const opts = options || {};
    const config = await getConfig(opts);
    const headers = Object.assign({}, opts.headers || {});

    if (opts.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (config.apiKey && !headers['X-API-Key']) {
      headers['X-API-Key'] = config.apiKey;
    }

    const response = await fetch(buildUrl(config.apiBase, path), {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
    });

    if (!response.ok) {
      let detail = response.statusText || `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch (error) {
        const text = await response.text().catch(() => '');
        detail = text || detail;
      }
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  async function setOnlineState(online) {
    await storageSet({ [STORAGE_KEYS.online]: Boolean(online) });
  }

  async function ping(options) {
    try {
      const result = await request('/', options);
      await setOnlineState(true);
      return result;
    } catch (error) {
      await setOnlineState(false);
      throw error;
    }
  }

  async function listClaud(options) {
    try {
      const entries = await request('/api/claud', options);
      await storageSet({
        [STORAGE_KEYS.cachedClaudTiles]: entries,
        [STORAGE_KEYS.online]: true,
      });
      return entries;
    } catch (error) {
      await setOnlineState(false);
      throw error;
    }
  }

  async function getClaud(id, options) {
    return request(`/api/claud/${encodeURIComponent(id)}`, options);
  }

  async function createClaud(entry, options) {
    return request('/api/claud', {
      ...(options || {}),
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  async function updateClaud(id, entry, options) {
    return request(`/api/claud/${encodeURIComponent(id)}`, {
      ...(options || {}),
      method: 'PUT',
      body: JSON.stringify(entry),
    });
  }

  async function deleteClaud(id, options) {
    return request(`/api/claud/${encodeURIComponent(id)}`, {
      ...(options || {}),
      method: 'DELETE',
    });
  }

  async function getCachedClaudTiles() {
    const stored = await storageGet([STORAGE_KEYS.cachedClaudTiles, STORAGE_KEYS.online]);
    return {
      entries: stored[STORAGE_KEYS.cachedClaudTiles] || [],
      online: stored[STORAGE_KEYS.online] !== false,
    };
  }

  async function saveConfig(config) {
    const updates = {};
    if (config.apiBase !== undefined) {
      updates[STORAGE_KEYS.apiBase] = normalizeApiBase(config.apiBase);
    }
    if (config.apiKey !== undefined) {
      updates[STORAGE_KEYS.apiKey] = config.apiKey;
    }
    await storageSet(updates);
    return getConfig();
  }

  globalScope.MegaMindApi = {
    DEFAULT_API_BASE,
    DEFAULT_API_KEY,
    STORAGE_KEYS,
    getConfig,
    saveConfig,
    storageGet,
    storageSet,
    request,
    ping,
    listClaud,
    getClaud,
    createClaud,
    updateClaud,
    deleteClaud,
    getCachedClaudTiles,
    setOnlineState,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
