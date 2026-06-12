(function () {
  'use strict';

  const elements = {
    account: document.getElementById('account-value'),
    model: document.getElementById('model-value'),
    session: document.getElementById('session-value'),
    weekly: document.getElementById('weekly-value'),
    megamind: document.getElementById('megamind-value'),
    offlineBanner: document.getElementById('offline-banner'),
    pauseButton: document.getElementById('pause-button'),
    refreshButton: document.getElementById('refresh-button'),
    statusMessage: document.getElementById('status-message'),
    summarizePill: document.getElementById('summarize-pill'),
    summaryList: document.getElementById('summary-list'),
    emptyState: document.getElementById('empty-state'),
  };

  const state = {
    entries: [],
    online: false,
    summarizeRunning: false,
    liveStats: null,
  };

  function getRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime;
    }
    return null;
  }

  function sendMessage(message) {
    const runtime = getRuntime();
    if (!runtime || !runtime.sendMessage) {
      return Promise.resolve({ ok: false, error: 'Extension runtime unavailable' });
    }

    try {
      const response = runtime.sendMessage(message);
      if (response && typeof response.then === 'function') {
        return response.catch((error) => ({ ok: false, error: error.message }));
      }
    } catch (error) {
      return Promise.resolve({ ok: false, error: error.message });
    }

    return new Promise((resolve) => {
      runtime.sendMessage(message, (response) => {
        const lastError = runtime.lastError;
        if (lastError) {
          resolve({ ok: false, error: lastError.message });
          return;
        }
        resolve(response || { ok: true });
      });
    });
  }

  function escapeText(value) {
    return String(value || '').replace(/[&<>"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function formatStat(usage) {
    if (!usage) {
      return '0% \u00b7 resets in unknown';
    }
    return `${usage.percent || 0}% \u00b7 resets in ${usage.resetText || 'unknown'}`;
  }

  function relativeTime(value) {
    const time = new Date(value || 0).getTime();
    if (!Number.isFinite(time) || time <= 0) {
      return 'Unknown time';
    }

    const seconds = Math.max(1, Math.floor((Date.now() - time) / 1000));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days === 1) {
      return 'Yesterday';
    }
    if (days > 1) {
      return `${days} days ago`;
    }
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    return 'Just now';
  }

  function parseEntryContent(entry) {
    const content = entry && entry.content;
    if (!content || typeof content !== 'string') {
      return null;
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  function summaryTitle(entry) {
    const parsed = parseEntryContent(entry);
    return (parsed && parsed.title) || entry.title || 'Untitled Summary';
  }

  function summarySnippet(entry) {
    const parsed = parseEntryContent(entry);
    const text = (parsed && (parsed.summary || parsed.current_state || parsed.important_context)) || entry.content || '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
  }

  function summaryPayload(entry) {
    const parsed = parseEntryContent(entry);
    return parsed || entry;
  }

  function renderLiveStats() {
    const stats = state.liveStats || {};
    const usage = stats.usage || {};
    elements.account.textContent = stats.account || 'Unknown';
    elements.model.textContent = stats.model || 'Unknown';
    elements.session.textContent = formatStat(usage.session);
    elements.weekly.textContent = formatStat(usage.weekly);

    const dot = document.createElement('span');
    dot.className = `status-dot ${state.online ? 'online' : 'offline'}`;
    elements.megamind.replaceChildren(dot, document.createTextNode(state.online ? ' Online' : ' Offline'));
    elements.offlineBanner.classList.toggle('hidden', state.online);
    elements.summarizePill.classList.toggle('hidden', !state.summarizeRunning);
    elements.pauseButton.disabled = state.summarizeRunning;
  }

  function appendTextElement(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderSummaries() {
    elements.summaryList.replaceChildren();
    const entries = state.entries || [];
    elements.emptyState.classList.toggle('hidden', entries.length > 0);

    entries.slice(0, 10).forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `summary-tile${state.summarizeRunning ? ' tile-busy' : ''}`;
      button.dataset.entryId = entry.id;

      const icon = document.createElement('span');
      icon.className = 'tile-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\ud83d\udcc4';

      const main = document.createElement('span');
      main.className = 'tile-main';
      appendTextElement(main, 'span', 'tile-title', summaryTitle(entry));
      appendTextElement(main, 'span', 'tile-snippet', `"${summarySnippet(entry)}"`);
      appendTextElement(main, 'span', 'tile-time', relativeTime(entry.updated_at || entry.created_at));

      const spinner = document.createElement('span');
      spinner.className = 'tile-spinner';
      spinner.setAttribute('aria-hidden', 'true');

      button.append(icon, main, spinner);
      button.addEventListener('click', () => resumeFromEntry(entry));
      elements.summaryList.appendChild(button);
    });
  }

  function render() {
    renderLiveStats();
    renderSummaries();
  }

  function setStatus(message, isError) {
    elements.statusMessage.textContent = message || '';
    elements.statusMessage.classList.toggle('error', Boolean(isError));
  }

  async function loadState() {
    const popupState = await sendMessage({ type: 'MEGAMIND_GET_POPUP_STATE' });
    if (popupState.ok === false && popupState.error) {
      state.online = false;
      setStatus(popupState.error, true);
      render();
      return;
    }
    state.entries = popupState.entries || [];
    state.online = popupState.online !== false;
    state.liveStats = popupState.liveStats || null;
    state.summarizeRunning = Boolean(popupState.summarizeRunning);
    if (popupState.summarizeError) {
      setStatus(popupState.summarizeError, true);
    }
    render();
  }

  async function refreshTiles() {
    setStatus('Refreshing summaries...', false);
    const result = await sendMessage({ type: 'MEGAMIND_REFRESH_TILES' });
    state.entries = result.entries || state.entries;
    state.online = !result.offline && result.ok !== false;
    setStatus(result.offline ? 'MegaMind Offline \u2014 cached tiles' : 'Summaries refreshed', Boolean(result.offline));
    render();
  }

  async function pauseNow() {
    state.summarizeRunning = true;
    setStatus('Scraping Claude and summarizing...', false);
    render();
    const result = await sendMessage({ type: 'MEGAMIND_POPUP_PAUSE_NOW' });
    if (result && result.ok === false) {
      state.summarizeRunning = false;
      setStatus(result.error || 'Could not pause active Claude tab', true);
      render();
    }
  }

  async function resumeFromEntry(entry) {
    setStatus('Pasting resume prompt into Claude...', false);
    const result = await sendMessage({
      type: 'MEGAMIND_RESUME_SUMMARY',
      summary: summaryPayload(entry),
    });
    setStatus(result && result.ok === false ? (result.error || 'Could not send resume prompt') : 'Resume prompt sent', result && result.ok === false);
  }

  function handleRuntimeMessage(message) {
    if (!message || !message.type) {
      return;
    }

    if (message.type === 'MEGAMIND_TILES_UPDATED') {
      state.entries = message.entries || [];
      state.online = !message.offline && !message.cached;
      setStatus(message.offline ? 'MegaMind Offline \u2014 cached tiles' : '', Boolean(message.offline));
      render();
    }

    if (message.type === 'MEGAMIND_SUMMARIZE_STATUS') {
      state.summarizeRunning = Boolean(message.running);
      render();
    }

    if (message.type === 'MEGAMIND_SUMMARY_CREATED') {
      state.summarizeRunning = false;
      state.online = true;
      setStatus('Summary saved to MegaMind', false);
      render();
    }

    if (message.type === 'MEGAMIND_SUMMARY_FAILED') {
      state.summarizeRunning = false;
      state.online = false;
      setStatus(message.error || 'Summarize failed', true);
      render();
    }

    if (message.type === 'MEGAMIND_POPUP_STATS_UPDATE') {
      state.liveStats = message.stats || null;
      render();
    }

    if (message.type === 'MEGAMIND_POPUP_WARNING') {
      setStatus('Claude usage is above 85%. Consider pausing soon.', true);
    }
  }

  function start() {
    elements.pauseButton.addEventListener('click', pauseNow);
    elements.refreshButton.addEventListener('click', refreshTiles);

    const runtime = getRuntime();
    if (runtime && runtime.onMessage && runtime.onMessage.addListener) {
      runtime.onMessage.addListener(handleRuntimeMessage);
    }

    loadState();
    sendMessage({ type: 'MEGAMIND_GET_SUMMARIZE_STATUS' });
  }

  start();
})();
