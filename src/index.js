const fs = require("fs");
const path = require("path");
const { renderDashboard } = require("./render_dashboard");
const {
  computeAlerts,
  renderAlertsMarkdown,
  maybeShowPopup,
} = require("./alerts");

const ENV_PATH = path.join(__dirname, "..", ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(ENV_PATH);

const DEFAULT_DEMO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || null;
const COINGECKO_API_KEY_HEADER = (() => {
  if (process.env.COINGECKO_API_KEY_HEADER) {
    return process.env.COINGECKO_API_KEY_HEADER;
  }
  if (COINGECKO_API_KEY && COINGECKO_API_KEY.startsWith("CG-")) {
    return "x_cg_demo_api_key";
  }
  return "x_cg_pro_api_key";
})();
const COINGECKO_API_KEY_IN_QUERY =
  process.env.COINGECKO_API_KEY_IN_QUERY === "1" ||
  (COINGECKO_API_KEY && COINGECKO_API_KEY.startsWith("CG-"));

// On-chain data sources (free explorers first, then Covalent as fallback)
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || null;
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || null;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || null;
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || null;
const OPTIMISM_API_KEY = process.env.OPTIMISM_API_KEY || null; // Optimistic Etherscan
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || null;

// Ethplorer (Ethereum-only token holders; set ETHPLORER_API_KEY or use "freekey")
const ETHPLORER_API_KEY = process.env.ETHPLORER_API_KEY || null;
const ETHPLORER_BASE_URL = "https://api.ethplorer.io";
let ethplorerLastCallAt = 0;
const explorerHolderWarnings = new Set();

// Covalent/GoldRush API configuration (fallback option)
const COVALENT_API_KEY = process.env.COVALENT_API_KEY || null;
const COVALENT_BASE_URL = "https://api.goldrush.dev";

const BASE_URL =
  process.env.COINGECKO_BASE_URL ||
  (COINGECKO_API_KEY
    ? COINGECKO_API_KEY.startsWith("CG-")
      ? DEFAULT_DEMO_BASE_URL
      : DEFAULT_PRO_BASE_URL
    : DEFAULT_DEMO_BASE_URL);

const VS_CURRENCY = "usd";
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const CACHE_DIR = path.join(REPORTS_DIR, "cache");
const BACKTEST_DIR = path.join(REPORTS_DIR, "backtest");
const BACKTEST_PREDICTIONS_PATH = path.join(BACKTEST_DIR, "predictions.json");
const BACKTEST_REPORT_MD_PATH = path.join(BACKTEST_DIR, "BacktestReport.md");
const BACKTEST_REPORT_JSON_PATH = path.join(BACKTEST_DIR, "BacktestReport.json");
const DASHBOARD_PATH = path.join(REPORTS_DIR, "Dashboard.html");
const ALERTS_JSON_PATH = path.join(REPORTS_DIR, "Alerts.json");
const ALERTS_MD_PATH = path.join(REPORTS_DIR, "Alerts.md");
const ALERT_STATE_PATH = path.join(REPORTS_DIR, "alert_state.json");
const WATCHLIST_PATH = path.join(__dirname, "..", "config", "watchlist.json");
const STAGING_WATCHLIST_PATH = path.join(
  __dirname,
  "..",
  "config",
  "watchlist_staging.json"
);
const DISCOVERY_QUEUE_PATH = path.join(
  __dirname,
  "..",
  "config",
  "discovery_queue.json"
);

const CACHE_TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES || 360);
const CACHE_TTL_MS =
  Number.isFinite(CACHE_TTL_MINUTES) && CACHE_TTL_MINUTES > 0
    ? CACHE_TTL_MINUTES * 60 * 1000
    : 360 * 60 * 1000;
const SKIP_MARKET_CHART = process.env.SKIP_MARKET_CHART === "1";

const VOLUME_LOW = 5_000_000;
const VOLUME_DROP = 1_000_000;
const CHASING_7D = 40;
const CHASING_24H = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCoinGeckoError(bodyText) {
  try {
    const payload = JSON.parse(bodyText);
    const status = payload.status || {};
    const code = status.error_code || payload.error_code;
    const message =
      status.error_message || payload.error_message || payload.error;
    if (!code && !message) {
      return null;
    }
    switch (code) {
      case 10002:
        return "CoinGecko API key missing. Set COINGECKO_API_KEY and verify the header/query parameter name.";
      case 10005:
        return "CoinGecko endpoint not available on your plan.";
      case 10010:
        return "CoinGecko Pro key used with demo base URL. Set COINGECKO_BASE_URL=https://pro-api.coingecko.com/api/v3.";
      case 10011:
        return "CoinGecko Demo key used with pro base URL. Use https://api.coingecko.com/api/v3 or set COINGECKO_BASE_URL.";
      case 1020:
        return "CoinGecko access denied by CDN firewall. Try again later or check your IP/network.";
      default:
        return code
          ? `CoinGecko error ${code}: ${message || "Request failed."}`
          : `CoinGecko error: ${message}`;
    }
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}, retries = 2) {
  const headers = {
    accept: "application/json",
    ...(options.headers || {}),
  };
  let requestUrl = url;
  if (COINGECKO_API_KEY && url.startsWith(BASE_URL)) {
    headers[COINGECKO_API_KEY_HEADER] = COINGECKO_API_KEY;
    if (COINGECKO_API_KEY_IN_QUERY) {
      const urlObj = new URL(url);
      if (!urlObj.searchParams.has(COINGECKO_API_KEY_HEADER)) {
        urlObj.searchParams.set(COINGECKO_API_KEY_HEADER, COINGECKO_API_KEY);
      }
      requestUrl = urlObj.toString();
    }
  }
  try {
    const response = await fetch(requestUrl, { ...options, headers });
    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 30000;
        await sleep(waitMs);
        return fetchJson(url, options, retries - 1);
      }
      const body = await response.text();
      if (requestUrl.startsWith(BASE_URL)) {
        const friendly = formatCoinGeckoError(body);
        if (friendly) {
          throw new Error(friendly);
        }
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
    }
    return await response.json();
  } catch (err) {
    if (retries > 0) {
      await sleep(750);
      return fetchJson(url, options, retries - 1);
    }
    throw err;
  }
}

function average(values) {
  if (!values || values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const digits = Math.abs(value) >= 1 ? 2 : 6;
  return (
    "$" +
    value.toLocaleString("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    })
  );
}

function formatUsdCompact(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  return formatUsd(value);
}

function formatPct(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(2)}%`;
}

function formatSignedPct(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isoToFilename(isoString) {
  if (!isoString) {
    return "unknown_time";
  }
  return isoString.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function normalizeCoinGeckoId(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function readCache(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > CACHE_TTL_MS) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function buildSupervisorSchema() {
  return {
    name: "daily_watchlist_supervisor_output",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionable_today: { type: "boolean" },
        executive_summary: { type: "string" },
        onchain_highlights: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              symbol: { type: "string" },
              chain: { type: "string" },
              risk: { type: "string", enum: ["HIGH", "OK", "UNKNOWN"] },
              facts: { type: "array", maxItems: 4, items: { type: "string" } },
            },
            required: ["symbol", "chain", "risk", "facts"],
          },
        },
        watch_closely: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              symbol: { type: "string" },
              verdict: { type: "string", enum: ["WATCH CLOSELY"] },
              why: { type: "string" },
              key_data_points: { type: "array", items: { type: "string" } },
            },
            required: ["symbol", "verdict", "why", "key_data_points"],
          },
        },
        avoid_chasing: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              symbol: { type: "string" },
              verdict: { type: "string", enum: ["AVOID/CHASING"] },
              why: { type: "string" },
              key_data_points: { type: "array", items: { type: "string" } },
            },
            required: ["symbol", "verdict", "why", "key_data_points"],
          },
        },
        manual_checks_required: { type: "array", items: { type: "string" } },
        source_links_used: { type: "array", items: { type: "string" } },
      },
      required: [
        "actionable_today",
        "executive_summary",
        "onchain_highlights",
        "watch_closely",
        "avoid_chasing",
        "manual_checks_required",
        "source_links_used",
      ],
    },
  };
}

async function runSupervisor(layer1Report) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "skipped", reason: "OPENAI_API_KEY not set" };
  }
  const model = process.env.OPENAI_MODEL_SUPERVISOR || "gpt-4o";

  const systemMsg =
    "You are a strict crypto research supervisor. " +
    "Do not hype. Do not invent facts. " +
    "Only use the provided JSON. " +
    "Do not claim a clean catalyst unless it is dated within 14 days and linked. " +
    "If unlock data is UNKNOWN/LOW, mark not actionable and say it needs verification. " +
    "For on-chain: do not guess address identity (exchange/whale/team). Only summarize chain, holder concentration %, and EOA vs CONTRACT counts when available.";

  const userMsg =
    "Summarize today's scan strictly using the provided JSON only. " +
    "Return JSON matching the schema. " +
    "Include up to 5 on-chain highlights focusing on coins where `high_concentration_risk=true`; otherwise include any with on-chain data. " +
    "Do not include raw addresses in the highlight facts.\n\n" +
    JSON.stringify(layer1Report);

  const schema = buildSupervisorSchema();

  const body = {
    model,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schema.name,
        schema: schema.schema,
      },
    },
  };

  try {
    const response = await fetchJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI response missing content.");
    }

    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI API error: ${err.message}`);
  }
}

