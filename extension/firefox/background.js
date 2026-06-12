try {
  importScripts('../shared/megamind.js', '../shared/summarize.js');
} catch (error) {
  importScripts('shared/megamind.js', 'shared/summarize.js');
}

const CLAUD_POLL_ALARM = 'megamind-poll-claud';
const CLAUD_POLL_MINUTES = 5;

const STORAGE_KEYS = {
  liveStats: 'megamindLiveStats',
  lastWarning: 'megamindLastWarning',
  summarizeRunning: 'megamindSummarizeRunning',
  summarizeError: 'megamindSummarizeError',
  lastSummary: 'megamindLastSummary',
  lastSyncReason: 'megamindLastSyncReason',
  lastRefreshAt: 'megamindLastRefreshAt',
};

function getExtensionApi() {
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser;
  }
  return chrome;
}

function storageGet(keys) {
  return MegaMindApi.storageGet(keys);
}

function storageSet(items) {
  return MegaMindApi.storageSet(items);
}

function sendRuntimeMessage(message) {
  const api = getExtensionApi();
  if (!api || !api.runtime || !api.runtime.sendMessage) {
    return;
  }

  try {
    const response = api.runtime.sendMessage(message);
    if (response && typeof response.catch === 'function') {
      response.catch(() => undefined);
    }
  } catch (error) {
    // Popup may not be open; broadcasts are best-effort.
  }
}

function queryActiveClaudeTab() {
  const api = getExtensionApi();
  return new Promise((resolve) => {
    if (!api.tabs || !api.tabs.query) {
      resolve(null);
      return;
    }

    const query = { active: true, currentWindow: true };
    try {
      const result = api.tabs.query(query);
      if (result && typeof result.then === 'function') {
        result.then((tabs) => resolve((tabs || []).find((tab) => tab.url && tab.url.startsWith('https://claude.ai/')) || null)).catch(() => resolve(null));
        return;
      }
    } catch (error) {
      // Callback path below handles Chrome MV3.
    }

    api.tabs.query(query, (tabs) => {
      resolve((tabs || []).find((tab) => tab.url && tab.url.startsWith('https://claude.ai/')) || null);
    });
  });
}

function sendTabMessage(tabId, message) {
  const api = getExtensionApi();
  return new Promise((resolve) => {
    if (!api.tabs || !api.tabs.sendMessage || tabId === undefined || tabId === null) {
      resolve({ ok: false, error: 'No active Claude tab' });
      return;
    }

    try {
      const result = api.tabs.sendMessage(tabId, message);
      if (result && typeof result.then === 'function') {
        result.then((response) => resolve(response || { ok: true })).catch((error) => resolve({ ok: false, error: error.message }));
        return;
      }
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }

    api.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = api.runtime && api.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, error: runtimeError.message });
        return;
      }
      resolve(response || { ok: true });
    });
  });
}

async function refreshClaudTiles(reason) {
  try {
    const entries = await MegaMindApi.listClaud();
    await storageSet({
      [STORAGE_KEYS.lastRefreshAt]: new Date().toISOString(),
      [STORAGE_KEYS.summarizeError]: '',
    });
    sendRuntimeMessage({
      type: 'MEGAMIND_TILES_UPDATED',
      entries,
      cached: false,
      reason: reason || 'poll',
    });
    return { ok: true, entries, cached: false };
  } catch (error) {
    const cached = await MegaMindApi.getCachedClaudTiles();
    await storageSet({
      [MegaMindApi.STORAGE_KEYS.online]: false,
      [STORAGE_KEYS.summarizeError]: error.message || 'MegaMind offline',
    });
    sendRuntimeMessage({
      type: 'MEGAMIND_TILES_UPDATED',
      entries: cached.entries,
      cached: true,
      offline: true,
      error: error.message,
      reason: reason || 'poll',
    });
    return { ok: false, entries: cached.entries, cached: true, offline: true, error: error.message };
  }
}

async function updateSummarizeStatus() {
  try {
    const status = await MegaMindSummarize.getStatus();
    await storageSet({
      [STORAGE_KEYS.summarizeRunning]: Boolean(status.running),
      [MegaMindApi.STORAGE_KEYS.online]: true,
    });
    sendRuntimeMessage({ type: 'MEGAMIND_SUMMARIZE_STATUS', running: Boolean(status.running) });
    return status;
  } catch (error) {
    await storageSet({
      [STORAGE_KEYS.summarizeRunning]: false,
      [MegaMindApi.STORAGE_KEYS.online]: false,
      [STORAGE_KEYS.summarizeError]: error.message || 'MegaMind offline',
    });
    sendRuntimeMessage({ type: 'MEGAMIND_SUMMARIZE_STATUS', running: false, offline: true, error: error.message });
    return { running: false, offline: true, error: error.message };
  }
}

async function summarizeConversation(conversationText, stats, reason) {
  if (!conversationText || !conversationText.trim()) {
    return { ok: false, error: 'No conversation text to summarize' };
  }

  await storageSet({
    [STORAGE_KEYS.summarizeRunning]: true,
    [STORAGE_KEYS.summarizeError]: '',
    [STORAGE_KEYS.lastSyncReason]: reason || 'pause',
  });
  sendRuntimeMessage({ type: 'MEGAMIND_SUMMARIZE_STATUS', running: true, reason });

  try {
    const summary = await MegaMindSummarize.summarizeConversation(conversationText);
    await storageSet({
      [STORAGE_KEYS.summarizeRunning]: false,
      [STORAGE_KEYS.lastSummary]: summary,
      [MegaMindApi.STORAGE_KEYS.online]: true,
    });
    sendRuntimeMessage({ type: 'MEGAMIND_SUMMARY_CREATED', summary, stats, reason });
    await refreshClaudTiles('summary-created');
    return { ok: true, summary };
  } catch (error) {
    await storageSet({
      [STORAGE_KEYS.summarizeRunning]: false,
      [STORAGE_KEYS.summarizeError]: error.message || 'Summarize failed',
      [MegaMindApi.STORAGE_KEYS.online]: false,
    });
    sendRuntimeMessage({
      type: 'MEGAMIND_SUMMARY_FAILED',
      error: error.message || 'Summarize failed',
      stats,
      reason,
    });
    return { ok: false, error: error.message || 'Summarize failed' };
  }
}

