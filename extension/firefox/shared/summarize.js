(function (globalScope) {
  'use strict';

  function getApi() {
    if (!globalScope.MegaMindApi) {
      throw new Error('MegaMindApi must be loaded before MegaMindSummarize');
    }
    return globalScope.MegaMindApi;
  }

  async function getStatus(options) {
    return getApi().request('/api/summarize/status', options);
  }

  async function summarizeConversation(conversationText, options) {
    if (!conversationText || !conversationText.trim()) {
      throw new Error('Conversation text is required');
    }

    return getApi().request('/api/summarize', {
      ...(options || {}),
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...((options && options.headers) || {}),
      },
      body: conversationText,
    });
  }

  async function summarizePayload(payload, options) {
    return getApi().request('/api/summarize', {
      ...(options || {}),
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function waitUntilIdle(options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs || 600000;
    const intervalMs = opts.intervalMs || 1000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const status = await getStatus(opts);
      if (!status.running) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timed out waiting for summarize to finish');
  }

  globalScope.MegaMindSummarize = {
    getStatus,
    summarizeConversation,
    summarizePayload,
    waitUntilIdle,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
