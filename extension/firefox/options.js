(function () {
  'use strict';

  const form = document.getElementById('options-form');
  const apiBaseInput = document.getElementById('api-base');
  const apiKeyInput = document.getElementById('api-key');
  const testButton = document.getElementById('test-button');
  const statusMessage = document.getElementById('status-message');

  function setStatus(message, isError) {
    statusMessage.textContent = message || '';
    statusMessage.classList.toggle('error', Boolean(isError));
  }

  async function loadOptions() {
    const config = await MegaMindApi.getConfig();
    apiBaseInput.value = config.apiBase || MegaMindApi.DEFAULT_API_BASE;
    apiKeyInput.value = config.apiKey || MegaMindApi.DEFAULT_API_KEY || '';
  }

  async function saveOptions() {
    const apiBase = apiBaseInput.value.trim() || MegaMindApi.DEFAULT_API_BASE;
    const apiKey = apiKeyInput.value.trim();
    await MegaMindApi.saveConfig({ apiBase, apiKey });
    setStatus('Saved MegaMind connection settings.', false);
  }

  async function testConnection() {
    setStatus('Testing MegaMind connection...', false);
    try {
      const entries = await MegaMindApi.listClaud({
        apiBase: apiBaseInput.value.trim() || MegaMindApi.DEFAULT_API_BASE,
        apiKey: apiKeyInput.value.trim(),
      });
      setStatus(`Connected. Claud entries: ${entries.length}.`, false);
    } catch (error) {
      setStatus(error.message || 'Connection test failed.', true);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveOptions().catch((error) => setStatus(error.message || 'Save failed.', true));
  });

  testButton.addEventListener('click', () => {
    testConnection();
  });

  loadOptions().catch((error) => setStatus(error.message || 'Could not load options.', true));
})();