async function fetchMarketData(ids) {
  const uniqueIds = Array.from(
    new Set((ids || []).map((id) => (typeof id === "string" ? id : "")).filter(Boolean))
  );
  if (!uniqueIds.length) {
    return [];
  }
  const cachePath = path.join(CACHE_DIR, "markets.json");
  const cached = readCache(cachePath);
  const cachedArray = Array.isArray(cached) ? cached : [];
  const cachedById = new Map(
    cachedArray
      .filter((entry) => entry && typeof entry === "object" && entry.id)
      .map((entry) => [entry.id, entry])
  );

  const missingIds = uniqueIds.filter((id) => !cachedById.has(id));
  if (cached && missingIds.length === 0) {
    return cachedArray;
  }

  const idsToFetch = cached ? missingIds : uniqueIds;
  const fetched = [];
  const chunkSize = 250;
  for (let i = 0; i < idsToFetch.length; i += chunkSize) {
    const chunk = idsToFetch.slice(i, i + chunkSize);
    const url = `${BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
      `&ids=${chunk.join(",")}` +
      `&price_change_percentage=24h,7d,30d&sparkline=false&per_page=250&page=1`;
    const data = await fetchJson(url);
    if (Array.isArray(data)) {
      fetched.push(...data);
    }
  }

  for (const entry of fetched) {
    if (entry && typeof entry === "object" && entry.id) {
      cachedById.set(entry.id, entry);
    }
  }
  const merged = Array.from(cachedById.values());
  writeCache(cachePath, merged);
  return merged;
}

async function fetchBtcData() {
  const cachePath = path.join(CACHE_DIR, "btc_market.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const url = `${BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
    `&ids=bitcoin&price_change_percentage=24h,7d,30d&sparkline=false`;
  const data = await fetchJson(url);
  const btc = data[0] || null;
  writeCache(cachePath, btc);
  return btc;
}

function computeRelativeStrength(coinChange, btcChange) {
  if (coinChange === null || btcChange === null) {
    return null;
  }
  // Relative strength = coin performance - BTC performance
  // Positive = outperforming BTC, Negative = underperforming
  return coinChange - btcChange;
}

async function fetchMarketChart(id) {
  const cachePath = path.join(CACHE_DIR, `market_chart_${id}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const url = `${BASE_URL}/coins/${id}/market_chart?vs_currency=${VS_CURRENCY}` +
    `&days=30&interval=daily`;
  const data = await fetchJson(url);
  writeCache(cachePath, data);
  return data;
}

function getVolumeStats(marketChart) {
  if (!marketChart || !Array.isArray(marketChart.total_volumes)) {
    return { avg7d: null, avg30d: null };
  }
  const volumes = marketChart.total_volumes
    .map((entry) => num(entry[1]))
    .filter((value) => Number.isFinite(value));
  if (!volumes.length) {
    return { avg7d: null, avg30d: null };
  }
  const last7 = volumes.slice(-7);
  const last30 = volumes.slice(-30);
  return {
    avg7d: average(last7),
    avg30d: average(last30),
  };
}

function computeDilution(market) {
  const circulating = num(market?.circulating_supply);
  const totalSupply = num(market?.total_supply) ?? num(market?.max_supply);
  const marketCap = num(market?.market_cap);
  const fdv = num(market?.fully_diluted_valuation);
  const floatPercent =
    circulating !== null && totalSupply ? (circulating / totalSupply) * 100 : null;
  const marketcapToFdv =
    marketCap !== null && fdv ? marketCap / fdv : null;

  const highDilutionRisk =
    (floatPercent !== null && floatPercent < 20) ||
    (marketcapToFdv !== null && marketcapToFdv < 0.2) ||
    (marketCap !== null && fdv !== null && fdv >= marketCap * 5);

  const lowFloatRisk = floatPercent !== null && floatPercent < 20;

  return {
    circulating,
    totalSupply,
    marketCap,
    fdv,
    floatPercent,
    marketcapToFdv,
    highDilutionRisk,
    lowFloatRisk,
  };
}

function evaluateGates(coin) {
  const trackableData =
    coin.price !== null &&
    coin.price_change_24h !== null &&
    coin.price_change_7d !== null &&
    coin.price_change_30d !== null &&
    coin.volume_24h !== null &&
    coin.circulating_supply !== null &&
    (coin.fdv !== null ||
      coin.total_supply !== null ||
      coin.max_supply !== null);

  const liquidity = coin.volume_24h !== null && coin.volume_24h >= VOLUME_LOW;
  const unlockTransparency = coin.unlock_confidence !== "UNKNOWN";
  const traction = coin.traction_status === "OK";
  
  // Concentration risk gate: fails if high concentration detected
  // If data unavailable, don't fail the gate (graceful degradation)
  const concentrationRisk = coin.holder_confidence === "MEDIUM" 
    ? !coin.high_concentration_risk 
    : true; // Pass if data unavailable

  return {
    trackable_data: trackableData,
    liquidity,
    unlock_transparency: unlockTransparency,
    traction,
    concentration_risk: concentrationRisk,
  };
}

function decideLabel(coin, gates) {
  // Now 5 gates total (added concentration_risk)
  const score =
    (gates.trackable_data ? 1 : 0) +
    (gates.liquidity ? 1 : 0) +
    (gates.unlock_transparency ? 1 : 0) +
    (gates.traction ? 1 : 0) +
    (gates.concentration_risk ? 1 : 0);

  let label = "WATCH-ONLY";
  const severeLiquidity = coin.volume_24h !== null && coin.volume_24h < VOLUME_DROP;
  
  // High concentration risk is a severe warning
  const severeConcentrationRisk = coin.high_concentration_risk === true;

  if (!gates.trackable_data || severeLiquidity) {
    label = "DROP";
  } else if (score >= 3 && !severeConcentrationRisk) {
    label = "KEEP";
  }

  if (label === "KEEP" && coin.unlock_confidence === "UNKNOWN") {
    label = "WATCH-ONLY";
  }
  
  // High concentration risk downgrades to WATCH-ONLY even if other gates pass
  if (label === "KEEP" && severeConcentrationRisk) {
    label = "WATCH-ONLY";
  }

  return label;
}

function rankCoins(coins) {
  const candidates = coins.filter((coin) => coin.hygiene_label !== "DROP");
  const ranked = [...candidates].sort((a, b) => {
    // 1. Clean catalyst is most important
    const catalystA = a.has_clean_catalyst ? 1 : 0;
    const catalystB = b.has_clean_catalyst ? 1 : 0;
    if (catalystA !== catalystB) {
      return catalystB - catalystA;
    }
    // 2. Outperforming BTC is next (relative strength)
    const rsA = a.outperforming_btc ? 1 : 0;
    const rsB = b.outperforming_btc ? 1 : 0;
    if (rsA !== rsB) {
      return rsB - rsA;
    }
    // 3. Not chasing
    const chaseA = a.chasing ? 1 : 0;
    const chaseB = b.chasing ? 1 : 0;
    if (chaseA !== chaseB) {
      return chaseA - chaseB;
    }
    // 4. Lower dilution risk
    const dilutionA = a.high_dilution_risk ? 1 : 0;
    const dilutionB = b.high_dilution_risk ? 1 : 0;
    if (dilutionA !== dilutionB) {
      return dilutionA - dilutionB;
    }
    // 5. Higher relative strength (actual value)
    const rs7dA = a.relative_strength_7d || -Infinity;
    const rs7dB = b.relative_strength_7d || -Infinity;
    if (rs7dA !== rs7dB) {
      return rs7dB - rs7dA;
    }
    // 6. Volume as final tiebreaker
    return (b.volume_24h || 0) - (a.volume_24h || 0);
  });

  const avoidChasing = [...coins]
    .filter((coin) => coin.chasing)
    .sort((a, b) => {
      const aMax = Math.max(a.price_change_7d || 0, a.price_change_24h || 0);
      const bMax = Math.max(b.price_change_7d || 0, b.price_change_24h || 0);
      return bMax - aMax;
    })
    .slice(0, 3);

  return {
    ranked,
    top_watch: ranked.slice(0, 3),
    top_avoid: avoidChasing,
  };
}

// DefiLlama API helpers (FREE - no API key needed)
async function fetchDefiLlamaProtocols() {
  const cachePath = path.join(CACHE_DIR, "defillama_protocols.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson("https://api.llama.fi/protocols", {}, 1);
    writeCache(cachePath, data);
    return data || [];
  } catch (err) {
    console.warn(`DefiLlama protocols fetch failed: ${err.message}`);
    return [];
  }
}

async function fetchDefiLlamaTVL(protocolSlug) {
  if (!protocolSlug) return null;
  const cachePath = path.join(CACHE_DIR, `defillama_tvl_${protocolSlug}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`https://api.llama.fi/protocol/${protocolSlug}`, {}, 1);
    writeCache(cachePath, data);
    return data;
  } catch (err) {
    return null;
  }
}

async function fetchDefiLlamaUnlocks(protocolSlug) {
  if (!protocolSlug) return null;
  const cachePath = path.join(CACHE_DIR, `defillama_unlocks_${protocolSlug}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`https://api.llama.fi/unlocks/${protocolSlug}`, {}, 1);
    writeCache(cachePath, data);
    return data;
  } catch (err) {
    return null;
  }
}

// GitHub API helper (FREE - no auth needed for public repos)
function extractGitHubRepo(url) {
  if (!url) return null;
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }
  return null;
}

async function fetchGitHubReleases(owner, repo) {
  if (!owner || !repo) return [];
  const cachePath = path.join(CACHE_DIR, `github_releases_${owner}_${repo}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`, {}, 1);
    writeCache(cachePath, data);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

// CoinGecko developer data (uses existing API key)
async function fetchCoinGeckoDeveloperData(id) {
  if (!id) return null;
  const cachePath = path.join(CACHE_DIR, `coingecko_dev_${id}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`${BASE_URL}/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=true&sparkline=false`);
    writeCache(cachePath, data);
    return data?.developer_data || null;
  } catch (err) {
    return null;
  }
}

// Fetch full coin details from CoinGecko (includes contract addresses)
async function fetchCoinGeckoFullDetails(id) {
  if (!id) return null;
  const cachePath = path.join(CACHE_DIR, `coingecko_full_${id}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`${BASE_URL}/coins/${id}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false&sparkline=false`);
    writeCache(cachePath, data);
    return data || null;
  } catch (err) {
    return null;
  }
}

function normalizeContractAddress(address) {
  if (!address) {
    return null;
  }
  const trimmed = String(address).trim();
  if (!trimmed) {
    return null;
  }
  if (
    trimmed.toLowerCase() === "0x0000000000000000000000000000000000000000"
  ) {
    return null;
  }
  return trimmed;
}