async function getPopupState() {
  const stored = await storageGet([
    MegaMindApi.STORAGE_KEYS.cachedClaudTiles,
    MegaMindApi.STORAGE_KEYS.online,
    STORAGE_KEYS.liveStats,
    STORAGE_KEYS.lastWarning,
    STORAGE_KEYS.summarizeRunning,
    STORAGE_KEYS.summarizeError,
    STORAGE_KEYS.lastSummary,
    STORAGE_KEYS.lastRefreshAt,
  ]);
  return {
    entries: stored[MegaMindApi.STORAGE_KEYS.cachedClaudTiles] || [],
    online: stored[MegaMindApi.STORAGE_KEYS.online] !== false,
    liveStats: stored[STORAGE_KEYS.liveStats] || null,
    lastWarning: stored[STORAGE_KEYS.lastWarning] || null,
    summarizeRunning: Boolean(stored[STORAGE_KEYS.summarizeRunning]),
    summarizeError: stored[STORAGE_KEYS.summarizeError] || '',
    lastSummary: stored[STORAGE_KEYS.lastSummary] || null,
    lastRefreshAt: stored[STORAGE_KEYS.lastRefreshAt] || '',
  };
}

async function pauseActiveClaudeTab() {
  const tab = await queryActiveClaudeTab();
  if (!tab) {
    return { ok: false, error: 'No active Claude tab' };
  }
  return sendTabMessage(tab.id, { type: 'MEGAMIND_PAUSE_NOW' });
}

async function insertResumePrompt(summary) {
  const tab = await queryActiveClaudeTab();
  if (!tab) {
    return { ok: false, error: 'No active Claude tab' };
  }

  const prompt = `Here is the context from my previous session. Read it carefully and continue from where we left off: ${JSON.stringify(summary)}`;
  return sendTabMessage(tab.id, {
    type: 'MEGAMIND_INSERT_AND_SEND',
    prompt,
  });
}

function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'MEGAMIND_STATS_UPDATE') {
    storageSet({ [STORAGE_KEYS.liveStats]: message.stats || null });
    sendRuntimeMessage({ type: 'MEGAMIND_POPUP_STATS_UPDATE', stats: message.stats || null });
    return false;
  }

  if (message.type === 'MEGAMIND_USAGE_WARNING') {
    const warning = {
      threshold: message.threshold,
      stats: message.stats || null,
      createdAt: new Date().toISOString(),
    };
    storageSet({ [STORAGE_KEYS.lastWarning]: warning });
    sendRuntimeMessage({ type: 'MEGAMIND_POPUP_WARNING', warning });
    return false;
  }

  if (message.type === 'MEGAMIND_PAUSE_TRIGGERED') {
    summarizeConversation(message.conversationText || '', message.stats || null, message.reason || 'pause')
      .then(sendResponse);
    return true;
  }

  if (message.type === 'MEGAMIND_GET_POPUP_STATE') {
    getPopupState().then(sendResponse);
    return true;
  }

  if (message.type === 'MEGAMIND_REFRESH_TILES') {
    refreshClaudTiles('manual').then(sendResponse);
    return true;
  }

  if (message.type === 'MEGAMIND_GET_SUMMARIZE_STATUS') {
    updateSummarizeStatus().then(sendResponse);
    return true;
  }

  if (message.type === 'MEGAMIND_POPUP_PAUSE_NOW') {
    pauseActiveClaudeTab().then(sendResponse);
    return true;
  }

  if (message.type === 'MEGAMIND_RESUME_SUMMARY') {
    insertResumePrompt(message.summary).then(sendResponse);
    return true;
  }

  return false;
}

function setupPolling() {
  const api = getExtensionApi();
  if (api.alarms && api.alarms.create) {
    api.alarms.create(CLAUD_POLL_ALARM, { periodInMinutes: CLAUD_POLL_MINUTES });
    api.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === CLAUD_POLL_ALARM) {
        refreshClaudTiles('alarm');
        updateSummarizeStatus();
      }
    });
  } else {
    setInterval(() => {
      refreshClaudTiles('timer');
      updateSummarizeStatus();
    }, CLAUD_POLL_MINUTES * 60 * 1000);
  }
}

function start() {
  const api = getExtensionApi();
  api.runtime.onMessage.addListener(handleMessage);

  if (api.runtime.onInstalled && api.runtime.onInstalled.addListener) {
    api.runtime.onInstalled.addListener(() => {
      refreshClaudTiles('installed');
      updateSummarizeStatus();
    });
  }

  if (api.runtime.onStartup && api.runtime.onStartup.addListener) {
    api.runtime.onStartup.addListener(() => {
      refreshClaudTiles('startup');
      updateSummarizeStatus();
    });
  }

  setupPolling();
  refreshClaudTiles('boot');
  updateSummarizeStatus();
}

start();
