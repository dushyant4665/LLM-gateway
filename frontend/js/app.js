// Minimal LLM Gateway Frontend Controller

(function () {
  const API_BASE = window.location.origin;

  // DOM Elements
  const healthDot = document.getElementById('health-dot');
  const healthLabel = document.getElementById('health-label');

  // Key creation
  const keyForm = document.getElementById('key-form');
  const budgetInput = document.getElementById('budget-input');
  const generateKeyBtn = document.getElementById('generate-key-btn');
  const newKeyPanel = document.getElementById('new-key-panel');
  const newKeyDisplay = document.getElementById('new-key-display');
  const copyKeyBtn = document.getElementById('copy-key-btn');
  const attachKeyBtn = document.getElementById('attach-key-btn');

  // Usage inspection
  const usageKeyInput = document.getElementById('usage-key-input');
  const inspectUsageBtn = document.getElementById('inspect-usage-btn');
  const usageStatsContainer = document.getElementById('usage-stats-container');
  const valSpent = document.getElementById('val-spent');
  const valBudget = document.getElementById('val-budget');
  const progressBar = document.getElementById('progress-bar');
  const valPercent = document.getElementById('val-percent');
  const valRemaining = document.getElementById('val-remaining');
  const metricRequests = document.getElementById('metric-requests');
  const metricTotalTokens = document.getElementById('metric-total-tokens');
  const metricInTokens = document.getElementById('metric-in-tokens');
  const metricOutTokens = document.getElementById('metric-out-tokens');

  // Chat playground
  const chatKeyInput = document.getElementById('chat-key-input');
  const chatModelSelect = document.getElementById('chat-model-select');
  const chatPrompt = document.getElementById('chat-prompt');
  const sendRequestBtn = document.getElementById('send-request-btn');
  const playStatusMsg = document.getElementById('play-status-msg');
  const chatResponseViewer = document.getElementById('chat-response-viewer');
  const playBadges = document.getElementById('play-badges');
  const telemetryBox = document.getElementById('telemetry-box');
  const telHttp = document.getElementById('tel-http');
  const telLatency = document.getElementById('tel-latency');
  const telTokens = document.getElementById('tel-tokens');
  const telCost = document.getElementById('tel-cost');

  // Code snippet
  const curlCodeSnippet = document.getElementById('curl-code-snippet');
  const copyCurlBtn = document.getElementById('copy-curl-btn');

  // Restore saved key from localStorage on load
  const savedKey = localStorage.getItem('gateway_active_key');
  if (savedKey) {
    applyActiveKey(savedKey);
  }

  // ── 1. Gateway Health Check ────────────────────────────────────────────────
  async function pingHealth() {
    try {
      const start = performance.now();
      const res = await fetch(`${API_BASE}/health`);
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        healthDot.className = 'health-dot online';
        healthLabel.textContent = `Online (${latency}ms)`;
      } else {
        healthDot.className = 'health-dot offline';
        healthLabel.textContent = `Error ${res.status}`;
      }
    } catch (err) {
      healthDot.className = 'health-dot offline';
      healthLabel.textContent = 'Offline';
    }
  }

  pingHealth();
  setInterval(pingHealth, 25000);

  // ── 2. Create API Key ──────────────────────────────────────────────────────
  keyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const budget = parseFloat(budgetInput.value);

    if (isNaN(budget) || budget <= 0) {
      alert('Please enter a positive budget amount.');
      return;
    }

    generateKeyBtn.disabled = true;
    generateKeyBtn.textContent = 'Creating...';

    try {
      const res = await fetch(`${API_BASE}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create key');

      newKeyDisplay.textContent = data.key;
      newKeyPanel.classList.remove('hidden');
      applyActiveKey(data.key);
      await fetchKeyUsage(data.key);
    } catch (err) {
      alert(`Error creating key: ${err.message}`);
    } finally {
      generateKeyBtn.disabled = false;
      generateKeyBtn.textContent = 'Create Key';
    }
  });

  copyKeyBtn.addEventListener('click', () => {
    const key = newKeyDisplay.textContent;
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      const original = copyKeyBtn.textContent;
      copyKeyBtn.textContent = 'Copied!';
      setTimeout(() => (copyKeyBtn.textContent = original), 1500);
    });
  });

  attachKeyBtn.addEventListener('click', () => {
    const key = newKeyDisplay.textContent;
    if (!key) return;
    applyActiveKey(key);
    fetchKeyUsage(key);
  });

  function applyActiveKey(key) {
    usageKeyInput.value = key;
    chatKeyInput.value = key;
    localStorage.setItem('gateway_active_key', key);
    syncCurlSnippet(key);
  }

  function syncCurlSnippet(key) {
    const activeKey = key || '<YOUR_KEY>';
    const model = chatModelSelect ? chatModelSelect.value : 'openai/gpt-oss-20b';

    curlCodeSnippet.textContent = `curl -X POST ${API_BASE}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${activeKey}" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "Hello via Gateway"}]
  }'`;
  }

  // ── 3. Check Usage & Spend ─────────────────────────────────────────────────
  inspectUsageBtn.addEventListener('click', () => {
    const key = usageKeyInput.value.trim();
    if (!key) {
      alert('Enter an API key to check.');
      return;
    }
    fetchKeyUsage(key);
  });

  async function fetchKeyUsage(key) {
    inspectUsageBtn.disabled = true;
    inspectUsageBtn.textContent = 'Loading...';

    try {
      const res = await fetch(`${API_BASE}/api/usage`, {
        headers: { Authorization: `Bearer ${key}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch usage');

      renderUsageData(data);
      usageStatsContainer.classList.remove('hidden');
    } catch (err) {
      alert(`Usage lookup failed: ${err.message}`);
    } finally {
      inspectUsageBtn.disabled = false;
      inspectUsageBtn.textContent = 'Check Usage';
    }
  }

  function renderUsageData(data) {
    const spent = Number(data.spent || data.totalEstimatedCost || 0);
    const budget = Number(data.budget || 0);
    const remaining = Number(data.remaining !== undefined ? data.remaining : Math.max(0, budget - spent));

    valSpent.textContent = `$${spent.toFixed(6)}`;
    valBudget.textContent = budget > 0 ? `$${budget.toFixed(2)}` : '$--';
    valRemaining.textContent = budget > 0 ? `Remaining: $${remaining.toFixed(6)}` : 'Remaining: --';

    let pct = 0;
    if (budget > 0) pct = Math.min(100, (spent / budget) * 100);

    valPercent.textContent = `${pct.toFixed(1)}% used`;
    progressBar.style.width = `${pct}%`;

    progressBar.className = 'progress-fill';
    if (pct >= 100) progressBar.classList.add('danger');
    else if (pct >= 80) progressBar.classList.add('warning');

    metricRequests.textContent = data.totalRequests || 0;
    metricTotalTokens.textContent = Number(data.totalTokens || 0).toLocaleString();
    metricInTokens.textContent = Number(data.inputTokens || 0).toLocaleString();
    metricOutTokens.textContent = Number(data.outputTokens || 0).toLocaleString();
  }

  // ── 4. Chat Proxy ──────────────────────────────────────────────────────────
  sendRequestBtn.addEventListener('click', async () => {
    const key = chatKeyInput.value.trim();
    const model = chatModelSelect.value;
    const prompt = chatPrompt.value.trim();

    if (!key) {
      alert('API Key is required.');
      return;
    }
    if (!prompt) {
      alert('Please enter a message.');
      return;
    }

    sendRequestBtn.disabled = true;
    playStatusMsg.classList.remove('hidden');
    playBadges.innerHTML = '';
    chatResponseViewer.textContent = 'Sending request...';
    telemetryBox.classList.add('hidden');

    const start = performance.now();

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const latency = Math.round(performance.now() - start);
      const data = await res.json();

      telHttp.textContent = `${res.status} ${res.statusText || ''}`;
      telLatency.textContent = `${latency}ms`;

      if (res.ok) {
        chatResponseViewer.textContent = data.message?.content || JSON.stringify(data, null, 2);

        if (data.fallback) {
          playBadges.innerHTML = '<span class="badge badge-warning">Fallback Provider</span>';
        } else {
          playBadges.innerHTML = `<span class="badge badge-success">Provider: ${data.model || model}</span>`;
        }

        const totalTokens = data.usage?.total_tokens ?? 0;
        telTokens.textContent = totalTokens.toLocaleString();

        const pTok = data.usage?.prompt_tokens || 0;
        const cTok = data.usage?.completion_tokens || 0;
        const cost = (pTok * 0.59 + cTok * 0.79) / 1000000;
        telCost.textContent = data.fallback ? '$0.0000 (No charge)' : `$${cost.toFixed(6)}`;

        telemetryBox.classList.remove('hidden');
        fetchKeyUsage(key);
      } else {
        chatResponseViewer.textContent = `Error ${res.status}:\n${data.error || JSON.stringify(data, null, 2)}`;
        playBadges.innerHTML = `<span class="badge badge-danger">HTTP ${res.status}</span>`;

        telTokens.textContent = '0';
        telCost.textContent = '$0.00';
        telemetryBox.classList.remove('hidden');
        fetchKeyUsage(key);
      }
    } catch (err) {
      chatResponseViewer.textContent = `Network error: ${err.message}`;
      playBadges.innerHTML = '<span class="badge badge-danger">Network Error</span>';
    } finally {
      sendRequestBtn.disabled = false;
      playStatusMsg.classList.add('hidden');
    }
  });

  chatModelSelect.addEventListener('change', () => syncCurlSnippet(chatKeyInput.value.trim()));
  chatKeyInput.addEventListener('input', () => syncCurlSnippet(chatKeyInput.value.trim()));

  copyCurlBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(curlCodeSnippet.textContent).then(() => {
      const orig = copyCurlBtn.textContent;
      copyCurlBtn.textContent = 'Copied!';
      setTimeout(() => (copyCurlBtn.textContent = orig), 1500);
    });
  });
})();