// Extract primary contract address from CoinGecko (platforms/detail_platforms)
function extractPrimaryContractAddress(coinDetails) {
  const candidates = [];
  const seenChains = new Set();

  const detailPlatforms =
    coinDetails?.detail_platforms &&
    typeof coinDetails.detail_platforms === "object"
      ? coinDetails.detail_platforms
      : null;

  if (detailPlatforms) {
    for (const [chain, info] of Object.entries(detailPlatforms)) {
      const config = getExplorerConfig(chain);
      if (!config) continue;
      const address = normalizeContractAddress(info?.contract_address);
      if (!address) continue;
      candidates.push({
        chain,
        address,
        decimals: num(info?.decimal_place),
      });
      seenChains.add(String(chain).toLowerCase());
    }
  }

  const platforms =
    coinDetails?.platforms && typeof coinDetails.platforms === "object"
      ? coinDetails.platforms
      : null;

  if (platforms) {
    for (const [chain, contractAddress] of Object.entries(platforms)) {
      const chainKey = String(chain).toLowerCase();
      if (seenChains.has(chainKey)) continue;
      const config = getExplorerConfig(chain);
      if (!config) continue;
      const address = normalizeContractAddress(contractAddress);
      if (!address) continue;
      candidates.push({ chain, address, decimals: null });
      seenChains.add(chainKey);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const preferredOrder = [
    "ethereum",
    "arbitrum-one",
    "optimistic-ethereum",
    "base",
    "polygon-pos",
    "binance-smart-chain",
  ];
  const orderIndex = (chain) => {
    const idx = preferredOrder.indexOf(String(chain).toLowerCase());
    return idx === -1 ? 999 : idx;
  };

  candidates.sort((a, b) => orderIndex(a.chain) - orderIndex(b.chain));

  const withExplorerKey = candidates.find((c) => {
    const config = getExplorerConfig(c.chain);
    return config && config.apiKey;
  });
  if (withExplorerKey) {
    return withExplorerKey;
  }

  if (COVALENT_API_KEY) {
    const withCovalent = candidates.find((c) => {
      const config = getExplorerConfig(c.chain);
      return config && config.covalentChain;
    });
    if (withCovalent) {
      return withCovalent;
    }
  }

  return candidates[0];
}

// Map CoinGecko chain identifiers to explorer APIs
function getExplorerConfig(geckoChain) {
  const chainMap = {
    "ethereum": {
      explorer: "etherscan",
      apiKey: ETHERSCAN_API_KEY,
      baseUrl: "https://api.etherscan.io/api",
      webUrl: "https://etherscan.io",
      rpcUrl: "https://ethereum.publicnode.com",
      covalentChain: "eth-mainnet",
    },
    "binance-smart-chain": {
      explorer: "bscscan",
      apiKey: BSCSCAN_API_KEY,
      baseUrl: "https://api.bscscan.com/api",
      webUrl: "https://bscscan.com",
      rpcUrl: "https://bsc-dataseed.binance.org",
      covalentChain: "bsc-mainnet",
    },
    "polygon-pos": {
      explorer: "polygonscan",
      apiKey: POLYGONSCAN_API_KEY,
      baseUrl: "https://api.polygonscan.com/api",
      webUrl: "https://polygonscan.com",
      rpcUrl: "https://polygon-rpc.com",
      covalentChain: "matic-mainnet",
    },
    "arbitrum-one": {
      explorer: "arbiscan",
      apiKey: ARBISCAN_API_KEY,
      baseUrl: "https://api.arbiscan.io/api",
      webUrl: "https://arbiscan.io",
      rpcUrl: "https://arb1.arbitrum.io/rpc",
      covalentChain: "arbitrum-mainnet",
    },
    "optimistic-ethereum": {
      explorer: "optimism",
      apiKey: OPTIMISM_API_KEY,
      baseUrl: "https://api-optimistic.etherscan.io/api",
      webUrl: "https://optimistic.etherscan.io",
      rpcUrl: "https://mainnet.optimism.io",
      covalentChain: "optimism-mainnet",
    },
    "base": {
      explorer: "basescan",
      apiKey: BASESCAN_API_KEY,
      baseUrl: "https://api.basescan.org/api",
      webUrl: "https://basescan.org",
      rpcUrl: "https://mainnet.base.org",
      covalentChain: "base-mainnet",
    },
  };
  
  return chainMap[geckoChain?.toLowerCase()] || null;
}

function formatOnChainSource(source) {
  const key = String(source || "").toLowerCase();
  const map = {
    etherscan: "Etherscan",
    bscscan: "BSCScan",
    polygonscan: "PolygonScan",
    arbiscan: "Arbiscan",
    optimism: "Optimism",
    basescan: "BaseScan",
    ethplorer: "Ethplorer",
    covalent: "Covalent/GoldRush",
  };
  return map[key] || (source ? String(source) : "UNKNOWN");
}

function shortAddress(address) {
  if (!address) {
    return "n/a";
  }
  const value = String(address);
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function getExplorerAddressUrl(explorerConfig, address) {
  if (!explorerConfig?.webUrl || !address) {
    return null;
  }
  return `${explorerConfig.webUrl}/address/${address}`;
}

function normalizeHolderBalance(balanceValue, source, tokenDecimals = null) {
  if (balanceValue === null || balanceValue === undefined) {
    return null;
  }
  const src = String(source || "").toLowerCase();
  const decimals =
    typeof tokenDecimals === "number" && Number.isFinite(tokenDecimals)
      ? tokenDecimals
      : null;
  const cleaned =
    typeof balanceValue === "string"
      ? balanceValue.replace(/,/g, "").trim()
      : balanceValue;

  if (
    (src === "covalent" || src === "ethplorer") &&
    decimals !== null &&
    typeof cleaned === "string" &&
    /^\d+$/.test(cleaned)
  ) {
    const raw = Number(cleaned);
    const divisor = 10 ** decimals;
    if (!Number.isFinite(raw) || !Number.isFinite(divisor) || divisor <= 0) {
      return null;
    }
    return raw / divisor;
  }

  if (typeof cleaned === "string") {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return num(cleaned);
}

async function fetchExplorerAddressType(explorerConfig, address) {
  if (!explorerConfig || !address) {
    return null;
  }

  const addressLower = String(address).toLowerCase();
  const cacheSuffix = explorerConfig.rpcUrl ? "rpc" : "api";
  const cachePath = path.join(
    CACHE_DIR,
    `explorer_code_${explorerConfig.explorer}_${cacheSuffix}_${addressLower}.json`
  );
  const cached = readCache(cachePath);
  if (cached && typeof cached.is_contract === "boolean") {
    return cached.is_contract ? "CONTRACT" : "EOA";
  }

  try {
    let code = null;

    if (explorerConfig.rpcUrl) {
      const response = await fetch(explorerConfig.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getCode",
          params: [address, "latest"],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        code = typeof data?.result === "string" ? data.result : null;
      }
    }

    if (!code && explorerConfig.apiKey && explorerConfig.baseUrl) {
      const url = `${explorerConfig.baseUrl}?module=proxy&action=eth_getCode&address=${address}&tag=latest&apikey=${explorerConfig.apiKey}`;
      const data = await fetchJson(url, {}, 1);
      code = typeof data?.result === "string" ? data.result : null;
    }

    if (code && !/^0x[0-9a-f]*$/i.test(String(code).trim())) {
      return null;
    }

    if (!code) {
      return null;
    }
    const normalized = code.toLowerCase();
    const isContract =
      normalized !== "0x" && normalized !== "0x0" && normalized.length > 2;
    writeCache(cachePath, { is_contract: isContract });
    return isContract ? "CONTRACT" : "EOA";
  } catch {
    return null;
  }
}

async function buildOnchainDetails({
  holdersData,
  contractInfo,
  supplyUsed,
  top10HolderPercent,
  highConcentrationRisk,
}) {
  if (!holdersData || !Array.isArray(holdersData?.items) || !contractInfo) {
    return null;
  }

  const explorerConfig = getExplorerConfig(contractInfo.chain);
  const contractUrl = explorerConfig
    ? getExplorerAddressUrl(explorerConfig, contractInfo.address)
    : null;
  const shouldDetectContracts =
    Boolean(explorerConfig?.rpcUrl) ||
    highConcentrationRisk === true ||
    (typeof top10HolderPercent === "number" &&
      Number.isFinite(top10HolderPercent) &&
      top10HolderPercent >= 30);

  const topRaw = holdersData.items.slice(0, 10);
  const top = topRaw.map((holder, idx) => {
    const balanceTokens = normalizeHolderBalance(
      holder?.balance,
      holdersData.source,
      contractInfo.decimals ?? null
    );
    const percent =
      typeof supplyUsed === "number" &&
      Number.isFinite(supplyUsed) &&
      supplyUsed > 0 &&
      typeof balanceTokens === "number" &&
      Number.isFinite(balanceTokens) &&
      balanceTokens >= 0
        ? (balanceTokens / supplyUsed) * 100
        : null;
    const address = holder?.address || null;
    return {
      rank: holder?.rank || idx + 1,
      address,
      address_url: explorerConfig ? getExplorerAddressUrl(explorerConfig, address) : null,
      address_type: null,
      percent_of_supply: percent,
    };
  });

  if (shouldDetectContracts && (explorerConfig?.rpcUrl || explorerConfig?.apiKey)) {
    for (let i = 0; i < Math.min(top.length, 5); i++) {
      const holder = top[i];
      if (!holder.address) continue;
      holder.address_type = await fetchExplorerAddressType(
        explorerConfig,
        holder.address
      );
      await sleep(220);
    }
  }

  return {
    chain: contractInfo.chain || null,
    contract_address: contractInfo.address || null,
    contract_url: contractUrl,
    source: formatOnChainSource(holdersData.source),
    top_holders: top,
  };
}

async function fetchEthplorerTokenHolders(contractAddress, limit = 20) {
  if (!contractAddress) {
    return null;
  }

  const apiKey = String(ETHPLORER_API_KEY || "freekey").trim();
  if (!apiKey) {
    return null;
  }

  const cachePath = path.join(
    CACHE_DIR,
    `ethplorer_holders_${contractAddress.toLowerCase()}.json`
  );
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }

  const minIntervalMs = 1100;
  const since = Date.now() - ethplorerLastCallAt;
  if (since < minIntervalMs) {
    await sleep(minIntervalMs - since);
  }
  ethplorerLastCallAt = Date.now();

  try {
    const url =
      `${ETHPLORER_BASE_URL}/getTopTokenHolders/${contractAddress}` +
      `?apiKey=${encodeURIComponent(apiKey)}&limit=${encodeURIComponent(limit)}`;
    const payload = await fetchJson(url, {}, 1);
    const holdersRaw = Array.isArray(payload?.holders) ? payload.holders : null;
    if (!holdersRaw || holdersRaw.length === 0) {
      return null;
    }

    const holders = holdersRaw
      .slice(0, limit)
      .map((holder, idx) => ({
        address: holder?.address || null,
        balance: holder?.rawBalance ?? holder?.balance ?? null,
        rank: idx + 1,
        percent: num(holder?.share),
      }))
      .filter((holder) => holder.address && holder.balance !== null);

    if (holders.length === 0) {
      return null;
    }

    const result = { items: holders, source: "ethplorer" };
    writeCache(cachePath, result);
    return result;
  } catch (err) {
    console.warn(`Ethplorer holders fetch failed: ${err.message}`);
    return null;
  }
}

// Fetch token holders from Etherscan-style APIs (free tier)
async function fetchExplorerTokenHolders(explorerConfig, contractAddress) {
  if (!explorerConfig || !explorerConfig.apiKey || !contractAddress) {
    return null;
  }
  
  const cachePath = path.join(CACHE_DIR, `explorer_holders_${explorerConfig.explorer}_${contractAddress.toLowerCase()}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  
  try {
    // Etherscan-style API: tokenholderlist
    // Returns top 1000 token holders
    const url = `${explorerConfig.baseUrl}?module=token&action=tokenholderlist&contractaddress=${contractAddress}&page=1&offset=20&apikey=${explorerConfig.apiKey}`;
    const data = await fetchJson(url, {}, 1);
    
    // Etherscan-style returns: { status: "1", message: "OK", result: [...] }
    if (data?.status === "1" && Array.isArray(data.result)) {
      // Transform to our format
      const holders = data.result.slice(0, 20).map((holder, idx) => ({
        address: holder.TokenHolderAddress,
        balance: holder.TokenHolderQuantity,
        rank: idx + 1,
      }));
      
      const result = {
        items: holders,
        source: explorerConfig.explorer,
      };
      
      writeCache(cachePath, result);
      return result;
    }

    const warnKey = `${explorerConfig.explorer}:tokenholderlist`;
    if (!explorerHolderWarnings.has(warnKey)) {
      const reason =
        typeof data?.result === "string"
          ? data.result
          : typeof data?.message === "string"
            ? data.message
            : `status ${data?.status || "?"}`;
      console.warn(
        `Explorer holders unavailable (${explorerConfig.explorer}): ${reason}`
      );
      explorerHolderWarnings.add(warnKey);
    }

    return null;
  } catch (err) {
    console.warn(`Explorer holders fetch failed (${explorerConfig.explorer}): ${err.message}`);
    return null;
  }
}

// Fetch token holders from Covalent/GoldRush API (fallback)
async function fetchCovalentTokenHolders(chainName, contractAddress) {
  if (!COVALENT_API_KEY || !chainName || !contractAddress) {
    return null;
  }
  
  const cachePath = path.join(CACHE_DIR, `covalent_holders_${chainName}_${contractAddress.toLowerCase()}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  
  try {
    // Covalent/GoldRush API endpoint for token holders
    // GET /v1/{chain_id}/tokens/{address}/token_holders/
    const url = `${COVALENT_BASE_URL}/v1/${chainName}/tokens/${contractAddress}/token_holders/?key=${COVALENT_API_KEY}`;
    const payload = await fetchJson(url, {}, 1);

    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.items)
        ? payload.items
        : null;

    if (!items || items.length === 0) {
      return null;
    }

    const holders = items
      .slice(0, 20)
      .map((holder, idx) => ({
        address:
          holder?.address ||
          holder?.wallet_address ||
          holder?.holder_address ||
          null,
        balance: holder?.balance ?? null,
        rank: idx + 1,
      }))
      .filter((h) => h.address && h.balance !== null);

    if (holders.length === 0) {
      return null;
    }

    const result = { items: holders, source: "covalent" };
    writeCache(cachePath, result);
    return result;
  } catch (err) {
    console.warn(`Covalent holders fetch failed for ${chainName}/${contractAddress}: ${err.message}`);
    return null;
  }
}

// Multi-source token holder fetcher (tries free explorers first, then Covalent)
async function fetchTokenHoldersMultiSource(geckoChain, contractAddress) {
  if (!contractAddress) {
    return null;
  }

  if (String(geckoChain || "").toLowerCase() === "ethereum") {
    const ethplorerData = await fetchEthplorerTokenHolders(contractAddress, 20);
    if (ethplorerData) {
      return ethplorerData;
    }
  }
  
  // Try free explorer APIs first
  const explorerConfig = getExplorerConfig(geckoChain);
  if (explorerConfig && explorerConfig.apiKey) {
    const explorerData = await fetchExplorerTokenHolders(explorerConfig, contractAddress);
    if (explorerData) {
      return explorerData;
    }
  }
  
  // Fallback to Covalent if available
  if (explorerConfig && explorerConfig.covalentChain && COVALENT_API_KEY) {
    const covalentData = await fetchCovalentTokenHolders(explorerConfig.covalentChain, contractAddress);
    if (covalentData) {
      return covalentData;
    }
  }
  
  return null;
}

// Evaluate holder concentration risk
function evaluateHolderConcentration(holdersData, totalSupply, tokenDecimals = null) {
  if (!holdersData || !Array.isArray(holdersData?.items)) {
    return {
      top_10_holder_percent: null,
      top_20_holder_percent: null,
      high_concentration_risk: false,
      holder_confidence: "UNKNOWN",
    };
  }
  
  const holders = holdersData.items.slice(0, 20); // Top 20 holders
  let top10Total = 0;
  let top20Total = 0;
  
  for (let i = 0; i < holders.length; i++) {
    const balance = normalizeHolderBalance(
      holders[i]?.balance,
      holdersData.source,
      tokenDecimals
    );
    
    if (balance !== null && Number.isFinite(balance) && balance > 0) {
      if (i < 10) {
        top10Total += balance;
      }
      top20Total += balance;
    }
  }
  
  const top10Percent = totalSupply && totalSupply > 0 
    ? (top10Total / totalSupply) * 100 
    : null;
  const top20Percent = totalSupply && totalSupply > 0 
    ? (top20Total / totalSupply) * 100 
    : null;
  
  // Flag high concentration: top 10 hold >50% OR top 20 hold >70%
  const highConcentrationRisk = 
    (top10Percent !== null && top10Percent > 50) ||
    (top20Percent !== null && top20Percent > 70);
  
  return {
    top_10_holder_percent: top10Percent,
    top_20_holder_percent: top20Percent,
    high_concentration_risk: highConcentrationRisk,
    holder_confidence: "MEDIUM",
  };
}

// Discovery: Find trending coins
async function fetchTrendingCoins() {
  const cachePath = path.join(CACHE_DIR, "trending_coins.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(`${BASE_URL}/search/trending`, {}, 1);
    const trending = data?.coins?.map((item) => ({
      id: item.item?.id,
      name: item.item?.name,
      symbol: item.item?.symbol,
      market_cap_rank: item.item?.market_cap_rank,
      score: item.item?.score || 0,
    })) || [];
    writeCache(cachePath, trending);
    return trending;
  } catch (err) {
    console.warn(`Trending coins fetch failed: ${err.message}`);
    return [];
  }
}

// Discovery: Find coins by market criteria (volume, market cap, price change)
async function discoverCoinsByCriteria(options = {}) {
  const {
    minVolume24h = 5_000_000, // $5M minimum
    maxMarketCap = 5_000_000_000, // $5B maximum (avoid mega caps)
    minMarketCap = 10_000_000, // $10M minimum
    minPriceChange7d = 5, // +5% minimum
    maxPriceChange7d = 100, // +100% maximum (avoid pumps)
    limit = 50,
  } = options;

  const cachePath = path.join(CACHE_DIR, `discovery_${minVolume24h}_${minMarketCap}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }

  try {
    // Fetch top coins by market cap
    const url = `${BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
      `&order=market_cap_desc` +
      `&per_page=250` +
      `&page=1` +
      `&price_change_percentage=24h,7d,30d` +
      `&sparkline=false`;
    
    const data = await fetchJson(url);
    
    // Filter by criteria
    const discovered = data
      .filter((coin) => {
        const volume24h = num(coin.total_volume);
        const marketCap = num(coin.market_cap);
        const priceChange7d = num(coin.price_change_percentage_7d_in_currency);
        
        return (
          volume24h >= minVolume24h &&
          marketCap >= minMarketCap &&
          marketCap <= maxMarketCap &&
          priceChange7d !== null &&
          priceChange7d >= minPriceChange7d &&
          priceChange7d <= maxPriceChange7d
        );
      })
      .slice(0, limit)
      .map((coin) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        current_price: num(coin.current_price),
        market_cap: num(coin.market_cap),
        total_volume: num(coin.total_volume),
        price_change_percentage_24h: num(coin.price_change_percentage_24h_in_currency),
        price_change_percentage_7d: num(coin.price_change_percentage_7d_in_currency),
        price_change_percentage_30d: num(coin.price_change_percentage_30d_in_currency),
        market_cap_rank: coin.market_cap_rank,
      }));
    
    writeCache(cachePath, discovered);
    return discovered;
  } catch (err) {
    console.warn(`Coin discovery failed: ${err.message}`);
    return [];
  }
}

// Helper to find DefiLlama protocol slug from coin name/symbol
function findDefiLlamaSlug(coinName, symbol, coinGeckoId, protocols) {
  if (!protocols || !Array.isArray(protocols)) return null;
  
  // Build comprehensive search terms
  const searchTerms = [
    coinName?.toLowerCase(),
    symbol?.toLowerCase(),
    coinGeckoId?.toLowerCase(),
    coinName?.toLowerCase().replace(/\s+/g, "-"),
    coinName?.toLowerCase().replace(/\s+/g, ""),
    // Common variations
    coinName?.toLowerCase().replace(/\./g, ""),
    coinName?.toLowerCase().replace(/\s+network/gi, ""),
    coinName?.toLowerCase().replace(/\s+protocol/gi, ""),
  ].filter(Boolean);
  
  // Try exact matches first
  for (const term of searchTerms) {
    const found = protocols.find((p) => 
      p.slug?.toLowerCase() === term ||
      p.name?.toLowerCase() === term ||
      p.symbol?.toLowerCase() === term
    );
    if (found) return found.slug;
  }
  
  // Try partial matches
  for (const term of searchTerms) {
    const found = protocols.find((p) => 
      p.slug?.toLowerCase().includes(term) ||
      p.name?.toLowerCase().includes(term) ||
      (term.length > 3 && p.slug?.toLowerCase().startsWith(term))
    );
    if (found) return found.slug;
  }
  
  return null;
}

// Parse RSS feed (simple parser for common formats)
async function fetchRSSFeed(url) {
  if (!url) return [];
  const cachePath = path.join(CACHE_DIR, `rss_${Buffer.from(url).toString('base64').slice(0, 20)}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await response.text();
    const items = [];
    
    // Simple RSS/Atom parser
    const itemMatches = text.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    for (const match of itemMatches) {
      const itemText = match[1];
      const titleMatch = itemText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = itemText.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || itemText.match(/<link[^>]*href=["']([^"']+)["']/i);
      const dateMatch = itemText.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || itemText.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
          url: linkMatch[1] || linkMatch[2] || '',
          date: dateMatch ? dateMatch[1].trim() : null,
        });
      }
    }
    
    // Also try Atom format
    if (items.length === 0) {
      const entryMatches = text.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi);
      for (const match of entryMatches) {
        const entryText = match[1];
        const titleMatch = entryText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = entryText.match(/<link[^>]*href=["']([^"']+)["']/i);
        const dateMatch = entryText.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || entryText.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
        
        if (titleMatch && linkMatch) {
          items.push({
            title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
            url: linkMatch[1],
            date: dateMatch ? dateMatch[1].trim() : null,
          });
        }
      }
    }
    
    writeCache(cachePath, items.slice(0, 10)); // Cache first 10 items
    return items.slice(0, 10);
  } catch (err) {
    return [];
  }
}

// Check for clean catalysts (GitHub releases + RSS feeds within 14 days)
function checkCatalysts(githubReleases, rssItems) {
  const now = Date.now();
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const catalysts = [];
  
  // Check GitHub releases
  if (Array.isArray(githubReleases)) {
    for (const release of githubReleases) {
      const publishedAt = release.published_at ? new Date(release.published_at).getTime() : null;
      if (publishedAt && publishedAt >= fourteenDaysAgo) {
        catalysts.push({
          type: "github_release",
          title: release.name || release.tag_name || "Release",
          date: release.published_at,
          url: release.html_url,
          description: release.body || "",
        });
      }
    }
  }
  
  // Check RSS feed items
  if (Array.isArray(rssItems)) {
    for (const item of rssItems) {
      let publishedAt = null;
      if (item.date) {
        publishedAt = new Date(item.date).getTime();
        if (isNaN(publishedAt)) {
          // Try parsing common date formats
          publishedAt = Date.parse(item.date);
        }
      }
      
      if (publishedAt && !isNaN(publishedAt) && publishedAt >= fourteenDaysAgo) {
        // Filter for meaningful events (avoid generic blog posts)
        const title = item.title?.toLowerCase() || '';
        const isSignificant = 
          title.includes('launch') ||
          title.includes('release') ||
          title.includes('mainnet') ||
          title.includes('partnership') ||
          title.includes('integration') ||
          title.includes('upgrade') ||
          title.includes('v2') ||
          title.includes('v3') ||
          title.includes('announcement');
        
        if (isSignificant) {
          catalysts.push({
            type: "blog_post",
            title: item.title,
            date: item.date,
            url: item.url,
            description: "",
          });
        }
      }
    }
  }
  
  // Sort by date (newest first)
  catalysts.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
  
  return {
    has_clean_catalyst: catalysts.length > 0,
    clean_catalyst: catalysts.length > 0 
      ? `${catalysts[0].title} (${new Date(catalysts[0].date).toLocaleDateString()})`
      : "No clean catalyst in last 14 days",
    catalyst_sources: catalysts,
    catalyst_checked: true,
  };
}

// Evaluate unlock data from DefiLlama
function evaluateUnlocks(unlockData, marketCap, circulatingSupply) {
  if (!unlockData || !Array.isArray(unlockData)) {
    return {
      unlock_confidence: "UNKNOWN",
      unlock_next_30d: null,
      unlock_next_30d_value: null,
      unlock_risk_flag: false,
    };
  }
  
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
  
  let totalUnlock = 0;
  let totalValue = 0;
  
  for (const unlock of unlockData) {
    const unlockDate = unlock.timestamp ? new Date(unlock.timestamp * 1000).getTime() : null;
    if (unlockDate && unlockDate <= thirtyDaysFromNow && unlockDate >= now) {
      const amount = num(unlock.amount) || 0;
      totalUnlock += amount;
      if (marketCap && unlock.price) {
        totalValue += amount * num(unlock.price);
      } else if (marketCap && circulatingSupply && circulatingSupply > 0) {
        // Estimate value from market cap and supply
        const pricePerToken = marketCap / circulatingSupply;
        totalValue += amount * pricePerToken;
      }
    }
  }
  
  const confidence = unlockData.length > 0 ? "MEDIUM" : "UNKNOWN";
  
  // Flag if unlock is >1% of supply OR >$10M
  const supplyPercent = circulatingSupply && circulatingSupply > 0 
    ? (totalUnlock / circulatingSupply) * 100 
    : null;
  const unlockRiskFlag = 
    (supplyPercent !== null && supplyPercent > 1) ||
    (totalValue > 10000000); // $10M threshold
  
  return {
    unlock_confidence: confidence,
    unlock_next_30d: totalUnlock > 0 ? totalUnlock : null,
    unlock_next_30d_value: totalValue > 0 ? totalValue : null,
    unlock_next_30d_percent: supplyPercent,
    unlock_risk_flag: unlockRiskFlag,
  };
}

// Evaluate traction from TVL and developer data
function evaluateTraction(tvlData, devData) {
  let tractionStatus = "UNKNOWN";
  let missingTraction = true;
  const tractionSignals = [];
  
  // Check TVL - DefiLlama returns tvl as array or single value
  if (tvlData) {
    let currentTVL = null;
    if (Array.isArray(tvlData.tvl) && tvlData.tvl.length > 0) {
      // Get most recent TVL entry
      const latest = tvlData.tvl[tvlData.tvl.length - 1];
      currentTVL = num(latest?.totalLiquidityUSD) || num(latest?.value);
    } else if (tvlData.tvl) {
      currentTVL = num(tvlData.tvl);
    } else if (tvlData.currentChainTvls) {
      // Sum all chain TVLs
      const chains = Object.values(tvlData.currentChainTvls);
      currentTVL = chains.reduce((sum, val) => sum + (num(val) || 0), 0);
    }
    
    if (currentTVL && currentTVL > 1000000) { // $1M+ TVL
      tractionStatus = "OK";
      missingTraction = false;
      tractionSignals.push(`TVL: ${formatUsd(currentTVL)}`);
    }
  }
  
  // Check developer activity
  if (devData) {
    const commits4w = num(devData.commit_count_4_weeks);
    const stars = num(devData.stars);
    const forks = num(devData.forks);
    
    if (commits4w && commits4w > 10) {
      if (tractionStatus === "UNKNOWN") tractionStatus = "OK";
      missingTraction = false;
      tractionSignals.push(`${commits4w} commits (4w)`);
    }
    if (stars && stars > 100) {
      tractionSignals.push(`${stars} GitHub stars`);
    }
  }
  
  return {
    traction_status: tractionStatus,
    missing_traction: missingTraction,
    traction_signals: tractionSignals,
  };
}

function labelRank(label) {
  switch (label) {
    case "KEEP":
      return 2;
    case "WATCH-ONLY":
      return 1;
    case "DROP":
      return 0;
    default:
      return -1;
  }
}

function severityRank(severity) {
  switch (severity) {
    case "CRITICAL":
      return 0;
    case "WARNING":
      return 1;
    case "POSITIVE":
      return 2;
    case "INFO":
      return 3;
    default:
      return 4;
  }
}

function coinKey(coin) {
  const idLower = normalizeCoinGeckoId(coin?.coin_gecko_id);
  if (idLower) return `id:${idLower}`;
  const symbolLower =
    typeof coin?.symbol === "string" ? coin.symbol.trim().toLowerCase() : "";
  return symbolLower ? `sym:${symbolLower}` : null;
}

function buildCoinIndex(layer1Report) {
  const coins = Array.isArray(layer1Report?.coins) ? layer1Report.coins : [];
  const map = new Map();
  for (const coin of coins) {
    const key = coinKey(coin);
    if (!key) continue;
    map.set(key, coin);
  }
  return map;
}

function pctChange(previousValue, currentValue) {
  if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
    return null;
  }
  if (previousValue === 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

function buildDiffReport(previousReport, currentReport) {
  if (!previousReport || !currentReport) {
    return null;
  }
  const prevMap = buildCoinIndex(previousReport);
  const currMap = buildCoinIndex(currentReport);

  const prevKeys = new Set(prevMap.keys());
  const currKeys = new Set(currMap.keys());
  const allKeys = new Set([...prevKeys, ...currKeys]);

  const riskFlags = [
    "chasing",
    "unlock_risk_flag",
    "high_concentration_risk",
    "low_liquidity",
    "high_dilution_risk",
  ];

  const changes = [];
  for (const key of allKeys) {
    const prev = prevMap.get(key) || null;
    const curr = currMap.get(key) || null;

    const symbol = curr?.symbol || prev?.symbol || "n/a";
    const name = curr?.name || prev?.name || null;
    const watchlistSource =
      curr?.watchlist_source || prev?.watchlist_source || "main";

    if (!prev && curr) {
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity: "INFO",
        type: "NEW_COIN",
        description: "New coin appeared in scan",
        details: {},
      });
      continue;
    }
    if (prev && !curr) {
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity: "INFO",
        type: "REMOVED_COIN",
        description: "Coin no longer present in scan",
        details: {},
      });
      continue;
    }
    if (!prev || !curr) continue;

    if (
      prev.watchlist_source &&
      curr.watchlist_source &&
      prev.watchlist_source !== curr.watchlist_source
    ) {
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: curr.watchlist_source,
        severity: "INFO",
        type: "LIST_CHANGED",
        description: `Moved from ${prev.watchlist_source} to ${curr.watchlist_source}`,
        details: {
          previous_list: prev.watchlist_source,
          current_list: curr.watchlist_source,
        },
      });
    }

    if (prev.hygiene_label !== curr.hygiene_label) {
      const prevRank = labelRank(prev.hygiene_label);
      const currRank = labelRank(curr.hygiene_label);
      const downgrade = prevRank !== -1 && currRank !== -1 && currRank < prevRank;
      const upgrade = prevRank !== -1 && currRank !== -1 && currRank > prevRank;
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity: downgrade ? "CRITICAL" : upgrade ? "POSITIVE" : "WARNING",
        type: downgrade ? "LABEL_DOWNGRADE" : upgrade ? "LABEL_UPGRADE" : "LABEL_CHANGE",
        description: `Label changed ${prev.hygiene_label} → ${curr.hygiene_label}`,
        details: {
          previous_label: prev.hygiene_label,
          current_label: curr.hygiene_label,
        },
      });
    }

    for (const flag of riskFlags) {
      const prevVal = prev[flag] === true;
      const currVal = curr[flag] === true;
      if (prevVal === currVal) continue;
      const triggered = !prevVal && currVal;
      const cleared = prevVal && !currVal;
      if (!triggered && !cleared) continue;

      const isCatalyst = flag === "has_clean_catalyst";
      const severity = triggered
        ? isCatalyst
          ? "INFO"
          : "WARNING"
        : "POSITIVE";

      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity,
        type: triggered ? "FLAG_TRIGGERED" : "FLAG_CLEARED",
        description: `${triggered ? "New" : "Cleared"} flag: ${flag}`,
        details: { flag, previous: prevVal, current: currVal },
      });
    }

    if (prev.has_clean_catalyst !== curr.has_clean_catalyst) {
      const prevVal = prev.has_clean_catalyst === true;
      const currVal = curr.has_clean_catalyst === true;
      if (!prevVal && currVal) {
        changes.push({
          key,
          symbol,
          name,
          watchlist_source: watchlistSource,
          severity: "INFO",
          type: "CATALYST_DETECTED",
          description: "Clean catalyst detected",
          details: {},
        });
      } else if (prevVal && !currVal) {
        changes.push({
          key,
          symbol,
          name,
          watchlist_source: watchlistSource,
          severity: "INFO",
          type: "CATALYST_CLEARED",
          description: "Catalyst no longer detected",
          details: {},
        });
      }
    }

    const priceDelta = pctChange(prev.price, curr.price);
    if (priceDelta !== null && Math.abs(priceDelta) >= 10) {
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity: "INFO",
        type: "PRICE_MOVE",
        description: `Price moved ${formatSignedPct(priceDelta, 1)} since last scan`,
        details: { previous_price: prev.price, current_price: curr.price, pct: priceDelta },
      });
    }
  }

  changes.sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  return {
    previous_scan_date: previousReport.generated_at || null,
    current_scan_date: currentReport.generated_at || null,
    changes,
  };
}

function formatAlertsSection(alertsReport) {
  const lines = [];
  lines.push("## Alerts");

  const defiThreshold = alertsReport?.thresholds?.defi_score_threshold;
  const discoveryThreshold = alertsReport?.thresholds?.discovery_score_threshold;
  const actionable = alertsReport?.thresholds?.alert_actionable;
  lines.push(
    `Thresholds: DeFi >= ${defiThreshold ?? "n/a"}, Discovery >= ${discoveryThreshold ?? "n/a"}, Actionable=${actionable ? "on" : "off"}`
  );
  lines.push("");

  const alertList = Array.isArray(alertsReport?.alerts) ? alertsReport.alerts : [];
  if (alertList.length === 0) {
    lines.push("- None");
    lines.push("");
    lines.push("Full details: [Alerts.md](Alerts.md)");
    lines.push("");
    return lines.join("\n");
  }

  const top = alertList.slice(0, 10);
  for (const alert of top) {
    const symbol = alert.symbol ? `${alert.symbol} ` : "";
    const source = alert.source ? `[${String(alert.source).toUpperCase()}] ` : "";
    const tag = alert.watchlist_source === "staging" ? " (staging)" : "";
    lines.push(`- ${source}${symbol}${alert.title}${tag}`);
    if (alert.url) {
      lines.push(`  - ${alert.url}`);
    }
  }
  if (alertList.length > top.length) {
    lines.push(`- ...and ${alertList.length - top.length} more (see Alerts.md)`);
  }
  lines.push("");
  lines.push("Full details: [Alerts.md](Alerts.md)");
  lines.push("");
  return lines.join("\n");
}

function formatDiffSection(diffReport) {
  const lines = [];
  lines.push("## Changes Since Last Run");
  if (!diffReport) {
    lines.push("- First scan (no previous history found).");
    lines.push("");
    lines.push("---");
    lines.push("");
    return lines.join("\n");
  }

  const prev = diffReport.previous_scan_date
    ? new Date(diffReport.previous_scan_date).toLocaleString()
    : "n/a";
  lines.push(`Previous scan: ${prev}`);
  lines.push("");

  const bySeverity = {
    CRITICAL: [],
    WARNING: [],
    POSITIVE: [],
    INFO: [],
  };

  for (const change of diffReport.changes || []) {
    const severity = bySeverity[change.severity] ? change.severity : "INFO";
    bySeverity[severity].push(change);
  }

  const sections = [
    { key: "CRITICAL", title: "Critical" },
    { key: "WARNING", title: "Warning" },
    { key: "POSITIVE", title: "Positive" },
    { key: "INFO", title: "Info" },
  ];

  for (const section of sections) {
    const items = bySeverity[section.key];
    if (!items || items.length === 0) continue;
    lines.push(`### ${section.title} (${items.length})`);
    for (const item of items) {
      const tag = item.watchlist_source === "staging" ? " (staging)" : "";
      lines.push(`- **${item.symbol}${tag}**: ${item.description}`);
    }
    lines.push("");
  }

  if (diffReport.changes.length === 0) {
    lines.push("- No material changes detected.");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function loadPreviousLayer1Report() {
  const historyDir = path.join(REPORTS_DIR, "history", "watchlist");
  if (!fs.existsSync(historyDir)) {
    return null;
  }
  const files = fs
    .readdirSync(historyDir)
    .filter((name) => name.endsWith("_Layer1Report.json"))
    .sort()
    .reverse();
  if (files.length === 0) {
    return null;
  }
  const previousPath = path.join(historyDir, files[0]);
  return readJsonFile(previousPath, null);
}

async function fetchSimplePrices(coinIds) {
  const uniqueIds = Array.from(
    new Set(
      (coinIds || [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );
  const prices = new Map();
  if (uniqueIds.length === 0) {
    return prices;
  }

  const chunkSize = 200;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const url = `${BASE_URL}/simple/price?ids=${chunk.join(
      ","
    )}&vs_currencies=${VS_CURRENCY}`;
    const data = await fetchJson(url, {}, 1);
    for (const id of chunk) {
      const price = num(data?.[id]?.[VS_CURRENCY]);
      if (price !== null) {
        prices.set(id, price);
      }
    }
  }
  return prices;
}

function loadBacktestPredictions() {
  const raw = readJsonFile(BACKTEST_PREDICTIONS_PATH, []);
  return Array.isArray(raw) ? raw : [];
}

function saveBacktestPredictions(predictions) {
  ensureDir(BACKTEST_DIR);
  fs.writeFileSync(
    BACKTEST_PREDICTIONS_PATH,
    JSON.stringify(predictions, null, 2),
    "utf8"
  );
}

function buildPredictionId(scanIso, coin) {
  const scanPart = isoToFilename(scanIso);
  const idPart = normalizeCoinGeckoId(coin?.coin_gecko_id) || (coin?.symbol || "unknown");
  return `${scanPart}_${idPart}`;
}

function recordBacktestPredictions(layer1Report, predictions) {
  const scanDate = layer1Report?.generated_at || new Date().toISOString();
  const existingIds = new Set(
    predictions
      .map((p) => (typeof p?.prediction_id === "string" ? p.prediction_id : ""))
      .filter(Boolean)
  );

  const coins = Array.isArray(layer1Report?.coins) ? layer1Report.coins : [];
  let added = 0;
  for (const coin of coins) {
    if (!Number.isFinite(coin?.price)) continue;
    const predictionId = buildPredictionId(scanDate, coin);
    if (existingIds.has(predictionId)) continue;

    predictions.push({
      prediction_id: predictionId,
      symbol: coin.symbol,
      name: coin.name,
      coin_gecko_id: coin.coin_gecko_id,
      watchlist_source: coin.watchlist_source || "main",
      scan_date: scanDate,
      price_at_scan: coin.price,
      market_cap_at_scan: coin.market_cap ?? null,
      volume_24h_at_scan: coin.volume_24h ?? null,
      hygiene_label: coin.hygiene_label,
      flags: {
        chasing: coin.chasing === true,
        unlock_risk: coin.unlock_risk_flag === true,
        high_concentration_risk: coin.high_concentration_risk === true,
        has_clean_catalyst: coin.has_clean_catalyst === true,
        low_liquidity: coin.low_liquidity === true,
        high_dilution_risk: coin.high_dilution_risk === true,
      },
      outcomes: {
        price_7d: null,
        price_14d: null,
        price_30d: null,
        return_7d_pct: null,
        return_14d_pct: null,
        return_30d_pct: null,
        outcome_updated_at: null,
      },
    });
    existingIds.add(predictionId);
    added += 1;
  }
  return { added };
}

function updatePredictionOutcomes(prediction, currentPrice, nowIso) {
  if (!prediction || !Number.isFinite(currentPrice)) {
    return false;
  }
  const scanMs = Date.parse(prediction.scan_date);
  if (!Number.isFinite(scanMs)) {
    return false;
  }
  const ageDays = (Date.now() - scanMs) / (1000 * 60 * 60 * 24);
  const priceAtScan = num(prediction.price_at_scan);
  if (priceAtScan === null || priceAtScan === 0) {
    return false;
  }

  const horizons = [
    { days: 7, key: "7d" },
    { days: 14, key: "14d" },
    { days: 30, key: "30d" },
  ];

  let updated = false;
  prediction.outcomes = prediction.outcomes || {};
  for (const h of horizons) {
    const priceKey = `price_${h.key}`;
    const returnKey = `return_${h.key}_pct`;
    if (ageDays >= h.days && prediction.outcomes[priceKey] === null) {
      prediction.outcomes[priceKey] = currentPrice;
      prediction.outcomes[returnKey] = ((currentPrice - priceAtScan) / priceAtScan) * 100;
      updated = true;
    }
  }

  if (updated) {
    prediction.outcomes.outcome_updated_at = nowIso;
  }
  return updated;
}

function computeBacktestStats(predictions) {
  const horizons = ["7d", "14d", "30d"];
  const labels = ["KEEP", "WATCH-ONLY", "DROP"];

  const byLabel = {};
  for (const label of labels) {
    byLabel[label] = predictions.filter((p) => p?.hygiene_label === label);
  }

  function statsForGroup(group) {
    const out = {
      count: group.length,
      avg_return_7d: null,
      avg_return_14d: null,
      avg_return_30d: null,
      win_rate_14d: null,
    };
    for (const h of horizons) {
      const key = `return_${h}_pct`;
      const values = group
        .map((p) => num(p?.outcomes?.[key]))
        .filter((v) => v !== null);
      const avg = average(values);
      out[`avg_return_${h}`] = avg;
      if (h === "14d" && values.length > 0) {
        out.win_rate_14d = values.filter((v) => v > 0).length / values.length;
      }
    }
    return out;
  }

  const accuracyByLabel = {};
  for (const label of labels) {
    accuracyByLabel[label] = statsForGroup(byLabel[label]);
  }

  const allWith14d = predictions.filter((p) => num(p?.outcomes?.return_14d_pct) !== null);
  const best14d = [...allWith14d]
    .sort((a, b) => (b.outcomes.return_14d_pct || -Infinity) - (a.outcomes.return_14d_pct || -Infinity))
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      coin_gecko_id: p.coin_gecko_id,
      hygiene_label: p.hygiene_label,
      return_14d_pct: p.outcomes.return_14d_pct,
    }));
  const worst14d = [...allWith14d]
    .sort((a, b) => (a.outcomes.return_14d_pct || Infinity) - (b.outcomes.return_14d_pct || Infinity))
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      coin_gecko_id: p.coin_gecko_id,
      hygiene_label: p.hygiene_label,
      return_14d_pct: p.outcomes.return_14d_pct,
    }));

  const flags = [
    "has_clean_catalyst",
    "unlock_risk",
    "high_concentration_risk",
    "chasing",
    "low_liquidity",
    "high_dilution_risk",
  ];
  const flagEffectiveness = [];
  for (const flag of flags) {
    const withFlag = allWith14d.filter((p) => p?.flags?.[flag] === true);
    const withoutFlag = allWith14d.filter((p) => p?.flags?.[flag] !== true);
    const withVals = withFlag
      .map((p) => num(p?.outcomes?.return_14d_pct))
      .filter((v) => v !== null);
    const withoutVals = withoutFlag
      .map((p) => num(p?.outcomes?.return_14d_pct))
      .filter((v) => v !== null);
    const withAvg = average(withVals);
    const withoutAvg = average(withoutVals);
    flagEffectiveness.push({
      flag,
      count_with: withVals.length,
      avg_with_14d: withAvg,
      count_without: withoutVals.length,
      avg_without_14d: withoutAvg,
      edge_14d: withAvg !== null && withoutAvg !== null ? withAvg - withoutAvg : null,
    });
  }

  return {
    predictions_tracked: predictions.length,
    oldest_prediction: predictions
      .map((p) => Date.parse(p?.scan_date))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)[0] || null,
    accuracy_by_label: accuracyByLabel,
    best_14d: best14d,
    worst_14d: worst14d,
    flag_effectiveness_14d: flagEffectiveness,
  };
}

