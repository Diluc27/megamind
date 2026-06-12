console.log('[MegaMind] content.js loaded v2');

(function () {
  'use strict';

  const BAR_ID = 'megamind-claude-usage-bar';
  const SYNC_PHRASE = 'synctomega';
  const SESSION_WARNING_THRESHOLD = 85;
  const SESSION_PAUSE_THRESHOLD = 95;
  const USAGE_POLL_MS = 60000;
  const DOM_SCAN_MS = 800;

  const state = {
    account: 'Unknown',
    model: 'Unknown',
    orgId: '',
    title: '',
    conversationId: '',
    orgFromSSE: '',
    usage: {
      session: { percent: 0, resetText: 'unknown' },
      weekly: { percent: 0, resetText: 'unknown' },
    },
    warningSent: false,
    pauseTriggered: false,
    syncPhraseSeen: false,
    usageTimer: null,
    domTimer: null,
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

  function sendRuntimeMessage(message) {
    const runtime = getRuntime();
    if (!runtime || !runtime.sendMessage) {
      return Promise.resolve();
    }

    try {
      const response = runtime.sendMessage(message);
      if (response && typeof response.then === 'function') {
        return response.catch(() => undefined);
      }
    } catch (error) {
      return Promise.resolve();
    }

    return Promise.resolve();
  }

  function clampPercent(value) {
    const number = parseNumeric(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function parseNumeric(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const match = value.match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : Number.NaN;
    }
    return Number(value);
  }

  function firstValue(object, keys) {
    if (!object || typeof object !== 'object') {
      return undefined;
    }
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null) {
        return object[key];
      }
    }
    return undefined;
  }

  function percentFromUsage(value) {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return clampPercent(value <= 1 ? value * 100 : value);
    }
    if (typeof value !== 'object') {
      return 0;
    }

    const direct = firstValue(value, [
      'percent',
      'percentage',
      'used_percent',
      'usedPercentage',
      'usage_percent',
      'usagePercentage',
      'percent_used',
      'percentUsed',
      'utilization',
      'ratio',
    ]);
    if (direct !== undefined) {
      const number = parseNumeric(direct);
      return clampPercent(number <= 1 ? number * 100 : number);
    }

    const used = firstValue(value, [
      'used',
      'current',
      'count',
      'messages_used',
      'messagesUsed',
      'used_messages',
      'usedMessages',
      'message_count',
      'messageCount',
      'num_messages',
      'numMessages',
    ]);
    const limit = firstValue(value, [
      'limit',
      'max',
      'total',
      'messages_limit',
      'messagesLimit',
      'limit_messages',
      'limitMessages',
      'max_messages',
      'maxMessages',
      'quota',
      'allowed',
    ]);
    if (Number.isFinite(parseNumeric(used)) && parseNumeric(limit) > 0) {
      return clampPercent((parseNumeric(used) / parseNumeric(limit)) * 100);
    }

    const remaining = firstValue(value, [
      'remaining',
      'messages_remaining',
      'messagesRemaining',
      'remaining_messages',
      'remainingMessages',
      'available',
    ]);
    if (Number.isFinite(parseNumeric(remaining)) && parseNumeric(limit) > 0) {
      return clampPercent(((parseNumeric(limit) - parseNumeric(remaining)) / parseNumeric(limit)) * 100);
    }

    return 0;
  }

  function formatResetText(value) {
    if (!value) {
      return 'unknown';
    }
    if (typeof value === 'string' && /^\d+[dhms]/i.test(value.trim())) {
      return value.trim();
    }

    const resetDate = value instanceof Date ? value : new Date(value);
    const ms = resetDate.getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) {
      return 'soon';
    }

    const minutes = Math.ceil(ms / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  function resetFromUsage(value) {
    if (!value || typeof value !== 'object') {
      return 'unknown';
    }
    return formatResetText(
      firstValue(value, [
        'reset_at',
        'resets_at',
        'resetAt',
        'resetsAt',
        'next_reset',
        'nextReset',
        'reset_in',
        'resetIn',
        'resets_in',
        'resetsIn',
        'expires_at',
        'expiresAt',
      ])
    );
  }

  function hasUsageFields(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return [
      'percent',
      'percentage',
      'used_percent',
      'usedPercentage',
      'usage_percent',
      'usagePercentage',
      'used',
      'current',
      'count',
      'messages_used',
      'messagesUsed',
      'remaining',
      'messages_remaining',
      'messagesRemaining',
      'limit',
      'max',
      'total',
      'messages_limit',
      'messagesLimit',
    ].some((key) => value[key] !== undefined && value[key] !== null);
  }

  function scoreUsagePath(path, kind) {
    const text = path.join('.').toLowerCase();
    const weeklyTerms = ['weekly', 'week', 'longterm', 'long_term', 'long-term'];
    const sessionTerms = ['session', 'shortterm', 'short_term', 'short-term', 'fivehour', 'five_hour', 'five-hour', 'rolling', 'message_limit', 'messagelimit', 'conversation'];
    const preferredTerms = kind === 'weekly' ? weeklyTerms : sessionTerms;
    const blockedTerms = kind === 'weekly' ? sessionTerms : weeklyTerms;
    let score = 0;

    preferredTerms.forEach((term) => {
      if (text.includes(term)) {
        score += 6;
      }
    });
    blockedTerms.forEach((term) => {
      if (text.includes(term)) {
        score -= 10;
      }
    });
    if (text.endsWith(kind)) {
      score += 4;
    }
    return score;
  }

  function findUsageCandidate(payload, kind) {
    const candidates = [];
    const seen = new Set();

    function walk(value, path, depth) {
      if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) {
        return;
      }
      seen.add(value);

      if (hasUsageFields(value)) {
        candidates.push({ value, score: scoreUsagePath(path, kind) });
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, path.concat(String(index)), depth + 1));
        return;
      }

      Object.entries(value).forEach(([key, child]) => {
        if (child && typeof child === 'object') {
          walk(child, path.concat(key), depth + 1);
        }
      });
    }

    walk(payload, [], 0);
    candidates.sort((a, b) => b.score - a.score);
    return candidates.find((candidate) => candidate.score > 0)?.value || null;
  }

  function normalizeUsage(payload) {
    // Primary: known Claude shape with five_hour/seven_day
    if (payload && (payload.five_hour || payload.seven_day)) {
      return {
        session: {
          percent: Math.round(payload.five_hour?.utilization || 0),
          resetText: formatResetText(payload.five_hour?.resets_at || null),
        },
        weekly: {
          percent: Math.round(payload.seven_day?.utilization || 0),
          resetText: formatResetText(payload.seven_day?.resets_at || null),
        },
      };
    }

    // Fallback: generic field search for unknown shapes
    const messageLimit = payload && (payload.message_limit || payload.messageLimit || payload.messages || payload.limits);
    const session = findUsageCandidate(payload, 'session') ||
      (payload && (payload.session || payload.session_limit || payload.sessionLimit || payload.short_term || payload.shortTerm || payload.five_hour || payload.fiveHour || payload.rolling)) ||
      (messageLimit && (messageLimit.session || messageLimit.conversation || messageLimit.short_term)) ||
      messageLimit ||
      payload ||
      {};
    const weekly = findUsageCandidate(payload, 'weekly') ||
      (payload && (payload.weekly || payload.weekly_limit || payload.weeklyLimit || payload.week || payload.long_term || payload.longTerm)) ||
      (messageLimit && (messageLimit.weekly || messageLimit.long_term)) ||
      {};

    return {
      session: {
        percent: percentFromUsage(session),
        resetText: resetFromUsage(session),
      },
      weekly: {
        percent: percentFromUsage(weekly),
        resetText: resetFromUsage(weekly),
      },
    };
  }

  function createUsageSegment(label, usage, type) {
    const percent = usage.percent || 0;
    const segment = document.createElement('span');
    segment.className = `megamind-usage-segment megamind-${type}-segment`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'megamind-usage-label';
    labelSpan.textContent = `${label}:`;

    const percentSpan = document.createElement('span');
    percentSpan.className = 'megamind-usage-percent';
    percentSpan.textContent = `${percent}%`;

    const track = document.createElement('span');
    track.className = 'megamind-usage-track';

    const fill = document.createElement('span');
    fill.className = 'megamind-usage-fill';
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;

    const value = document.createElement('span');
    value.className = 'megamind-usage-value';
    value.textContent = `\u00b7 resets in ${usage.resetText || 'unknown'}`;

    track.appendChild(fill);
    segment.append(labelSpan, percentSpan, document.createTextNode(' '), track, document.createTextNode(' '), value);
    return segment;
  }

  function findComposer() {
    const candidates = [
      '[data-testid="chat-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      'textarea',
    ];
    for (const selector of candidates) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function findComposerContainer(composer) {
    if (!composer) {
      return null;
    }
    return composer.closest('form') || composer.closest('[data-testid*="composer"]') || composer.parentElement;
  }

  function ensureUsageBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) {
      return bar;
    }

    const composer = findComposer();
    if (!composer) return null;

    // Walk up from composer to find the outermost rounded composer container
    var target = composer;
    for (var i = 0; i < 8; i++) {
      var parent = target.parentElement;
      if (!parent) break;
      var style = window.getComputedStyle(parent);
      if (parent.tagName === 'MAIN' ||
          parent.getAttribute('role') === 'main' ||
          (parseFloat(style.borderRadius) > 8 && parent.offsetWidth > 400)) {
        break;
      }
      target = parent;
    }

    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'megamind-usage-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    target.insertAdjacentElement('afterend', bar);
    console.log('[MegaMind] bar inserted after:', target.tagName, (target.className || '').slice(0, 60), 'offsetWidth:', target.offsetWidth);
    return bar;
  }

  function renderUsageBar() {
    const bar = ensureUsageBar();
    if (!bar) {
      return;
    }

    const sessionPercent = state.usage.session.percent;
    bar.classList.toggle('megamind-usage-warn', sessionPercent >= SESSION_WARNING_THRESHOLD);
    bar.classList.toggle('megamind-usage-critical', sessionPercent >= SESSION_PAUSE_THRESHOLD);
    bar.replaceChildren(
      createUsageSegment('Session', state.usage.session, 'session'),
      createUsageSegment('Weekly', state.usage.weekly, 'weekly')
    );
  }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element && (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim();
      if (text) {
        return text.replace(/\s+/g, ' ');
      }
    }
    return '';
  }

  function detectAccount() {
    const fromDom = textFromSelectors([
      '[data-testid*="account"]',
      '[data-testid*="profile"]',
      'button[aria-label*="Account"]',
      'button[aria-label*="account"]',
      'button[aria-label*="Profile"]',
      'button[aria-label*="profile"]',
      'img[alt*="Avatar"]',
    ]);
    if (fromDom) {
      return fromDom;
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!/user|account|profile/i.test(key)) {
        continue;
      }
      const value = localStorage.getItem(key) || '';
      const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (emailMatch) {
        return emailMatch[0];
      }
    }

    return 'Unknown';
  }

  function detectModel() {
    const text = textFromSelectors([
      '[data-testid*="model"]',
      'button[aria-label*="model"]',
      'button[aria-label*="Model"]',
    ]);
    const pageText = text || ((document.body.innerText || document.body.textContent || '').slice(0, 5000));
    const match = pageText.match(/(Opus|Sonnet|Haiku)\s*(?:[0-9.]+)?/i);
    return match ? match[0].replace(/\s+/g, ' ') : 'Unknown';
  }

  function detectConversationTitle() {
    const heading = textFromSelectors(['main h1', 'h1', '[data-testid*="conversation-title"]']);
    const title = heading || document.title.replace(/\s*[|\-]\s*Claude.*$/i, '').replace(/^Claude\s*[|\-]\s*/i, '').trim();
    return title || 'Untitled Claude Conversation';
  }

  function detectConversationId() {
    const match = window.location.pathname.match(/\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function scanLocalStorageForOrgId() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      const value = localStorage.getItem(key) || '';
      if (!/org|organization|account/i.test(`${key} ${value}`)) {
        continue;
      }
      const uuid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuid) {
        return uuid[0];
      }
    }
    return '';
  }

  async function detectOrganizationId() {
    if (state.orgId) {
      return state.orgId;
    }

    // Wait up to 2s for SSE interceptor to detect the real org
    if (!state.orgFromSSE) {
      for (var _i = 0; _i < 20; _i++) {
        await new Promise(function(r) { return setTimeout(r, 100); });
        if (state.orgFromSSE) break;
      }
    }

    // Prefer orgId extracted from SSE URL (most reliable)
    if (state.orgFromSSE) {
      state.orgId = state.orgFromSSE;
      console.log('[MegaMind] orgId from SSE URL:', state.orgId);
      return state.orgId;
    }

    const localOrgId = scanLocalStorageForOrgId();
    if (localOrgId) {
      state.orgId = localOrgId;
      console.log('[MegaMind] orgId from localStorage:', localOrgId);
      return state.orgId;
    }

    try {
      const response = await fetch('/api/organizations', { credentials: 'include' });
      console.log('[MegaMind] /api/organizations status:', response.status);
      const responseClone = response.clone();
      const rawText = await responseClone.text();
      console.log('[MegaMind] /api/organizations raw body:', rawText);
      if (!response.ok) {
        return '';
      }
      const payload = JSON.parse(rawText);
      const organizations = Array.isArray(payload) ? payload : payload.organizations || payload.data || [];
      const active = organizations.find((org) => org.active || org.is_active || org.default) || organizations[0];
      state.orgId = active && (active.uuid || active.id || active.organization_uuid || active.organization_id) || '';
      console.log('[MegaMind] orgId from /api/organizations:', state.orgId);
      console.log('[MegaMind] active org object:', active);
      return state.orgId;
    } catch (error) {
      return '';
    }
  }

  function updatePageState() {
    const previousConversationId = state.conversationId;
    state.account = detectAccount();
    state.model = detectModel();
    state.title = detectConversationTitle();
    state.conversationId = detectConversationId();
    if (previousConversationId && state.conversationId && previousConversationId !== state.conversationId) {
      state.warningSent = false;
      state.pauseTriggered = false;
      state.syncPhraseSeen = false;
    }
  }

  async function fetchUsage() {
    const orgId = await detectOrganizationId();
    if (!orgId) {
      renderUsageBar();
      return;
    }

    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/usage`, { credentials: 'include' });
      console.log('[MegaMind] /api/organizations/{org}/usage status:', response.status);
      if (response.ok) {
        const payload = await response.json();
        console.log('[MegaMind] usage raw body:', JSON.stringify(payload).slice(0, 500));
        console.log('[MegaMind] normalized:', JSON.stringify(normalizeUsage(payload)));
        handleUsagePayload(payload);
        return;
      }
    } catch (error) {
      console.log('[MegaMind] /api/organizations/{org}/usage error:', error.message);
    }

    renderUsageBar();
  }

  function handleUsagePayload(payload) {
    state.usage = normalizeUsage(payload);
    renderUsageBar();
    sendStatsUpdate();
    evaluateThresholds();
  }

  function sendStatsUpdate() {
    sendRuntimeMessage({
      type: 'MEGAMIND_STATS_UPDATE',
      stats: {
        account: state.account,
        model: state.model,
        title: state.title,
        conversationId: state.conversationId,
        url: window.location.href,
        usage: state.usage,
      },
    });
  }

  function evaluateThresholds() {
    const sessionPercent = state.usage.session.percent;
    if (sessionPercent >= SESSION_WARNING_THRESHOLD && !state.warningSent) {
      state.warningSent = true;
      sendRuntimeMessage({
        type: 'MEGAMIND_USAGE_WARNING',
        threshold: SESSION_WARNING_THRESHOLD,
        stats: snapshotStats(),
      });
    }

    if (sessionPercent >= SESSION_PAUSE_THRESHOLD) {
      triggerPauseFlow('usage-95-percent');
    }
  }

  function collectConversationNodes() {
    const selectors = [
      '[data-testid*="conversation"] article',
      'main article',
      '[data-testid*="message"]',
      '[class*="font-claude-message"]',
      'main [role="listitem"]',
    ];
    const nodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const text = (node.innerText || node.textContent || '').trim();
        if (text.length < 2 || seen.has(text)) {
          return;
        }
        seen.add(text);
        nodes.push(node);
      });
      if (nodes.length > 0) {
        break;
      }
    }
    return nodes;
  }

  function scrapeConversation() {
    updatePageState();
    const nodes = collectConversationNodes();
    const messages = nodes.map((node, index) => {
      const roleText = node.getAttribute('data-testid') || node.getAttribute('aria-label') || '';
      const role = /human|user/i.test(roleText) ? 'User' : /assistant|claude/i.test(roleText) ? 'Claude' : `Message ${index + 1}`;
      const text = (node.innerText || node.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      return `${role}:\n${text}`;
    }).filter(Boolean);

    const fallback = messages.length > 0 ? '' : (document.querySelector('main') || document.body).innerText;
    return [
      `Title: ${state.title}`,
      `Account: ${state.account}`,
      `Model: ${state.model}`,
      `URL: ${window.location.href}`,
      `Conversation ID: ${state.conversationId || 'unknown'}`,
      '',
      messages.join('\n\n---\n\n') || fallback,
    ].join('\n');
  }

  function getAllTextWithShadows(root) {
    const parts = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent;
        if (t) parts.push(t);
        return;
      }
      if (node.shadowRoot) {
        // Inside shadow DOM, collect the full inner text
        const shadowText = node.shadowRoot.textContent;
        if (shadowText) parts.push(shadowText);
        walk(node.shadowRoot);
      }
      if (node.tagName === 'IFRAME') {
        try {
          const doc = node.contentDocument || node.contentWindow?.document;
          if (doc) walk(doc.body);
        } catch {
          // Cross-origin iframe — skip
        }
        return;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
    walk(root);
    return parts.join('\n');
  }

  function parseUsageFromDom() {
    // Use textContent (includes hidden elements) + shadow DOM walk
    const bodyText = getAllTextWithShadows(document.body) || document.body.textContent || '';
    const lines = bodyText.split('\n').filter((l) => l.trim());
    const firstChars = bodyText.substring(0, 200).replace(/\n/g, '\\n');
    console.log('[MegaMind] DOM text sample:', firstChars);

    let sessionPercent = null;
    let weeklyPercent = null;
    let sessionReset = null;
    let weeklyReset = null;

    function extractReset(text) {
      const m = text.match(/resets?\s+in\s+([^)\n.]+?)(?:\s*[).\n]|$)/i);
      return m ? m[1].trim().replace(/\s+/g, ' ') : null;
    }

    // Find all segments in the full body text (both may be on one line)
    const sessionSeg = bodyText.match(/(?:Session|session)\s*[:\s\u00b7\u2022]\s*(\d{1,3})\s*%/);
    if (sessionSeg) {
      sessionPercent = parseInt(sessionSeg[1], 10);
      const afterSession = bodyText.slice(bodyText.indexOf(sessionSeg[0]) + sessionSeg[0].length);
      sessionReset = extractReset(afterSession);
    }

    const weeklySeg = bodyText.match(/(?:Weekly|weekly|Week|week)\s*[:\s\u00b7\u2022]\s*(\d{1,3})\s*%/);
    if (weeklySeg) {
      weeklyPercent = parseInt(weeklySeg[1], 10);
      const afterWeekly = bodyText.slice(bodyText.indexOf(weeklySeg[0]) + weeklySeg[0].length);
      weeklyReset = extractReset(afterWeekly);
    }

    // Fallback: line-by-line search if full-body match failed
    if (sessionPercent === null || weeklyPercent === null) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (sessionPercent === null) {
          const m = trimmed.match(/(?:Session|session)\D*?(\d{1,3})\s*%/);
          if (m) {
            sessionPercent = parseInt(m[1], 10);
            sessionReset = extractReset(trimmed);
          }
        }
        if (weeklyPercent === null) {
          const m = trimmed.match(/(?:Weekly|weekly|Week|week)\D*?(\d{1,3})\s*%/);
          if (m) {
            weeklyPercent = parseInt(m[1], 10);
            weeklyReset = extractReset(trimmed);
          }
        }
        if (sessionPercent !== null && weeklyPercent !== null) break;
      }
    }

    const changed = (
      (sessionPercent !== null && sessionPercent !== state.usage.session.percent) ||
      (weeklyPercent !== null && weeklyPercent !== state.usage.weekly.percent) ||
      (sessionReset !== null && sessionReset !== state.usage.session.resetText) ||
      (weeklyReset !== null && weeklyReset !== state.usage.weekly.resetText)
    );

    if (changed) {
      if (sessionPercent !== null) {
        state.usage.session.percent = sessionPercent;
      }
      if (weeklyPercent !== null) {
        state.usage.weekly.percent = weeklyPercent;
      }
      if (sessionReset !== null) {
        state.usage.session.resetText = sessionReset;
      }
      if (weeklyReset !== null) {
        state.usage.weekly.resetText = weeklyReset;
      }
      console.log('[MegaMind] DOM usage parsed:', JSON.stringify(state.usage));
    }

    return changed;
  }

  function snapshotStats() {
    return {
      account: state.account,
      model: state.model,
      title: state.title,
      conversationId: state.conversationId,
      url: window.location.href,
      usage: state.usage,
    };
  }

  function triggerPauseFlow(reason) {
    if (state.pauseTriggered) {
      return;
    }
    state.pauseTriggered = true;
    const conversationText = scrapeConversation();
    sendRuntimeMessage({
      type: 'MEGAMIND_PAUSE_TRIGGERED',
      reason,
      conversationText,
      stats: snapshotStats(),
    });
  }

  function scanForSyncPhrase() {
    if (state.syncPhraseSeen) {
      return;
    }
    const main = document.querySelector('main') || document.body;
    const text = (main.innerText || main.textContent || '').toLowerCase();
    if (!text.includes(SYNC_PHRASE)) {
      return;
    }
    state.syncPhraseSeen = true;
    sendRuntimeMessage({
      type: 'MEGAMIND_SYNCTOMEGA_DETECTED',
      stats: snapshotStats(),
    });
    triggerPauseFlow('synctomega');
  }

  function setComposerText(text) {
    const composer = findComposer();
    if (!composer) {
      return false;
    }

    composer.focus();
    if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
      composer.value = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    composer.textContent = text;
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }

  function submitComposer() {
    const composer = findComposer();
    const container = findComposerContainer(composer);
    const sendButton = container && container.querySelector('button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]');
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
      return true;
    }
    if (composer) {
      composer.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
      }));
      return true;
    }
    return false;
  }

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === 'MEGAMIND_PAUSE_NOW') {
      triggerPauseFlow('manual');
      sendResponse && sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'MEGAMIND_SCRAPE_CONVERSATION') {
      sendResponse && sendResponse({ ok: true, conversationText: scrapeConversation(), stats: snapshotStats() });
      return false;
    }

    if (message.type === 'MEGAMIND_INSERT_AND_SEND') {
      const inserted = setComposerText(message.prompt || '');
      window.setTimeout(() => {
        const sent = inserted && submitComposer();
        sendResponse && sendResponse({ ok: inserted && sent });
      }, 100);
      return true;
    }

    return false;
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      window.clearTimeout(state.domTimer);
      state.domTimer = window.setTimeout(() => {
        updatePageState();
        parseUsageFromDom();
        renderUsageBar();
        scanForSyncPhrase();
      }, DOM_SCAN_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function start() {
    updatePageState();
    parseUsageFromDom();
    renderUsageBar();
    fetchUsage();
    observeDom();
    scanForSyncPhrase();
    state.usageTimer = window.setInterval(fetchUsage, USAGE_POLL_MS);

    const runtime = getRuntime();
    if (runtime && runtime.onMessage && runtime.onMessage.addListener) {
      runtime.onMessage.addListener(handleRuntimeMessage);
    }

    // Listen for orgId from main-world.js (SSE interceptor)
    window.addEventListener('message', function onMainWorldMessage(event) {
      if (!event.data || typeof event.data.type !== 'string') return;

      if (event.data.type === 'MEGAMIND_ORG_FROM_SSE' && event.data.orgId && !state.orgFromSSE) {
        state.orgFromSSE = event.data.orgId;
        console.log('[MegaMind] Received orgId from SSE interceptor:', state.orgFromSSE);
        if (state.orgId && state.orgId !== state.orgFromSSE) {
          state.orgId = state.orgFromSSE;
          fetchUsage();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
