export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_REPORTS_BASE_URL = 'https://sunsetseatime.github.io/crypto-news';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const reportCache = {
  fetchedAt: 0,
  ttlMs: 2 * 60 * 1000,
  data: null,
};

const rateLimitMap = new Map();

function getReportsBaseUrl() {
  const raw = process.env.REPORTS_BASE_URL || DEFAULT_REPORTS_BASE_URL;
  return String(raw).replace(/\/+$/, '');
}

function getChatPassword() {
  const raw = process.env.CHAT_PASSWORD;
  return raw ? String(raw) : '';
}

function getOpenAiKey() {
  const raw = process.env.OPENAI_API_KEY;
  return raw ? String(raw) : '';
}

function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL_CHAT || DEFAULT_OPENAI_MODEL);
}

function nowMs() {
  return Date.now();
}

function checkRateLimit(ip) {
  const now = nowMs();
  const key = ip || 'unknown';
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 30) return false;
  entry.count += 1;
  return true;
}

function shortUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const format = (n) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1e12) return `$${format(value / 1e12)}T`;
  if (abs >= 1e9) return `$${format(value / 1e9)}B`;
  if (abs >= 1e6) return `$${format(value / 1e6)}M`;
  if (abs >= 1e3) return `$${format(value / 1e3)}K`;
  return `$${format(value)}`;
}

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function safeText(value, maxLen = 1200) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

