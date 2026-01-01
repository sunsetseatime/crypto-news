export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_REPORTS_BASE_URL = 'https://sunsetseatime.github.io/crypto-news';

function getReportsBaseUrl() {
  const raw = process.env.REPORTS_BASE_URL || DEFAULT_REPORTS_BASE_URL;
  return String(raw).replace(/\/+$/, '');
}

function injectChat(html, { reportsBaseUrl }) {
  if (html.includes('id="cn-chat-open"')) return html;

  const css = `
<style id="cn-chat-style">
  .cn-chat-open {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 9999;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    padding: 10px 14px;
    background: rgba(0,0,0,0.35);
    color: var(--text, #e6edf3);
    box-shadow: var(--shadow, 0 10px 30px rgba(0,0,0,0.35));
    backdrop-filter: blur(10px);
    cursor: pointer;
    font: 600 13px/1.2 var(--sans, ui-sans-serif, system-ui);
  }
  .cn-chat-open:hover { background: rgba(0,0,0,0.5); }

  .cn-chat-panel {
    position: fixed;
    right: 18px;
    bottom: 72px;
    z-index: 9999;
    width: min(460px, calc(100vw - 36px));
    height: min(72vh, 720px);
    display: none;
    flex-direction: column;
    border-radius: 16px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: linear-gradient(180deg, rgba(15,26,43,0.96), rgba(12,21,38,0.96));
    color: var(--text, #e6edf3);
    box-shadow: var(--shadow, 0 10px 30px rgba(0,0,0,0.35));
    overflow: hidden;
    backdrop-filter: blur(14px);
  }
  .cn-chat-panel[data-open="1"] { display: flex; }

  .cn-chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 12px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  }
  .cn-chat-title { font-weight: 750; letter-spacing: 0.2px; }
  .cn-chat-subtitle { font-size: 12px; color: var(--muted, #9fb0c0); margin-top: 3px; }

  .cn-chat-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(0,0,0,0.18);
    color: var(--text, #e6edf3);
    cursor: pointer;
    font: 700 16px/1 var(--sans, ui-sans-serif, system-ui);
  }
  .cn-chat-icon-btn:hover { background: rgba(0,0,0,0.32); }

  .cn-chat-settings {
    display: grid;
    gap: 10px;
    padding: 10px 12px 12px;
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(0,0,0,0.08);
  }
  .cn-chat-row { display: grid; gap: 6px; }
  .cn-chat-label {
    font-size: 12px;
    color: var(--muted, #9fb0c0);
  }
  .cn-chat-input, .cn-chat-select {
    width: 100%;
    padding: 9px 10px;
    border-radius: 10px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(0,0,0,0.22);
    color: var(--text, #e6edf3);
    outline: none;
    font: 500 13px/1.2 var(--sans, ui-sans-serif, system-ui);
  }
  .cn-chat-input::placeholder { color: rgba(159,176,192,0.8); }

  .cn-chat-hint {
    font-size: 12px;
    color: var(--muted, #9fb0c0);
    line-height: 1.35;
  }
  .cn-chat-hint a { color: #a7d1ff; }

  .cn-chat-messages {
    flex: 1;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cn-chat-bubble {
    max-width: 92%;
    border-radius: 14px;
    padding: 10px 12px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(0,0,0,0.18);
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.35;
    font-size: 13px;
  }
  .cn-chat-bubble.cn-user { margin-left: auto; background: rgba(31,223,122,0.10); border-color: rgba(31,223,122,0.25); }
  .cn-chat-bubble.cn-assistant { margin-right: auto; }
  .cn-chat-meta { font-size: 11px; color: var(--muted, #9fb0c0); margin: 0 2px; }

  .cn-chat-form {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(0,0,0,0.10);
  }
  .cn-chat-send {
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: rgba(102,168,255,0.20);
    color: var(--text, #e6edf3);
    cursor: pointer;
    font: 700 13px/1.2 var(--sans, ui-sans-serif, system-ui);
  }
  .cn-chat-send:hover { background: rgba(102,168,255,0.30); }
  .cn-chat-send:disabled { opacity: 0.6; cursor: not-allowed; }

  .cn-chat-footer {
    padding: 0 12px 12px;
    font-size: 11px;
    color: var(--muted, #9fb0c0);
    background: rgba(0,0,0,0.10);
  }

  @media (max-width: 520px) {
    .cn-chat-panel {
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      border-radius: 0;
    }
    .cn-chat-open { right: 12px; bottom: 12px; }
  }
</style>`;

  const safeReportsBaseUrl = JSON.stringify(String(reportsBaseUrl || ''));
  const widget = `
<button id="cn-chat-open" class="cn-chat-open" type="button" aria-label="Open chat">
  <span>Chat</span>
  <span style="color: var(--muted, #9fb0c0); font-weight:600;">Ask about coins</span>
</button>

<section id="cn-chat-panel" class="cn-chat-panel" data-open="0" aria-label="Dashboard chat">
  <div class="cn-chat-header">
    <div>
      <div class="cn-chat-title">Ask the dashboard</div>
      <div class="cn-chat-subtitle">Plain English answers from your latest reports</div>
    </div>
    <button id="cn-chat-close" class="cn-chat-icon-btn" type="button" aria-label="Close chat">×</button>
  </div>

  <div class="cn-chat-settings">
    <div class="cn-chat-row">
      <div class="cn-chat-label">Access key (required)</div>
      <input id="cn-chat-key" class="cn-chat-input" type="password" autocomplete="off" placeholder="Set CHAT_PASSWORD on Vercel, then paste it here" />
    </div>
    <div class="cn-chat-row">
      <div class="cn-chat-label">Coin (optional)</div>
      <select id="cn-chat-coin" class="cn-chat-select">
        <option value="">General question (no coin selected)</option>
      </select>
    </div>
    <div class="cn-chat-hint">
      Uses Watchlist, Discovery, DeFi, Alerts, and Diff reports. If something is not in the reports, it will say so.<br />
      Reports source: <a id="cn-chat-reports-link" href="#" target="_blank" rel="noreferrer">open</a>
    </div>
  </div>

  <div id="cn-chat-messages" class="cn-chat-messages"></div>

  <form id="cn-chat-form" class="cn-chat-form">
    <input id="cn-chat-input" class="cn-chat-input" type="text" placeholder="Ask a question about a coin or today’s scan…" />
    <button id="cn-chat-send" class="cn-chat-send" type="submit">Send</button>
  </form>

  <div class="cn-chat-footer">Educational only. Not financial advice.</div>
</section>

<script>
  (function () {
    var REPORTS_BASE_URL = ${safeReportsBaseUrl};
    var STORAGE_KEY = 'crypto_news_chat_v1';

    function qs(sel) { return document.querySelector(sel); }
    function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

    function readState() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_) { return {}; }
    }
    function writeState(next) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
    }

    function isInsideLink(el) {
      while (el) {
        if (el.tagName && el.tagName.toLowerCase() === 'a') return true;
        el = el.parentElement;
      }
      return false;
    }

    function getCoinIdFromRow(row) {
      var a = row.querySelector('a[href*=\"coingecko.com/en/coins/\"]');
      if (!a) return '';
      try {
        var u = new URL(a.getAttribute('href'));
        var parts = u.pathname.split('/').filter(Boolean);
        var idx = parts.indexOf('coins');
        return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : '';
      } catch (_) {
        var href = a.getAttribute('href') || '';
        var m = href.match(/\\/coins\\/([^/?#]+)/i);
        return m && m[1] ? m[1] : '';
      }
    }

    function buildCoinIndex() {
      var rows = qsa('table.filterable tbody tr[data-symbol][data-name]');
      var grouped = new Map();

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var symbol = (row.dataset.symbol || '').trim();
        var name = (row.dataset.name || '').trim();
        if (!symbol) continue;
        var id = getCoinIdFromRow(row);
        if (!id) continue;

        var card = row.closest('.card');
        var h2 = card ? card.querySelector('h2') : null;
        var group = h2 ? (h2.textContent || '').trim() : 'Coins';

        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group).push({ id: id, symbol: symbol, name: name });
      }

      // sort groups and coins
      var groupNames = Array.from(grouped.keys()).sort(function (a, b) { return a.localeCompare(b); });
      var out = [];
      for (var g = 0; g < groupNames.length; g++) {
        var groupName = groupNames[g];
        var coins = grouped.get(groupName) || [];
        coins.sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
        out.push({ group: groupName, coins: coins });
      }
      return out;
    }

    function populateCoinSelect(selectEl, groups) {
      // keep the first "General" option
      while (selectEl.options.length > 1) selectEl.remove(1);
      for (var i = 0; i < groups.length; i++) {
        var og = document.createElement('optgroup');
        og.label = groups[i].group;
        for (var j = 0; j < groups[i].coins.length; j++) {
          var c = groups[i].coins[j];
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.symbol + ' — ' + c.name;
          opt.dataset.symbol = c.symbol;
          opt.dataset.name = c.name;
          og.appendChild(opt);
        }
        selectEl.appendChild(og);
      }
    }

    function setCoinById(selectEl, coinId) {
      if (!coinId) return;
      for (var i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === coinId) {
          selectEl.value = coinId;
          return;
        }
      }
    }

    function rewriteReportLinks() {
      if (!REPORTS_BASE_URL) return;
      var chips = qsa('a.chip[href]');
      for (var i = 0; i < chips.length; i++) {
        var a = chips[i];
        var href = a.getAttribute('href') || '';
        if (!href || href.startsWith('http') || href.startsWith('#')) continue;
        a.setAttribute('href', REPORTS_BASE_URL.replace(/\\/+$/, '') + '/' + href.replace(/^\\/+/, ''));
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noreferrer');
      }
    }

    function appendMessage(container, role, text) {
      var wrap = document.createElement('div');
      var meta = document.createElement('div');
      meta.className = 'cn-chat-meta';
      meta.textContent = role === 'user' ? 'You' : 'Dashboard';
      var bubble = document.createElement('div');
      bubble.className = 'cn-chat-bubble ' + (role === 'user' ? 'cn-user' : 'cn-assistant');
      bubble.textContent = text;
      wrap.appendChild(meta);
      wrap.appendChild(bubble);
      container.appendChild(wrap);
      container.scrollTop = container.scrollHeight;
      return bubble;
    }

    function init() {
      var openBtn = qs('#cn-chat-open');
      var panel = qs('#cn-chat-panel');
      var closeBtn = qs('#cn-chat-close');
      var keyInput = qs('#cn-chat-key');
      var coinSelect = qs('#cn-chat-coin');
      var messagesEl = qs('#cn-chat-messages');
      var form = qs('#cn-chat-form');
      var input = qs('#cn-chat-input');
      var sendBtn = qs('#cn-chat-send');
      var reportsLink = qs('#cn-chat-reports-link');

      if (!openBtn || !panel || !closeBtn || !keyInput || !coinSelect || !messagesEl || !form || !input || !sendBtn) return;

      var state = readState();
      if (state.accessKey) keyInput.value = state.accessKey;
      if (reportsLink && REPORTS_BASE_URL) {
        reportsLink.href = REPORTS_BASE_URL.replace(/\\/+$/, '') + '/';
        reportsLink.textContent = REPORTS_BASE_URL.replace(/^https?:\\/\\//, '');
      }

      var groups = buildCoinIndex();
      populateCoinSelect(coinSelect, groups);
      if (state.coinId) setCoinById(coinSelect, state.coinId);

      function openPanel() { panel.dataset.open = '1'; input.focus(); }
      function closePanel() { panel.dataset.open = '0'; }

      openBtn.addEventListener('click', openPanel);
      closeBtn.addEventListener('click', closePanel);

      keyInput.addEventListener('input', function () {
        var next = readState();
        next.accessKey = keyInput.value || '';
        writeState(next);
      });
      coinSelect.addEventListener('change', function () {
        var next = readState();
        next.coinId = coinSelect.value || '';
        writeState(next);
      });

      // click a coin row to pre-select it for chat
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || isInsideLink(t)) return;
        var row = t.closest && t.closest('table.filterable tbody tr[data-symbol][data-name]');
        if (!row) return;
        var coinId = getCoinIdFromRow(row);
        if (!coinId) return;
        setCoinById(coinSelect, coinId);
        var next = readState();
        next.coinId = coinId;
        writeState(next);
        openPanel();
      });

      var chatMessages = [];

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var text = (input.value || '').trim();
        if (!text) return;
        var accessKey = (keyInput.value || '').trim();
        if (!accessKey) {
          appendMessage(messagesEl, 'assistant', 'This chat is locked. Paste your access key first.');
          return;
        }

        var coinId = coinSelect.value || '';
        var coinOpt = coinSelect.options[coinSelect.selectedIndex] || null;
        var coin = coinId ? { id: coinId, symbol: coinOpt && coinOpt.dataset ? coinOpt.dataset.symbol : null, name: coinOpt && coinOpt.dataset ? coinOpt.dataset.name : null } : null;

        chatMessages.push({ role: 'user', content: text });
        appendMessage(messagesEl, 'user', text);

        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        var placeholder = appendMessage(messagesEl, 'assistant', 'Thinking…');

        try {
          var res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-chat-password': accessKey
            },
            body: JSON.stringify({ messages: chatMessages.slice(-20), coin: coin })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) {
            placeholder.textContent = (data && data.error) ? data.error : ('Request failed (' + res.status + ')');
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
            return;
          }
          var answer = data && data.answer ? String(data.answer) : '';
          if (!answer) answer = 'No answer returned.';
          placeholder.textContent = answer;
          chatMessages.push({ role: 'assistant', content: answer });
        } catch (err) {
          placeholder.textContent = 'Chat failed: ' + (err && err.message ? err.message : String(err));
        } finally {
          input.disabled = false;
          sendBtn.disabled = false;
          input.focus();
        }
      });

      rewriteReportLinks();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
</script>`;

  let out = html;

  if (out.includes('</head>')) out = out.replace('</head>', `${css}\n</head>`);
  else out = `${css}\n${out}`;

  if (out.includes('</body>')) out = out.replace('</body>', `${widget}\n</body>`);
  else out = `${out}\n${widget}`;

  return out;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fallbackHtml(message) {
  const safe = escapeHtml(message);
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crypto Scanner Dashboard</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; line-height: 1.35; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .card { border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; padding: 16px; max-width: 880px; }
</style>
<div class="card">
  <h1 style="margin:0 0 10px">Dashboard not available</h1>
  <p style="margin:0 0 10px">This Vercel dashboard proxies your latest GitHub Pages reports.</p>
  <p style="margin:0 0 10px">Error: <code>${safe}</code></p>
  <p style="margin:0">Set <code>REPORTS_BASE_URL</code> (e.g. <code>${escapeHtml(DEFAULT_REPORTS_BASE_URL)}</code>).</p>
</div>`;
}

export async function GET() {
  const baseUrl = getReportsBaseUrl();
  const dashboardUrl = `${baseUrl}/Dashboard.html`;

  try {
    const res = await fetch(dashboardUrl, { next: { revalidate: 60 } });
    if (!res.ok) {
      return new Response(fallbackHtml(`HTTP ${res.status} fetching ${dashboardUrl}`), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    const html = await res.text();
    const withChat = injectChat(html, { reportsBaseUrl: baseUrl });
    return new Response(withChat, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    return new Response(fallbackHtml(err?.message || String(err)), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}
