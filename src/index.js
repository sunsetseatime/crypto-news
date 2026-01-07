const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
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
const DEFI_SNAPSHOTS_DIR = path.join(REPORTS_DIR, "defi", "snapshots");
const DEFI_LATEST_PATH = path.join(REPORTS_DIR, "defi", "Latest.json");
const BACKTEST_PREDICTIONS_PATH = path.join(BACKTEST_DIR, "predictions.json");
const BACKTEST_REPORT_MD_PATH = path.join(BACKTEST_DIR, "BacktestReport.md");
const BACKTEST_REPORT_JSON_PATH = path.join(BACKTEST_DIR, "BacktestReport.json");
const MACRO_PULSE_JSON_PATH = path.join(REPORTS_DIR, "MacroPulse.json");
const MACRO_PULSE_MD_PATH = path.join(REPORTS_DIR, "MacroPulse.md");
const DASHBOARD_PATH = path.join(REPORTS_DIR, "Dashboard.html");
const ALERTS_JSON_PATH = path.join(REPORTS_DIR, "Alerts.json");
const ALERTS_MD_PATH = path.join(REPORTS_DIR, "Alerts.md");
const ALERT_STATE_PATH = path.join(REPORTS_DIR, "alert_state.json");
const WATCHLIST_PATH = path.join(__dirname, "..", "config", "watchlist.json");
const PORTFOLIO_PATH = path.join(__dirname, "..", "config", "portfolio.json");
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
const AUTO_STAGE_IGNORE_PATH = path.join(
  __dirname,
  "..",
  "config",
  "auto_stage_ignore.json"
);

// Discovery auto-stage (queue -> staging)
const AUTO_STAGE_DISCOVERY = process.env.AUTO_STAGE_DISCOVERY === "1";
const AUTO_STAGE_LIMIT = clamp(envNumber("AUTO_STAGE_LIMIT", 2), 0, 10);
const AUTO_STAGE_DISCOVERY_SCORE_MIN = envNumber(
  "AUTO_STAGE_DISCOVERY_SCORE_MIN",
  85
);
const AUTO_STAGE_VOLUME_24H_MIN = envNumber("AUTO_STAGE_VOLUME_24H_MIN", 10_000_000);
const AUTO_STAGE_VOL_TO_MCAP_MIN = envNumber("AUTO_STAGE_VOL_TO_MCAP_MIN", 0.05);
const AUTO_STAGE_PRICE_CHANGE_7D_MAX = envNumber(
  "AUTO_STAGE_PRICE_CHANGE_7D_MAX",
  60
);
const AUTO_STAGE_MAX_TOTAL = clamp(envNumber("AUTO_STAGE_MAX_TOTAL", 25), 0, 500);
const ADDRESS_BOOK_PATH =
  process.env.ADDRESS_BOOK_PATH ||
  path.join(__dirname, "..", "config", "address_book.json");

const CACHE_TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES || 360);
const CACHE_TTL_MS =
  Number.isFinite(CACHE_TTL_MINUTES) && CACHE_TTL_MINUTES > 0
    ? CACHE_TTL_MINUTES * 60 * 1000
    : 360 * 60 * 1000;
const SKIP_MARKET_CHART = process.env.SKIP_MARKET_CHART === "1";

// DeFi scan freshness handling (always auto-run on stale)
const AUTO_RUN_DEFI = true;
const DEFI_STALE_HOURS = envNumber("DEFI_STALE_HOURS", 24);

// Portfolio size setting - adjusts liquidity thresholds
// Set PORTFOLIO_SIZE env var to your trading capital (e.g., "5000" for $5K)
// Default thresholds are for institutional/large portfolios
const PORTFOLIO_SIZE = Number(process.env.PORTFOLIO_SIZE || 100000);
const PORTFOLIO_MULTIPLIER = Math.max(0.1, Math.min(1, PORTFOLIO_SIZE / 100000));

// Liquidity thresholds scale with portfolio size:
// - $100K+ portfolio: $5M low, $1M drop (default, conservative)
// - $50K portfolio: $2.5M low, $500K drop
// - $10K portfolio: $500K low, $100K drop
// - $5K portfolio: $250K low, $50K drop (more aggressive)
const VOLUME_LOW = Math.max(250_000, Math.round(5_000_000 * PORTFOLIO_MULTIPLIER));
const VOLUME_DROP = Math.max(50_000, Math.round(1_000_000 * PORTFOLIO_MULTIPLIER));
const CHASING_7D = 40;
const CHASING_24H = 20;

// CryptoPanic API for news sentiment
// NOTE: Free tier has 24h delay and no sentiment - not useful for trading
// Paid plan ($199/mo) gives real-time news + sentiment
// We primarily use CoinGecko status updates (free) as fallback
const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY || "";

// Take-profit configuration (default targets in %)
const TAKE_PROFIT_TARGET_1 = Number(process.env.TAKE_PROFIT_TARGET_1 || 15); // First target: 15%
const TAKE_PROFIT_TARGET_2 = Number(process.env.TAKE_PROFIT_TARGET_2 || 30); // Second target: 30%
const TAKE_PROFIT_TARGET_3 = Number(process.env.TAKE_PROFIT_TARGET_3 || 50); // Moon target: 50%
const TAKE_PROFIT_APPROACH_BUFFER = clamp(
  envNumber("TAKE_PROFIT_APPROACH_BUFFER", 2),
  0,
  10
);

const ETF_FLOW_PROXY_URL = "https://r.jina.ai/http://farside.co.uk/btc/";
const ETF_FLOW_CACHE_PATH = path.join(CACHE_DIR, "etf_flows_btc.json");
const LEVERAGE_CACHE_PATH = path.join(CACHE_DIR, "leverage_btc.json");
const GLOBAL_MARKET_CACHE_PATH = path.join(CACHE_DIR, "global_market.json");
const GLOBAL_MARKET_HISTORY_PATH = path.join(CACHE_DIR, "global_market_history.json");
const ALT_MARKET_CACHE_PATH = path.join(CACHE_DIR, "alt_market_snapshot.json");
const ALT_PULSE_COINS = [
  { id: "ethereum", symbol: "ETH" },
  { id: "binancecoin", symbol: "BNB" },
  { id: "solana", symbol: "SOL" },
  { id: "ripple", symbol: "XRP" },
  { id: "litecoin", symbol: "LTC" },
  { id: "monero", symbol: "XMR" },
];
const ALT_PULSE_IDS = ALT_PULSE_COINS.map((coin) => coin.id);

// Market condition alert thresholds
const FEAR_GREED_EXTREME_FEAR = 25;  // Below this = accumulation zone
const FEAR_GREED_FEAR = 40;          // Below this = still good to buy
const FEAR_GREED_GREED = 60;         // Above this = be cautious
const FEAR_GREED_EXTREME_GREED = 75; // Above this = consider taking profits

// Blue Chip Scanner configuration
const BLUE_CHIP_COUNT = Number(process.env.BLUE_CHIP_COUNT || 50); // Top N by market cap
const BLUE_CHIP_MIN_MCAP = 1_000_000_000; // $1B minimum market cap
const DIP_THRESHOLD_PERCENT = 10; // Alert when down 10%+ from recent high (lowered for blue chips)
const RSI_OVERSOLD_THRESHOLD = 35; // RSI below this = oversold (slightly higher for blue chips)
const STABLECOIN_IDS = new Set([
  "tether", "usd-coin", "dai", "binance-usd", "trueusd", "pax-dollar",
  "frax", "usdd", "gemini-dollar", "fei-usd", "first-digital-usd",
]);

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