function writeBacktestReport(stats) {
  ensureDir(BACKTEST_DIR);
  const generatedAt = new Date().toISOString();

  fs.writeFileSync(
    BACKTEST_REPORT_JSON_PATH,
    JSON.stringify({ generated_at: generatedAt, ...stats }, null, 2),
    "utf8"
  );

  const md = [];
  md.push("# Backtest Report");
  md.push("");
  md.push(`Generated: ${generatedAt}`);
  md.push(`Predictions tracked: ${stats.predictions_tracked}`);
  if (stats.oldest_prediction) {
    md.push(`Oldest prediction: ${new Date(stats.oldest_prediction).toISOString()}`);
  }
  md.push("");

  md.push("## Accuracy by Label");
  md.push("");
  md.push("| Label | Count | Avg 7d | Avg 14d | Avg 30d | Win Rate (14d) |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const label of ["KEEP", "WATCH-ONLY", "DROP"]) {
    const row = stats.accuracy_by_label?.[label] || {};
    const winRate =
      typeof row.win_rate_14d === "number"
        ? `${(row.win_rate_14d * 100).toFixed(0)}%`
        : "n/a";
    md.push(
      `| ${label} | ${row.count ?? 0} | ${formatSignedPct(
        row.avg_return_7d,
        1
      )} | ${formatSignedPct(row.avg_return_14d, 1)} | ${formatSignedPct(
        row.avg_return_30d,
        1
      )} | ${winRate} |`
    );
  }
  md.push("");

  md.push("## Flag Effectiveness (14d)");
  md.push("");
  md.push("| Flag | With Flag (n) | Avg 14d | Without Flag (n) | Avg 14d | Edge |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of stats.flag_effectiveness_14d || []) {
    md.push(
      `| ${item.flag} | ${item.count_with} | ${formatSignedPct(
        item.avg_with_14d,
        1
      )} | ${item.count_without} | ${formatSignedPct(
        item.avg_without_14d,
        1
      )} | ${formatSignedPct(item.edge_14d, 1)} |`
    );
  }
  md.push("");

  md.push("## Best Predictions (14d)");
  md.push("");
  if (!stats.best_14d || stats.best_14d.length === 0) {
    md.push("- No 14d outcomes yet (run the scanner over time).");
  } else {
    for (const item of stats.best_14d.slice(0, 5)) {
      md.push(
        `- ${item.symbol}: ${item.hygiene_label} (${formatSignedPct(
          item.return_14d_pct,
          1
        )})`
      );
    }
  }
  md.push("");

  md.push("## Worst Predictions (14d)");
  md.push("");
  if (!stats.worst_14d || stats.worst_14d.length === 0) {
    md.push("- No 14d outcomes yet (run the scanner over time).");
  } else {
    for (const item of stats.worst_14d.slice(0, 5)) {
      md.push(
        `- ${item.symbol}: ${item.hygiene_label} (${formatSignedPct(
          item.return_14d_pct,
          1
        )})`
      );
    }
  }
  md.push("");

  fs.writeFileSync(BACKTEST_REPORT_MD_PATH, md.join("\n"), "utf8");
}

