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

function volumeToMcapPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(1)}%`;
}

function safeText(value, maxLen = 1200) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}...`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesWord(haystackLower, wordLower) {
  if (!wordLower) return false;
  const re = new RegExp(`\\b${escapeRegExp(wordLower)}\\b`, 'i');
  return re.test(haystackLower);
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
    macroPulse: `${baseUrl}/MacroPulse.json`,
  };

  const [layer1, diff, alerts, discovery, defi, supervisor, backtest, macroPulse] =
    await Promise.all([
      fetchJson(urls.layer1),
      fetchJson(urls.diff),
      fetchJson(urls.alerts),
      fetchJson(urls.discovery),
      fetchJson(urls.defi),
      fetchJson(urls.supervisor),
      fetchJson(urls.backtest),
      fetchJson(urls.macroPulse),
    ]);

  const data = {
    baseUrl,
    layer1,
    diff,
    alerts,
    discovery,
    defi,
    supervisor,
    backtest,
    macroPulse,
  };
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

function findDiscoveryCandidate(discovery, coin) {
  const candidates = Array.isArray(discovery?.candidates) ? discovery.candidates : [];
  if (!candidates.length) return null;

  const id = String(coin?.id || '').trim().toLowerCase();
  if (id) {
    const hit = candidates.find(
      (c) => String(c?.id || '').trim().toLowerCase() === id,
    );
    if (hit) return hit;
  }

  const symbol = String(coin?.symbol || '').trim().toLowerCase();
  if (symbol) {
    const hit = candidates.find(
      (c) => String(c?.symbol || '').trim().toLowerCase() === symbol,
    );
    if (hit) return hit;
  }

  const name = String(coin?.name || '').trim().toLowerCase();
  if (name) {
    const hit = candidates.find(
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

  const gateFailuresRaw = Array.isArray(coinEntry.gates_failed)
    ? coinEntry.gates_failed
    : [];
  const gateFailures = gateFailuresRaw
    .map((g) => String(g || '').trim())
    .filter(Boolean)
    .map((g) => {
      switch (g) {
        case 'trackable_data':
          return 'Some basic market data is missing';
        case 'liquidity':
          return 'Trading activity looks too low';
        case 'unlock_transparency':
          return 'Token unlock schedule info is missing';
        case 'traction':
          return 'Traction signals are missing or weak';
        case 'concentration_risk':
          return 'Ownership looks too concentrated';
        default:
          return g;
      }
    });

  return {
    id: coinEntry.coin_gecko_id || null,
    symbol: coinEntry.symbol || null,
    name: coinEntry.name || null,
    list: coinEntry.watchlist_source === 'staging' ? 'Staging watchlist' : 'Watchlist',
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
    why_decision: gateFailures,
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
          volume_to_mcap: volumeToMcapPct(discoveryForCoin.volume_to_mcap),
          price_change_7d: pct(discoveryForCoin.price_change_7d),
          source: discoveryForCoin.source || null,
        }
      : null,
    explain: coinEntry?.explain
      ? {
          why: Array.isArray(coinEntry.explain?.why)
            ? coinEntry.explain.why.slice(0, 3)
            : [],
          risks: Array.isArray(coinEntry.explain?.risks)
            ? coinEntry.explain.risks.slice(0, 2)
            : [],
          suggested_max_buy:
            typeof coinEntry.explain?.sizing?.suggested_max_buy_usd === 'number'
              ? shortUsd(Number(coinEntry.explain.sizing.suggested_max_buy_usd))
              : null,
          news_checked_at: coinEntry.explain?.news?.fetched_at || null,
          news_source: coinEntry.explain?.news?.source || null,
        }
      : null,
  };
}

function summarizeDiscoveryCandidate(candidate, reports) {
  if (!candidate) return null;
  const criteria = reports?.discovery?.criteria || null;
  const why = [];

  if (candidate.source) {
    why.push(`It appeared via the discovery feed: ${String(candidate.source)}`);
  }
  if (criteria?.min_volume_24h && typeof candidate.volume_24h === 'number') {
    why.push(
      `24h trading activity: ${shortUsd(candidate.volume_24h)} (rule: at least ${criteria.min_volume_24h})`,
    );
  }
  if (
    criteria?.min_market_cap &&
    criteria?.max_market_cap &&
    typeof candidate.market_cap === 'number'
  ) {
    why.push(
      `Market size: ${shortUsd(candidate.market_cap)} (rule: between ${criteria.min_market_cap} and ${criteria.max_market_cap})`,
    );
  }
  if (criteria?.price_change_7d_range && typeof candidate.price_change_7d === 'number') {
    why.push(
      `7-day move: ${pct(candidate.price_change_7d)} (rule: ${criteria.price_change_7d_range})`,
    );
  }
  if (typeof candidate.volume_to_mcap === 'number') {
    why.push(
      `24h trading activity vs size: ${volumeToMcapPct(candidate.volume_to_mcap)} (higher usually means more attention)`,
    );
  }

  return {
    id: candidate.id || null,
    symbol: candidate.symbol ? String(candidate.symbol).toUpperCase() : null,
    name: candidate.name || null,
    status: candidate.status || null,
    discovery_score:
      typeof candidate.discovery_score === 'number'
        ? Number(candidate.discovery_score.toFixed(1))
        : null,
    market_cap: shortUsd(candidate.market_cap),
    volume_24h: shortUsd(candidate.volume_24h),
    volume_to_mcap: volumeToMcapPct(candidate.volume_to_mcap),
    price_change_7d: pct(candidate.price_change_7d),
    market_cap_rank:
      typeof candidate.market_cap_rank === 'number' ? candidate.market_cap_rank : null,
    first_seen_at: candidate.first_seen_at || null,
    last_seen_at: candidate.last_seen_at || null,
    why_in_discovery: why,
  };
}

function summarizeGlobal(reports) {
  const alerts = Array.isArray(reports?.alerts?.alerts)
    ? reports.alerts.alerts.slice(0, 20).map((a) => ({
        source: a.source || null,
        symbol: a.symbol || null,
        title: a.title || null,
        score: typeof a.score === 'number' ? Number(a.score.toFixed(1)) : null,
        why: Array.isArray(a?.explain?.why) ? a.explain.why.slice(0, 3) : null,
        risks: Array.isArray(a?.explain?.risks) ? a.explain.risks.slice(0, 2) : null,
        details:
          a?.source === 'discovery' && a?.details
            ? {
                status: a.details.status || null,
                market_cap: shortUsd(Number(a.details.market_cap)),
                volume_24h: shortUsd(Number(a.details.volume_24h)),
                price_change_7d: pct(Number(a.details.price_change_7d)),
              }
            : null,
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
        .slice(0, 25)
        .map((c) => ({
          id: c.id || null,
          symbol: c.symbol ? String(c.symbol).toUpperCase() : null,
          name: c.name || null,
          status: c.status || null,
          score: typeof c.discovery_score === 'number' ? Number(c.discovery_score.toFixed(1)) : null,
          market_cap: shortUsd(c.market_cap),
          volume_24h: shortUsd(c.volume_24h),
          volume_to_mcap: volumeToMcapPct(c.volume_to_mcap),
          price_change_7d: pct(c.price_change_7d),
          source: c.source || null,
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

  const macro = reports?.macroPulse || null;
  const macroPulse = macro
    ? {
        generated_at: macro.generated_at || null,
        btc_price: shortUsd(Number(macro.btc_price)),
        btc_change_24h: pct(Number(macro.btc_change_24h)),
        etf_flows: macro.etf_flows?.error
          ? { error: macro.etf_flows.error }
          : macro.etf_flows
            ? {
                today_total_musd:
                  typeof macro.etf_flows.today_total_musd === 'number'
                    ? macro.etf_flows.today_total_musd
                    : null,
                five_day_total_musd:
                  typeof macro.etf_flows.five_day_total_musd === 'number'
                    ? macro.etf_flows.five_day_total_musd
                    : null,
                momentum: macro.etf_flows.momentum_label || null,
                top_drivers: Array.isArray(macro.etf_flows.top_drivers)
                  ? macro.etf_flows.top_drivers.map((d) => ({
                      ticker: d.ticker || null,
                      flow_musd:
                        typeof d.flow_musd === 'number'
                          ? Number(d.flow_musd.toFixed(1))
                          : null,
                    }))
                  : [],
              }
            : null,
        leverage: macro.leverage?.error
          ? { error: macro.leverage.error }
          : macro.leverage
            ? {
                funding_rate_pct:
                  typeof macro.leverage.funding_rate_pct === 'number'
                    ? Number(macro.leverage.funding_rate_pct.toFixed(4))
                    : null,
                funding_label: macro.leverage.funding_label || null,
                open_interest_usd: shortUsd(Number(macro.leverage.open_interest_usd)),
                open_interest_change_pct: pct(Number(macro.leverage.open_interest_change_pct)),
                open_interest_label: macro.leverage.open_interest_label || null,
              }
            : null,
        btc_share: macro.btc_share?.error
          ? { error: macro.btc_share.error }
          : macro.btc_share
            ? {
                pct:
                  typeof macro.btc_share.pct === 'number'
                    ? Number(macro.btc_share.pct.toFixed(1))
                    : null,
                change_24h:
                  typeof macro.btc_share.change_24h === 'number'
                    ? Number(macro.btc_share.change_24h.toFixed(1))
                    : null,
                trend: macro.btc_share.trend_label || null,
              }
            : null,
        alt_strength: macro.alt_strength?.groups
          ? {
              stronger: Array.isArray(macro.alt_strength.groups.stronger)
                ? macro.alt_strength.groups.stronger.slice(0, 6)
                : [],
              weaker: Array.isArray(macro.alt_strength.groups.weaker)
                ? macro.alt_strength.groups.weaker.slice(0, 6)
                : [],
              inline: Array.isArray(macro.alt_strength.groups.inline)
                ? macro.alt_strength.groups.inline.slice(0, 6)
                : [],
            }
          : null,
        alt_news: Array.isArray(macro.alt_news)
          ? macro.alt_news.slice(0, 3).map((item) => ({
              symbol: item.symbol || null,
              tone: item.tone || null,
              title: safeText(item.title, 160) || null,
              window: item.window || null,
            }))
          : [],
        mood: macro.mood
          ? {
              label: macro.mood.label || null,
              reason: safeText(macro.mood.reason, 160) || null,
            }
          : null,
      }
    : null;

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
    data_freshness: reports?.layer1?.data_freshness || null,
    portfolio_guidance: reports?.layer1?.portfolio_guidance || null,
    reports_generated_at: {
      watchlist: reports?.layer1?.generated_at || null,
      discovery: reports?.discovery?.generated_at || null,
      defi: reports?.defi?.generated_at || null,
      alerts: reports?.alerts?.generated_at || null,
      diff: reports?.diff?.current_scan_date || null,
      supervisor: reports?.supervisor?.generated_at || null,
      backtest: reports?.backtest?.generated_at || null,
    },
    discovery_criteria: reports?.discovery?.criteria || null,
    discovery_total_candidates:
      typeof reports?.discovery?.total_candidates === 'number'
        ? reports.discovery.total_candidates
        : null,
    alerts,
    diffTop,
    discoveryTop,
    defiTop,
    macro_pulse: macroPulse,
    supervisor,
    backtest,
  };
}

function collectMentionedItems({ conversation, reports, selectedItem }) {
  const text = conversation
    .map((m) => String(m?.content || ''))
    .join('\n')
    .slice(-8000)
    .toLowerCase();

  const hits = [];
  const seen = new Set();

  function push(kind, data) {
    const key = `${kind}:${String(data?.id || data?.symbol || data?.name || '')}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, data });
  }

  if (selectedItem?.kind && selectedItem?.data) {
    push(selectedItem.kind, selectedItem.data);
  }

  const layerCoins = Array.isArray(reports?.layer1?.coins) ? reports.layer1.coins : [];
  for (const c of layerCoins) {
    const id = String(c?.coin_gecko_id || '').trim().toLowerCase();
    const name = String(c?.name || '').trim().toLowerCase();
    const symbol = String(c?.symbol || '').trim().toLowerCase();

    const match =
      (id && text.includes(id)) ||
      (name && text.includes(name)) ||
      (symbol && symbol.length >= 3 && includesWord(text, symbol));
    if (!match) continue;

    const summary = summarizeCoin(c, reports);
    if (summary) push('watchlist_coin', summary);
    if (hits.length >= 6) break;
  }

  const discoveryCandidates = Array.isArray(reports?.discovery?.candidates)
    ? reports.discovery.candidates
    : [];
  for (const c of discoveryCandidates) {
    const id = String(c?.id || '').trim().toLowerCase();
    const name = String(c?.name || '').trim().toLowerCase();
    const symbol = String(c?.symbol || '').trim().toLowerCase();

    const match =
      (id && text.includes(id)) ||
      (name && text.includes(name)) ||
      (symbol && symbol.length >= 4 && includesWord(text, symbol));
    if (!match) continue;

    const summary = summarizeDiscoveryCandidate(c, reports);
    if (summary) push('discovery_candidate', summary);
    if (hits.length >= 6) break;
  }

  return hits.slice(0, 6);
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
    '- Discovery results are NOT recommendations. Discovery is just a shortlist that passed the discovery filters (volume, size, and recent move). Meme coins can appear if they match the numbers.',
    '- If the user asks "why was this chosen?", explain whether it was:',
    '  - on the Watchlist/Staging list (manually added or staged), and why it got its decision label, OR',
    '  - on the Discovery list (passed the discovery filters), and show the key numbers that triggered it.',
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
    req.headers.get('x-chat-password') || req.headers.get('x-access-key') || '';
  if (String(provided) !== password) {
    return new Response(JSON.stringify({ error: 'Access key required.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
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
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY on the server.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
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
  const singleMessage = typeof body?.message === 'string' ? body.message.trim() : '';

  const conversation = incomingMessages
    ? incomingMessages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: safeText(m.content, 2000) }))
        .slice(-20)
    : singleMessage
      ? [{ role: 'user', content: safeText(singleMessage, 2000) }]
      : [];

  if (conversation.length === 0) {
    return new Response(JSON.stringify({ error: 'No message provided.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
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
  const selectedDiscovery = selectedCoin
    ? null
    : findDiscoveryCandidate(reports.discovery, coin);

  const coinSummary = summarizeCoin(selectedCoin, reports);
  const discoverySummary = summarizeDiscoveryCandidate(selectedDiscovery, reports);

  const selectedItem = coinSummary
    ? { kind: 'watchlist_coin', data: coinSummary }
    : discoverySummary
      ? { kind: 'discovery_candidate', data: discoverySummary }
      : null;

  const globalSummary = summarizeGlobal(reports);
  const mentionedItems = collectMentionedItems({
    conversation,
    reports,
    selectedItem,
  });

  const system = buildSystemPrompt();
  const context = {
    reports_base_url: reports.baseUrl,
    selected_item: selectedItem,
    mentioned_items: mentionedItems,
    global: globalSummary,
  };

  const messages = [
    { role: 'system', content: system },
    {
      role: 'system',
      content: `Report context (JSON):\n${safeText(JSON.stringify(context, null, 2), 16000)}`,
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