async function fetchText(url, options = {}, retries = 2) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 15000;
        await sleep(waitMs);
        return fetchText(url, options, retries - 1);
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (err) {
    if (retries > 0) {
      await sleep(750);
      return fetchText(url, options, retries - 1);
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

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function envNumber(name, fallbackValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallbackValue;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallbackValue;
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

function roundUsd(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const abs = Math.abs(value);
  const step = abs >= 5000 ? 50 : abs >= 1000 ? 25 : abs >= 200 ? 10 : abs >= 50 ? 5 : 1;
  return Math.round(value / step) * step;
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

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
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

function deriveRuleConfidence(countWith, countWithout) {
  const minCount = Math.min(countWith || 0, countWithout || 0);
  if (minCount >= 20) return "high";
  if (minCount >= 8) return "medium";
  return "low";
}

function loadRuleConfidenceFromBacktest() {
  const report = readJsonFile(BACKTEST_REPORT_JSON_PATH, null);
  const items = Array.isArray(report?.flag_effectiveness_14d)
    ? report.flag_effectiveness_14d
    : [];
  const map = {};
  for (const item of items) {
    const flag = item?.flag;
    if (!flag) continue;
    const countWith = Number(item?.count_with) || 0;
    const countWithout = Number(item?.count_without) || 0;
    const confidence =
      item?.confidence || deriveRuleConfidence(countWith, countWithout);
    map[flag] = confidence;
  }
  return map;
}

function loadRuleEffectivenessFromBacktest() {
  const report = readJsonFile(BACKTEST_REPORT_JSON_PATH, null);
  const items = Array.isArray(report?.flag_effectiveness_14d)
    ? report.flag_effectiveness_14d
    : [];
  const map = {};

  for (const item of items) {
    const flag = item?.flag;
    if (!flag) continue;

    const countWith = Number(item?.count_with) || 0;
    const countWithout = Number(item?.count_without) || 0;
    const confidence =
      item?.confidence || deriveRuleConfidence(countWith, countWithout);

    map[flag] = {
      label: item?.label || flag,
      confidence,
      sample_min: Number(item?.sample_min) || 0,
      verdict: item?.verdict || null,
      count_with: countWith,
      count_without: countWithout,
      edge_14d: typeof item?.edge_14d === "number" ? item.edge_14d : null,
    };
  }

  return map;
}

function isEligibleForAutoStageCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const score = num(candidate.discovery_score);
  if (score === null || score < AUTO_STAGE_DISCOVERY_SCORE_MIN) return false;
  const volume24h = num(candidate.volume_24h);
  if (volume24h === null || volume24h < AUTO_STAGE_VOLUME_24H_MIN) return false;
  const volToMcap = num(candidate.volume_to_mcap);
  if (volToMcap === null || volToMcap < AUTO_STAGE_VOL_TO_MCAP_MIN) return false;
  const priceChange7d = num(candidate.price_change_7d);
  if (
    priceChange7d === null ||
    priceChange7d > AUTO_STAGE_PRICE_CHANGE_7D_MAX
  ) {
    return false;
  }
  return true;
}

function autoStageDiscoveryQueue({
  discoveryQueue,
  watchlistIds,
  stagingIds,
  autoStageIgnoreIds,
  nowIso,
}) {
  const queue =
    discoveryQueue && typeof discoveryQueue === "object"
      ? discoveryQueue
      : { candidates: [] };
  const candidates = Array.isArray(queue.candidates) ? queue.candidates : [];
  if (candidates.length === 0) {
    return { queue, staged: [], pending_high_score: 0, updated: false };
  }

  const pendingHighScore = candidates.filter((entry) => {
    const score = num(entry?.discovery_score);
    const status = entry?.status || "NEW";
    return (
      status === "NEW" &&
      score !== null &&
      score >= AUTO_STAGE_DISCOVERY_SCORE_MIN
    );
  }).length;

  if (!AUTO_STAGE_DISCOVERY) {
    return {
      queue,
      staged: [],
      pending_high_score: pendingHighScore,
      updated: false,
    };
  }

  const existingAutoStaged = candidates.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    if (entry.status !== "STAGED") return false;
    const source = entry.staged_source || (entry.auto_staged ? "auto" : null);
    return source === "auto";
  }).length;

  const remainingCapacity = Math.max(0, AUTO_STAGE_MAX_TOTAL - existingAutoStaged);
  const targetCount = Math.min(AUTO_STAGE_LIMIT, remainingCapacity);
  if (targetCount <= 0) {
    return {
      queue,
      staged: [],
      pending_high_score: pendingHighScore,
      updated: false,
    };
  }

  const sorted = [...candidates].sort(
    (a, b) => (num(b?.discovery_score) || 0) - (num(a?.discovery_score) || 0)
  );

  const staged = [];
  let updated = false;

  for (const entry of sorted) {
    if (staged.length >= targetCount) break;
    if (!isEligibleForAutoStageCandidate(entry)) continue;

    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId || entry?.id);
    if (!idLower) continue;
    if (autoStageIgnoreIds.has(idLower)) continue;
    if (watchlistIds.has(idLower) || stagingIds.has(idLower)) continue;

    const status = entry?.status || "NEW";
    if (status !== "NEW") continue;

    entry.status = "STAGED";
    entry.staged_source = "auto";
    entry.staged_at = entry.staged_at || nowIso;
    entry.auto_staged = true;
    updated = true;

    staged.push({
      coinGeckoId: entry.coinGeckoId || entry.id || "",
      symbol: entry.symbol ? String(entry.symbol).toUpperCase() : "",
      name: entry.name || entry.coinGeckoId || entry.id || "",
      discovery_score: entry.discovery_score ?? null,
    });
  }

  return {
    queue,
    staged,
    pending_high_score: pendingHighScore,
    updated,
  };
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

function buildSupervisorInput(layer1Report) {
  const report = layer1Report && typeof layer1Report === "object" ? layer1Report : {};
  const coins = Array.isArray(report.coins) ? report.coins : [];

  const trimmedCoins = coins.map((coin) => {
    const onchain = coin?.onchain || null;
    const topHolders = Array.isArray(onchain?.top_holders) ? onchain.top_holders : [];
    const top10 = topHolders.slice(0, 10);

    const classify = (holder) => {
      const kind = String(holder?.holder_kind || "").toLowerCase();
      const type = String(holder?.address_type || "").toUpperCase();
      if (type === "CONTRACT") return "contract";
      if (type === "EOA") return "wallet";
      if (kind.includes("smart")) return "contract";
      if (kind.includes("wallet")) return "wallet";
      return "unknown";
    };

    let walletCount = 0;
    let contractCount = 0;
    let unknownCount = 0;
    for (const holder of top10) {
      const bucket = classify(holder);
      if (bucket === "wallet") walletCount += 1;
      else if (bucket === "contract") contractCount += 1;
      else unknownCount += 1;
    }

    const newsHeadline =
      Array.isArray(coin?.news_headlines) && coin.news_headlines.length > 0
        ? coin.news_headlines[0]?.title || null
        : null;

    return {
      symbol: coin?.symbol || null,
      name: coin?.name || null,
      watchlist_source: coin?.watchlist_source || "main",
      hygiene_label: coin?.hygiene_label || null,
      price: num(coin?.price),
      price_change_24h: num(coin?.price_change_24h),
      price_change_7d: num(coin?.price_change_7d),
      price_change_30d: num(coin?.price_change_30d),
      volume_24h: num(coin?.volume_24h),
      has_clean_catalyst: Boolean(coin?.has_clean_catalyst),
      clean_catalyst: coin?.clean_catalyst || null,
      chasing: Boolean(coin?.chasing),
      low_liquidity: Boolean(coin?.low_liquidity),
      high_dilution_risk: Boolean(coin?.high_dilution_risk),
      unlock_risk_flag: Boolean(coin?.unlock_risk_flag),
      traction_status: coin?.traction_status || null,
      github_active: Boolean(coin?.github_active),
      github_stale: Boolean(coin?.github_stale),
      github_archived: Boolean(coin?.github_archived),
      holder_concentration_level: coin?.holder_concentration_level || "UNKNOWN",
      top_10_holder_percent: num(coin?.top_10_holder_percent),
      top_20_holder_percent: num(coin?.top_20_holder_percent),
      top_10_wallet_percent: num(coin?.top_10_wallet_percent),
      top_10_exchange_percent: num(coin?.top_10_exchange_percent),
      top_10_contract_percent: num(coin?.top_10_contract_percent),
      onchain: onchain
        ? {
            chain: onchain.chain || null,
            source: onchain.source || null,
            wallet_count_top10: walletCount,
            contract_count_top10: contractCount,
            unknown_count_top10: unknownCount,
          }
        : null,
      entry_signal: coin?.entry_signal || null,
      rsi_14d: num(coin?.rsi_14d),
      distance_from_high: num(coin?.distance_from_high),
      news_activity: coin?.news_activity || null,
      news_sentiment: coin?.news_sentiment || null,
      news_signal: coin?.news_signal || null,
      news_headline: newsHeadline,
      defi_matched: Boolean(coin?.defi_matched),
      defi_protocol_name: coin?.defi_protocol_name || null,
      defi_audit_status: coin?.defi_audit_status || null,
      defi_hack_count:
        typeof coin?.defi_hack_count === "number" ? coin.defi_hack_count : null,
      take_profit: coin?.take_profit
        ? {
            signal: coin.take_profit.signal || null,
            profit_pct: num(coin.take_profit.profit_pct),
            highest_target_hit:
              typeof coin.take_profit.highest_target_hit === "number"
                ? coin.take_profit.highest_target_hit
                : null,
            approaching_delta_pct: num(coin.take_profit.approaching_delta_pct),
          }
        : null,
    };
  });

  return {
    generated_at: report.generated_at || null,
    actionable_today: Boolean(report.actionable_today),
    warnings: Array.isArray(report.warnings) ? report.warnings.slice(0, 20) : [],
    market_condition: report?.market_condition?.signals || null,
    btc_reference: report?.btc_reference || null,
    coins: trimmedCoins,
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
    "Use plain English and avoid jargon. " +
    "Only use the provided JSON. " +
    "Do not claim a clean catalyst unless it is dated within 14 days and linked. " +
    "If unlock data is UNKNOWN/LOW, mark not actionable and say it needs verification. " +
    "For on-chain: do not guess address identity (exchange/person/team). Only summarize chain, holder concentration %, and wallet vs smart-contract counts when available.";

  const userMsg =
    "Summarize today's scan strictly using the provided JSON only. " +
    "Return JSON matching the schema. " +
    "Include up to 5 on-chain highlights focusing on coins where ownership concentration is HIGH (`holder_concentration_level=HIGH`); otherwise include any with on-chain data. " +
    "Do not include raw addresses in the highlight facts.\n\n" +
    JSON.stringify(buildSupervisorInput(layer1Report));

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

// ============================================================================
// TECHNICAL ANALYSIS - Entry Signals
// ============================================================================

/**
 * Calculate RSI (Relative Strength Index) from price data
 * RSI < 30 = oversold (potential buy)
 * RSI > 70 = overbought (potential sell/wait)
 */
function calculateRSI(prices, period = 14) {
  if (!Array.isArray(prices) || prices.length < period + 1) {
    return null;
  }
  
  // Calculate price changes
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  if (changes.length < period) return null;
  
  // Get the most recent 'period' changes
  const recentChanges = changes.slice(-period);
  
  // Separate gains and losses
  let avgGain = 0;
  let avgLoss = 0;
  
  for (const change of recentChanges) {
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  if (avgLoss === 0) return 100; // All gains, RSI = 100
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return Math.round(rsi * 10) / 10; // Round to 1 decimal
}

/**
 * Get technical entry signals from market chart data
 */
function getTechnicalSignals(marketChart, currentPrice) {
  const result = {
    rsi_14d: null,
    rsi_signal: null, // "oversold", "overbought", "neutral"
    high_30d: null,
    low_30d: null,
    distance_from_high: null, // Percentage below 30d high
    distance_from_low: null, // Percentage above 30d low
    entry_signal: null, // "strong_buy", "buy", "wait", "overbought"
    entry_score: null, // 0-100 score for entry quality
  };
  
  if (!marketChart || !Array.isArray(marketChart.prices)) {
    return result;
  }
  
  const prices = marketChart.prices
    .map((entry) => num(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  
  if (prices.length < 14) {
    return result;
  }
  
  // Calculate RSI
  result.rsi_14d = calculateRSI(prices, 14);
  
  if (result.rsi_14d !== null) {
    if (result.rsi_14d < 30) {
      result.rsi_signal = "oversold";
    } else if (result.rsi_14d > 70) {
      result.rsi_signal = "overbought";
    } else {
      result.rsi_signal = "neutral";
    }
  }
  
  // Calculate 30-day high/low
  const last30Prices = prices.slice(-30);
  result.high_30d = Math.max(...last30Prices);
  result.low_30d = Math.min(...last30Prices);
  
  // Calculate distance from high/low
  const price = currentPrice || prices[prices.length - 1];
  if (price && result.high_30d) {
    result.distance_from_high = ((result.high_30d - price) / result.high_30d) * 100;
  }
  if (price && result.low_30d) {
    result.distance_from_low = ((price - result.low_30d) / result.low_30d) * 100;
  }
  
  // Calculate entry score (0-100, higher = better entry)
  // Factors: RSI weight (40%), distance from high weight (40%), distance from low (20%)
  let entryScore = 50; // Start neutral
  
  if (result.rsi_14d !== null) {
    // RSI contribution: oversold adds points, overbought subtracts
    if (result.rsi_14d < 30) {
      entryScore += 30 + ((30 - result.rsi_14d) / 30) * 10; // Up to +40
    } else if (result.rsi_14d > 70) {
      entryScore -= 20 + ((result.rsi_14d - 70) / 30) * 20; // Up to -40
    } else {
      // Neutral RSI: slight bonus if below 50
      entryScore += (50 - result.rsi_14d) / 2;
    }
  }
  
  // Distance from high contribution: bigger dip = better entry
  if (result.distance_from_high !== null) {
    if (result.distance_from_high > 40) {
      entryScore += 25; // Down 40%+ from high
    } else if (result.distance_from_high > 25) {
      entryScore += 15; // Down 25-40%
    } else if (result.distance_from_high > 10) {
      entryScore += 5; // Down 10-25%
    } else if (result.distance_from_high < 5) {
      entryScore -= 10; // Near all-time high
    }
  }
  
  // Clamp score to 0-100
  result.entry_score = Math.max(0, Math.min(100, Math.round(entryScore)));
  
  // Determine entry signal
  if (result.entry_score >= 75) {
    result.entry_signal = "strong_buy";
  } else if (result.entry_score >= 60) {
    result.entry_signal = "buy";
  } else if (result.entry_score >= 40) {
    result.entry_signal = "wait";
  } else {
    result.entry_signal = "overbought";
  }
  
  return result;
}

// ============================================================================
// BLUE CHIP SCANNER - Top Cryptos by Market Cap
// ============================================================================

/**
 * Fetch top N cryptocurrencies by market cap from CoinGecko
 */
async function fetchBlueChips(count = BLUE_CHIP_COUNT) {
  const cachePath = path.join(CACHE_DIR, "blue_chips.json");
  const cached = readCache(cachePath);
  if (cached && Array.isArray(cached.coins)) {
    return cached;
  }
  
  try {
    const params = new URLSearchParams({
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: String(count),
      page: "1",
      sparkline: "true", // Get 7-day price data for analysis
      price_change_percentage: "24h,7d,30d",
    });
    
    const data = await fetchJson(
      `${BASE_URL}/coins/markets?${params.toString()}`,
      COINGECKO_API_KEY ? { [COINGECKO_API_KEY_HEADER]: COINGECKO_API_KEY } : {},
      2
    );
    
    if (!Array.isArray(data)) {
      console.warn("Blue chip fetch returned non-array");
      return { coins: [], fetched_at: new Date().toISOString() };
    }
    
    // Filter to only include coins above minimum market cap and exclude stablecoins
    const filtered = data.filter(coin => 
      num(coin.market_cap) >= BLUE_CHIP_MIN_MCAP && 
      !STABLECOIN_IDS.has(coin.id)
    );
    
    const result = {
      coins: filtered,
      fetched_at: new Date().toISOString(),
    };
    
    writeCache(cachePath, result);
    return result;
  } catch (err) {
    console.warn(`Blue chip fetch failed: ${err.message}`);
    return { coins: [], fetched_at: new Date().toISOString() };
  }
}

/**
 * Calculate RSI from sparkline price data
 */
function calculateRSIFromSparkline(sparkline) {
  if (!sparkline || !Array.isArray(sparkline.price) || sparkline.price.length < 14) {
    return null;
  }
  
  const prices = sparkline.price;
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  // Use last 14 periods
  const recent = changes.slice(-14);
  let gains = 0, losses = 0;
  for (const change of recent) {
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function sparklinePctChange(sparkline, pointsBack) {
  if (!sparkline || !Array.isArray(sparkline.price) || sparkline.price.length < 2) {
    return null;
  }
  const prices = sparkline.price;
  const end = num(prices[prices.length - 1]);
  const startIdx = prices.length - 1 - Math.max(1, Number(pointsBack) || 1);
  const start = startIdx >= 0 ? num(prices[startIdx]) : null;
  if (end === null || start === null || start <= 0) return null;
  return ((end - start) / start) * 100;
}

/**
 * Analyze blue chips for dip opportunities
 */
function analyzeBlueChipsForDips(blueChips, fearGreed) {
  const opportunities = [];
  const wait_list = [];
  const coins = blueChips?.coins || [];
  const marketInFear = fearGreed && fearGreed.value <= FEAR_GREED_FEAR;
  
  for (const coin of coins) {
    const symbol = coin.symbol?.toUpperCase() || "???";
    const name = coin.name || symbol;
    const price = num(coin.current_price);
    const high24h = num(coin.high_24h);
    const ath = num(coin.ath);
    const athDate = coin.ath_date;
    const change24h = num(coin.price_change_percentage_24h);
    const change7d = num(coin.price_change_percentage_7d_in_currency);
    const change30d = num(coin.price_change_percentage_30d_in_currency);
    const marketCap = num(coin.market_cap);
    const volume24h = num(coin.total_volume);
    
    // Calculate RSI from sparkline
    const rsi = calculateRSIFromSparkline(coin.sparkline_in_7d);
    
    // Calculate distance from 7-day high (from sparkline)
    let high7d = price;
    if (coin.sparkline_in_7d?.price?.length > 0) {
      high7d = Math.max(...coin.sparkline_in_7d.price);
    }
    const dipFrom7dHigh = high7d > 0 ? ((high7d - price) / high7d) * 100 : 0;
    
    // Calculate distance from ATH
    const dipFromATH = ath > 0 ? ((ath - price) / ath) * 100 : 0;

    const recentChange3h = sparklinePctChange(coin.sparkline_in_7d, 3);
    const recentChange6h = sparklinePctChange(coin.sparkline_in_7d, 6);
    const stabilizing =
      recentChange3h !== null ? recentChange3h >= -0.5 : recentChange6h !== null ? recentChange6h >= -1 : false;
    
    // Determine buy signals
    const signals = [];
    let signalStrength = 0;
    const riskWarnings = [];
    
    // RSI oversold
    if (rsi !== null && rsi < RSI_OVERSOLD_THRESHOLD) {
      signals.push(`RSI oversold (${rsi.toFixed(0)})`);
      signalStrength += rsi < 25 ? 30 : 20;
    }
    
    // Big dip from recent high
    if (dipFrom7dHigh >= DIP_THRESHOLD_PERCENT) {
      signals.push(`Down ${dipFrom7dHigh.toFixed(1)}% from 7d high`);
      signalStrength += dipFrom7dHigh >= 25 ? 30 : 20;
    }
    
    // Weekly loss
    if (change7d < -10) {
      signals.push(`Down ${Math.abs(change7d).toFixed(1)}% this week`);
      signalStrength += Math.abs(change7d) >= 20 ? 25 : 15;
    }
    
    // Far from ATH (long-term value)
    if (dipFromATH >= 50) {
      signals.push(`${dipFromATH.toFixed(0)}% below ATH`);
      signalStrength += 10;
    }

    // Risk hints (plain-English warnings)
    if (change24h !== null && change24h <= -8) {
      riskWarnings.push(`still dropping today (${formatSignedPct(change24h, 1)})`);
    }
    if (change30d !== null && change30d <= -30) {
      riskWarnings.push(`down a lot this month (${formatSignedPct(change30d, 1)})`);
    }
    if (recentChange3h !== null && recentChange3h <= -1) {
      riskWarnings.push(`still falling in the last few hours (${formatSignedPct(recentChange3h, 1)})`);
    }
    
    // Market fear bonus
    if (marketInFear && signals.length > 0) {
      signalStrength += 20;
    }
    
    // Determine entry signal
    let entrySignal = "wait";
    if (signalStrength >= 50) {
      entrySignal = "strong_buy";
    } else if (signalStrength >= 30) {
      entrySignal = "buy";
    } else if (rsi !== null && rsi > 70) {
      entrySignal = "overbought";
    }
    
    const fallingHardToday =
      change24h !== null && change24h <= -6 && (recentChange3h === null ? true : recentChange3h <= -0.5);

    // Only include if there's at least one buy signal; if still falling hard, move to a wait list.
    if (signals.length > 0 && entrySignal !== "overbought" && entrySignal !== "wait") {
      const payload = {
        symbol,
        name,
        coin_gecko_id: coin.id,
        price,
        market_cap: marketCap,
        volume_24h: volume24h,
        change_24h: change24h,
        change_7d: change7d,
        change_30d: change30d,
        recent_change_3h: recentChange3h,
        recent_change_6h: recentChange6h,
        stabilizing,
        rsi,
        dip_from_7d_high: dipFrom7dHigh,
        dip_from_ath: dipFromATH,
        signals,
        signal_strength: signalStrength,
        entry_signal: entrySignal,
        market_in_fear: marketInFear,
        risk_warnings: riskWarnings,
      };

      if (fallingHardToday && !stabilizing) {
        wait_list.push({
          ...payload,
          entry_signal: "wait",
          wait_reason: "Still falling hard today; wait for it to stop falling.",
        });
      } else {
        opportunities.push(payload);
      }
    }
  }
  
  // Sort by signal strength (best opportunities first)
  opportunities.sort((a, b) => b.signal_strength - a.signal_strength);
  wait_list.sort((a, b) => b.signal_strength - a.signal_strength);
  
  return {
    scanned_count: coins.length,
    opportunities,
    wait_list,
    market_in_fear: marketInFear,
    scanned_at: new Date().toISOString(),
  };
}

// ============================================================================
// MARKET CONDITION DETECTION - Fear & Greed, BTC Trend
// ============================================================================

/**
 * Fetch Fear & Greed Index from alternative.me (free API)
 */
async function fetchFearGreedIndex() {
  const cachePath = path.join(CACHE_DIR, "fear_greed.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  
  try {
    // Fetch current + 30 days history
    const data = await fetchJson("https://api.alternative.me/fng/?limit=31", {}, 1);
    
    if (!data || !Array.isArray(data.data)) {
      return null;
    }
    
    const current = data.data[0];
    const history = data.data;
    
    // Calculate averages
    const values = history.map(d => parseInt(d.value)).filter(v => !isNaN(v));
    const avg7d = values.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, values.length);
    const avg30d = values.reduce((a, b) => a + b, 0) / values.length;
    
    // Detect trend (is sentiment improving or worsening?)
    const recent3d = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const prev3d = values.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
    const trend = recent3d > prev3d ? "improving" : recent3d < prev3d ? "worsening" : "stable";
    
    const result = {
      value: parseInt(current.value),
      classification: current.value_classification,
      timestamp: current.timestamp,
      avg_7d: Math.round(avg7d),
      avg_30d: Math.round(avg30d),
      trend,
      fetched_at: new Date().toISOString(),
    };
    
    writeCache(cachePath, result);
    return result;
  } catch (err) {
    console.warn(`Fear & Greed fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Calculate BTC moving averages from price history
 */
function calculateBTCMovingAverages(marketChart) {
  if (!marketChart || !Array.isArray(marketChart.prices)) {
    return null;
  }
  
  const prices = marketChart.prices
    .map(entry => num(entry[1]))
    .filter(v => Number.isFinite(v) && v > 0);
  
  if (prices.length < 30) return null;
  
  const currentPrice = prices[prices.length - 1];
  
  // Simple Moving Averages
  const ma7 = prices.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
  const ma30 = prices.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, prices.length);
  
  // Price position relative to MAs
  const aboveMA7 = currentPrice > ma7;
  const aboveMA20 = currentPrice > ma20;
  const aboveMA30 = currentPrice > ma30;
  
  // Recent momentum (7-day change)
  const price7dAgo = prices[prices.length - 8] || prices[0];
  const momentum7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;
  
  // Volume surge detection (if we have volume data)
  
  return {
    current_price: currentPrice,
    ma_7d: ma7,
    ma_20d: ma20,
    ma_30d: ma30,
    above_ma_7d: aboveMA7,
    above_ma_20d: aboveMA20,
    above_ma_30d: aboveMA30,
    momentum_7d: Math.round(momentum7d * 100) / 100,
  };
}

/**
 * Detect overall market condition and generate signals
 */
function detectMarketCondition(fearGreed, btcData, btcMAs) {
  const signals = {
    // Accumulation signals (BUY zones)
    accumulation: [],
    // Run signals (momentum plays)
    run: [],
    // Warning signals (be careful)
    warnings: [],
    // Overall assessment
    market_phase: "neutral",
    recommendation: "hold",
  };
  
  // === ACCUMULATION SIGNALS (high priority for user) ===
  
  if (fearGreed) {
    if (fearGreed.value <= FEAR_GREED_EXTREME_FEAR) {
      signals.accumulation.push({
        signal: "extreme_fear",
        strength: "strong",
        message: `Fear & Greed at ${fearGreed.value} (Extreme Fear) - historically great buying zone`,
        value: fearGreed.value,
      });
    } else if (fearGreed.value <= FEAR_GREED_FEAR) {
      signals.accumulation.push({
        signal: "fear",
        strength: "moderate", 
        message: `Fear & Greed at ${fearGreed.value} (Fear) - good accumulation zone`,
        value: fearGreed.value,
      });
    }
    
    // Sentiment turning from fear to neutral (early run signal)
    if (fearGreed.trend === "improving" && fearGreed.value < 50 && fearGreed.avg_7d < fearGreed.value) {
      signals.run.push({
        signal: "sentiment_shift",
        strength: "moderate",
        message: `Sentiment improving: ${fearGreed.avg_7d} → ${fearGreed.value}`,
      });
    }
  }
  
  // BTC technical signals
  if (btcMAs) {
    // Accumulation: BTC oversold or below MAs
    if (btcMAs.momentum_7d < -10) {
      signals.accumulation.push({
        signal: "btc_dip",
        strength: "strong",
        message: `BTC down ${Math.abs(btcMAs.momentum_7d).toFixed(1)}% this week - potential accumulation`,
      });
    }
    
    if (!btcMAs.above_ma_30d && btcMAs.momentum_7d < 0) {
      signals.accumulation.push({
        signal: "btc_below_ma",
        strength: "moderate",
        message: "BTC below 30-day average - accumulation zone",
      });
    }
    
    // === RUN SIGNALS (momentum plays) ===
    
    // BTC crossing above MA (trend starting)
    if (btcMAs.above_ma_7d && btcMAs.above_ma_20d && btcMAs.momentum_7d > 5) {
      signals.run.push({
        signal: "btc_breakout",
        strength: "strong",
        message: `BTC up ${btcMAs.momentum_7d.toFixed(1)}% and above moving averages - momentum building`,
      });
    }
    
    // Strong weekly momentum
    if (btcMAs.momentum_7d > 10) {
      signals.run.push({
        signal: "btc_surge",
        strength: "strong",
        message: `BTC surging +${btcMAs.momentum_7d.toFixed(1)}% this week`,
      });
    }
  }
  
  // === WARNING SIGNALS ===
  
  if (fearGreed && fearGreed.value >= FEAR_GREED_EXTREME_GREED) {
    signals.warnings.push({
      signal: "extreme_greed",
      message: `Fear & Greed at ${fearGreed.value} (Extreme Greed) - be cautious, consider taking profits`,
    });
  }
  
  if (btcMAs && btcMAs.momentum_7d > 20) {
    signals.warnings.push({
      signal: "btc_overextended",
      message: `BTC up ${btcMAs.momentum_7d.toFixed(1)}% in 7 days - may be overextended`,
    });
  }
  
  // === DETERMINE MARKET PHASE ===
  
  if (signals.accumulation.some(s => s.strength === "strong")) {
    signals.market_phase = "accumulation";
    signals.recommendation = "accumulate";
  } else if (signals.run.some(s => s.strength === "strong")) {
    signals.market_phase = "run";
    signals.recommendation = signals.warnings.length > 0 ? "cautious_buy" : "buy_momentum";
  } else if (signals.warnings.length > 0) {
    signals.market_phase = "caution";
    signals.recommendation = "take_profits";
  } else {
    signals.market_phase = "neutral";
    signals.recommendation = "hold";
  }
  
  return signals;
}

/**
 * Generate play recommendations based on market condition + coin data
 * This tells the user WHAT to do with their money right now
 */
function generatePlayRecommendations(coins, marketCondition) {
  const phase = marketCondition?.market_phase || "neutral";
  const mainCoins = coins.filter(c => c.watchlist_source !== "staging");
  
  const recommendations = {
    market_phase: phase,
    best_buys: [],       // Coins to buy now
    momentum_plays: [],  // Quick trades for runs
    take_profits: [],    // Time to sell
    avoid: [],           // Stay away
    watch_for_dip: [],   // Good coins, wait for better entry
  };
  
  for (const coin of mainCoins) {
    const symbol = coin.symbol;
    const label = coin.hygiene_label;
    const entry = coin.entry_signal;
    const tp = coin.take_profit;
    const vs_btc = coin.relative_strength_7d || 0;
    const outperforming = coin.outperforming_btc === true;
    const chasing = coin.chasing === true;
    const highRisk = coin.holder_concentration_level === "HIGH" || coin.high_dilution_risk === true;
    const hasCatalyst = coin.has_clean_catalyst === true;
    const lowLiquidity = coin.low_liquidity === true;
    
    // Build a simple reason string
    const buildReason = (reasons) => reasons.filter(Boolean).join(", ");
    
    // === TAKE PROFIT (highest priority - you already own these) ===
    if (tp?.signal && tp.profit_pct > 0) {
      const targetName = tp.signal === "moon" ? "moon target" : 
                         tp.signal === "take_profit_2" ? "target 2" : "target 1";
      recommendations.take_profits.push({
        symbol,
        profit_pct: tp.profit_pct,
        reason: `Up ${tp.profit_pct.toFixed(1)}% - hit ${targetName}`,
        action: tp.signal === "moon" ? "Sell most, keep moonbag" : "Consider selling some",
        priority: tp.profit_pct,
      });
      continue; // Don't recommend buying something you should be selling
    }
    
    // === AVOID (chasing or high risk) ===
    if (label === "DROP" || chasing) {
      const reasons = [];
      if (chasing) reasons.push("price already pumped");
      if (highRisk) reasons.push("risky ownership");
      if (lowLiquidity) reasons.push("hard to exit");
      recommendations.avoid.push({
        symbol,
        reason: buildReason(reasons) || "multiple red flags",
        priority: 0,
      });
      continue;
    }
    
    // === For KEEP coins, decide based on market phase ===
    if (label === "KEEP") {
      const entryGood = entry === "strong_buy" || entry === "buy";
      const entryWait = entry === "wait" || entry === "overbought";
      
      // During ACCUMULATION phase: focus on fundamentals
      if (phase === "accumulation") {
        if (entryGood && !highRisk) {
          const reasons = [];
          reasons.push("good fundamentals");
          if (hasCatalyst) reasons.push("recent catalyst");
          if (!lowLiquidity) reasons.push("easy to trade");
          recommendations.best_buys.push({
            symbol,
            reason: buildReason(reasons),
            entry_signal: entry,
            action: "Strong buy - accumulation zone",
            priority: hasCatalyst ? 100 : 80,
          });
        } else if (entryWait) {
          recommendations.watch_for_dip.push({
            symbol,
            reason: "Good coin but entry not ideal yet",
            entry_signal: entry,
            action: "Wait for pullback",
            priority: 50,
          });
        } else if (highRisk) {
          recommendations.watch_for_dip.push({
            symbol,
            reason: "Good setup but ownership concentrated",
            entry_signal: entry,
            action: "Small position only",
            priority: 30,
          });
        }
      }
      // During RUN phase: focus on momentum - be more lenient with entries
      else if (phase === "run" || phase === "neutral") {
        // During runs, overbought coins can still have momentum
        // Only "wait" or no entry signal should block momentum plays
        const entryOkForRun = entry !== "wait" && entry !== null;
        
        if (outperforming && entryOkForRun && vs_btc > 5) {
          const reasons = [];
          reasons.push(`beating BTC by ${vs_btc.toFixed(1)}%`);
          if (hasCatalyst) reasons.push("has catalyst");
          if (entry === "overbought") reasons.push("hot but running");
          recommendations.momentum_plays.push({
            symbol,
            reason: buildReason(reasons),
            vs_btc: vs_btc,
            entry_signal: entry,
            action: entry === "overbought" ? "Quick trade, tight stop" : "Momentum play (target 5-10%)",
            priority: vs_btc + (hasCatalyst ? 20 : 0) + (entryGood ? 10 : 0),
          });
        } else if (entryGood && !highRisk) {
          recommendations.best_buys.push({
            symbol,
            reason: "Solid fundamentals, market moving",
            entry_signal: entry,
            action: "Buy with trailing stop",
            priority: 60,
          });
        } else if (!outperforming || vs_btc < 5) {
          recommendations.watch_for_dip.push({
            symbol,
            reason: outperforming ? "Slight outperformance, wait for strength" : "Not leading the rally",
            entry_signal: entry,
            action: "Watch for dip or momentum shift",
            priority: 40,
          });
        } else if (entry === "wait") {
          recommendations.watch_for_dip.push({
            symbol,
            reason: "Good coin but entry signal says wait",
            entry_signal: entry,
            action: "Set price alert for dip",
            priority: 35,
          });
        }
      }
      // During CAUTION phase: be defensive
      else if (phase === "caution") {
        if (tp?.profit_pct > 10) {
          // Already handled above
        } else {
          recommendations.watch_for_dip.push({
            symbol,
            reason: "Market overheated - wait for pullback",
            entry_signal: entry,
            action: "Don't chase, wait for correction",
            priority: 20,
          });
        }
      }
    }
    // WATCH-ONLY coins
    else if (label === "WATCH-ONLY") {
      if (outperforming && !chasing && phase === "run") {
        // Could be momentum play despite watch-only status
        recommendations.watch_for_dip.push({
          symbol,
          reason: `Outperforming (+${vs_btc.toFixed(1)}%) but has flags`,
          entry_signal: entry,
          action: "Small momentum play only",
          priority: vs_btc > 15 ? 40 : 20,
        });
      }
    }
  }
  
  // Sort each category by priority
  for (const key of Object.keys(recommendations)) {
    if (Array.isArray(recommendations[key])) {
      recommendations[key].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }
  
  return recommendations;
}

/**
 * Generate "Best Entries Today" - ranks coins by entry quality
 * Filters out junk, focuses on actionable buy opportunities
 */
function generateBestEntries(coins, marketCondition) {
  const phase = marketCondition?.market_phase || "neutral";
  const mainCoins = coins.filter(c => c.watchlist_source !== "staging");
  
  const entries = [];
  
  for (const coin of mainCoins) {
    const label = coin.hygiene_label;
    const entryScore = coin.entry_score;
    const entrySignal = coin.entry_signal;
    
    // Skip junk - only consider KEEP or solid WATCH-ONLY
    if (label === "DROP") continue;
    if (!entryScore || entryScore < 40) continue; // Overbought
    
    // Skip coins with severe risks
    const highRisk = coin.holder_concentration_level === "HIGH" || 
                     coin.high_dilution_risk === true ||
                     coin.github_archived === true;
    if (highRisk && label !== "KEEP") continue;
    
    // Build entry reasons
    const reasons = [];
    if (coin.rsi_14d !== null && coin.rsi_14d < 35) {
      reasons.push(`RSI ${Math.round(coin.rsi_14d)} (oversold)`);
    }
    if (coin.distance_from_high !== null && coin.distance_from_high > 15) {
      reasons.push(`${coin.distance_from_high.toFixed(0)}% from 30d high`);
    }
    if (coin.distance_from_low !== null && coin.distance_from_low < 10) {
      reasons.push("Near 30d low");
    }
    if (coin.traction_status === "OK") {
      reasons.push("✓ active dev");
    }
    if (coin.has_clean_catalyst) {
      reasons.push("catalyst");
    }
    if (coin.outperforming_btc) {
      const rsValue = num(coin.relative_strength_7d);
      if (rsValue !== null) {
        reasons.push(`Beating BTC by ${rsValue.toFixed(1)}%`);
      } else {
        reasons.push("beating BTC");
      }
    }
    if (coin.news_activity && coin.news_activity !== "quiet") {
      const tone =
        coin.news_sentiment === "bullish"
          ? "positive"
          : coin.news_sentiment === "bearish"
            ? "negative"
            : "mixed";
      const activityLabel =
        coin.news_activity === "very active"
          ? "Lots of news"
          : coin.news_activity === "active"
            ? "News is active"
            : "Some recent news";
      reasons.push(`${activityLabel} (${tone})`);
    }
    
    // Calculate adjusted score based on phase
    let adjustedScore = entryScore;
    if (phase === "accumulation" && entrySignal === "strong_buy") {
      adjustedScore += 20; // Bonus for buying in accumulation
    }
    if (phase === "run" && coin.outperforming_btc && coin.relative_strength_7d > 10) {
      adjustedScore += 10; // Momentum bonus during runs
    }
    if (label === "KEEP") {
      adjustedScore += 15; // Bonus for passing all hygiene gates
    }
    if (highRisk) {
      adjustedScore -= 20; // Penalty for risks
    }
    if (coin.volume_trend === "spike") {
      adjustedScore += 5;
    }
    if (coin.low_liquidity) {
      adjustedScore -= 10; // Liquidity penalty
    }
    const newsBoost = num(coin.news_momentum_score) || 0;
    if (newsBoost !== 0) {
      adjustedScore += newsBoost;
    }
    const rsValue = num(coin.relative_strength_7d);
    if (rsValue !== null) {
      if (rsValue >= 20) {
        adjustedScore += 12;
      } else if (rsValue >= 10) {
        adjustedScore += 6;
      } else if (rsValue <= -10) {
        adjustedScore -= 6;
      }
    }
    
    entries.push({
      symbol: coin.symbol,
      name: coin.name,
      coin_gecko_id: coin.coin_gecko_id,
      entry_signal: entrySignal,
      entry_score: entryScore,
      adjusted_score: adjustedScore,
      hygiene_label: label,
      rsi: coin.rsi_14d,
      distance_from_high: coin.distance_from_high,
      price: coin.price,
      price_change_7d: coin.price_change_7d,
      vs_btc_7d: coin.relative_strength_7d,
      reasons,
      action: entrySignal === "strong_buy" 
        ? "🟢 Buy now" 
        : entrySignal === "buy" 
          ? "🔵 Good entry" 
          : "⏸️ Wait for dip",
      risks: highRisk ? ["ownership/dilution risk"] : [],
    });
  }
  
  // Sort by adjusted score (best entries first)
  entries.sort((a, b) => b.adjusted_score - a.adjusted_score);
  
  return {
    market_phase: phase,
    best_entries: entries.slice(0, 5), // Top 5
    all_entries: entries,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Load the latest DeFi scan snapshot and create lookup maps
 * This allows watchlist coins to inherit audit/hack/TVL data from DeFi protocols
 */
function loadDefiKnowledge() {
  try {
    let protocols = [];
    let sourceLabel = null;

    if (fs.existsSync(DEFI_LATEST_PATH)) {
      const latest = readJsonFile(DEFI_LATEST_PATH, null);
      if (latest && Array.isArray(latest.protocols)) {
        protocols = latest.protocols;
        sourceLabel = "Latest.json";
      }
    }

    if (protocols.length === 0 && fs.existsSync(DEFI_SNAPSHOTS_DIR)) {
      const files = fs
        .readdirSync(DEFI_SNAPSHOTS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length > 0) {
        const latestPath = path.join(DEFI_SNAPSHOTS_DIR, files[0]);
        const snapshot = JSON.parse(fs.readFileSync(latestPath, "utf8"));
        if (snapshot && Array.isArray(snapshot.protocols)) {
          protocols = snapshot.protocols;
          sourceLabel = files[0];
        }
      }
    }

    if (protocols.length === 0) {
      return { bySymbol: new Map(), byName: new Map(), protocols: [] };
    }

    // Create lookup maps by symbol and name (case-insensitive)
    const bySymbol = new Map();
    const byName = new Map();

    for (const proto of protocols) {
      const symbolRaw = proto?.market?.token_symbol || proto?.symbol || "";
      const symbol = symbolRaw ? String(symbolRaw).toUpperCase() : "";
      const tokenName = proto?.market?.token_name
        ? String(proto.market.token_name).toLowerCase()
        : "";
      const protocolName = proto?.name ? String(proto.name).toLowerCase() : "";

      if (symbol && !bySymbol.has(symbol)) {
        bySymbol.set(symbol, proto);
      }
      if (tokenName && !byName.has(tokenName)) {
        byName.set(tokenName, proto);
      }
      if (protocolName && !byName.has(protocolName)) {
        byName.set(protocolName, proto);
      }
    }

    const label = sourceLabel || "unknown source";
    console.log(`DeFi Knowledge: Loaded ${protocols.length} protocols from ${label}`);
    return { bySymbol, byName, protocols, snapshotFile: label };
  } catch (err) {
    console.warn(`DeFi Knowledge: Failed to load - ${err.message}`);
    return { bySymbol: new Map(), byName: new Map(), protocols: [] };
  }
}

/**
 * Match a watchlist coin to DeFi protocol data
 */
function matchDefiProtocol(coin, defiKnowledge) {
  const symbol = coin.symbol?.toUpperCase();
  const name = coin.name?.toLowerCase();
  
  // Try symbol match first
  if (symbol && defiKnowledge.bySymbol.has(symbol)) {
    return defiKnowledge.bySymbol.get(symbol);
  }
  
  // Try name match
  if (name && defiKnowledge.byName.has(name)) {
    return defiKnowledge.byName.get(name);
  }
  
  // Try partial name match (e.g., "Pendle Finance" matches "pendle")
  if (name) {
    for (const [protoName, proto] of defiKnowledge.byName.entries()) {
      if (protoName.includes(name) || name.includes(protoName)) {
        return proto;
      }
    }
  }
  
  return null;
}

/**
 * Extract relevant DeFi data for a watchlist coin
 */
function extractDefiData(proto) {
  if (!proto) {
    return null;
  }
  
  return {
    defi_matched: true,
    defi_protocol_name: proto.name,
    defi_tvl: proto.tvl?.focus_current || null,
    defi_tvl_change_7d: proto.tvl?.change_7d_pct || null,
    defi_tvl_change_30d: proto.tvl?.change_30d_pct || null,
    defi_audit_status: proto.security?.audit_status || "UNKNOWN",
    defi_audit_links: proto.security?.audit_links || [],
    defi_hack_known: proto.security?.hack_known || false,
    defi_hack_count: proto.security?.hack_count || 0,
    defi_hack_total_usd: proto.security?.hack_total_usd || 0,
    defi_flags: {
      tvl_collapse: proto.flags?.tvl_collapse || false,
      liquidity_trap: proto.flags?.liquidity_trap || false,
      whale_concentration: proto.flags?.whale_concentration || false,
    },
    defi_score: proto.scores?.total || null,
    defi_bucket: proto.bucket || null,
    defi_links: proto.links || null,
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
  
  // Unlock transparency: now uses dilution proxy when no direct unlock data
  // A coin is considered "transparent" if:
  // 1. It has direct unlock data (unlock_confidence !== "UNKNOWN"), OR
  // 2. We can estimate dilution risk from supply data (circulating vs total)
  const hasUnlockData = coin.unlock_confidence !== "UNKNOWN";
  const hasDilutionData = coin.float_percent !== null || 
    (coin.circulating_supply !== null && 
     (coin.total_supply !== null || coin.max_supply !== null));
  const unlockTransparency = hasUnlockData || hasDilutionData;
  
  const traction = coin.traction_status === "OK";

  // Ownership concentration gate:
  // - HIGH fails
  // - UNKNOWN does not count as a pass (so coins don't look "clean" just because data is missing)
  const concentrationRisk =
    coin.holder_concentration_level === "LOW" ||
    coin.holder_concentration_level === "MEDIUM";
  const entryTiming = coin.entry_signal !== "overbought";
  const newsFlow = !(
    coin.news_signal === "hot" && coin.news_sentiment === "bearish"
  );

  return {
    trackable_data: trackableData,
    liquidity,
    unlock_transparency: unlockTransparency,
    traction,
    concentration_risk: concentrationRisk,
    entry_timing: entryTiming,
    news_flow: newsFlow,
  };
}

function decideLabel(coin, gates, ruleConfidence = {}) {
  // Score based on core gates; timing/news can still downgrade a KEEP.
  const score =
    (gates.trackable_data ? 1 : 0) +
    (gates.liquidity ? 1 : 0) +
    (gates.unlock_transparency ? 1 : 0) +
    (gates.traction ? 1 : 0) +
    (gates.concentration_risk ? 1 : 0);

  let label = "WATCH-ONLY";
  const severeLiquidity = coin.volume_24h !== null && coin.volume_24h < VOLUME_DROP;

  const concentrationConfidence =
    ruleConfidence?.high_concentration_risk || "low";
  const dilutionConfidence = ruleConfidence?.high_dilution_risk || "low";
  const enforceConcentrationRisk = concentrationConfidence !== "low";
  const enforceDilutionRisk = dilutionConfidence !== "low";

  const severeConcentrationRisk = coin.holder_concentration_level === "HIGH";
  const unknownConcentration = coin.holder_concentration_level === "UNKNOWN";
  
  // Severe dilution risk (< 20% float or mcap < 20% of FDV)
  const severeDilutionRisk = coin.high_dilution_risk === true;
  const effectiveConcentrationRisk =
    severeConcentrationRisk && enforceConcentrationRisk;
  const effectiveDilutionRisk = severeDilutionRisk && enforceDilutionRisk;

  if (!gates.trackable_data || severeLiquidity) {
    label = "DROP";
  } else if (score >= 3 && !effectiveConcentrationRisk && !effectiveDilutionRisk) {
    // KEEP: passes at least 3 of 5 gates + no severe risks
    label = "KEEP";
  }

  // Downgrade KEEP if chasing (already pumped without catalyst)
  if (label === "KEEP" && coin.chasing === true && !coin.has_clean_catalyst) {
    label = "WATCH-ONLY";
  }

  // Missing concentration data -> not actionable for KEEP (but better than blocking everything)
  // Only downgrade if we have NO holder data at all
  if (label === "KEEP" && unknownConcentration) {
    // Still allow KEEP if we have other positive signals (catalyst + traction)
    if (!coin.has_clean_catalyst || coin.traction_status !== "OK") {
      label = "WATCH-ONLY";
    }
  }

  // High concentration risk always downgrades
  if (label === "KEEP" && effectiveConcentrationRisk) {
    label = "WATCH-ONLY";
  }
  if (label === "KEEP" && effectiveDilutionRisk) {
    label = "WATCH-ONLY";
  }
  if (label === "KEEP" && !gates.entry_timing) {
    label = "WATCH-ONLY";
  }
  if (label === "KEEP" && !gates.news_flow) {
    label = "WATCH-ONLY";
  }

  return label;
}

function marketPhaseBasePositionPct(phase) {
  switch (phase) {
    case "accumulation":
      return 0.1;
    case "caution":
      return 0.03;
    case "run":
    case "neutral":
    default:
      return 0.07;
  }
}

function buildPortfolioGuidance(marketPhase) {
  const basePct = marketPhaseBasePositionPct(marketPhase);
  const keepCap = roundUsd(PORTFOLIO_SIZE * basePct);
  const watchCap = roundUsd(PORTFOLIO_SIZE * basePct * 0.5);

  const notes = [];
  if (marketPhase === "accumulation") {
    notes.push("Market looks like an accumulation phase; buying in steps can make sense.");
  } else if (marketPhase === "run") {
    notes.push("Market looks like a run; consider smaller, quicker trades and avoid chasing.");
  } else if (marketPhase === "caution") {
    notes.push("Market looks overheated; consider smaller size and wait for pullbacks.");
  }
  if (PORTFOLIO_SIZE <= 10_000) {
    notes.push("Liquidity checks are scaled for a smaller portfolio size.");
  }

  return {
    portfolio_size_usd: PORTFOLIO_SIZE,
    market_phase: marketPhase,
    base_position_pct: basePct,
    suggested_max_buy_keep_usd: keepCap,
    suggested_max_buy_watch_usd: watchCap,
    volume_low_threshold_usd: VOLUME_LOW,
    volume_drop_threshold_usd: VOLUME_DROP,
    notes,
  };
}

function computeSuggestedMaxBuyUsd({ coin, marketPhase }) {
  const label = coin?.hygiene_label || "UNKNOWN";
  if (label === "DROP") return null;

  const basePct = marketPhaseBasePositionPct(marketPhase);
  const labelPct = label === "KEEP" ? 1 : 0.5; // WATCH-ONLY = smaller size

  let riskMultiplier = 1;
  if (coin?.low_liquidity) riskMultiplier *= 0.5;
  if (coin?.high_slippage_risk) riskMultiplier *= 0.7;
  if (coin?.chasing) riskMultiplier *= 0.5;
  if (coin?.holder_concentration_level === "HIGH") riskMultiplier *= 0.5;
  if (coin?.high_dilution_risk) riskMultiplier *= 0.5;
  if (coin?.unlock_risk_flag) riskMultiplier *= 0.7;
  if (coin?.github_archived) riskMultiplier *= 0.4;
  if (coin?.defi_hack_count > 0) riskMultiplier *= 0.7;
  if (coin?.defi_audit_status === "NO") riskMultiplier *= 0.85;
  if (!coin?.gates?.news_flow) riskMultiplier *= 0.7;
  if (!coin?.gates?.entry_timing) riskMultiplier *= 0.7;

  riskMultiplier = clamp(riskMultiplier, 0.1, 1);

  const portfolioCapRaw = PORTFOLIO_SIZE * basePct * labelPct * riskMultiplier;
  const portfolioCap = roundUsd(portfolioCapRaw);

  const volume24h = num(coin?.volume_24h);
  const volumeCapRaw =
    volume24h !== null && volume24h > 0 ? volume24h * 0.001 : null; // ~0.1% of daily volume
  const volumeCap = volumeCapRaw !== null ? roundUsd(volumeCapRaw) : null;

  const suggested =
    volumeCap !== null ? Math.min(portfolioCap ?? portfolioCapRaw, volumeCap) : portfolioCap;

  const maxBuy = roundUsd(suggested ?? portfolioCapRaw);
  if (!Number.isFinite(maxBuy) || maxBuy <= 0) return null;

  return {
    suggested_max_buy_usd: maxBuy,
    inputs: {
      portfolio_size_usd: PORTFOLIO_SIZE,
      base_pct: basePct,
      label_pct: labelPct,
      risk_multiplier: Math.round(riskMultiplier * 100) / 100,
      portfolio_cap_usd: portfolioCap,
      volume_cap_usd: volumeCap,
    },
  };
}

function explainGateFailure(key, coin) {
  switch (key) {
    case "trackable_data":
      return "Some basic price/volume data is missing.";
    case "liquidity": {
      const vol = num(coin?.volume_24h);
      const volText = vol !== null ? formatUsdCompact(vol) : "n/a";
      return `Trading activity looks too low for your portfolio (24h volume ${volText}; target at least ${formatUsdCompact(VOLUME_LOW)}).`;
    }
    case "unlock_transparency":
      return coin?.unlock_confidence === "UNKNOWN"
        ? "Token unlock / vesting info is missing, so dilution risk is hard to judge."
        : "Unlock / supply info looks incomplete.";
    case "traction":
      return coin?.missing_traction
        ? "Traction data is missing or incomplete."
        : "Traction signals look weak right now.";
    case "concentration_risk":
      return coin?.holder_concentration_level === "HIGH"
        ? "Ownership looks very concentrated (a few holders control a lot)."
        : "Holder data is missing, so ownership risk is unknown.";
    case "entry_timing":
      return "Entry timing looks overheated right now (could pull back).";
    case "news_flow":
      return "News is hot and negative right now (worth double-checking).";
    default:
      return String(key || "unknown").replace(/_/g, " ");
  }
}

function buildCoinChecklist(coin) {
  const gates = coin?.gates || {};
  const items = [];

  const add = (label, passed, note) => {
    items.push({
      label,
      status: passed ? "pass" : "fail",
      note: note || null,
    });
  };

  add(
    "Market data present",
    Boolean(gates.trackable_data),
    gates.trackable_data
      ? null
      : "Missing price/volume fields needed for scoring."
  );

  const vol = num(coin?.volume_24h);
  add(
    "Trading activity",
    Boolean(gates.liquidity),
    vol !== null
      ? `24h volume ${formatUsdCompact(vol)} (target >= ${formatUsdCompact(VOLUME_LOW)})`
      : "24h volume missing"
  );

  const unlockConf = coin?.unlock_confidence || "UNKNOWN";
  add(
    "Supply/unlocks clear enough",
    Boolean(gates.unlock_transparency),
    unlockConf !== "UNKNOWN" ? `Unlock data: ${unlockConf}` : "Unlock data: unknown"
  );

  add(
    "Traction looks okay",
    Boolean(gates.traction),
    coin?.traction_status ? `Traction: ${coin.traction_status}` : "Traction status missing"
  );

  const top10 = num(coin?.top_10_holder_percent);
  const top10Text = top10 !== null ? `${top10.toFixed(1)}%` : "n/a";
  add(
    "Ownership not overly concentrated",
    Boolean(gates.concentration_risk),
    `Top 10 holders: ${top10Text} (level: ${coin?.holder_concentration_level || "UNKNOWN"})`
  );

  add(
    "Entry timing looks reasonable",
    Boolean(gates.entry_timing),
    coin?.entry_signal ? `Entry: ${coin.entry_signal.replace(/_/g, " ")}` : "Entry signal missing"
  );

  const activity = coin?.news_activity || "quiet";
  const sentiment = coin?.news_sentiment || "unknown";
  add(
    "News tone not strongly negative",
    Boolean(gates.news_flow),
    `News: ${activity}${sentiment && sentiment !== "unknown" ? ` (${sentiment})` : ""}`
  );

  return items;
}

function buildCoinExplain({ coin, marketPhase, ruleEffectiveness }) {
  const label = coin?.hygiene_label || "UNKNOWN";
  const failures = Array.isArray(coin?.gates_failed) ? coin.gates_failed : [];

  const positives = [];
  if (coin?.has_clean_catalyst) positives.push("Recent catalyst/news found.");
  if (coin?.traction_status === "OK") positives.push("Traction signals look okay.");
  if (coin?.github_active) positives.push("Development looks active recently.");
  if (coin?.outperforming_btc) {
    const rs = num(coin?.relative_strength_7d);
    positives.push(rs !== null ? `Beating BTC by ${rs.toFixed(1)}% this week.` : "Beating BTC this week.");
  }
  if (!coin?.low_liquidity && num(coin?.volume_24h) !== null) positives.push("Easy to trade (healthy daily volume).");
  if (coin?.entry_signal === "strong_buy") positives.push("Entry timing looks very good right now.");
  else if (coin?.entry_signal === "buy") positives.push("Entry timing looks good right now.");
  if (coin?.news_sentiment === "bullish" && coin?.news_activity && coin.news_activity !== "quiet") {
    positives.push("News tone looks positive recently.");
  }

  const risks = [];
  if (coin?.unlock_risk_flag) risks.push("Unlock risk in the next 30 days can add selling pressure.");
  if (coin?.high_dilution_risk) risks.push("Supply could expand a lot (dilution risk).");
  if (coin?.holder_concentration_level === "HIGH") risks.push("A few holders control a large share of supply.");
  if (coin?.low_liquidity) risks.push("Low trading activity can make exits harder.");
  if (coin?.chasing) risks.push("Price has already run up; pullbacks can be sharp.");
  if (!coin?.gates?.news_flow) risks.push("Recent news looks negative; double-check headlines before buying.");
  if (coin?.github_archived) risks.push("Project code repo is archived (development may have stopped).");
  if (coin?.defi_hack_count > 0) risks.push("Protocol has a history of hacks/exploits.");
  if (coin?.defi_audit_status === "NO") risks.push("No audit found; smart contract risk is higher.");

  const why = [];
  if (label === "KEEP") {
    why.push("Verdict is Buy because it passes most of the safety checks.");
    for (const line of positives.slice(0, 2)) why.push(line);
    if (why.length < 3) {
      const missing = failures.map((f) => explainGateFailure(f, coin)).slice(0, 1);
      if (missing.length > 0) why.push(`One thing to watch: ${missing[0]}`);
    }
  } else if (label === "WATCH-ONLY") {
    why.push("Verdict is Watch because it has some positives, but not enough to buy confidently yet.");
    if (positives.length > 0) why.push(positives[0]);
    const mainIssue = failures.length > 0 ? explainGateFailure(failures[0], coin) : null;
    if (mainIssue) why.push(`Main issue: ${mainIssue}`);
  } else if (label === "DROP") {
    why.push("Verdict is Avoid because it fails key checks or has missing data.");
    const mainIssues = failures.slice(0, 2).map((f) => explainGateFailure(f, coin));
    for (const issue of mainIssues) why.push(issue);
    while (why.length < 3) {
      why.push("Revisit only if data improves and risks clear up.");
    }
  } else {
    why.push("Verdict is unknown because the scanner could not score it reliably.");
    const mainIssue = failures.length > 0 ? explainGateFailure(failures[0], coin) : null;
    if (mainIssue) why.push(mainIssue);
    why.push("Try re-running the scan later.");
  }

  const checklist = buildCoinChecklist(coin);

  const sizing = computeSuggestedMaxBuyUsd({ coin, marketPhase });

  const exchangePct = num(coin?.top_10_exchange_percent);
  const holderNote =
    exchangePct !== null && exchangePct > 0
      ? `Some top holders are labeled exchange wallets (${exchangePct.toFixed(1)}% of supply in the top 10). This is often lower \"whale\" risk because it can represent many users.`
      : null;

  const ownershipRule = ruleEffectiveness?.high_concentration_risk || null;
  const dilutionRule = ruleEffectiveness?.high_dilution_risk || null;

  return {
    why: why.slice(0, 3),
    risks: risks.slice(0, 2),
    checklist,
    headline: Array.isArray(coin?.news_headlines) && coin.news_headlines.length > 0 ? coin.news_headlines[0]?.title || null : null,
    news: {
      source: coin?.news_source || null,
      fetched_at: coin?.news_fetched_at || null,
    },
    holder_note: holderNote,
    sizing,
    confidence: {
      ownership_rule: ownershipRule
        ? {
            confidence: ownershipRule.confidence || null,
            sample_min: ownershipRule.sample_min ?? null,
            verdict: ownershipRule.verdict || null,
          }
        : null,
      dilution_rule: dilutionRule
        ? {
            confidence: dilutionRule.confidence || null,
            sample_min: dilutionRule.sample_min ?? null,
            verdict: dilutionRule.verdict || null,
          }
        : null,
    },
  };
}

function rankCoins(coins) {
  const candidates = coins.filter((coin) => coin.hygiene_label !== "DROP");
  const relativeStrengthTier = (value) => {
    if (!Number.isFinite(value)) return 0;
    if (value >= 20) return 2;
    if (value >= 10) return 1;
    if (value <= -10) return -1;
    return 0;
  };
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
    // 4. Stronger relative strength vs BTC
    const rsTierA = relativeStrengthTier(a.relative_strength_7d);
    const rsTierB = relativeStrengthTier(b.relative_strength_7d);
    if (rsTierA !== rsTierB) {
      return rsTierB - rsTierA;
    }
    // 5. Lower dilution risk
    const dilutionA = a.high_dilution_risk ? 1 : 0;
    const dilutionB = b.high_dilution_risk ? 1 : 0;
    if (dilutionA !== dilutionB) {
      return dilutionA - dilutionB;
    }
    // 6. Higher relative strength (actual value)
    const rs7dA = a.relative_strength_7d || -Infinity;
    const rs7dB = b.relative_strength_7d || -Infinity;
    if (rs7dA !== rs7dB) {
      return rs7dB - rs7dA;
    }
    // 7. Volume as final tiebreaker
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

// Fetch GitHub repo activity (last commit date, contributors)
async function fetchGitHubRepoActivity(owner, repo) {
  if (!owner || !repo) return null;
  const cachePath = path.join(CACHE_DIR, `github_activity_${owner}_${repo}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  try {
    // Fetch repo info (includes pushed_at = last push date)
    const repoData = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, {}, 1);
    if (!repoData) return null;
    
    // Fetch recent commits (just get the latest one)
    let lastCommitDate = null;
    let lastCommitMessage = null;
    try {
      const commits = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {}, 1);
      if (Array.isArray(commits) && commits.length > 0) {
        lastCommitDate = commits[0]?.commit?.committer?.date || commits[0]?.commit?.author?.date || null;
        lastCommitMessage = commits[0]?.commit?.message?.split('\n')[0]?.slice(0, 80) || null;
      }
    } catch {
      // Commits endpoint might fail for large repos, fall back to pushed_at
    }
    
    const result = {
      last_push: repoData.pushed_at || null,
      last_commit: lastCommitDate || repoData.pushed_at || null,
      last_commit_message: lastCommitMessage,
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      open_issues: repoData.open_issues_count || 0,
      default_branch: repoData.default_branch || "main",
      created_at: repoData.created_at || null,
      archived: repoData.archived || false,
      fetched_at: new Date().toISOString(),
    };
    
    writeCache(cachePath, result);
    return result;
  } catch (err) {
    return null;
  }
}

// Helper to calculate days since a date
function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = Date.parse(dateStr);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// NEWS SENTIMENT - CryptoPanic API
// ============================================================================

/**
 * Fetch news/updates for a coin
 * CryptoPanic free tier has 24h delay + no sentiment = not useful
 * Only use CryptoPanic if you have a paid API key ($199/mo)
 * Otherwise, use CoinGecko status updates (free, no delay)
 */
async function fetchNewsSentiment(symbol, coinGeckoId) {
  if (!symbol) return null;
  
  const cacheKey = `news_${symbol.toLowerCase()}`;
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  
  // Only use CryptoPanic if we have a paid API key (free tier is 24h delayed)
  if (CRYPTOPANIC_API_KEY) {
    try {
      const currencies = symbol.toUpperCase();
      const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&currencies=${currencies}&filter=important`;
      
      const data = await fetchJson(url, {}, 1);
      
      if (data && Array.isArray(data.results)) {
        const posts = data.results.slice(0, 20);
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        
        let news24h = 0;
        let news7d = 0;
        let bullish = 0;
        let bearish = 0;
        let neutral = 0;
        const headlines = [];
        
        for (const post of posts) {
          const publishedAt = Date.parse(post.published_at);
          if (publishedAt > oneDayAgo) news24h++;
          if (publishedAt > oneWeekAgo) news7d++;
          
          const votes = post.votes || {};
          if (votes.positive > votes.negative) bullish++;
          else if (votes.negative > votes.positive) bearish++;
          else neutral++;
          
          if (publishedAt > oneWeekAgo && headlines.length < 5) {
            headlines.push({
              title: post.title?.slice(0, 100) || "",
              url: post.url || "",
              source: post.source?.title || "",
              published: post.published_at,
              sentiment: votes.positive > votes.negative ? "bullish" : 
                         votes.negative > votes.positive ? "bearish" : "neutral",
            });
          }
        }
        
        const total = bullish + bearish + neutral;
        let overallSentiment = "neutral";
        let sentimentScore = 50;
        
        if (total > 0) {
          sentimentScore = Math.round(((bullish - bearish) / total + 1) * 50);
          if (bullish > bearish * 2) overallSentiment = "bullish";
          else if (bearish > bullish * 2) overallSentiment = "bearish";
        }
        
        let newsSignal = "quiet";
        if (news24h >= 5) newsSignal = "hot";
        else if (news24h >= 2) newsSignal = "active";
        else if (news7d >= 5) newsSignal = "moderate";
        
        const result = {
          source: "CryptoPanic",
          news_count_24h: news24h,
          news_count_7d: news7d,
          sentiment: overallSentiment,
          sentiment_score: sentimentScore,
          bullish_count: bullish,
          bearish_count: bearish,
          neutral_count: neutral,
          news_signal: newsSignal,
          headlines,
          fetched_at: new Date().toISOString(),
        };
        
        writeCache(cachePath, result);
        return result;
      }
    } catch (err) {
      // Fall through to CoinGecko
    }
  }
  
  // Default: Use CoinGecko (free, no delay, but limited info)
  return await fetchCoinGeckoNews(coinGeckoId);
}

/**
 * Fallback: Fetch status updates from CoinGecko
 */
async function fetchCoinGeckoNews(coinGeckoId) {
  if (!coinGeckoId) return null;
  
  const cachePath = path.join(CACHE_DIR, `cg_news_${coinGeckoId}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  
  try {
    const url = `${BASE_URL}/coins/${coinGeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const data = await fetchJson(url);
    
    const statusUpdates = data?.status_updates || [];
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const recentUpdates = statusUpdates.filter(u => {
      const created = Date.parse(u.created_at);
      return created > oneWeekAgo;
    });
    
    const result = {
      source: "CoinGecko",
      news_count_24h: 0, // CoinGecko doesn't have precise timing
      news_count_7d: recentUpdates.length,
      sentiment: "neutral",
      sentiment_score: 50,
      bullish_count: 0,
      bearish_count: 0,
      neutral_count: recentUpdates.length,
      news_signal: recentUpdates.length >= 3 ? "active" : "quiet",
      headlines: recentUpdates.slice(0, 5).map(u => ({
        title: u.description?.slice(0, 100) || "",
        url: u.url || "",
        source: "CoinGecko",
        published: u.created_at,
        sentiment: "neutral",
      })),
      fetched_at: new Date().toISOString(),
    };
    
    writeCache(cachePath, result);
    return result;
  } catch {
    return null;
  }
}

function evaluateNewsMomentum(newsSentiment) {
  const signal = newsSentiment?.news_signal || "quiet";
  const sentiment = newsSentiment?.sentiment || "neutral";
  const count24h = num(newsSentiment?.news_count_24h);
  const count7d = num(newsSentiment?.news_count_7d);

  let activityLabel = "quiet";
  let score = 0;

  if (signal === "hot" || (count24h !== null && count24h >= 5)) {
    activityLabel = "very active";
    score += 15;
  } else if (signal === "active" || (count24h !== null && count24h >= 2)) {
    activityLabel = "active";
    score += 10;
  } else if (signal === "moderate" || (count7d !== null && count7d >= 3)) {
    activityLabel = "some";
    score += 5;
  }

  if (sentiment === "bullish") {
    score += 5;
  } else if (sentiment === "bearish") {
    score -= 10;
  }

  const viral24h = count24h !== null && count24h >= 5;
  const viral7d = count7d !== null && count7d >= 8;
  const isViral = signal === "hot" || viral24h || viral7d;

  return {
    activity_label: activityLabel,
    momentum_score: score,
    is_viral: isViral,
  };
}

function addUniqueWarning(list, warning) {
  if (!warning) return;
  if (!Array.isArray(list)) return;
  if (list.includes(warning)) return;
  list.push(warning);
}

function detectNegativeHeadline(headlines) {
  const items = Array.isArray(headlines) ? headlines : [];
  const keywords = [
    "hack",
    "exploit",
    "lawsuit",
    "investigation",
    "ban",
    "delist",
    "outage",
    "downtime",
    "vulnerability",
    "bug",
    "breach",
    "scam",
    "fraud",
    "liquidation",
    "halt",
  ];
  for (const item of items) {
    const title = String(item?.title || "").toLowerCase();
    if (!title) continue;
    for (const kw of keywords) {
      if (title.includes(kw)) return kw;
    }
  }
  return null;
}

async function enrichBlueChipOpportunitiesWithNews(blueChipData, maxCoins = 5) {
  if (!blueChipData || !Array.isArray(blueChipData.opportunities)) return;
  const top = blueChipData.opportunities.slice(0, Math.max(0, maxCoins));
  if (top.length === 0) return;

  await Promise.all(
    top.map(async (opp) => {
      const symbol = opp?.symbol;
      const coinId = opp?.coin_gecko_id;
      if (!symbol || !coinId) return;

      let news = null;
      try {
        news = await fetchNewsSentiment(symbol, coinId);
      } catch {
        news = null;
      }
      if (!news) return;

      const summary = evaluateNewsMomentum(news);
      opp.news_source = news.source || null;
      opp.news_signal = news.news_signal || "quiet";
      opp.news_sentiment = news.sentiment || "neutral";
      opp.news_activity = summary.activity_label;

      const headline = Array.isArray(news.headlines)
        ? news.headlines.find((h) => h && h.title)
        : null;
      opp.news_headline = headline?.title || null;

      const warnings = Array.isArray(opp.risk_warnings) ? opp.risk_warnings : [];
      if (!Array.isArray(opp.risk_warnings)) {
        opp.risk_warnings = warnings;
      }

      if (opp.news_sentiment === "bearish" && summary.activity_label !== "quiet") {
        addUniqueWarning(warnings, "news looks negative");
        return;
      }

      const negKeyword = detectNegativeHeadline(news.headlines);
      if (negKeyword) {
        addUniqueWarning(warnings, `headline mentions ${negKeyword}`);
      }
    })
  );
}

// ============================================================================
// MACRO PULSE (ETF FLOWS + LEVERAGE)
// ============================================================================

function parseEtfFlowValue(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "n/a") {
    return null;
  }
  const numeric = cleaned.replace(/[$,]/g, "");
  if (numeric.startsWith("(") && numeric.endsWith(")")) {
    const inner = numeric.slice(1, -1);
    const parsed = Number(inner);
    return Number.isFinite(parsed) ? -parsed : null;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFarsideDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

function parseFarsideFlows(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const rows = lines.filter((line) => line.trim().startsWith("|"));
  if (rows.length === 0) return null;

  let tickers = null;
  let totalIndex = null;
  const parsedRows = [];
  for (const row of rows) {
    const cols = row
      .split("|")
      .slice(1, -1)
      .map((col) => col.trim());
    if (!tickers) {
      if (cols.includes("Total")) {
        totalIndex = cols.indexOf("Total");
      }
      if (cols.includes("IBIT") && cols.includes("FBTC")) {
        tickers = cols;
        if (!tickers.includes("Total")) {
          if (Number.isFinite(totalIndex) && totalIndex >= 0) {
            tickers[totalIndex] = "Total";
          } else if (tickers.length > 0) {
            tickers[tickers.length - 1] = "Total";
          }
        }
        continue;
      }
      continue;
    }

    const dateIso = parseFarsideDate(cols[0]);
    if (!dateIso) continue;

    const flows = {};
    let total = null;
    for (let i = 1; i < cols.length; i += 1) {
      const label = tickers[i] || "";
      if (!label) continue;
      const value = parseEtfFlowValue(cols[i]);
      if (label === "Total") {
        total = value;
        continue;
      }
      flows[label] = value;
    }
    if (total === null) {
      total = Object.values(flows)
        .map((v) => (Number.isFinite(v) ? v : 0))
        .reduce((sum, v) => sum + v, 0);
    }

    parsedRows.push({
      date: dateIso,
      total_musd: total,
      flows_musd: flows,
    });
  }

  if (parsedRows.length === 0) return null;

  parsedRows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    source: "Farside Investors (via Jina AI proxy)",
    unit: "USD_millions",
    rows: parsedRows,
  };
}

async function fetchEtfFlows() {
  const cached = readCache(ETF_FLOW_CACHE_PATH);
  if (cached) return cached;
  const raw = await fetchText(ETF_FLOW_PROXY_URL);
  const parsed = parseFarsideFlows(raw);
  if (!parsed) {
    throw new Error("ETF flow parse failed.");
  }
  writeCache(ETF_FLOW_CACHE_PATH, parsed);
  return parsed;
}

function summarizeEtfFlows(flowData) {
  if (!flowData || !Array.isArray(flowData.rows) || flowData.rows.length === 0) {
    return { error: "ETF flows unavailable." };
  }
  const rows = flowData.rows;
  const lastRows = rows.slice(-5);
  const latest = lastRows[lastRows.length - 1];
  const todayTotal = latest?.total_musd ?? null;
  const fiveDayTotal = lastRows
    .map((r) => (Number.isFinite(r.total_musd) ? r.total_musd : 0))
    .reduce((sum, v) => sum + v, 0);

  const drivers = Object.entries(latest.flows_musd || {})
    .filter(([, v]) => Number.isFinite(v) && v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([ticker, value]) => ({ ticker, flow_musd: value }));

  let momentum = "mixed";
  if (todayTotal > 0 && fiveDayTotal > 0) {
    momentum = "turning positive";
  } else if (todayTotal < 0 && fiveDayTotal < 0) {
    momentum = "still net selling";
  } else if (
    Math.abs(todayTotal || 0) < 100 &&
    Math.abs(fiveDayTotal || 0) < 200
  ) {
    momentum = "quiet";
  }

  let devilNote =
    "Flows can flip quickly day to day; treat today as a hint, not a guarantee.";
  if (todayTotal >= 300) {
    devilNote =
      "Big inflow today, but it is just one session. Watch for follow-through before getting too bullish.";
  } else if (todayTotal <= -300) {
    devilNote =
      "Big outflow today, but one red day does not confirm a trend. It could be profit-taking or rotation.";
  } else if (Math.abs(todayTotal || 0) < 75) {
    devilNote = "Flows are small today; this is more noise than signal.";
  }

  return {
    source: flowData.source,
    unit: flowData.unit,
    latest_date: latest.date,
    today_total_musd: todayTotal,
    five_day_total_musd: fiveDayTotal,
    momentum_label: momentum,
    devil_note: devilNote,
    top_drivers: drivers,
    last_rows: lastRows,
  };
}

function classifyFundingRate(rate) {
  if (!Number.isFinite(rate)) return "unknown";
  const abs = Math.abs(rate);
  if (abs < 0.00005) return "neutral";
  if (rate > 0) return abs >= 0.0002 ? "longs stronger" : "mild long bias";
  return abs >= 0.0002 ? "shorts stronger" : "mild short bias";
}

function classifyOpenInterest(changePct) {
  if (!Number.isFinite(changePct)) return "unknown";
  if (changePct >= 5) return "rising fast";
  if (changePct >= 2) return "rising";
  if (changePct <= -5) return "dropping fast";
  if (changePct <= -2) return "dropping";
  return "steady";
}

function loadGlobalMarketHistory() {
  const history = readJsonFile(GLOBAL_MARKET_HISTORY_PATH, []);
  return Array.isArray(history) ? history : [];
}

function recordGlobalMarketHistory(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.btc_dominance_pct)) return;
  const history = loadGlobalMarketHistory();
  const ts = Date.parse(snapshot.fetched_at || new Date().toISOString());
  if (!Number.isFinite(ts)) return;

  const last = history[history.length - 1];
  const lastTs = last ? Date.parse(last.timestamp) : null;
  if (Number.isFinite(lastTs) && Math.abs(ts - lastTs) < 3 * 60 * 60 * 1000) {
    return;
  }

  history.push({
    timestamp: new Date(ts).toISOString(),
    btc_dominance_pct: snapshot.btc_dominance_pct,
  });

  const maxEntries = 60;
  if (history.length > maxEntries) {
    history.splice(0, history.length - maxEntries);
  }
  writeJsonFile(GLOBAL_MARKET_HISTORY_PATH, history);
}

function findDominanceChange(history, latestPct) {
  if (!Number.isFinite(latestPct) || !Array.isArray(history)) return null;
  const targetMs = Date.now() - 24 * 60 * 60 * 1000;
  let best = null;
  let bestDiff = Infinity;

  for (const entry of history) {
    const ts = Date.parse(entry?.timestamp);
    const pct = num(entry?.btc_dominance_pct);
    if (!Number.isFinite(ts) || pct === null) continue;
    const diff = Math.abs(ts - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }

  if (!best || bestDiff > 8 * 60 * 60 * 1000) {
    return null;
  }
  return latestPct - best.btc_dominance_pct;
}

function classifyShareTrend(changePct) {
  if (!Number.isFinite(changePct)) return "steady";
  if (changePct >= 0.2) return "rising";
  if (changePct <= -0.2) return "falling";
  return "steady";
}

async function fetchGlobalMarketSnapshot() {
  const cached = readCache(GLOBAL_MARKET_CACHE_PATH);
  if (cached) return cached;

  const data = await fetchJson(`${BASE_URL}/global`, {}, 1);
  const snapshot = {
    fetched_at: new Date().toISOString(),
    btc_dominance_pct: num(data?.data?.market_cap_percentage?.btc),
    total_market_cap_usd: num(data?.data?.total_market_cap?.usd),
  };
  writeCache(GLOBAL_MARKET_CACHE_PATH, snapshot);
  recordGlobalMarketHistory(snapshot);
  return snapshot;
}

async function fetchAltMarketSnapshot(ids) {
  const cached = readCache(ALT_MARKET_CACHE_PATH);
  if (cached) return cached;

  const idList = Array.isArray(ids) ? ids : [];
  if (idList.length === 0) return { fetched_at: new Date().toISOString(), data: {} };

  const url =
    `${BASE_URL}/simple/price?ids=${idList.join(",")}` +
    `&vs_currencies=${VS_CURRENCY}&include_24hr_change=true`;
  const data = await fetchJson(url, {}, 1);
  const snapshot = {
    fetched_at: new Date().toISOString(),
    data: data || {},
  };
  writeCache(ALT_MARKET_CACHE_PATH, snapshot);
  return snapshot;
}

function classifyAltVsBtc(altChange, btcChange) {
  if (!Number.isFinite(altChange) || !Number.isFinite(btcChange)) return "unknown";
  const diff = altChange - btcChange;
  if (diff >= 2) return "stronger than BTC";
  if (diff <= -2) return "weaker than BTC";
  return "about the same";
}

function summarizeAltStrength(snapshot, btcChange) {
  const items = ALT_PULSE_COINS.map((coin) => {
    const change = num(snapshot?.data?.[coin.id]?.usd_24h_change);
    const label = classifyAltVsBtc(change, btcChange);
    return {
      id: coin.id,
      symbol: coin.symbol,
      change_24h: change,
      vs_btc_label: label,
    };
  });

  const groups = {
    stronger: [],
    weaker: [],
    inline: [],
    unknown: [],
  };
  for (const item of items) {
    if (item.vs_btc_label === "stronger than BTC") groups.stronger.push(item.symbol);
    else if (item.vs_btc_label === "weaker than BTC") groups.weaker.push(item.symbol);
    else if (item.vs_btc_label === "about the same") groups.inline.push(item.symbol);
    else groups.unknown.push(item.symbol);
  }

  return { items, groups };
}

function normalizeNewsTone(sentiment) {
  if (sentiment === "bullish") return "positive";
  if (sentiment === "bearish") return "negative";
  return "neutral";
}

function summarizeAltNews(newsEntries) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const items = [];

  for (const entry of newsEntries) {
    const symbol = entry?.symbol;
    const sentiment = entry?.sentiment;
    const headlines = Array.isArray(entry?.headlines) ? entry.headlines : [];
    const headline = headlines.find((h) => h && h.title) || null;
    if (!headline) continue;
    const publishedMs = Date.parse(headline.published || "");
    if (Number.isFinite(publishedMs) && publishedMs < sevenDaysAgo) continue;

    const windowLabel =
      Number.isFinite(publishedMs) && publishedMs >= now - 24 * 60 * 60 * 1000
        ? "today"
        : "this week";

    items.push({
      symbol,
      tone: normalizeNewsTone(headline.sentiment || sentiment),
      title: headline.title,
      source: headline.source || "",
      published_at: Number.isFinite(publishedMs)
        ? new Date(publishedMs).toISOString()
        : null,
      window: windowLabel,
    });
  }

  items.sort((a, b) => {
    const at = a.published_at ? Date.parse(a.published_at) : 0;
    const bt = b.published_at ? Date.parse(b.published_at) : 0;
    return bt - at;
  });

  return items.slice(0, 3);
}

function summarizeBtcShare(globalSnapshot) {
  if (!globalSnapshot || !Number.isFinite(globalSnapshot.btc_dominance_pct)) {
    return { error: "BTC share unavailable." };
  }

  const history = loadGlobalMarketHistory();
  const change24h = findDominanceChange(history, globalSnapshot.btc_dominance_pct);
  return {
    pct: globalSnapshot.btc_dominance_pct,
    change_24h: change24h,
    trend_label: classifyShareTrend(change24h),
  };
}

function deriveMacroMood({ etfSummary, leverage, altStrength }) {
  const today = num(etfSummary?.today_total_musd);
  const fiveDay = num(etfSummary?.five_day_total_musd);
  const flowBias =
    today !== null && fiveDay !== null
      ? today > 0 && fiveDay > 0
        ? "positive"
        : today < 0 && fiveDay < 0
          ? "negative"
          : "mixed"
      : "mixed";

  const funding = num(leverage?.funding_rate_pct);
  const fundingTone =
    funding === null
      ? null
      : funding > 0.05
        ? "high"
        : funding < -0.05
          ? "negative"
          : "calm";

  const stronger = altStrength?.groups?.stronger?.length || 0;
  const weaker = altStrength?.groups?.weaker?.length || 0;

  let label = "Mixed";
  if (flowBias === "positive" && stronger >= weaker + 1 && fundingTone !== "high") {
    label = "Bullish tilt";
  } else if (flowBias === "negative" && (weaker >= stronger + 1 || fundingTone === "negative")) {
    label = "Cautious";
  }

  const reasons = [];
  if (flowBias === "positive") reasons.push("ETF money flow is positive");
  if (flowBias === "negative") reasons.push("ETF money flow is negative");
  if (fundingTone === "high") reasons.push("funding cost looks crowded");
  if (fundingTone === "negative") reasons.push("funding cost leans short");
  if (stronger >= weaker + 2) reasons.push("more alts are beating BTC");
  if (weaker >= stronger + 2) reasons.push("more alts are lagging BTC");

  return {
    label,
    reason: reasons.slice(0, 2).join("; "),
  };
}

async function fetchLeverageSnapshot() {
  const cached = readCache(LEVERAGE_CACHE_PATH);
  if (cached) return cached;

  const fundingUrl =
    "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
  const oiUrl =
    "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=2";

  const [funding, oiHist] = await Promise.all([
    fetchJson(fundingUrl, {}, 1),
    fetchJson(oiUrl, {}, 1),
  ]);

  const fundingRate = Number(funding?.lastFundingRate);
  const fundingLabel = classifyFundingRate(fundingRate);

  let openInterestUsd = null;
  let openInterestChangePct = null;
  if (Array.isArray(oiHist) && oiHist.length > 0) {
    const sorted = [...oiHist].sort(
      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );
    const latest = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    openInterestUsd = Number(latest?.sumOpenInterestValue);
    if (previous && Number(previous?.sumOpenInterestValue) > 0) {
      openInterestChangePct =
        ((openInterestUsd - Number(previous.sumOpenInterestValue)) /
          Number(previous.sumOpenInterestValue)) *
        100;
    }
  }

  const leverage = {
    source: "Binance BTCUSDT perp",
    funding_rate: Number.isFinite(fundingRate) ? fundingRate : null,
    funding_rate_pct: Number.isFinite(fundingRate) ? fundingRate * 100 : null,
    funding_label: fundingLabel,
    open_interest_usd: Number.isFinite(openInterestUsd) ? openInterestUsd : null,
    open_interest_change_pct: Number.isFinite(openInterestChangePct)
      ? openInterestChangePct
      : null,
    open_interest_label: classifyOpenInterest(openInterestChangePct),
    as_of: new Date().toISOString(),
  };

  writeCache(LEVERAGE_CACHE_PATH, leverage);
  return leverage;
}

async function buildMacroPulse({ btcData } = {}) {
  let etfSummary = null;
  let leverage = null;
  let btcShare = null;
  let altStrength = null;
  let altNews = [];
  let mood = null;
  try {
    const flows = await fetchEtfFlows();
    etfSummary = summarizeEtfFlows(flows);
  } catch (err) {
    etfSummary = { error: err.message || "ETF flow fetch failed." };
  }

  try {
    leverage = await fetchLeverageSnapshot();
  } catch (err) {
    leverage = { error: err.message || "Leverage fetch failed." };
  }

  const btcPrice = num(btcData?.current_price);
  const btcChange24h = num(btcData?.price_change_percentage_24h_in_currency);

  try {
    const globalSnapshot = await fetchGlobalMarketSnapshot();
    recordGlobalMarketHistory(globalSnapshot);
    btcShare = summarizeBtcShare(globalSnapshot);
  } catch (err) {
    btcShare = { error: err.message || "BTC share fetch failed." };
  }

  try {
    const altSnapshot = await fetchAltMarketSnapshot(ALT_PULSE_IDS);
    altStrength = summarizeAltStrength(altSnapshot, btcChange24h);
  } catch (err) {
    altStrength = { error: err.message || "Alt strength fetch failed." };
  }

  try {
    const newsEntries = await Promise.all(
      ALT_PULSE_COINS.map(async (coin) => {
        const sentiment = await fetchNewsSentiment(coin.symbol, coin.id);
        return {
          symbol: coin.symbol,
          sentiment: sentiment?.sentiment || "neutral",
          headlines: sentiment?.headlines || [],
        };
      })
    );
    altNews = summarizeAltNews(newsEntries);
  } catch (err) {
    altNews = [];
  }

  mood = deriveMacroMood({ etfSummary, leverage, altStrength });

  return {
    generated_at: new Date().toISOString(),
    btc_price: btcPrice,
    btc_change_24h: btcChange24h,
    etf_flows: etfSummary,
    leverage,
    btc_share: btcShare,
    alt_strength: altStrength,
    alt_news: altNews,
    mood,
  };
}

function formatUsdMillions(value) {
  if (!Number.isFinite(value)) return "n/a";
  return formatUsdCompact(Math.abs(value) * 1_000_000);
}

function formatSignedUsdMillions(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsdMillions(value)}`;
}

function renderMacroPulseMarkdown(macroPulse) {
  if (!macroPulse) return "# Market Pulse\n\nNo data.\n";
  const lines = [];
  lines.push("# Market Pulse");
  lines.push("");
  lines.push(`Generated: ${macroPulse.generated_at}`);
  lines.push("");

  if (Number.isFinite(macroPulse.btc_price)) {
    const price = formatUsd(macroPulse.btc_price);
    const change = formatSignedPct(macroPulse.btc_change_24h, 2);
    lines.push(`BTC price: ${price} (${change} 24h)`);
    lines.push("");
  }

  const etf = macroPulse.etf_flows || {};
  lines.push("## ETF money flow (spot BTC)");
  if (etf.error) {
    lines.push(`- ${etf.error}`);
  } else {
    lines.push(`- Today: ${formatSignedUsdMillions(etf.today_total_musd)}`);
    lines.push(
      `- Last 5 days: ${formatSignedUsdMillions(etf.five_day_total_musd)}`
    );
    lines.push(`- Momentum: ${etf.momentum_label || "mixed"}`);
    if (Array.isArray(etf.top_drivers) && etf.top_drivers.length > 0) {
      const drivers = etf.top_drivers
        .map((d) => `${d.ticker} ${formatSignedUsdMillions(d.flow_musd)}`)
        .join(", ");
      lines.push(`- Biggest movers: ${drivers}`);
    }
    if (etf.devil_note) {
      lines.push(`- Note: ${etf.devil_note}`);
    }
  }
  lines.push("");

  const lev = macroPulse.leverage || {};
  lines.push("## Leverage check (BTC futures)");
  if (lev.error) {
    lines.push(`- ${lev.error}`);
  } else {
    const fundingPct = Number.isFinite(lev.funding_rate_pct)
      ? `${lev.funding_rate_pct.toFixed(3)}%`
      : "n/a";
    const oiChange = Number.isFinite(lev.open_interest_change_pct)
      ? `${lev.open_interest_change_pct.toFixed(2)}%`
      : "n/a";
    lines.push(
      `- Funding cost: ${fundingPct} (${lev.funding_label || "unknown"})`
    );
    lines.push(
      `- Open positions: ${formatUsd(lev.open_interest_usd)} (${lev.open_interest_label || "unknown"}, ${oiChange})`
    );
  }
  lines.push("");

  const share = macroPulse.btc_share || {};
  lines.push("## BTC market share");
  if (share.error) {
    lines.push(`- ${share.error}`);
  } else {
    const sharePct = Number.isFinite(share.pct)
      ? formatPct(share.pct, 1)
      : "n/a";
    const shareChange = Number.isFinite(share.change_24h)
      ? formatSignedPct(share.change_24h, 1)
      : "n/a";
    const shareTrend = share.trend_label || "steady";
    const changeNote =
      shareChange !== "n/a" ? `${shareTrend}, ${shareChange} in 24h` : shareTrend;
    lines.push(`- BTC share: ${sharePct} (${changeNote})`);
  }
  lines.push("");

  const strength = macroPulse.alt_strength || {};
  lines.push("## Alt strength vs BTC");
  if (strength.error) {
    lines.push(`- ${strength.error}`);
  } else {
    const stronger = strength.groups?.stronger || [];
    const weaker = strength.groups?.weaker || [];
    const inline = strength.groups?.inline || [];
    const unknown = strength.groups?.unknown || [];
    if (stronger.length) lines.push(`- Stronger than BTC: ${stronger.join(", ")}`);
    if (weaker.length) lines.push(`- Weaker than BTC: ${weaker.join(", ")}`);
    if (inline.length) lines.push(`- About the same: ${inline.join(", ")}`);
    if (!stronger.length && !weaker.length && !inline.length && unknown.length) {
      lines.push("- Alt strength: n/a");
    }
  }
  lines.push("");

  const altNews = Array.isArray(macroPulse.alt_news) ? macroPulse.alt_news : [];
  lines.push("## Altcoin news");
  if (altNews.length === 0) {
    lines.push("- No major altcoin headlines today.");
  } else {
    for (const item of altNews.slice(0, 3)) {
      const tone = item?.tone || "neutral";
      const windowLabel = item?.window || "recent";
      const title = item?.title || "";
      const symbol = item?.symbol || "n/a";
      lines.push(`- ${symbol} (${tone}, ${windowLabel}): ${title}`);
    }
  }
  lines.push("");

  const mood = macroPulse.mood || {};
  lines.push("## Market mood");
  if (mood.label) {
    lines.push(`- ${mood.label}${mood.reason ? `: ${mood.reason}` : ""}`);
  } else {
    lines.push("- Mixed signals.");
  }
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// TAKE-PROFIT TRACKING
// ============================================================================

/**
 * Load portfolio positions (entry prices) from config/portfolio.json
 * Format: { "SYMBOL": { "entry_price": 1.23, "quantity": 100, "entry_date": "2024-01-15" } }
 */
function loadPortfolio() {
  try {
    if (!fs.existsSync(PORTFOLIO_PATH)) {
      // Create template file if it doesn't exist
      const template = {
        _comment: "Add your positions here to track take-profit targets",
        _example: {
          entry_price: 1.50,
          quantity: 100,
          entry_date: "2024-01-15",
          notes: "Bought on dip"
        },
      };
      fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(template, null, 2), "utf8");
      return {};
    }
    const data = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, "utf8"));
    // Filter out comments
    const positions = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("_") && value?.entry_price) {
        positions[key.toUpperCase()] = value;
      }
    }
    return positions;
  } catch {
    return {};
  }
}

function getDefiLatestInfo() {
  if (!fs.existsSync(DEFI_LATEST_PATH)) {
    return { data: null, generated_at: null, age_hours: null };
  }
  const data = readJsonFile(DEFI_LATEST_PATH, null);
  const generatedAt = data?.generated_at || null;
  const ageHours =
    generatedAt && Number.isFinite(Date.parse(generatedAt))
      ? (Date.now() - Date.parse(generatedAt)) / (1000 * 60 * 60)
      : null;
  return { data, generated_at: generatedAt, age_hours: ageHours };
}

function ensureDefiFreshness(preScanWarnings) {
  let info = getDefiLatestInfo();
  const isStale =
    !info.data || (info.age_hours !== null && info.age_hours > DEFI_STALE_HOURS);

  if (isStale && AUTO_RUN_DEFI) {
    console.log("DeFi scan is stale; running src/defi_scan.js...");
    try {
      execFileSync(process.execPath, [path.join(__dirname, "defi_scan.js")], {
        stdio: "inherit",
      });
    } catch (err) {
      preScanWarnings.push(
        "DeFi scan auto-run failed. Run: node src/defi_scan.js"
      );
    }
    info = getDefiLatestInfo();
  }

  const stillStale =
    !info.data || (info.age_hours !== null && info.age_hours > DEFI_STALE_HOURS);
  if (stillStale) {
    const ageNote =
      info.age_hours !== null ? `${info.age_hours.toFixed(1)}h` : "unknown age";
    const autoRunNote = "Auto-run was attempted but data is still stale.";
    preScanWarnings.push(
      `DeFi scan data is missing or stale (${ageNote}). ${autoRunNote} Run node src/defi_scan.js.`
    );
  }

  return info;
}

/**
 * Calculate take-profit status for a coin
 */
function calculateTakeProfitStatus(symbol, currentPrice, portfolio) {
  const position = portfolio[symbol?.toUpperCase()];
  if (!position || !position.entry_price || !currentPrice) {
    return null;
  }
  
  const entryPrice = num(position.entry_price);
  if (!entryPrice || entryPrice <= 0) return null;
  
  const profitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const quantity = num(position.quantity) || 0;
  const profitUsd = quantity * (currentPrice - entryPrice);
  
  // Check targets
  const targets = [
    { level: 1, pct: TAKE_PROFIT_TARGET_1, hit: profitPct >= TAKE_PROFIT_TARGET_1 },
    { level: 2, pct: TAKE_PROFIT_TARGET_2, hit: profitPct >= TAKE_PROFIT_TARGET_2 },
    { level: 3, pct: TAKE_PROFIT_TARGET_3, hit: profitPct >= TAKE_PROFIT_TARGET_3 },
  ];
  
  const highestHit = targets.filter(t => t.hit).pop();
  const nextTarget = targets.find(t => !t.hit);
  const approachingTarget =
    nextTarget &&
    profitPct >= nextTarget.pct - TAKE_PROFIT_APPROACH_BUFFER &&
    profitPct < nextTarget.pct;

  let signal = "hold";
  if (profitPct < -20) signal = "deep_loss";
  else if (profitPct < -10) signal = "loss";
  else if (profitPct < 0) signal = "slight_loss";
  else if (profitPct >= TAKE_PROFIT_TARGET_3) signal = "moon";
  else if (profitPct >= TAKE_PROFIT_TARGET_2) signal = "take_profit_2";
  else if (profitPct >= TAKE_PROFIT_TARGET_1) signal = "take_profit_1";
  else if (approachingTarget) signal = "approaching_target";
  else if (profitPct > 5) signal = "green";
  
  return {
    entry_price: entryPrice,
    current_price: currentPrice,
    quantity,
    profit_pct: Math.round(profitPct * 100) / 100,
    profit_usd: Math.round(profitUsd * 100) / 100,
    entry_date: position.entry_date || null,
    days_held: position.entry_date ? daysSince(position.entry_date) : null,
    targets,
    highest_target_hit: highestHit?.level || 0,
    next_target: nextTarget?.pct || null,
    approaching_target: approachingTarget,
    approaching_target_level: nextTarget?.level || null,
    approaching_target_pct: nextTarget?.pct || null,
    approaching_delta_pct:
      approachingTarget && nextTarget ? nextTarget.pct - profitPct : null,
    signal,
  };
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

function normalizeEvmAddress(address) {
  if (!address) return null;
  const value = String(address).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }
  if (value.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return value.toLowerCase();
}

function loadAddressBook(filePath) {
  const raw = readJsonFile(filePath, null);
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  const byChain = new Map();
  let count = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const chain = String(entry.chain || "").trim().toLowerCase();
    const address = normalizeEvmAddress(entry.address);
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const category =
      typeof entry.category === "string" ? entry.category.trim().toLowerCase() : "";
    if (!chain || !address || !label) continue;

    if (!byChain.has(chain)) {
      byChain.set(chain, new Map());
    }
    byChain.get(chain).set(address, { label, category: category || null });
    count += 1;
  }

  return { byChain, count };
}

function getAddressBookEntry(addressBook, chain, address) {
  if (!addressBook?.byChain) return null;
  const chainKey = String(chain || "").trim().toLowerCase();
  const normalized = normalizeEvmAddress(address);
  if (!chainKey || !normalized) return null;
  const chainMap = addressBook.byChain.get(chainKey);
  if (!chainMap) return null;
  return chainMap.get(normalized) || null;
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

function parseRpcHexToBigInt(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0x") return null;
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

async function fetchEvmCallHex(explorerConfig, toAddress, data) {
  if (!explorerConfig || !toAddress || !data) {
    return null;
  }

  try {
    if (explorerConfig.rpcUrl) {
      const response = await fetch(explorerConfig.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: toAddress, data }, "latest"],
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const result = typeof payload?.result === "string" ? payload.result : null;
        if (result && /^0x[0-9a-fA-F]*$/.test(result.trim())) {
          return result.trim();
        }
      }
    }

    if (explorerConfig.apiKey && explorerConfig.baseUrl) {
      const url =
        `${explorerConfig.baseUrl}?module=proxy&action=eth_call` +
        `&to=${encodeURIComponent(toAddress)}` +
        `&data=${encodeURIComponent(data)}` +
        `&tag=latest&apikey=${encodeURIComponent(explorerConfig.apiKey)}`;
      const payload = await fetchJson(url, {}, 1);
      const result = typeof payload?.result === "string" ? payload.result : null;
      if (result && /^0x[0-9a-fA-F]*$/.test(result.trim())) {
        return result.trim();
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function fetchErc20Metadata(explorerConfig, contractAddress) {
  if (!explorerConfig || !contractAddress) {
    return null;
  }

  const contract = String(contractAddress).trim();
  if (!contract) return null;

  const cachePath = path.join(
    CACHE_DIR,
    `erc20_meta_${explorerConfig.explorer}_${contract.toLowerCase()}.json`
  );
  const cached = readCache(cachePath);
  if (
    cached &&
    (cached.decimals === null || Number.isFinite(cached.decimals)) &&
    (cached.total_supply_base_units === null ||
      typeof cached.total_supply_base_units === "string")
  ) {
    return cached;
  }

  const decimalsHex = await fetchEvmCallHex(
    explorerConfig,
    contract,
    "0x313ce567"
  );
  const supplyHex = await fetchEvmCallHex(
    explorerConfig,
    contract,
    "0x18160ddd"
  );

  const decimalsBig = parseRpcHexToBigInt(decimalsHex);
  const supplyBig = parseRpcHexToBigInt(supplyHex);

  const decimals =
    decimalsBig !== null &&
    decimalsBig >= 0n &&
    decimalsBig <= 255n &&
    Number.isFinite(Number(decimalsBig))
      ? Number(decimalsBig)
      : null;

  const result = {
    decimals,
    total_supply_base_units: supplyBig !== null ? supplyBig.toString() : null,
    source: explorerConfig.rpcUrl ? "rpc" : "explorer_proxy",
  };

  writeCache(cachePath, result);
  return result;
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

function parseDecimalStringToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function percentFromBaseUnits(balanceBaseUnits, totalSupplyBaseUnits) {
  if (balanceBaseUnits === null || totalSupplyBaseUnits === null) return null;
  if (totalSupplyBaseUnits <= 0n) return null;
  if (balanceBaseUnits < 0n) return null;
  const bps = (balanceBaseUnits * 10000n) / totalSupplyBaseUnits; // 0.01%
  return Number(bps) / 100;
}

function concentrationLevelFromTotals(top10Percent, top20Percent) {
  const top10 = num(top10Percent);
  const top20 = num(top20Percent);
  if (top10 === null && top20 === null) return "UNKNOWN";
  if ((top10 !== null && top10 > 50) || (top20 !== null && top20 > 70)) return "HIGH";
  if ((top10 !== null && top10 >= 30) || (top20 !== null && top20 >= 45)) return "MEDIUM";
  return "LOW";
}

function clampPct(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function buildConcentrationSummary({
  top10Percent,
  top20Percent,
  level,
  confidence,
  walletTop10,
  exchangeTop10,
  contractTop10,
  supplyBasis,
}) {
  const pieces = [];
  if (top10Percent !== null) pieces.push(`Top 10 holders: ${formatPct(top10Percent)}`);
  if (top20Percent !== null) pieces.push(`Top 20 holders: ${formatPct(top20Percent)}`);
  if (pieces.length === 0) pieces.push("Top holders: n/a");
  pieces.push(`Concentration: ${level === "UNKNOWN" ? "Unknown" : level.toLowerCase()}`);
  pieces.push(`Data quality: ${confidence === "UNKNOWN" ? "unknown" : confidence.toLowerCase()}`);
  if (supplyBasis) pieces.push(`Supply basis: ${supplyBasis}`);

  const breakdown = [];
  if (walletTop10 !== null && walletTop10 > 0) {
    breakdown.push(`wallets ${formatPct(walletTop10)}`);
  }
  if (exchangeTop10 !== null && exchangeTop10 > 0) {
    breakdown.push(`exchanges ${formatPct(exchangeTop10)}`);
  }
  if (contractTop10 !== null && contractTop10 > 0) {
    breakdown.push(`smart contracts ${formatPct(contractTop10)}`);
  }
  if (breakdown.length > 0) {
    pieces.push(`Top 10 breakdown: ${breakdown.join(", ")}`);
  }

  return pieces.join(" | ");
}

async function analyzeHolderConcentration({
  holdersData,
  contractInfo,
  supplyFallbackTokens,
  addressBook,
}) {
  const empty = {
    top_10_holder_percent: null,
    top_20_holder_percent: null,
    top_10_wallet_percent: null,
    top_10_exchange_percent: null,
    top_10_contract_percent: null,
    holder_concentration_level: "UNKNOWN",
    high_concentration_risk: false,
    holder_confidence: "UNKNOWN",
    holder_concentration_summary: "No on-chain holder data.",
    onchain: null,
  };

  if (!holdersData || !Array.isArray(holdersData?.items) || !contractInfo) {
    return empty;
  }

  const items = holdersData.items.slice(0, 20);
  if (items.length === 0) {
    return empty;
  }

  const explorerConfig = getExplorerConfig(contractInfo.chain);
  const contractUrl = explorerConfig
    ? getExplorerAddressUrl(explorerConfig, contractInfo.address)
    : null;

  const erc20Meta =
    explorerConfig && contractInfo.address
      ? await fetchErc20Metadata(explorerConfig, contractInfo.address)
      : null;

  const tokenDecimals =
    typeof erc20Meta?.decimals === "number" && Number.isFinite(erc20Meta.decimals)
      ? erc20Meta.decimals
      : typeof contractInfo.decimals === "number" && Number.isFinite(contractInfo.decimals)
        ? contractInfo.decimals
        : null;

  const totalSupplyBaseUnits =
    typeof erc20Meta?.total_supply_base_units === "string" &&
    /^\d+$/.test(erc20Meta.total_supply_base_units)
      ? BigInt(erc20Meta.total_supply_base_units)
      : null;

  const supplyFallback =
    Number.isFinite(supplyFallbackTokens) && supplyFallbackTokens > 0
      ? supplyFallbackTokens
      : null;

  const sourceKey = String(holdersData.source || "").toLowerCase();
  const canUseBaseUnits =
    (sourceKey === "ethplorer" || sourceKey === "covalent") &&
    totalSupplyBaseUnits !== null;

  const computed = items.map((holder, idx) => {
    const share = clampPct(num(holder?.percent));
    if (share !== null) {
      return { holder, rank: holder?.rank || idx + 1, percent: share, method: "provider_share" };
    }

    if (canUseBaseUnits) {
      const balanceBase = parseDecimalStringToBigInt(holder?.balance);
      const pct = balanceBase !== null ? percentFromBaseUnits(balanceBase, totalSupplyBaseUnits) : null;
      if (pct !== null) {
        return { holder, rank: holder?.rank || idx + 1, percent: clampPct(pct), method: "rpc_total_supply" };
      }
    }

    if (supplyFallback !== null) {
      const balance = normalizeHolderBalance(holder?.balance, holdersData.source, tokenDecimals);
      if (balance !== null && Number.isFinite(balance) && balance >= 0) {
        const pct = (balance / supplyFallback) * 100;
        return { holder, rank: holder?.rank || idx + 1, percent: clampPct(pct), method: "fallback_supply" };
      }
    }

    return { holder, rank: holder?.rank || idx + 1, percent: null, method: null };
  });

  const top10 = computed.slice(0, 10);
  const top20 = computed.slice(0, 20);

  const sumPercent = (rows, requiredCount) => {
    const percents = rows.map((r) => r.percent).filter((v) => v !== null);
    if (percents.length < requiredCount) return null;
    return percents.reduce((sum, v) => sum + v, 0);
  };

  const top10Percent = sumPercent(top10, Math.min(10, top10.length));
  const top20Percent = sumPercent(top20, Math.min(20, top20.length));

  const supplyBasis = totalSupplyBaseUnits !== null
    ? "on-chain total supply"
    : supplyFallback !== null
      ? "CoinGecko supply"
      : null;

  const methodsUsed = new Set(
    top10.map((r) => r.method).filter((m) => typeof m === "string")
  );
  const holderConfidence = methodsUsed.has("rpc_total_supply")
    ? methodsUsed.has("fallback_supply")
      ? "MEDIUM"
      : "HIGH"
    : methodsUsed.has("provider_share")
      ? "MEDIUM"
      : methodsUsed.has("fallback_supply")
        ? "LOW"
        : "UNKNOWN";

  const onchainTop = top10.map((row) => {
    const holder = row.holder || {};
    const address = holder?.address || null;
    const tag = address ? getAddressBookEntry(addressBook, contractInfo.chain, address) : null;
    return {
      rank: row.rank,
      address,
      address_url:
        explorerConfig && address ? getExplorerAddressUrl(explorerConfig, address) : null,
      address_type: null,
      holder_label: tag?.label || null,
      holder_category: tag?.category || null,
      holder_kind: "Unknown",
      percent_of_supply: row.percent,
    };
  });

  if (explorerConfig && (explorerConfig.rpcUrl || explorerConfig.apiKey)) {
    for (let i = 0; i < Math.min(onchainTop.length, 10); i++) {
      const holder = onchainTop[i];
      if (!holder.address) continue;
      holder.address_type = await fetchExplorerAddressType(explorerConfig, holder.address);
      await sleep(220);
    }
  }

  for (const holder of onchainTop) {
    const category = holder.holder_category;
    if (category === "exchange") {
      holder.holder_kind = "Exchange wallet";
    } else if (holder.address_type === "CONTRACT") {
      holder.holder_kind = "Smart contract";
    } else if (holder.address_type === "EOA") {
      holder.holder_kind = "Wallet";
    } else {
      holder.holder_kind = "Unknown";
    }
  }

  let breakdownHasAny = false;
  let walletTop10Sum = 0;
  let exchangeTop10Sum = 0;
  let contractTop10Sum = 0;

  for (const holder of onchainTop) {
    const pct = num(holder.percent_of_supply);
    if (pct === null) continue;
    breakdownHasAny = true;
    if (holder.holder_kind === "Exchange wallet") {
      exchangeTop10Sum += pct;
    } else if (holder.holder_kind === "Smart contract") {
      contractTop10Sum += pct;
    } else if (holder.holder_kind === "Wallet") {
      walletTop10Sum += pct;
    }
  }

  const walletTop10 = breakdownHasAny ? walletTop10Sum : null;
  const exchangeTop10 = breakdownHasAny ? exchangeTop10Sum : null;
  const contractTop10 = breakdownHasAny ? contractTop10Sum : null;

  let level = concentrationLevelFromTotals(top10Percent, top20Percent);

  // If most of the concentration is explained by exchanges/contracts, lower the warning.
  if (level === "HIGH" && walletTop10 !== null && top10Percent !== null) {
    const nonWallet = (exchangeTop10 || 0) + (contractTop10 || 0);
    if (walletTop10 <= 20 && nonWallet >= 30) {
      level = "MEDIUM";
    }
  } else if (level === "MEDIUM" && walletTop10 !== null && top10Percent !== null) {
    const nonWallet = (exchangeTop10 || 0) + (contractTop10 || 0);
    if (walletTop10 <= 10 && nonWallet >= 20) {
      level = "LOW";
    }
  }

  const summary = buildConcentrationSummary({
    top10Percent,
    top20Percent,
    level,
    confidence: holderConfidence,
    walletTop10,
    exchangeTop10,
    contractTop10,
    supplyBasis,
  });

  return {
    top_10_holder_percent: top10Percent,
    top_20_holder_percent: top20Percent,
    top_10_wallet_percent: walletTop10,
    top_10_exchange_percent: exchangeTop10,
    top_10_contract_percent: contractTop10,
    holder_concentration_level: level,
    high_concentration_risk: level === "HIGH",
    holder_confidence: holderConfidence,
    holder_concentration_summary: summary,
    onchain: {
      chain: contractInfo.chain || null,
      contract_address: contractInfo.address || null,
      contract_url: contractUrl,
      source: formatOnChainSource(holdersData.source),
      supply_basis: supplyBasis,
      top_holders: onchainTop,
    },
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

// Evaluate unlock data from DefiLlama + estimate from dilution data
function evaluateUnlocks(unlockData, marketCap, circulatingSupply, totalSupply, maxSupply) {
  // First try DefiLlama unlock data
  if (unlockData && Array.isArray(unlockData) && unlockData.length > 0) {
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
          const pricePerToken = marketCap / circulatingSupply;
          totalValue += amount * pricePerToken;
        }
      }
    }
    
    const supplyPercent = circulatingSupply && circulatingSupply > 0 
      ? (totalUnlock / circulatingSupply) * 100 
      : null;
    const unlockRiskFlag = 
      (supplyPercent !== null && supplyPercent > 1) ||
      (totalValue > 10000000);
    
    return {
      unlock_confidence: "HIGH",
      unlock_source: "DefiLlama",
      unlock_next_30d: totalUnlock > 0 ? totalUnlock : null,
      unlock_next_30d_value: totalValue > 0 ? totalValue : null,
      unlock_next_30d_percent: supplyPercent,
      unlock_risk_flag: unlockRiskFlag,
    };
  }
  
  // Fallback: estimate from supply data (dilution proxy)
  const effectiveTotal = num(totalSupply) || num(maxSupply);
  const circ = num(circulatingSupply);
  
  if (circ && effectiveTotal && effectiveTotal > circ) {
    const lockedPercent = ((effectiveTotal - circ) / effectiveTotal) * 100;
    const floatPercent = (circ / effectiveTotal) * 100;
    
    // Estimate: if >50% is still locked, there's meaningful unlock potential
    // Risk flag if <30% is circulating (70% still locked)
    const unlockRiskFlag = floatPercent < 30;
    
    return {
      unlock_confidence: "ESTIMATED",
      unlock_source: "supply_ratio",
      unlock_next_30d: null,
      unlock_next_30d_value: null,
      unlock_next_30d_percent: null,
      unlock_risk_flag: unlockRiskFlag,
      locked_percent: lockedPercent,
      float_percent: floatPercent,
    };
  }
  
  return {
    unlock_confidence: "UNKNOWN",
    unlock_source: null,
    unlock_next_30d: null,
    unlock_next_30d_value: null,
    unlock_risk_flag: false,
  };
}

// Evaluate traction from TVL, developer data, and GitHub activity
// Priority: GitHub direct data > CoinGecko dev stats > TVL only
function evaluateTraction(tvlData, devData, githubActivity) {
  let tractionStatus = "UNKNOWN";
  let missingTraction = true;
  const tractionSignals = [];
  let tractionSource = null;
  
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
      tractionSource = "TVL";
    }
  }
  
  // Check GitHub direct activity (PREFERRED over CoinGecko)
  // This gives us actual recent commit data, not aggregated stats
  if (githubActivity) {
    const lastCommitDate = githubActivity.last_commit;
    const stars = num(githubActivity.stars);
    const isArchived = githubActivity.archived;
    
    // Check if repo is archived (bad sign)
    if (isArchived) {
      tractionSignals.push("⚠️ Repo archived");
      // Don't set OK if archived
    } else if (lastCommitDate) {
      // Calculate days since last commit
      const commitDate = new Date(lastCommitDate);
      const now = new Date();
      const daysSinceCommit = Math.floor((now - commitDate) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCommit <= 30) {
        // Active development (commit in last 30 days)
        tractionStatus = "OK";
        missingTraction = false;
        tractionSignals.push(`✓ Active dev (${daysSinceCommit}d ago)`);
        tractionSource = "GitHub";
      } else if (daysSinceCommit <= 90) {
        // Recent activity (commit in last 90 days)
        if (tractionStatus === "UNKNOWN") tractionStatus = "OK";
        missingTraction = false;
        tractionSignals.push(`Dev activity (${daysSinceCommit}d ago)`);
        tractionSource = tractionSource || "GitHub";
      } else if (daysSinceCommit > 180) {
        // Stale (no commits in 6 months)
        tractionSignals.push(`⚠️ Stale code (${daysSinceCommit}d)`);
        // Don't override OK from TVL, but note the staleness
      }
    }
    
    // GitHub stars as social traction signal
    if (stars && stars > 500) {
      tractionSignals.push(`${stars.toLocaleString()} GitHub stars`);
    } else if (stars && stars > 100) {
      tractionSignals.push(`${stars} stars`);
    }
  }
  
  // Fallback to CoinGecko developer data if no GitHub direct data
  if (!githubActivity && devData) {
    const commits4w = num(devData.commit_count_4_weeks);
    const stars = num(devData.stars);
    const forks = num(devData.forks);
    
    if (commits4w && commits4w > 10) {
      if (tractionStatus === "UNKNOWN") tractionStatus = "OK";
      missingTraction = false;
      tractionSignals.push(`${commits4w} commits (4w via CG)`);
      tractionSource = tractionSource || "CoinGecko";
    }
    if (stars && stars > 100) {
      tractionSignals.push(`${stars} stars (CG)`);
    }
  }
  
  return {
    traction_status: tractionStatus,
    missing_traction: missingTraction,
    traction_signals: tractionSignals,
    traction_source: tractionSource,
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
  const flagLabels = {
    chasing: "price chasing",
    unlock_risk_flag: "unlock risk",
    high_concentration_risk: "ownership very concentrated",
    low_liquidity: "low liquidity",
    high_dilution_risk: "dilution risk",
  };

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
        description: `Label changed from ${prev.hygiene_label} to ${curr.hygiene_label}`,
        details: {
          previous_label: prev.hygiene_label,
          current_label: curr.hygiene_label,
        },
      });
    }

    // Ownership concentration deltas (top holders %)
    const prevTop10 = num(prev.top_10_holder_percent);
    const currTop10 = num(curr.top_10_holder_percent);
    const prevTop20 = num(prev.top_20_holder_percent);
    const currTop20 = num(curr.top_20_holder_percent);

    const prevLevel =
      typeof prev.holder_concentration_level === "string"
        ? prev.holder_concentration_level
        : concentrationLevelFromTotals(prevTop10, prevTop20);
    const currLevel =
      typeof curr.holder_concentration_level === "string"
        ? curr.holder_concentration_level
        : concentrationLevelFromTotals(currTop10, currTop20);

    const levelRank = (level) => {
      switch (String(level || "").toUpperCase()) {
        case "LOW":
          return 1;
        case "MEDIUM":
          return 2;
        case "HIGH":
          return 3;
        default:
          return 0;
      }
    };

    if (prevLevel !== currLevel) {
      const prevR = levelRank(prevLevel);
      const currR = levelRank(currLevel);
      const upgraded = currR > prevR;
      const downgraded = currR < prevR;
      const severity = upgraded
        ? currLevel === "HIGH"
          ? "CRITICAL"
          : "WARNING"
        : downgraded
          ? "POSITIVE"
          : "INFO";

      const pretty = (value) => {
        const v = String(value || "").toUpperCase();
        return v === "UNKNOWN" || !v ? "Unknown" : `${v[0]}${v.slice(1).toLowerCase()}`;
      };

      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity,
        type: "CONCENTRATION_LEVEL_CHANGED",
        description: `Ownership concentration is now ${pretty(currLevel)} (was ${pretty(prevLevel)})`,
        details: { previous_level: prevLevel, current_level: currLevel },
      });
    }

    const pushPctDelta = (label, prevVal, currVal) => {
      if (prevVal === null || currVal === null) return;
      const delta = currVal - prevVal;
      if (!Number.isFinite(delta) || Math.abs(delta) < 5) return; // 5 percentage points
      const increased = delta > 0;
      const severity = increased ? "WARNING" : "POSITIVE";
      changes.push({
        key,
        symbol,
        name,
        watchlist_source: watchlistSource,
        severity,
        type: "CONCENTRATION_PCT_CHANGED",
        description: `Ownership concentration changed: ${label} ${formatPct(currVal)} (was ${formatPct(prevVal)})`,
        details: {
          label,
          previous_percent: prevVal,
          current_percent: currVal,
          delta_points: delta,
        },
      });
    };

    pushPctDelta("Top 10 holders", prevTop10, currTop10);
    pushPctDelta("Top 20 holders", prevTop20, currTop20);

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
        description: `${triggered ? "New" : "Cleared"} flag: ${flagLabels[flag] || flag}`,
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

  // Split by Main vs Staging
  const mainPredictions = predictions.filter((p) => (p?.watchlist_source || "main") !== "staging");
  const stagingPredictions = predictions.filter((p) => p?.watchlist_source === "staging");

  function statsForGroup(group) {
    const out = {
      count: group.length,
      sample_7d: 0,
      sample_14d: 0,
      sample_30d: 0,
      avg_return_7d: null,
      avg_return_14d: null,
      avg_return_30d: null,
      win_rate_7d: null,
      win_rate_14d: null,
      win_rate_30d: null,
    };
    for (const h of horizons) {
      const key = `return_${h}_pct`;
      const values = group
        .map((p) => num(p?.outcomes?.[key]))
        .filter((v) => v !== null);
      const avg = average(values);
      out[`sample_${h}`] = values.length;
      out[`avg_return_${h}`] = avg;
      if (values.length > 0) {
        out[`win_rate_${h}`] = values.filter((v) => v > 0).length / values.length;
      }
    }
    return out;
  }

  const accuracyByLabel = {};
  for (const label of labels) {
    accuracyByLabel[label] = statsForGroup(byLabel[label]);
  }

  // Main vs Staging breakdown
  const mainVsStaging = {
    main: statsForGroup(mainPredictions),
    staging: statsForGroup(stagingPredictions),
  };

  // Helper to get active flags for a prediction
  function getActiveFlags(p) {
    const flags = [];
    if (p?.flags?.has_clean_catalyst) flags.push("catalyst");
    if (p?.flags?.chasing) flags.push("chasing");
    if (p?.flags?.unlock_risk) flags.push("unlock risk");
    if (p?.flags?.high_concentration_risk) flags.push("concentrated");
    if (p?.flags?.low_liquidity) flags.push("low liquidity");
    if (p?.flags?.high_dilution_risk) flags.push("dilution");
    return flags;
  }

  const allWith14d = predictions.filter((p) => num(p?.outcomes?.return_14d_pct) !== null);
  const best14d = [...allWith14d]
    .sort((a, b) => (b.outcomes.return_14d_pct || -Infinity) - (a.outcomes.return_14d_pct || -Infinity))
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      coin_gecko_id: p.coin_gecko_id,
      hygiene_label: p.hygiene_label,
      watchlist_source: p.watchlist_source || "main",
      return_14d_pct: p.outcomes.return_14d_pct,
      flags: getActiveFlags(p),
      why_good: p?.flags?.has_clean_catalyst ? "Had a catalyst" : 
                p.hygiene_label === "KEEP" ? "Passed safety checks" : "Unknown",
    }));
  const worst14d = [...allWith14d]
    .sort((a, b) => (a.outcomes.return_14d_pct || Infinity) - (b.outcomes.return_14d_pct || Infinity))
    .slice(0, 5)
    .map((p) => ({
      symbol: p.symbol,
      coin_gecko_id: p.coin_gecko_id,
      hygiene_label: p.hygiene_label,
      watchlist_source: p.watchlist_source || "main",
      return_14d_pct: p.outcomes.return_14d_pct,
      flags: getActiveFlags(p),
      why_bad: p?.flags?.chasing ? "Was chasing price" :
               p?.flags?.high_concentration_risk ? "Few big holders" :
               p?.flags?.low_liquidity ? "Low liquidity" :
               p?.flags?.high_dilution_risk ? "High dilution" : "Unknown",
    }));

  const flags = [
    "has_clean_catalyst",
    "unlock_risk",
    "high_concentration_risk",
    "chasing",
    "low_liquidity",
    "high_dilution_risk",
  ];
  
  const flagLabels = {
    has_clean_catalyst: "Recent catalyst/news",
    unlock_risk: "Unlock risk",
    high_concentration_risk: "Few big holders",
    chasing: "Price chasing",
    low_liquidity: "Low liquidity",
    high_dilution_risk: "High dilution risk",
  };
  
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
    const edge = withAvg !== null && withoutAvg !== null ? withAvg - withoutAvg : null;
    const sampleMin = Math.min(withVals.length, withoutVals.length);
    const confidence = deriveRuleConfidence(withVals.length, withoutVals.length);
    flagEffectiveness.push({
      flag,
      label: flagLabels[flag] || flag,
      count_with: withVals.length,
      avg_with_14d: withAvg,
      count_without: withoutVals.length,
      avg_without_14d: withoutAvg,
      edge_14d: edge,
      sample_min: sampleMin,
      confidence,
      verdict: edge === null ? "Not enough data" :
               edge > 5 ? "✓ Helpful (buy signal)" :
               edge < -5 ? "✓ Helpful (avoid signal)" :
               "Neutral (not predictive)",
    });
  }

  // Data coverage summary
  const dataCoverage = {
    total_predictions: predictions.length,
    with_7d_outcome: predictions.filter((p) => num(p?.outcomes?.return_7d_pct) !== null).length,
    with_14d_outcome: predictions.filter((p) => num(p?.outcomes?.return_14d_pct) !== null).length,
    with_30d_outcome: predictions.filter((p) => num(p?.outcomes?.return_30d_pct) !== null).length,
    awaiting_7d: predictions.filter((p) => {
      const age = (Date.now() - Date.parse(p?.scan_date)) / (1000 * 60 * 60 * 24);
      return age < 7 && num(p?.outcomes?.return_7d_pct) === null;
    }).length,
    awaiting_14d: predictions.filter((p) => {
      const age = (Date.now() - Date.parse(p?.scan_date)) / (1000 * 60 * 60 * 24);
      return age >= 7 && age < 14 && num(p?.outcomes?.return_14d_pct) === null;
    }).length,
  };

  return {
    predictions_tracked: predictions.length,
    oldest_prediction: predictions
      .map((p) => Date.parse(p?.scan_date))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)[0] || null,
    data_coverage: dataCoverage,
    accuracy_by_label: accuracyByLabel,
    main_vs_staging: mainVsStaging,
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
  md.push("# 📊 Backtest Report");
  md.push("");
  md.push(`**Generated:** ${generatedAt}`);
  md.push("");
  
  // Data Coverage Summary
  md.push("## 📈 Data Coverage");
  md.push("");
  const cov = stats.data_coverage || {};
  md.push(`- **Total predictions tracked:** ${stats.predictions_tracked}`);
  md.push(`- **With 7-day results:** ${cov.with_7d_outcome || 0} (${cov.awaiting_7d || 0} still waiting)`);
  md.push(`- **With 14-day results:** ${cov.with_14d_outcome || 0} (${cov.awaiting_14d || 0} still waiting)`);
  md.push(`- **With 30-day results:** ${cov.with_30d_outcome || 0}`);
  if (stats.oldest_prediction) {
    md.push(`- **Tracking since:** ${new Date(stats.oldest_prediction).toLocaleDateString()}`);
  }
  md.push("");
  if ((cov.with_14d_outcome || 0) < 10) {
    md.push("> ⏳ **Note:** Need more time to collect meaningful results. Keep running the scanner daily!");
    md.push("");
  }

  // Accuracy by Label
  md.push("## 🎯 Accuracy by Decision");
  md.push("");
  md.push("How did each decision type perform?");
  md.push("");
  md.push("| Decision | Sample | Avg 7d | Avg 14d | Avg 30d | Win Rate |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const label of ["KEEP", "WATCH-ONLY", "DROP"]) {
    const row = stats.accuracy_by_label?.[label] || {};
    const sample14d = row.sample_14d || 0;
    const winRate = typeof row.win_rate_14d === "number" && sample14d > 0
        ? `${(row.win_rate_14d * 100).toFixed(0)}%`
        : "n/a";
    const decision = label === "KEEP" ? "✅ Buy" : label === "WATCH-ONLY" ? "👀 Watch" : "🚫 Avoid";
    md.push(
      `| ${decision} | ${sample14d} coins | ${formatSignedPct(row.avg_return_7d, 1)} | ${formatSignedPct(row.avg_return_14d, 1)} | ${formatSignedPct(row.avg_return_30d, 1)} | ${winRate} |`
    );
  }
  md.push("");

  // Main vs Staging comparison
  md.push("## 🆚 Main Watchlist vs Staging");
  md.push("");
  md.push("Does staging (discovery) add value, or is it just noise?");
  md.push("");
  const mvs = stats.main_vs_staging || {};
  const mainStats = mvs.main || {};
  const stagingStats = mvs.staging || {};
  md.push("| List | Coins Tracked | Avg 14d Return | Win Rate |");
  md.push("| --- | --- | --- | --- |");
  const mainWin = typeof mainStats.win_rate_14d === "number" && mainStats.sample_14d > 0
    ? `${(mainStats.win_rate_14d * 100).toFixed(0)}%` : "n/a";
  const stagingWin = typeof stagingStats.win_rate_14d === "number" && stagingStats.sample_14d > 0
    ? `${(stagingStats.win_rate_14d * 100).toFixed(0)}%` : "n/a";
  md.push(`| 📋 Main Watchlist | ${mainStats.sample_14d || 0} | ${formatSignedPct(mainStats.avg_return_14d, 1)} | ${mainWin} |`);
  md.push(`| 🧪 Staging/Discovery | ${stagingStats.sample_14d || 0} | ${formatSignedPct(stagingStats.avg_return_14d, 1)} | ${stagingWin} |`);
  md.push("");

  // Flag Effectiveness
  md.push("## 🔍 Which Rules Help?");
  md.push("");
  md.push("How do coins with each warning flag perform vs coins without it?");
  md.push("");
  md.push("| Rule | With Flag | Avg 14d | Without | Avg 14d | Confidence | Verdict |");
  md.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const item of stats.flag_effectiveness_14d || []) {
    const verdict = item.verdict || "Not enough data";
    const confidenceRaw =
      item.confidence || deriveRuleConfidence(item.count_with, item.count_without);
    const confidenceLabel =
      typeof confidenceRaw === "string"
        ? confidenceRaw.charAt(0).toUpperCase() + confidenceRaw.slice(1)
        : "Unknown";
    md.push(
      `| ${item.label || item.flag} | ${item.count_with} | ${formatSignedPct(item.avg_with_14d, 1)} | ${item.count_without} | ${formatSignedPct(item.avg_without_14d, 1)} | ${confidenceLabel} | ${verdict} |`
    );
  }
  md.push("");

  // Best Predictions
  md.push("## 🏆 Best Picks (14 days)");
  md.push("");
  if (!stats.best_14d || stats.best_14d.length === 0) {
    md.push("- No 14-day results yet. Keep running the scanner!");
  } else {
    for (const item of stats.best_14d.slice(0, 5)) {
      const flags = item.flags?.length > 0 ? ` (${item.flags.join(", ")})` : "";
      const source = item.watchlist_source === "staging" ? " [staging]" : "";
      md.push(
        `- **${item.symbol}**${source}: ${formatSignedPct(item.return_14d_pct, 1)} — ${item.why_good}${flags}`
      );
    }
  }
  md.push("");

  // Worst Predictions
  md.push("## ⚠️ Worst Picks (14 days)");
  md.push("");
  if (!stats.worst_14d || stats.worst_14d.length === 0) {
    md.push("- No 14-day results yet. Keep running the scanner!");
  } else {
    for (const item of stats.worst_14d.slice(0, 5)) {
      const flags = item.flags?.length > 0 ? ` (${item.flags.join(", ")})` : "";
      const source = item.watchlist_source === "staging" ? " [staging]" : "";
      md.push(
        `- **${item.symbol}**${source}: ${formatSignedPct(item.return_14d_pct, 1)} — ${item.why_bad}${flags}`
      );
    }
  }
  md.push("");

  // Insights
  md.push("## 💡 Key Insights");
  md.push("");
  const insights = [];
  
  // Check if KEEP outperforms
  const keepRow = stats.accuracy_by_label?.["KEEP"] || {};
  const dropRow = stats.accuracy_by_label?.["DROP"] || {};
  if (keepRow.sample_14d >= 5 && dropRow.sample_14d >= 5) {
    const keepAvg = keepRow.avg_return_14d;
    const dropAvg = dropRow.avg_return_14d;
    if (keepAvg !== null && dropAvg !== null) {
      if (keepAvg > dropAvg + 5) {
        insights.push(`✅ **KEEP picks outperform DROP by ${formatSignedPct(keepAvg - dropAvg, 1)}** — the scanner is working!`);
      } else if (dropAvg > keepAvg) {
        insights.push(`⚠️ DROP picks outperformed KEEP — review your criteria or market conditions.`);
      }
    }
  }
  
  // Find best/worst rules
  const helpfulRules = (stats.flag_effectiveness_14d || [])
    .filter(r => r.count_with >= 3 && r.count_without >= 3)
    .filter(r => r.edge_14d !== null && Math.abs(r.edge_14d) > 5);
  
  for (const rule of helpfulRules) {
    if (rule.edge_14d > 5) {
      insights.push(`📈 **"${rule.label}"** is a positive signal: +${formatSignedPct(rule.edge_14d, 1)} edge`);
    } else if (rule.edge_14d < -5) {
      insights.push(`📉 **"${rule.label}"** correctly identifies risk: ${formatSignedPct(rule.edge_14d, 1)} edge`);
    }
  }
  
  if (insights.length === 0) {
    insights.push("Keep running daily scans to build enough data for insights.");
  }
  
  for (const insight of insights) {
    md.push(`- ${insight}`);
  }
  md.push("");

  fs.writeFileSync(BACKTEST_REPORT_MD_PATH, md.join("\n"), "utf8");
}

function computeDiscoveryFunnelStats(predictions) {
  // Load discovery queue to get funnel status
  const discoveryQueue = readJsonFile(DISCOVERY_QUEUE_PATH, { candidates: [] });
  const candidates = Array.isArray(discoveryQueue?.candidates) ? discoveryQueue.candidates : [];
  
  // Count by status
  const statusCounts = {
    NEW: 0,
    STAGED: 0,
    PROMOTED: 0,
    IGNORED: 0,
  };
  
  for (const c of candidates) {
    const status = c?.status || "NEW";
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    }
  }
  
  const totalDiscovered = candidates.length;
  const conversionToStaging = totalDiscovered > 0 
    ? ((statusCounts.STAGED + statusCounts.PROMOTED) / totalDiscovered * 100).toFixed(1) 
    : 0;
  const conversionToMain = totalDiscovered > 0 
    ? (statusCounts.PROMOTED / totalDiscovered * 100).toFixed(1) 
    : 0;
  
  // Compare staging vs main performance from predictions
  const stagingPredictions = predictions.filter((p) => p?.watchlist_source === "staging");
  const mainPredictions = predictions.filter((p) => (p?.watchlist_source || "main") !== "staging");
  
  const stagingWith14d = stagingPredictions.filter((p) => num(p?.outcomes?.return_14d_pct) !== null);
  const mainWith14d = mainPredictions.filter((p) => num(p?.outcomes?.return_14d_pct) !== null);
  
  const stagingReturns = stagingWith14d.map((p) => num(p?.outcomes?.return_14d_pct)).filter((v) => v !== null);
  const mainReturns = mainWith14d.map((p) => num(p?.outcomes?.return_14d_pct)).filter((v) => v !== null);
  
  const stagingAvg = average(stagingReturns);
  const mainAvg = average(mainReturns);
  
  // Top discovery performers (staged coins that did well)
  const topStagingPerformers = [...stagingWith14d]
    .sort((a, b) => (b.outcomes?.return_14d_pct || -Infinity) - (a.outcomes?.return_14d_pct || -Infinity))
    .slice(0, 3)
    .map((p) => ({
      symbol: p.symbol,
      return_14d_pct: p.outcomes?.return_14d_pct,
    }));
  
  // Calculate if staging adds value
  let stagingVerdict = "Not enough data yet";
  if (stagingReturns.length >= 3 && mainReturns.length >= 3) {
    const diff = (stagingAvg || 0) - (mainAvg || 0);
    if (diff > 5) {
      stagingVerdict = "✅ Staging finds winners! Outperforming main by " + formatSignedPct(diff, 1);
    } else if (diff < -5) {
      stagingVerdict = "⚠️ Staging underperforms. Focus on your main watchlist.";
    } else {
      stagingVerdict = "➖ Staging performs similarly to main watchlist.";
    }
  }
  
  return {
    total_discovered: totalDiscovered,
    by_status: statusCounts,
    conversion_rate_staging: parseFloat(conversionToStaging),
    conversion_rate_main: parseFloat(conversionToMain),
    staging_performance: {
      sample_size: stagingReturns.length,
      avg_return_14d: stagingAvg,
      top_performers: topStagingPerformers,
    },
    main_performance: {
      sample_size: mainReturns.length,
      avg_return_14d: mainAvg,
    },
    verdict: stagingVerdict,
  };
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
  
  // Compute discovery funnel stats
  const funnelStats = computeDiscoveryFunnelStats(predictions);
  
  return {
    added_predictions: recordResult.added,
    outcomes_updated: dueIds.size,
    stats,
    funnelStats,
  };
}

function buildSummary(
  layer1Report,
  supervisorResult,
  diffReport,
  alertsReport,
  macroPulse
) {
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

  if (fs.existsSync(MACRO_PULSE_MD_PATH)) {
    lines.push("Macro pulse: [MacroPulse.md](MacroPulse.md)");
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
        const riskLabel =
          risk === "HIGH" ? "High risk" : risk === "OK" ? "No red flag" : "Unknown";
        const facts = Array.isArray(item?.facts) ? item.facts.filter(Boolean) : [];
        lines.push(`- ${symbol} (${chain}) [${riskLabel}]: ${facts.join(" | ")}`);
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
      lines.push(`- ${coin.symbol}${tag}: price chasing`);
    }
  }
  lines.push("");

  // BTC reference
  if (layer1Report.btc_reference) {
    const btc = layer1Report.btc_reference;
    lines.push("## BTC Reference");
    lines.push(`BTC 7d: ${formatPct(btc.price_change_7d)} | Coins beating BTC are marked with ✓`);
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
    lines.push("| Symbol | Decision | Price | 7-day | vs BTC (7-day) | Volume (24h) | Notes |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const coin of coins) {
      const notes = [];
      if (coin.watchlist_source === "staging") {
        notes.push("staging list");
      }
      if (coin.chasing) {
        notes.push("price chasing");
      }
      if (coin.thin_fragile) {
        notes.push("volume fading");
      }
      if (coin.high_dilution_risk) {
        notes.push("dilution risk");
      }
      if (coin.low_liquidity) {
        notes.push("low liquidity");
      }
      if (coin.unlock_confidence === "UNKNOWN") {
        notes.push("unlock info missing");
      }
      if (coin.unlock_risk_flag) {
        notes.push("unlock risk");
      }
      if (coin.has_clean_catalyst) {
        notes.push("recent catalyst");
      }
      if (coin.traction_status === "OK") {
        notes.push("traction ok");
      }
      if (coin.holder_concentration_level === "HIGH") {
        notes.push("ownership very concentrated");
      } else if (coin.holder_concentration_level === "UNKNOWN") {
        notes.push("ownership data missing");
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
    lines.push(
      "- Shows top holders and whether each is a wallet or a smart contract (when available)."
    );
    lines.push(
      "- Exchange wallets are only labeled if you add them to `config/address_book.json`."
    );
    lines.push("");
    for (const coin of onchainCoins) {
      const chainLabel = coin.onchain.chain ? ` (${coin.onchain.chain})` : "";
      const tag = coin.watchlist_source === "staging" ? " (staging)" : "";
      lines.push(`### ${coin.symbol}${tag}${chainLabel}`);
      const top10 = formatPct(coin.top_10_holder_percent);
      const top20 = formatPct(coin.top_20_holder_percent);
      const level = coin.holder_concentration_level || "UNKNOWN";
      const levelLabel =
        level === "UNKNOWN" ? "Unknown" : `${level[0]}${level.slice(1).toLowerCase()}`;
      const confidence = coin.holder_confidence || "UNKNOWN";
      const confidenceLabel =
        confidence === "UNKNOWN"
          ? "Unknown"
          : `${confidence[0]}${confidence.slice(1).toLowerCase()}`;
      lines.push(
        `Top 10 holders: ${top10} | Top 20 holders: ${top20} | Concentration: ${levelLabel} | Data quality: ${confidenceLabel} | Source: ${coin.onchain.source}`
      );

      const breakdown = [];
      if (Number.isFinite(coin.top_10_wallet_percent) && coin.top_10_wallet_percent > 0) {
        breakdown.push(`wallets ${formatPct(coin.top_10_wallet_percent)}`);
      }
      if (
        Number.isFinite(coin.top_10_exchange_percent) &&
        coin.top_10_exchange_percent > 0
      ) {
        breakdown.push(`exchanges ${formatPct(coin.top_10_exchange_percent)}`);
      }
      if (
        Number.isFinite(coin.top_10_contract_percent) &&
        coin.top_10_contract_percent > 0
      ) {
        breakdown.push(`smart contracts ${formatPct(coin.top_10_contract_percent)}`);
      }
      if (breakdown.length > 0) {
        lines.push(`Top 10 breakdown: ${breakdown.join(" | ")}`);
      }
      if (coin.onchain.contract_address && coin.onchain.contract_url) {
        lines.push(
          `Contract: [${shortAddress(coin.onchain.contract_address)}](${coin.onchain.contract_url})`
        );
      }
      lines.push("");
      lines.push("| Rank | Holder | Type | % Supply |");
      lines.push("| --- | --- | --- | --- |");
      for (const holder of coin.onchain.top_holders.slice(0, 5)) {
        const holderName =
          holder.holder_label ||
          (holder.address ? shortAddress(holder.address) : "n/a");
        const holderLink =
          holder.address && holder.address_url
            ? `[${holderName}](${holder.address_url})`
            : holder.address
              ? holderName
              : "n/a";
        const holderType =
          holder.holder_kind ||
          (holder.address_type === "CONTRACT"
            ? "Smart contract"
            : holder.address_type === "EOA"
              ? "Wallet"
              : "Unknown");
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

  const preScanWarnings = [];
  const defiLatestInfo = ensureDefiFreshness(preScanWarnings);
  const ruleConfidence = loadRuleConfidenceFromBacktest();
  const ruleEffectiveness = loadRuleEffectivenessFromBacktest();

  const addressBook = loadAddressBook(ADDRESS_BOOK_PATH);
  if (addressBook.count > 0) {
    console.log(`Loaded address book entries: ${addressBook.count}`);
  }

  const watchlistMainRaw = readJsonFile(WATCHLIST_PATH, []);
  const watchlistStagingRaw = readJsonFile(STAGING_WATCHLIST_PATH, []);
  const portfolio = loadPortfolio(); // Load entry prices for take-profit tracking
  const watchlistMain = Array.isArray(watchlistMainRaw) ? watchlistMainRaw : [];
  const watchlistStaging = Array.isArray(watchlistStagingRaw)
    ? watchlistStagingRaw
    : [];
  const watchlistMainIds = new Set(
    watchlistMain
      .map((coin) => normalizeCoinGeckoId(coin?.coinGeckoId))
      .filter(Boolean)
  );
  const watchlistStagingIds = new Set(
    watchlistStaging
      .map((coin) => normalizeCoinGeckoId(coin?.coinGeckoId))
      .filter(Boolean)
  );
  const defiKnowledge = loadDefiKnowledge(); // Load DeFi scan data for audit/hack context

  const autoStageIgnoreRaw = readJsonFile(AUTO_STAGE_IGNORE_PATH, []);
  const autoStageIgnoreIds = new Set(
    (Array.isArray(autoStageIgnoreRaw) ? autoStageIgnoreRaw : [])
      .map((id) => normalizeCoinGeckoId(id))
      .filter(Boolean)
  );

  const discoveryQueueRaw = readJsonFile(DISCOVERY_QUEUE_PATH, null);
  const autoStageResult = autoStageDiscoveryQueue({
    discoveryQueue: discoveryQueueRaw,
    watchlistIds: watchlistMainIds,
    stagingIds: watchlistStagingIds,
    autoStageIgnoreIds,
    nowIso: new Date().toISOString(),
  });
  let discoveryQueue = autoStageResult.queue;
  if (autoStageResult.updated) {
    writeJsonFile(DISCOVERY_QUEUE_PATH, discoveryQueue);
  }
  if (!AUTO_STAGE_DISCOVERY && autoStageResult.pending_high_score > 0) {
    preScanWarnings.push(
      `Discovery queue has ${autoStageResult.pending_high_score} high-score coin(s) waiting to be staged. Turn on AUTO_STAGE_DISCOVERY=1 or run node src/promote_discovery.js.`
    );
  }
  if (autoStageResult.staged.length > 0) {
    console.log(
      `Auto-staged ${autoStageResult.staged.length} discovery coin(s) into staging.`
    );
  }
  const discoveryCandidates = Array.isArray(discoveryQueue?.candidates)
    ? discoveryQueue.candidates
    : [];
  const autoStaged = discoveryCandidates
    .filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.status !== "STAGED") return false;
      const idLower = normalizeCoinGeckoId(entry.coinGeckoId || entry.id);
      if (!idLower || autoStageIgnoreIds.has(idLower)) return false;
      const source = entry.staged_source || (entry.auto_staged ? "auto" : null);
      return source === "auto";
    })
    .map((entry) => ({
      symbol: entry.symbol ? String(entry.symbol).toUpperCase() : "N/A",
      name: entry.name || entry.coinGeckoId || entry.id || "",
      coinGeckoId: entry.coinGeckoId || entry.id || "",
      category: "discovery:auto",
      urls: { official: "", x: "", blog: "", github: "" },
      notes: "",
      auto_staged: true,
    }))
    .filter((entry) => typeof entry.coinGeckoId === "string" && entry.coinGeckoId.trim());

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
  let autoStagedAdded = 0;
  for (const coin of autoStaged) {
    const idLower = normalizeCoinGeckoId(coin?.coinGeckoId);
    if (!idLower || seenIds.has(idLower)) continue;
    seenIds.add(idLower);
    watchlist.push({ ...coin, watchlist_source: "staging" });
    autoStagedAdded += 1;
  }

  const ids = watchlist.map((coin) => coin.coinGeckoId).filter((id) => id);

  console.log("Fetching market data and DefiLlama protocols...");
  console.log(
    `Processing ${watchlistMain.length} watchlist coins + ${watchlistStaging.length + autoStagedAdded} staging coins (auto-staged: ${autoStagedAdded})...`
  );
  const [marketData, btcData, defiLlamaProtocols, fearGreedData, btcMarketChart, blueChipsData] = await Promise.all([
    fetchMarketData(ids),
    fetchBtcData(),
    fetchDefiLlamaProtocols(),
    fetchFearGreedIndex(),
    fetchMarketChart("bitcoin"),
    fetchBlueChips(),
  ]);
  const macroPulse = await buildMacroPulse({ btcData });
  
  const btc = {
    price_change_24h: num(btcData?.price_change_percentage_24h_in_currency),
    price_change_7d: num(btcData?.price_change_percentage_7d_in_currency),
    price_change_30d: num(btcData?.price_change_percentage_30d_in_currency),
  };
  
  // Calculate BTC moving averages and detect market condition
  const btcMAs = calculateBTCMovingAverages(btcMarketChart);
  const marketCondition = detectMarketCondition(fearGreedData, btcData, btcMAs);
  const portfolioGuidance = buildPortfolioGuidance(
    marketCondition?.market_phase || "neutral"
  );
  
  // Analyze blue chips for dip opportunities
  const blueChipOpportunities = analyzeBlueChipsForDips(blueChipsData, fearGreedData);
  await enrichBlueChipOpportunitiesWithNews(blueChipOpportunities, 5);
  console.log(`Blue Chip Scanner: ${blueChipOpportunities.scanned_count} top cryptos scanned, ${blueChipOpportunities.opportunities.length} dip opportunities found`);
  
  // Will be populated after coins are processed
  let playRecommendations = null;
  
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
    news: "NONE",
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
    const technicalSignals = getTechnicalSignals(marketChart, num(market?.current_price));
    const volume24h = num(market?.total_volume);
    const volumeBaseline = volumeStats.avg7d ?? volumeStats.avg30d;
    const volumeBaselineWindow = volumeStats.avg7d ? "7d" : volumeStats.avg30d ? "30d" : null;
    const volumeRatio =
      volume24h !== null && volumeBaseline !== null && volumeBaseline > 0
        ? volume24h / volumeBaseline
        : null;
    let volumeTrend = null;
    if (volumeRatio !== null) {
      if (volumeRatio >= 2) {
        volumeTrend = "spike";
      } else if (volumeRatio >= 1.1) {
        volumeTrend = "above_baseline";
      } else if (volumeRatio <= 0.7) {
        volumeTrend = "below_baseline";
      } else {
        volumeTrend = "normal";
      }
    }

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
    
    const githubRepo = extractGitHubRepo(coin.urls?.github);
    const [tvlData, unlockData, devData, githubReleases, rssItems, githubActivity, newsSentiment] = await Promise.all([
      defiLlamaSlug ? fetchDefiLlamaTVL(defiLlamaSlug) : Promise.resolve(null),
      defiLlamaSlug ? fetchDefiLlamaUnlocks(defiLlamaSlug) : Promise.resolve(null),
      coin.coinGeckoId ? fetchCoinGeckoDeveloperData(coin.coinGeckoId) : Promise.resolve(null),
      githubRepo ? fetchGitHubReleases(githubRepo.owner, githubRepo.repo) : Promise.resolve([]),
      rssUrl ? fetchRSSFeed(rssUrl) : Promise.resolve([]),
      githubRepo ? fetchGitHubRepoActivity(githubRepo.owner, githubRepo.repo) : Promise.resolve(null),
      fetchNewsSentiment(coin.symbol, coin.coinGeckoId),
    ]);
    const newsSummary = evaluateNewsMomentum(newsSentiment);

    // Evaluate holder concentration
    const supplyForConcentration =
      dilution.totalSupply !== null && dilution.totalSupply > 0
        ? dilution.totalSupply
        : dilution.circulating !== null && dilution.circulating > 0
          ? dilution.circulating
          : null;
    const holderInfo = await analyzeHolderConcentration({
      holdersData,
      contractInfo,
      supplyFallbackTokens: supplyForConcentration,
      addressBook,
    });
    const onchainDetails = holderInfo.onchain;
    
    // Small delay to avoid rate limiting
    await sleep(200);

    // Evaluate unlocks (now with dilution fallback)
    const unlockInfo = evaluateUnlocks(
      unlockData, 
      dilution.marketCap, 
      dilution.circulating,
      dilution.totalSupply,
      num(market?.max_supply)
    );
    
    // Update data sources tracking
    if (tvlData && dataSources.tvl === "NONE") dataSources.tvl = "DefiLlama";
    if (unlockInfo.unlock_source && dataSources.unlocks === "NONE") {
      dataSources.unlocks = unlockInfo.unlock_source === "DefiLlama" 
        ? "DefiLlama" 
        : "Supply Ratio";
    }
    if (devData && dataSources.developer_data === "NONE") dataSources.developer_data = "CoinGecko";
    if (githubActivity && dataSources.developer_data === "CoinGecko") {
      dataSources.developer_data = "CoinGecko+GitHub";
    } else if (githubActivity && dataSources.developer_data === "NONE") {
      dataSources.developer_data = "GitHub";
    }
    if (newsSentiment && dataSources.news === "NONE") {
      dataSources.news = newsSentiment.source || "CryptoPanic";
    }
    if ((githubReleases.length > 0 || rssItems.length > 0) && dataSources.catalysts === "NONE") {
      dataSources.catalysts = githubReleases.length > 0 ? "GitHub" : "RSS";
    }
    if (holdersData && dataSources.onchain === "NONE") {
      dataSources.onchain = formatOnChainSource(holdersData?.source);
    }
    
    // Evaluate traction (now uses GitHub activity as primary source)
    const tractionInfo = evaluateTraction(tvlData, devData, githubActivity);
    
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
      volume_ratio: volumeRatio,
      volume_trend: volumeTrend,
      volume_note: "Total volume used; spot/perps split unknown.",
      clean_catalyst: catalystInfo.clean_catalyst,
      catalyst_sources: catalystInfo.catalyst_sources,
      catalyst_checked: catalystInfo.catalyst_checked,
      has_clean_catalyst: hasCleanCatalyst,
      unlock_confidence: unlockInfo.unlock_confidence,
      unlock_source: unlockInfo.unlock_source || null,
      unlock_next_30d: unlockInfo.unlock_next_30d,
      unlock_next_30d_value: unlockInfo.unlock_next_30d_value,
      unlock_next_30d_percent: unlockInfo.unlock_next_30d_percent,
      unlock_risk_flag: unlockInfo.unlock_risk_flag,
      locked_percent: unlockInfo.locked_percent || null,
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
      // GitHub repo activity (direct from GitHub API)
      github_last_commit: githubActivity?.last_commit || null,
      github_last_commit_days: daysSince(githubActivity?.last_commit),
      github_last_commit_message: githubActivity?.last_commit_message || null,
      github_stars: githubActivity?.stars || null,
      github_archived: githubActivity?.archived || false,
      github_stale: (() => {
        const days = daysSince(githubActivity?.last_commit);
        return days !== null && days > 180; // Stale if no commits in 6 months
      })(),
      github_active: (() => {
        const days = daysSince(githubActivity?.last_commit);
        return days !== null && days <= 30; // Active if commits in last 30 days
      })(),
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
      traction_source: tractionInfo.traction_source,
      top_10_holder_percent: holderInfo.top_10_holder_percent,
      top_20_holder_percent: holderInfo.top_20_holder_percent,
      top_10_wallet_percent: holderInfo.top_10_wallet_percent,
      top_10_exchange_percent: holderInfo.top_10_exchange_percent,
      top_10_contract_percent: holderInfo.top_10_contract_percent,
      high_concentration_risk: holderInfo.high_concentration_risk,
      holder_concentration_level: holderInfo.holder_concentration_level,
      holder_confidence: holderInfo.holder_confidence,
      holder_concentration_summary: holderInfo.holder_concentration_summary,
      onchain: onchainDetails,
      // Technical entry signals
      rsi_14d: technicalSignals.rsi_14d,
      rsi_signal: technicalSignals.rsi_signal,
      high_30d: technicalSignals.high_30d,
      low_30d: technicalSignals.low_30d,
      distance_from_high: technicalSignals.distance_from_high,
      distance_from_low: technicalSignals.distance_from_low,
      entry_signal: technicalSignals.entry_signal,
      entry_score: technicalSignals.entry_score,
      // News sentiment
      news_count_24h: newsSentiment?.news_count_24h || 0,
      news_count_7d: newsSentiment?.news_count_7d || 0,
      news_sentiment: newsSentiment?.sentiment || "unknown",
      news_sentiment_score: newsSentiment?.sentiment_score || null,
      news_signal: newsSentiment?.news_signal || "quiet",
      news_headlines: newsSentiment?.headlines?.slice(0, 3) || [],
      news_source: newsSentiment?.source || null,
      news_fetched_at: newsSentiment?.fetched_at || null,
      news_activity: newsSummary.activity_label,
      news_momentum_score: newsSummary.momentum_score,
      news_is_viral: newsSummary.is_viral,
      // Take-profit tracking
      take_profit: calculateTakeProfitStatus(coin.symbol, num(market?.current_price), portfolio),
      // DeFi knowledge (from DeFi scan if matched)
      ...(() => {
        const defiProto = matchDefiProtocol(coin, defiKnowledge);
        return extractDefiData(defiProto) || { defi_matched: false };
      })(),
    };

    const gates = evaluateGates(coinReport);
    const label = decideLabel(coinReport, gates, ruleConfidence);
    const gatesFailed = Object.entries(gates)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    coinReport.hygiene_label = label;
    coinReport.gates_failed = gatesFailed;
    coinReport.gates = gates;
    coinReport.explain = buildCoinExplain({
      coin: coinReport,
      marketPhase: marketCondition?.market_phase || "neutral",
      ruleEffectiveness,
    });

    coins.push(coinReport);
    
    // Progress logging
    const progress = ((coins.length / watchlist.length) * 100).toFixed(0);
    if (coins.length % 3 === 0 || coins.length === watchlist.length) {
      console.log(`Progress: ${coins.length}/${watchlist.length} (${progress}%) - ${coin.symbol}: ${coinReport.hygiene_label}`);
    }
  }

  const ranking = rankCoins(coins);
  const actionableToday = coins.some((coin) => coin.hygiene_label === "KEEP");

  const warnings = [...preScanWarnings];
  if (dataSources.unlocks === "NONE") {
    warnings.push("Some coins missing unlock data; actionability may be blocked.");
  }
  if (dataSources.catalysts === "NONE") {
    warnings.push("Some coins missing catalyst data.");
  }
  
  // Generate play recommendations based on market condition + coin data
  playRecommendations = generatePlayRecommendations(coins, marketCondition);
  
  // Generate best entries ranking
  const bestEntries = generateBestEntries(coins, marketCondition);
  console.log(`Best Entries: ${bestEntries.best_entries.length} top opportunities found`);

  const dataFreshness = {
    scan_generated_at: new Date().toISOString(),
    fear_greed_fetched_at: fearGreedData?.fetched_at || null,
    macro_pulse_generated_at: macroPulse?.generated_at || null,
    defi_generated_at: defiLatestInfo?.generated_at || null,
    defi_age_hours: typeof defiLatestInfo?.age_hours === "number" ? defiLatestInfo.age_hours : null,
    cache_ttl_minutes: CACHE_TTL_MINUTES,
  };

  const layer1Report = {
    generated_at: dataFreshness.scan_generated_at,
    data_sources: {
      ...dataSources,
      volume_note: "Total volume used as proxy for spot volume.",
    },
    data_freshness: dataFreshness,
    rule_confidence: ruleConfidence,
    portfolio_guidance: portfolioGuidance,
    btc_reference: {
      price_change_24h: btc.price_change_24h,
      price_change_7d: btc.price_change_7d,
      price_change_30d: btc.price_change_30d,
    },
    // Market condition for accumulation/run alerts
    market_condition: {
      fear_greed: fearGreedData,
      btc_moving_averages: btcMAs,
      signals: marketCondition,
    },
    // Actionable recommendations based on market + coins
    play_recommendations: playRecommendations,
    // Best entries today (ranked by entry signal strength)
    best_entries: bestEntries,
    // Blue chip dip opportunities (top cryptos by market cap)
    blue_chip_opportunities: blueChipOpportunities,
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

  try {
    fs.writeFileSync(
      MACRO_PULSE_JSON_PATH,
      JSON.stringify(macroPulse, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      MACRO_PULSE_MD_PATH,
      renderMacroPulseMarkdown(macroPulse),
      "utf8"
    );
  } catch (err) {
    console.warn(`Macro Pulse write failed: ${err.message}`);
  }

  const previousLayer1Report = loadPreviousLayer1Report();
  const diffReport = buildDiffReport(previousLayer1Report, layer1Report);
  if (diffReport) {
    const diffPath = path.join(REPORTS_DIR, "DiffReport.json");
    fs.writeFileSync(diffPath, JSON.stringify(diffReport, null, 2), "utf8");
  }

  let backtestStats = null;
  let funnelStats = null;
  try {
    const backtestResult = await runBacktest(layer1Report);
    backtestStats = backtestResult?.stats || null;
    funnelStats = backtestResult?.funnelStats || null;
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

  let defiLatest = defiLatestInfo?.data || null;
  if (!defiLatest) {
    try {
      const defiLatestPath = path.join(REPORTS_DIR, "defi", "Latest.json");
      if (fs.existsSync(defiLatestPath)) {
        defiLatest = JSON.parse(fs.readFileSync(defiLatestPath, "utf8"));
      }
    } catch {
      defiLatest = null;
    }
  }

  function parseEnvNumber(name, fallbackValue) {
    if (process.env[name] === undefined) return fallbackValue;
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) ? parsed : null;
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
      macroPulse,
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
      funnelStats,
      macroPulse,
    });
    fs.writeFileSync(DASHBOARD_PATH, dashboardHtml, "utf8");
  } catch (err) {
    console.warn(`Dashboard render failed: ${err.message}`);
  }

  const summary = buildSummary(
    layer1Report,
    supervisorResult,
    diffReport,
    alertsReport,
    macroPulse
  );
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