async function runBacktest(layer1Report) {
  ensureDir(BACKTEST_DIR);
  const predictions = loadBacktestPredictions();
  const recordResult = recordBacktestPredictions(layer1Report, predictions);

  const dueIds = new Set();
  for (const p of predictions) {
    const scanMs = Date.parse(p?.scan_date);
    if (!Number.isFinite(scanMs)) continue;
    const ageDays = (Date.now() - scanMs) / (1000 * 60 * 60 * 24);
    const outcomes = p?.outcomes || {};
    if (ageDays >= 7 && outcomes.price_7d === null) dueIds.add(p.coin_gecko_id);
    if (ageDays >= 14 && outcomes.price_14d === null) dueIds.add(p.coin_gecko_id);
    if (ageDays >= 30 && outcomes.price_30d === null) dueIds.add(p.coin_gecko_id);
  }

  const nowIso = new Date().toISOString();
  if (dueIds.size > 0) {
    const priceMap = await fetchSimplePrices(Array.from(dueIds));
    for (const p of predictions) {
      const id = p?.coin_gecko_id;
      if (!id || !priceMap.has(id)) continue;
      updatePredictionOutcomes(p, priceMap.get(id), nowIso);
    }
  }

  saveBacktestPredictions(predictions);
  const stats = computeBacktestStats(predictions);
  writeBacktestReport(stats);
  return {
    added_predictions: recordResult.added,
    outcomes_updated: dueIds.size,
    stats,
  };
}