async function fetchJson(url) {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function loadReports() {
  const now = nowMs();
  if (reportCache.data && now - reportCache.fetchedAt < reportCache.ttlMs) {
    return reportCache.data;
  }

  const baseUrl = getReportsBaseUrl();
  const urls = {
    layer1: `${baseUrl}/Layer1Report.json`,
    diff: `${baseUrl}/DiffReport.json`,
    alerts: `${baseUrl}/Alerts.json`,
    discovery: `${baseUrl}/DiscoveryReport.json`,
    defi: `${baseUrl}/defi/Latest.json`,
    supervisor: `${baseUrl}/SupervisorSummary.json`,
    backtest: `${baseUrl}/backtest/BacktestReport.json`,
  };

  const [layer1, diff, alerts, discovery, defi, supervisor, backtest] = await Promise.all([
    fetchJson(urls.layer1),
    fetchJson(urls.diff),
    fetchJson(urls.alerts),
    fetchJson(urls.discovery),
    fetchJson(urls.defi),
    fetchJson(urls.supervisor),
    fetchJson(urls.backtest),
  ]);

  const data = { baseUrl, layer1, diff, alerts, discovery, defi, supervisor, backtest };
  reportCache.data = data;
  reportCache.fetchedAt = now;
  return data;
}

function findCoin(layer1, coin) {
  const coins = Array.isArray(layer1?.coins) ? layer1.coins : [];
  if (!coins.length) return null;

  const coinId = String(coin?.id || '').trim().toLowerCase();
  if (coinId) {
    const hit = coins.find(
      (c) => String(c?.coin_gecko_id || '').trim().toLowerCase() === coinId,
    );
    if (hit) return hit;
  }

  const symbol = String(coin?.symbol || '').trim().toLowerCase();
  if (symbol) {
    const hit = coins.find(
      (c) => String(c?.symbol || '').trim().toLowerCase() === symbol,
    );
    if (hit) return hit;
  }

  const name = String(coin?.name || '').trim().toLowerCase();
  if (name) {
    const hit = coins.find(
      (c) => String(c?.name || '').trim().toLowerCase() === name,
    );
    if (hit) return hit;
  }

  return null;
}

function summarizeCoin(coinEntry, reports) {
  if (!coinEntry) return null;

  const riskFlags = [];
  if (coinEntry.low_liquidity) riskFlags.push('low liquidity');
  if (coinEntry.high_slippage_risk) riskFlags.push('high slippage risk');
  if (coinEntry.chasing) riskFlags.push('price run-up / chasing risk');
  if (coinEntry.high_dilution_risk) riskFlags.push('high dilution risk');
  if (coinEntry.low_float_risk) riskFlags.push('low float risk');
  if (coinEntry.thin_fragile) riskFlags.push('thin/fragile market');
  if (coinEntry.unlock_risk_flag) riskFlags.push('unlock risk in next 30 days');
  if (coinEntry.missing_traction) riskFlags.push('traction data missing');

  const topHolders = Array.isArray(coinEntry?.onchain?.top_holders)
    ? coinEntry.onchain.top_holders
    : [];
  const top10 = topHolders.slice(0, 10);
  const labeledExchangesTop10 = top10.filter(
    (h) => String(h?.holder_category || '').toLowerCase() === 'exchange',
  );
  const exchangePctTop10 =
    labeledExchangesTop10.length > 0
      ? labeledExchangesTop10.reduce(
          (sum, h) => sum + (Number(h?.percent_of_supply) || 0),
          0,
        )
      : null;

  const diffForCoin = Array.isArray(reports?.diff?.changes)
    ? reports.diff.changes.filter((c) => {
        if (coinEntry.coin_gecko_id)
          return (
            String(c?.key || '').toLowerCase() ===
            `id:${String(coinEntry.coin_gecko_id).toLowerCase()}`
          );
        return (
          String(c?.symbol || '').toLowerCase() ===
          String(coinEntry.symbol || '').toLowerCase()
        );
      })
    : [];

  const discoveryForCoin = Array.isArray(reports?.discovery?.candidates)
    ? reports.discovery.candidates.find(
        (c) =>
          String(c?.id || '').toLowerCase() ===
          String(coinEntry.coin_gecko_id || '').toLowerCase(),
      )
    : null;

  return {
    id: coinEntry.coin_gecko_id || null,
    symbol: coinEntry.symbol || null,
    name: coinEntry.name || null,
    list:
      coinEntry.watchlist_source === 'staging' ? 'Staging watchlist' : 'Watchlist',
    decision: coinEntry.hygiene_label || null,
    price: typeof coinEntry.price === 'number' ? `$${coinEntry.price}` : null,
    price_change_24h: pct(coinEntry.price_change_24h),
    price_change_7d: pct(coinEntry.price_change_7d),
    volume_24h: shortUsd(coinEntry.volume_24h),
    market_cap: shortUsd(coinEntry.market_cap),
    catalyst: coinEntry.clean_catalyst || null,
    has_clean_catalyst: Boolean(coinEntry.has_clean_catalyst),
    unlock_confidence: coinEntry.unlock_confidence || null,
    unlock_next_30d: coinEntry.unlock_next_30d || null,
    unlock_next_30d_value: shortUsd(coinEntry.unlock_next_30d_value),
    holder_concentration_level: coinEntry.holder_concentration_level || null,
    top_10_holder_percent:
      typeof coinEntry.top_10_holder_percent === 'number'
        ? `${coinEntry.top_10_holder_percent.toFixed(2)}%`
        : null,
    top_20_holder_percent:
      typeof coinEntry.top_20_holder_percent === 'number'
        ? `${coinEntry.top_20_holder_percent.toFixed(2)}%`
        : null,
    labeled_exchange_percent_in_top10:
      typeof exchangePctTop10 === 'number'
        ? `${exchangePctTop10.toFixed(2)}%`
        : null,
    holder_note:
      exchangePctTop10 && exchangePctTop10 > 0
        ? 'Some of the biggest holders are labeled exchange wallets (often lower whale risk because they can represent many customers).'
        : 'No holders are labeled as exchange wallets in the report (unknown exchange exposure).',
    key_risks: riskFlags,
    diff_notes: diffForCoin.slice(0, 10).map((c) => safeText(c?.description, 240)),
    discovery: discoveryForCoin
      ? {
          status: discoveryForCoin.status || null,
          discovery_score:
            typeof discoveryForCoin.discovery_score === 'number'
              ? Number(discoveryForCoin.discovery_score.toFixed(1))
              : null,
          market_cap: shortUsd(discoveryForCoin.market_cap),
          volume_24h: shortUsd(discoveryForCoin.volume_24h),
          price_change_7d: pct(discoveryForCoin.price_change_7d),
        }
      : null,
  };
}

function summarizeGlobal(reports) {
  const alerts = Array.isArray(reports?.alerts?.alerts)
    ? reports.alerts.alerts.slice(0, 20).map((a) => ({
        source: a.source || null,
        symbol: a.symbol || null,
        title: a.title || null,
        score: typeof a.score === 'number' ? Number(a.score.toFixed(1)) : null,
      }))
    : [];

  const diffTop = Array.isArray(reports?.diff?.changes)
    ? reports.diff.changes.slice(0, 20).map((c) => ({
        severity: c.severity || null,
        symbol: c.symbol || null,
        type: c.type || null,
        description: safeText(c.description, 240),
      }))
    : [];

  const discoveryTop = Array.isArray(reports?.discovery?.candidates)
    ? reports.discovery.candidates
        .slice()
        .sort((a, b) => (Number(b.discovery_score) || 0) - (Number(a.discovery_score) || 0))
        .slice(0, 10)
        .map((c) => ({
          id: c.id || null,
          symbol: c.symbol ? String(c.symbol).toUpperCase() : null,
          name: c.name || null,
          status: c.status || null,
          score: typeof c.discovery_score === 'number' ? Number(c.discovery_score.toFixed(1)) : null,
        }))
    : [];

  const defiTop = Array.isArray(reports?.defi?.protocols)
    ? reports.defi.protocols
        .slice()
        .sort((a, b) => (Number(b?.scores?.total) || 0) - (Number(a?.scores?.total) || 0))
        .slice(0, 10)
        .map((p) => ({
          name: p.name || null,
          chains: Array.isArray(p.chains) ? p.chains.slice(0, 4) : [],
          tvl: shortUsd(Number(p?.tvl?.focus_current)),
          score: typeof p?.scores?.total === 'number' ? Number(p.scores.total.toFixed(1)) : null,
          flags: p?.flags || null,
        }))
    : [];

  const supervisor = reports?.supervisor
    ? {
        actionable_today: Boolean(reports.supervisor.actionable_today),
        executive_summary: safeText(reports.supervisor.executive_summary, 1200) || null,
        watch_closely: Array.isArray(reports.supervisor.watch_closely)
          ? reports.supervisor.watch_closely.slice(0, 10).map((w) => ({
              symbol: w.symbol || null,
              verdict: w.verdict || null,
              why: safeText(w.why, 200) || null,
            }))
          : [],
      }
    : null;

  const backtest = reports?.backtest
    ? {
        generated_at: reports.backtest.generated_at || null,
        predictions_tracked:
          typeof reports.backtest.predictions_tracked === 'number'
            ? reports.backtest.predictions_tracked
            : null,
        accuracy_by_label: reports.backtest.accuracy_by_label || null,
      }
    : null;

  return {
    reports_generated_at: {
      watchlist: reports?.layer1?.generated_at || null,
      discovery: reports?.discovery?.generated_at || null,
      defi: reports?.defi?.generated_at || null,
      alerts: reports?.alerts?.generated_at || null,
      diff: reports?.diff?.current_scan_date || null,
      supervisor: reports?.supervisor?.generated_at || null,
      backtest: reports?.backtest?.generated_at || null,
    },
    alerts,
    diffTop,
    discoveryTop,
    defiTop,
    supervisor,
    backtest,
  };
}

function buildSystemPrompt() {
  return [
    'You are the chat assistant inside a crypto scanning dashboard.',
    '',
    'Your job: help the user understand the latest Watchlist / Discovery / DeFi reports in plain English.',
    '',
    'Rules:',
    '- Use ONLY the report context provided. If something is not in the context, say you do not know.',
    '- Use plain English. Avoid jargon and acronyms. If you must use an acronym (like FDV), define it first.',
    '- Do not give financial advice. Do not tell the user to buy/sell. Focus on education and explaining risk signals.',
    '- When discussing big holders:',
    '  - Exchange wallets can look huge but often represent many customers, so they are usually lower "single whale" risk.',
    '  - Never guess whether an address is an exchange. Only call it an exchange if the report explicitly labels it as an exchange.',
    '- If the user asks a vague question, ask 1 short follow-up question before answering.',
  ].join('\n');
}

async function callOpenAi({ apiKey, model, messages }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 800)}`);
  }

  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI returned no message content.');
  }
  return content;
}

export async function POST(req) {
  const password = getChatPassword();
  if (!password) {
    return new Response(
      JSON.stringify({
        error:
          'Chat is not configured. Set CHAT_PASSWORD and OPENAI_API_KEY in your Vercel project.',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  const provided =
    req.headers.get('x-chat-password') ||
    req.headers.get('x-access-key') ||
    '';
  if (String(provided) !== password) {
    return new Response(
      JSON.stringify({ error: 'Access key required.' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Try again in a few minutes.' }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    );
  }

  const apiKey = getOpenAiKey();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing OPENAI_API_KEY on the server.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const coin = body?.coin || null;
  const incomingMessages = Array.isArray(body?.messages) ? body.messages : null;
  const singleMessage =
    typeof body?.message === 'string' ? body.message.trim() : '';

  const conversation = incomingMessages
    ? incomingMessages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: safeText(m.content, 2000) }))
        .slice(-20)
    : singleMessage
      ? [{ role: 'user', content: safeText(singleMessage, 2000) }]
      : [];

  if (conversation.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No message provided.' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  let reports;
  try {
    reports = await loadReports();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Failed to load latest reports.',
        details: err?.message || String(err),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const selectedCoin = findCoin(reports.layer1, coin);
  const coinSummary = summarizeCoin(selectedCoin, reports);
  const globalSummary = summarizeGlobal(reports);

  const system = buildSystemPrompt();
  const context = {
    reports_base_url: reports.baseUrl,
    selected_coin: coinSummary,
    global: globalSummary,
  };

  const messages = [
    { role: 'system', content: system },
    {
      role: 'system',
      content: `Report context (JSON):\n${safeText(JSON.stringify(context, null, 2), 12000)}`,
    },
    ...conversation,
  ];

  try {
    const answer = await callOpenAi({
      apiKey,
      model: getOpenAiModel(),
      messages,
    });
    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Chat request failed.',
        details: err?.message || String(err),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
}