function buildSummary(layer1Report, supervisorResult, diffReport, alertsReport) {
  const lines = [];
  lines.push("# Crypto Watchlist Daily Scanner");
  lines.push("");
  lines.push(`Run: ${layer1Report.generated_at}`);
  lines.push(`Data sources: Market=${layer1Report.data_sources.market_data}, TVL=${layer1Report.data_sources.tvl || "NONE"}, Unlocks=${layer1Report.data_sources.unlocks || "NONE"}, Catalysts=${layer1Report.data_sources.catalysts || "NONE"}, Dev=${layer1Report.data_sources.developer_data || "NONE"}, OnChain=${layer1Report.data_sources.onchain || "NONE"}`);
  lines.push("");

  lines.push(formatAlertsSection(alertsReport));
  lines.push(formatDiffSection(diffReport));

  if (fs.existsSync(DASHBOARD_PATH)) {
    lines.push("Dashboard: [Dashboard.html](Dashboard.html)");
    lines.push("");
  }

  if (fs.existsSync(BACKTEST_REPORT_MD_PATH)) {
    lines.push(
      "Backtest report: [backtest/BacktestReport.md](backtest/BacktestReport.md)"
    );
    lines.push("");
  }

  if (supervisorResult && supervisorResult.status === "ok") {
    lines.push("## AI Supervisor Summary");
    lines.push(supervisorResult.executive_summary || "No summary provided.");
    lines.push("");

    const highlights = Array.isArray(supervisorResult.onchain_highlights)
      ? supervisorResult.onchain_highlights
      : [];
    if (highlights.length > 0) {
      lines.push("### On-chain Highlights (AI, factual)");
      for (const item of highlights) {
        const symbol = item?.symbol || "n/a";
        const chain = item?.chain || "unknown";
        const risk = item?.risk || "UNKNOWN";
        const facts = Array.isArray(item?.facts) ? item.facts.filter(Boolean) : [];
        lines.push(`- ${symbol} (${chain}) [${risk}]: ${facts.join(" | ")}`);
      }
      lines.push("");
    }
  } else {
    lines.push("## AI Supervisor Summary");
    lines.push("AI summary unavailable.");
    lines.push("");
  }

  // DeFi Protocol Scanner (latest snapshot) — separate runner, but surfaced here for convenience.
  try {
    const defiLatestPath = path.join(REPORTS_DIR, "defi", "Latest.json");
    if (fs.existsSync(defiLatestPath)) {
      const defiSnapshot = JSON.parse(fs.readFileSync(defiLatestPath, "utf8"));
      if (defiSnapshot && Array.isArray(defiSnapshot.protocols)) {
        const buckets = { CANDIDATE: 0, WATCH: 0, AVOID: 0 };
        for (const p of defiSnapshot.protocols) {
          if (p?.bucket && buckets[p.bucket] !== undefined) {
            buckets[p.bucket] += 1;
          }
        }

        lines.push("## DeFi Protocol Scanner (Latest)");
        if (defiSnapshot.generated_at) {
          lines.push(`Run: ${defiSnapshot.generated_at}`);
        }
        lines.push("Report: [defi/Latest.md](defi/Latest.md)");
        lines.push(
          `Buckets: candidates=${buckets.CANDIDATE}, watch=${buckets.WATCH}, avoid=${buckets.AVOID}`
        );
        lines.push("");

        const allCandidates = defiSnapshot.protocols.filter(
          (p) => p?.bucket === "CANDIDATE"
        );
        const tokenMappedCandidates = allCandidates.filter(
          (p) =>
            p?.market &&
            typeof p.market === "object" &&
            p.market.market_cap !== null &&
            p.market.volume_24h !== null
        );
        const preferTokenMapped = tokenMappedCandidates.length > 0;
        const candidates = (preferTokenMapped
          ? tokenMappedCandidates
          : allCandidates
        ).slice(0, 5);

        if (candidates.length === 0) {
          lines.push("- No DeFi candidates (check filters in `src/defi_scan.js`).");
        } else {
          if (preferTokenMapped) {
            lines.push("| Rank | Protocol | Token | TVL | 30d | 7d | Score |");
            lines.push("| --- | --- | --- | --- | --- | --- | --- |");
          } else {
            lines.push("| Rank | Protocol | TVL | 30d | 7d | Score |");
            lines.push("| --- | --- | --- | --- | --- | --- |");
          }
          candidates.forEach((p, idx) => {
            const name = p?.name || "n/a";
            const url = p?.links?.defillama || null;
            const protocol = url ? `[${name}](${url})` : name;
            const token = preferTokenMapped
              ? p?.market?.token_symbol || p?.market?.gecko_id || "n/a"
              : null;
            const tvl = formatUsdCompact(num(p?.tvl?.focus_current));
            const ch30d = formatSignedPct(num(p?.tvl?.change_30d_pct), 1);
            const ch7d = formatSignedPct(num(p?.tvl?.change_7d_pct), 1);
            const score =
              typeof p?.scores?.total === "number" && Number.isFinite(p.scores.total)
                ? p.scores.total.toFixed(1)
                : "n/a";
            if (preferTokenMapped) {
              lines.push(
                `| ${idx + 1} | ${protocol} | ${token} | ${tvl} | ${ch30d} | ${ch7d} | ${score} |`
              );
            } else {
              lines.push(
                `| ${idx + 1} | ${protocol} | ${tvl} | ${ch30d} | ${ch7d} | ${score} |`
              );
            }
          });
        }
        lines.push("");
      }
    }
  } catch {
    // DeFi scan summary is optional; ignore parse errors.
  }

  lines.push("## Top Watch Closely");
  if (layer1Report.ranking.top_watch.length === 0) {
    lines.push("- None");
  } else {
    for (const coin of layer1Report.ranking.top_watch) {
      const tag = coin.watchlist_source === "staging" ? " (staging)" : "";
      lines.push(`- ${coin.symbol}${tag}: ${coin.hygiene_label}`);
    }
  }
  lines.push("");

  lines.push("## Top Avoid/Chasing");
  if (layer1Report.ranking.top_avoid.length === 0) {
    lines.push("- None flagged");
  } else {
    for (const coin of layer1Report.ranking.top_avoid) {
      const tag = coin.watchlist_source === "staging" ? " (staging)" : "";
      lines.push(`- ${coin.symbol}${tag}: chasing=true`);
    }
  }
  lines.push("");

  // BTC reference
  if (layer1Report.btc_reference) {
    const btc = layer1Report.btc_reference;
    lines.push("## BTC Reference");
    lines.push(`BTC 7d: ${formatPct(btc.price_change_7d)} | Coins outperforming BTC are marked with ✓`);
    lines.push("");
  }

  const allCoins = Array.isArray(layer1Report.coins) ? layer1Report.coins : [];
  const mainCoins = allCoins.filter(
    (coin) => (coin.watchlist_source || "main") !== "staging"
  );
  const stagingCoins = allCoins.filter(
    (coin) => coin.watchlist_source === "staging"
  );

  function pushCoinTable(title, coins) {
    lines.push(title);
    lines.push("| Symbol | Label | Price | 7d | vs BTC | Vol 24h | Notes |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const coin of coins) {
      const notes = [];
      if (coin.watchlist_source === "staging") {
        notes.push("staging");
      }
      if (coin.chasing) {
        notes.push("chasing");
      }
      if (coin.thin_fragile) {
        notes.push("thin");
      }
      if (coin.high_dilution_risk) {
        notes.push("dilution");
      }
      if (coin.low_liquidity) {
        notes.push("low_liq");
      }
      if (coin.unlock_confidence === "UNKNOWN") {
        notes.push("unlock_unk");
      }
      if (coin.unlock_risk_flag) {
        notes.push("unlock_risk");
      }
      if (coin.has_clean_catalyst) {
        notes.push("catalyst");
      }
      if (coin.traction_status === "OK") {
        notes.push("traction");
      }
      if (coin.high_concentration_risk) {
        notes.push("whale_risk");
      }

      // Relative strength indicator
      const rsIndicator = coin.outperforming_btc ? "✓ " : "";
      const rs7d = coin.relative_strength_7d;
      const rsDisplay =
        rs7d !== null
          ? `${rsIndicator}${rs7d >= 0 ? "+" : ""}${rs7d.toFixed(1)}%`
          : "n/a";

      lines.push(
        `| ${coin.symbol} | ${coin.hygiene_label} | ${formatUsd(
          coin.price
        )} | ${formatPct(coin.price_change_7d)} | ${rsDisplay} | ${formatUsd(
          coin.volume_24h
        )} | ${notes.join(", ") || "-"} |`
      );
    }
    lines.push("");
  }

  pushCoinTable("## Watchlist", mainCoins);
  if (stagingCoins.length > 0) {
    pushCoinTable("## Staging Watchlist", stagingCoins);
  }

  lines.push("## On-chain Holder Snapshot");
  const onchainCoins = layer1Report.coins.filter(
    (coin) =>
      coin.onchain &&
      Array.isArray(coin.onchain.top_holders) &&
      coin.onchain.top_holders.length > 0
  );
  if (onchainCoins.length === 0) {
    lines.push(
      "- No on-chain holder data (set `ETHPLORER_API_KEY=freekey` for Ethereum, or `COVALENT_API_KEY` for multi-chain)."
    );
    lines.push("");
  } else {
    lines.push("- Shows top holders with `EOA` vs `CONTRACT` when available.");
    lines.push("");
    for (const coin of onchainCoins) {
      const chainLabel = coin.onchain.chain ? ` (${coin.onchain.chain})` : "";
      const tag = coin.watchlist_source === "staging" ? " (staging)" : "";
      lines.push(`### ${coin.symbol}${tag}${chainLabel}`);
      const top10 = formatPct(coin.top_10_holder_percent);
      const top20 = formatPct(coin.top_20_holder_percent);
      const risk = coin.high_concentration_risk ? "HIGH" : "OK";
      lines.push(
        `Top 10: ${top10} | Top 20: ${top20} | Risk: ${risk} | Source: ${coin.onchain.source}`
      );
      if (coin.onchain.contract_address && coin.onchain.contract_url) {
        lines.push(
          `Contract: [${shortAddress(coin.onchain.contract_address)}](${coin.onchain.contract_url})`
        );
      }
      lines.push("");
      lines.push("| Rank | Holder | Type | % Supply |");
      lines.push("| --- | --- | --- | --- |");
      for (const holder of coin.onchain.top_holders.slice(0, 5)) {
        const holderLink =
          holder.address && holder.address_url
            ? `[${shortAddress(holder.address)}](${holder.address_url})`
            : holder.address
              ? shortAddress(holder.address)
              : "n/a";
        const holderType = holder.address_type || "UNKNOWN";
        lines.push(
          `| ${holder.rank} | ${holderLink} | ${holderType} | ${formatPct(
            holder.percent_of_supply
          )} |`
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function main() {
  ensureDir(REPORTS_DIR);
  ensureDir(CACHE_DIR);

  const watchlistMainRaw = readJsonFile(WATCHLIST_PATH, []);
  const watchlistStagingRaw = readJsonFile(STAGING_WATCHLIST_PATH, []);
  const watchlistMain = Array.isArray(watchlistMainRaw) ? watchlistMainRaw : [];
  const watchlistStaging = Array.isArray(watchlistStagingRaw)
    ? watchlistStagingRaw
    : [];

  const seenIds = new Set();
  const watchlist = [];
  for (const coin of watchlistMain) {
    const idLower = normalizeCoinGeckoId(coin?.coinGeckoId);
    if (!idLower || seenIds.has(idLower)) continue;
    seenIds.add(idLower);
    watchlist.push({ ...coin, watchlist_source: "main" });
  }
  for (const coin of watchlistStaging) {
    const idLower = normalizeCoinGeckoId(coin?.coinGeckoId);
    if (!idLower || seenIds.has(idLower)) continue;
    seenIds.add(idLower);
    watchlist.push({ ...coin, watchlist_source: "staging" });
  }

  const ids = watchlist.map((coin) => coin.coinGeckoId).filter((id) => id);

  console.log("Fetching market data and DefiLlama protocols...");
  console.log(
    `Processing ${watchlistMain.length} watchlist coins + ${watchlistStaging.length} staging coins...`
  );
  const [marketData, btcData, defiLlamaProtocols] = await Promise.all([
    fetchMarketData(ids),
    fetchBtcData(),
    fetchDefiLlamaProtocols(),
  ]);
  
  const btc = {
    price_change_24h: num(btcData?.price_change_percentage_24h_in_currency),
    price_change_7d: num(btcData?.price_change_percentage_7d_in_currency),
    price_change_30d: num(btcData?.price_change_percentage_30d_in_currency),
  };
  
  const marketById = new Map(
    marketData.map((entry) => [entry.id, entry])
  );

  const coins = [];
  let dataSources = {
    market_data: "CoinGecko",
    unlocks: "NONE",
    catalysts: "NONE",
    tvl: "NONE",
    developer_data: "NONE",
    onchain: "NONE",
  };

  for (const coin of watchlist) {
    const market = marketById.get(coin.coinGeckoId);
    let marketChart = null;
    if (coin.coinGeckoId && !SKIP_MARKET_CHART) {
      try {
        marketChart = await fetchMarketChart(coin.coinGeckoId);
        await sleep(500);
      } catch (err) {
        marketChart = null;
      }
    }

    const volumeStats = getVolumeStats(marketChart);
    const volume24h = num(market?.total_volume);
    const volumeBaseline = volumeStats.avg7d ?? volumeStats.avg30d;
    const volumeBaselineWindow = volumeStats.avg7d ? "7d" : volumeStats.avg30d ? "30d" : null;
    const volumeTrend =
      volume24h !== null && volumeBaseline !== null
        ? volume24h >= volumeBaseline
          ? "above_baseline"
          : "below_baseline"
        : null;

    const dilution = computeDilution(market);
    const priceChange24h = num(market?.price_change_percentage_24h_in_currency);
    const priceChange7d = num(market?.price_change_percentage_7d_in_currency);
    const priceChange30d = num(market?.price_change_percentage_30d_in_currency);

    // Fetch additional data sources
    const defiLlamaSlug = findDefiLlamaSlug(coin.name, coin.symbol, coin.coinGeckoId, defiLlamaProtocols);
    
    // Determine RSS feed URL (common patterns)
    let rssUrl = null;
    if (coin.urls?.blog) {
      const blogUrl = coin.urls.blog;
      // Try common RSS feed paths
      const rssPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/blog/feed'];
      for (const path of rssPaths) {
        if (blogUrl.endsWith('/')) {
          rssUrl = blogUrl + path.slice(1);
        } else {
          rssUrl = blogUrl + path;
        }
        break; // Try first one
      }
    }
    
    // Fetch coin details for contract address (needed for on-chain analysis)
    let coinDetails = null;
    let holdersData = null;
    let contractInfo = null;
    // Try on-chain analysis if we have any API keys (free explorers OR Covalent)
    const hasOnChainKeys = ETHERSCAN_API_KEY || BSCSCAN_API_KEY || POLYGONSCAN_API_KEY || 
                          ARBISCAN_API_KEY || OPTIMISM_API_KEY || BASESCAN_API_KEY || 
                          ETHPLORER_API_KEY || COVALENT_API_KEY;
    
    if (coin.coinGeckoId && hasOnChainKeys) {
      try {
        coinDetails = await fetchCoinGeckoFullDetails(coin.coinGeckoId);
        contractInfo = extractPrimaryContractAddress(coinDetails);
        if (contractInfo) {
          // Try free explorers first, then Covalent as fallback
          holdersData = await fetchTokenHoldersMultiSource(contractInfo.chain, contractInfo.address);
          await sleep(300); // Rate limit protection
        }
      } catch (err) {
        // Fail gracefully if on-chain fetch fails
        console.warn(`On-chain fetch failed for ${coin.symbol}: ${err.message}`);
      }
    }
    
    const [tvlData, unlockData, devData, githubReleases, rssItems] = await Promise.all([
      defiLlamaSlug ? fetchDefiLlamaTVL(defiLlamaSlug) : Promise.resolve(null),
      defiLlamaSlug ? fetchDefiLlamaUnlocks(defiLlamaSlug) : Promise.resolve(null),
      coin.coinGeckoId ? fetchCoinGeckoDeveloperData(coin.coinGeckoId) : Promise.resolve(null),
      (() => {
        const repo = extractGitHubRepo(coin.urls?.github);
        return repo ? fetchGitHubReleases(repo.owner, repo.repo) : Promise.resolve([]);
      })(),
      rssUrl ? fetchRSSFeed(rssUrl) : Promise.resolve([]),
    ]);

    // Evaluate holder concentration
    const supplyForConcentration =
      dilution.totalSupply !== null && dilution.totalSupply > 0
        ? dilution.totalSupply
        : dilution.circulating !== null && dilution.circulating > 0
          ? dilution.circulating
          : null;
    const holderInfo = evaluateHolderConcentration(
      holdersData,
      supplyForConcentration,
      contractInfo?.decimals ?? null
    );

    const onchainDetails = await buildOnchainDetails({
      holdersData,
      contractInfo,
      supplyUsed: supplyForConcentration,
      top10HolderPercent: holderInfo.top_10_holder_percent,
      highConcentrationRisk: holderInfo.high_concentration_risk,
    });
    
    // Update data sources tracking
    if (tvlData && dataSources.tvl === "NONE") dataSources.tvl = "DefiLlama";
    if (unlockData && dataSources.unlocks === "NONE") dataSources.unlocks = "DefiLlama";
    if (devData && dataSources.developer_data === "NONE") dataSources.developer_data = "CoinGecko";
    if ((githubReleases.length > 0 || rssItems.length > 0) && dataSources.catalysts === "NONE") {
      dataSources.catalysts = githubReleases.length > 0 ? "GitHub" : "RSS";
    }
    if (holdersData && dataSources.onchain === "NONE") {
      dataSources.onchain = formatOnChainSource(holdersData?.source);
    }

    // Small delay to avoid rate limiting
    await sleep(200);

    // Evaluate unlocks
    const unlockInfo = evaluateUnlocks(unlockData, dilution.marketCap, dilution.circulating);
    
    // Evaluate traction
    const tractionInfo = evaluateTraction(tvlData, devData);
    
    // Check catalysts
    const catalystInfo = checkCatalysts(githubReleases, rssItems);

    const hasCleanCatalyst = catalystInfo.has_clean_catalyst;
    const chasing =
      !hasCleanCatalyst &&
      ((priceChange7d !== null && priceChange7d > CHASING_7D) ||
        (priceChange24h !== null && priceChange24h > CHASING_24H));

    const thinFragile =
      priceChange7d !== null &&
      priceChange7d > 0 &&
      volumeBaseline !== null &&
      volume24h !== null &&
      volume24h < volumeBaseline;

    const lowLiquidity = volume24h !== null && volume24h < VOLUME_LOW;
    const highSlippage =
      volume24h !== null && volume24h >= VOLUME_DROP && volume24h < VOLUME_LOW;

    // Compute relative strength vs BTC
    const rs24h = computeRelativeStrength(priceChange24h, btc.price_change_24h);
    const rs7d = computeRelativeStrength(priceChange7d, btc.price_change_7d);
    const rs30d = computeRelativeStrength(priceChange30d, btc.price_change_30d);
    const outperformingBtc = rs7d !== null && rs7d > 0;

    const coinReport = {
      symbol: coin.symbol,
      name: coin.name || null,
      watchlist_source: coin.watchlist_source || "main",
      coin_gecko_id: coin.coinGeckoId || null,
      price: num(market?.current_price),
      price_change_24h: priceChange24h,
      price_change_7d: priceChange7d,
      price_change_30d: priceChange30d,
      relative_strength_24h: rs24h,
      relative_strength_7d: rs7d,
      relative_strength_30d: rs30d,
      outperforming_btc: outperformingBtc,
      volume_24h: volume24h,
      volume_avg_7d: volumeStats.avg7d,
      volume_avg_30d: volumeStats.avg30d,
      volume_baseline: volumeBaseline,
      volume_baseline_window: volumeBaselineWindow,
      volume_trend: volumeTrend,
      volume_note: "Total volume used; spot/perps split unknown.",
      clean_catalyst: catalystInfo.clean_catalyst,
      catalyst_sources: catalystInfo.catalyst_sources,
      catalyst_checked: catalystInfo.catalyst_checked,
      has_clean_catalyst: hasCleanCatalyst,
      unlock_confidence: unlockInfo.unlock_confidence,
      unlock_next_30d: unlockInfo.unlock_next_30d,
      unlock_next_30d_value: unlockInfo.unlock_next_30d_value,
      unlock_next_30d_percent: unlockInfo.unlock_next_30d_percent,
      unlock_risk_flag: unlockInfo.unlock_risk_flag,
      tvl_current: (() => {
        if (!tvlData) return null;
        if (Array.isArray(tvlData.tvl) && tvlData.tvl.length > 0) {
          const latest = tvlData.tvl[tvlData.tvl.length - 1];
          return num(latest?.totalLiquidityUSD) || num(latest?.value);
        }
        if (tvlData.currentChainTvls) {
          const chains = Object.values(tvlData.currentChainTvls);
          return chains.reduce((sum, val) => sum + (num(val) || 0), 0);
        }
        return num(tvlData.tvl);
      })(),
      developer_commits_4w: devData ? num(devData.commit_count_4_weeks) : null,
      developer_stars: devData ? num(devData.stars) : null,
      developer_forks: devData ? num(devData.forks) : null,
      circulating_supply: dilution.circulating,
      total_supply: dilution.totalSupply,
      max_supply: num(market?.max_supply),
      market_cap: dilution.marketCap,
      fdv: dilution.fdv,
      marketcap_to_fdv: dilution.marketcapToFdv,
      float_percent: dilution.floatPercent,
      high_dilution_risk: dilution.highDilutionRisk,
      low_float_risk: dilution.lowFloatRisk,
      low_liquidity: lowLiquidity,
      high_slippage_risk: highSlippage,
      thin_fragile: thinFragile,
      chasing,
      traction_status: tractionInfo.traction_status,
      missing_traction: tractionInfo.missing_traction,
      traction_signals: tractionInfo.traction_signals,
      top_10_holder_percent: holderInfo.top_10_holder_percent,
      top_20_holder_percent: holderInfo.top_20_holder_percent,
      high_concentration_risk: holderInfo.high_concentration_risk,
      holder_confidence: holderInfo.holder_confidence,
      onchain: onchainDetails,
    };

    const gates = evaluateGates(coinReport);
    const label = decideLabel(coinReport, gates);
    const gatesFailed = Object.entries(gates)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    coinReport.hygiene_label = label;
    coinReport.gates_failed = gatesFailed;
    coinReport.gates = gates;

    coins.push(coinReport);
    
    // Progress logging
    const progress = ((coins.length / watchlist.length) * 100).toFixed(0);
    if (coins.length % 3 === 0 || coins.length === watchlist.length) {
      console.log(`Progress: ${coins.length}/${watchlist.length} (${progress}%) - ${coin.symbol}: ${coinReport.hygiene_label}`);
    }
  }

  const ranking = rankCoins(coins);
  const actionableToday = coins.some((coin) => coin.hygiene_label === "KEEP");

  const warnings = [];
  if (dataSources.unlocks === "NONE") {
    warnings.push("Some coins missing unlock data; actionability may be blocked.");
  }
  if (dataSources.catalysts === "NONE") {
    warnings.push("Some coins missing catalyst data.");
  }

  const layer1Report = {
    generated_at: new Date().toISOString(),
    data_sources: {
      ...dataSources,
      volume_note: "Total volume used as proxy for spot volume.",
    },
    btc_reference: {
      price_change_24h: btc.price_change_24h,
      price_change_7d: btc.price_change_7d,
      price_change_30d: btc.price_change_30d,
    },
    warnings: warnings.length > 0 ? warnings : [],
    actionable_today: actionableToday,
    coins,
    ranking: {
      ranked: ranking.ranked.map((coin, idx) => ({
        rank: idx + 1,
        symbol: coin.symbol,
        watchlist_source: coin.watchlist_source || "main",
        hygiene_label: coin.hygiene_label,
        chasing: coin.chasing,
        high_dilution_risk: coin.high_dilution_risk,
        volume_24h: coin.volume_24h,
      })),
      top_watch: ranking.top_watch.map((coin) => ({
        symbol: coin.symbol,
        watchlist_source: coin.watchlist_source || "main",
        hygiene_label: coin.hygiene_label,
      })),
      top_avoid: ranking.top_avoid.map((coin) => ({
        symbol: coin.symbol,
        watchlist_source: coin.watchlist_source || "main",
        reason: "chasing=true",
      })),
    },
  };

  const layer1Path = path.join(REPORTS_DIR, "Layer1Report.json");
  fs.writeFileSync(layer1Path, JSON.stringify(layer1Report, null, 2), "utf8");

  const previousLayer1Report = loadPreviousLayer1Report();
  const diffReport = buildDiffReport(previousLayer1Report, layer1Report);
  if (diffReport) {
    const diffPath = path.join(REPORTS_DIR, "DiffReport.json");
    fs.writeFileSync(diffPath, JSON.stringify(diffReport, null, 2), "utf8");
  }

  let backtestStats = null;
  try {
    const backtestResult = await runBacktest(layer1Report);
    backtestStats = backtestResult?.stats || null;
  } catch (err) {
    console.warn(`Backtest module failed: ${err.message}`);
  }

  let supervisorResult = null;
  let supervisorOutput = null;
  try {
    const result = await runSupervisor(layer1Report);
    if (result && result.status === "skipped") {
      supervisorResult = result;
    } else {
      supervisorResult = { status: "ok", ...result };
      supervisorOutput = result;
      const supervisorPath = path.join(
        REPORTS_DIR,
        "SupervisorSummary.json"
      );
      fs.writeFileSync(
        supervisorPath,
        JSON.stringify(result, null, 2),
        "utf8"
      );
    }
  } catch (err) {
    supervisorResult = { status: "error", reason: err.message };
  }

  let defiLatest = null;
  try {
    const defiLatestPath = path.join(REPORTS_DIR, "defi", "Latest.json");
    if (fs.existsSync(defiLatestPath)) {
      defiLatest = JSON.parse(fs.readFileSync(defiLatestPath, "utf8"));
    }
  } catch {
    defiLatest = null;
  }

  function parseEnvNumber(name, fallbackValue) {
    if (process.env[name] === undefined) return fallbackValue;
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  let discoveryQueue = null;
  try {
    discoveryQueue = readJsonFile(DISCOVERY_QUEUE_PATH, null);
  } catch {
    discoveryQueue = null;
  }

  const alertPopupEnabled = process.env.ALERT_POPUP === "1";
  const alertActionableEnabled = process.env.ALERT_ACTIONABLE !== "0";
  const alertsThresholds = {
    defi_score_threshold: parseEnvNumber("ALERT_DEFI_SCORE_THRESHOLD", 70),
    discovery_score_threshold: parseEnvNumber("ALERT_DISCOVERY_SCORE_THRESHOLD", 80),
    alert_actionable: alertActionableEnabled,
  };

  let alertsReport = null;
  try {
    alertsReport = computeAlerts({
      layer1Report,
      defiLatest,
      discoveryQueue,
      thresholds: alertsThresholds,
    });
    fs.writeFileSync(
      ALERTS_JSON_PATH,
      JSON.stringify(alertsReport, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      ALERTS_MD_PATH,
      renderAlertsMarkdown(alertsReport),
      "utf8"
    );
    try {
      maybeShowPopup(alertsReport, {
        enabled: alertPopupEnabled,
        statePath: ALERT_STATE_PATH,
      });
    } catch (err) {
      console.warn(`Alert popup failed: ${err.message}`);
    }
  } catch (err) {
    console.warn(`Alerts generation failed: ${err.message}`);
    alertsReport = null;
  }

  let dashboardHtml = null;
  try {
    dashboardHtml = renderDashboard({
      layer1Report,
      diffReport,
      supervisorResult,
      defiLatest,
      alertsReport,
      backtestStats,
    });
    fs.writeFileSync(DASHBOARD_PATH, dashboardHtml, "utf8");
  } catch (err) {
    console.warn(`Dashboard render failed: ${err.message}`);
  }

  const summary = buildSummary(layer1Report, supervisorResult, diffReport, alertsReport);
  const summaryPath = path.join(REPORTS_DIR, "Summary.md");
  fs.writeFileSync(summaryPath, summary, "utf8");

  // Archive this run so new runs don't overwrite context/history.
  const runId = isoToFilename(layer1Report.generated_at);
  const historyDir = path.join(REPORTS_DIR, "history", "watchlist");
  ensureDir(historyDir);
  fs.writeFileSync(
    path.join(historyDir, `${runId}_Layer1Report.json`),
    JSON.stringify(layer1Report, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(historyDir, `${runId}_Summary.md`), summary, "utf8");
  if (diffReport) {
    fs.writeFileSync(
      path.join(historyDir, `${runId}_DiffReport.json`),
      JSON.stringify(diffReport, null, 2),
      "utf8"
    );
  }
  if (dashboardHtml) {
    fs.writeFileSync(
      path.join(historyDir, `${runId}_Dashboard.html`),
      dashboardHtml,
      "utf8"
    );
  }
  if (supervisorOutput) {
    fs.writeFileSync(
      path.join(historyDir, `${runId}_SupervisorSummary.json`),
      JSON.stringify(supervisorOutput, null, 2),
      "utf8"
    );
  }
  if (alertsReport) {
    fs.writeFileSync(
      path.join(historyDir, `${runId}_Alerts.json`),
      JSON.stringify(alertsReport, null, 2),
      "utf8"
    );
    try {
      fs.writeFileSync(
        path.join(historyDir, `${runId}_Alerts.md`),
        renderAlertsMarkdown(alertsReport),
        "utf8"
      );
    } catch {
      // ignore markdown render failures
    }
  }

  console.log(summary);
  console.log(`\nSaved: ${layer1Path}`);
  console.log(`Saved: ${summaryPath}`);
  if (dashboardHtml) {
    console.log(`Saved: ${DASHBOARD_PATH}`);
  }
  if (alertsReport) {
    console.log(`Saved: ${ALERTS_JSON_PATH}`);
    console.log(`Saved: ${ALERTS_MD_PATH}`);
  }
  if (diffReport) {
    console.log(`Saved: ${path.join(REPORTS_DIR, "DiffReport.json")}`);
  }
  if (fs.existsSync(BACKTEST_REPORT_MD_PATH)) {
    console.log(`Saved: ${BACKTEST_REPORT_MD_PATH}`);
  }
  if (supervisorResult && supervisorResult.status === "ok") {
    console.log(`Saved: ${path.join(REPORTS_DIR, "SupervisorSummary.json")}`);
  }
  if (supervisorResult && supervisorResult.status === "skipped") {
    console.log("AI summary skipped (OPENAI_API_KEY not set).");
  }
  if (supervisorResult && supervisorResult.status === "error") {
    console.log(`AI summary failed: ${supervisorResult.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
