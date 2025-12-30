// Coin Discovery Module
// Finds trending/new coins that meet criteria for potential watchlist addition

const fs = require("fs");
const path = require("path");

// Load environment
const ENV_PATH = path.join(__dirname, "..", ".env");
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
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
const CONFIG_DIR = path.join(__dirname, "..", "config");
const WATCHLIST_PATH = path.join(CONFIG_DIR, "watchlist.json");
const STAGING_WATCHLIST_PATH = path.join(CONFIG_DIR, "watchlist_staging.json");
const DISCOVERY_QUEUE_PATH = path.join(CONFIG_DIR, "discovery_queue.json");
const AUTO_STAGE_IGNORE_PATH = path.join(CONFIG_DIR, "auto_stage_ignore.json");

const CACHE_TTL_MINUTES = 60; // Shorter cache for discovery (1 hour)
const CACHE_TTL_MS = CACHE_TTL_MINUTES * 60 * 1000;

const DISCOVER_MARKET_PAGES = Number(process.env.DISCOVER_MARKET_PAGES || 5);

const AUTO_STAGE_DISCOVERY = process.env.AUTO_STAGE_DISCOVERY === "1";
const AUTO_STAGE_LIMIT = clamp(envNumber("AUTO_STAGE_LIMIT", 2), 0, 10);
const AUTO_STAGE_DISCOVERY_SCORE_MIN = envNumber(
  "AUTO_STAGE_DISCOVERY_SCORE_MIN",
  90
);
const AUTO_STAGE_VOLUME_24H_MIN = envNumber("AUTO_STAGE_VOLUME_24H_MIN", 10_000_000);
const AUTO_STAGE_VOL_TO_MCAP_MIN = envNumber("AUTO_STAGE_VOL_TO_MCAP_MIN", 0.05);
const AUTO_STAGE_PRICE_CHANGE_7D_MAX = envNumber(
  "AUTO_STAGE_PRICE_CHANGE_7D_MAX",
  60
);
const AUTO_STAGE_MAX_TOTAL = clamp(envNumber("AUTO_STAGE_MAX_TOTAL", 25), 0, 500);

const KNOWN_STABLE_IDS = new Set(
  [
    "tether",
    "usd-coin",
    "dai",
    "usdd",
    "true-usd",
    "pax-dollar",
    "paxos-standard",
    "frax",
    "first-digital-usd",
    "paypal-usd",
    "gemini-dollar",
    "liquity-usd",
    "terrausd",
    "euro-coin",
    "tether-eurt",
  ].map((id) => id.toLowerCase())
);

const STABLE_TEXT_RE =
  /(?:^|[^a-z0-9])(usd|usdt|usdc|dai|tusd|usdd|busd|usdp|pax|gusd|susd|frax|lusd|eurt|eurs|eur|gbp|jpy)(?:$|[^a-z0-9])/i;
const STABLE_NAME_RE =
  /(stablecoin|stable coin|usd|us dollar|dollar|usdt|usdc|euro|gbp)/i;

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
  if (!Number.isFinite(value)) return "n/a";
  const digits = Math.abs(value) >= 1 ? 2 : 6;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) return "n/a";
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
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > CACHE_TTL_MS) return null;
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
        return "CoinGecko API key missing. Set COINGECKO_API_KEY and verify COINGECKO_API_KEY_HEADER/COINGECKO_API_KEY_IN_QUERY.";
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
  const headers = { accept: "application/json", ...(options.headers || {}) };

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

// Get trending coins
async function fetchTrendingCoins() {
  const cachePath = path.join(CACHE_DIR, "trending_coins.json");
  const cached = readCache(cachePath);
  if (cached) return cached;
  
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
    console.warn(`Trending fetch failed: ${err.message}`);
    return [];
  }
}

// Discover coins by criteria
async function discoverCoinsByCriteria(options = {}) {
  const {
    minVolume24h = 5_000_000,
    maxMarketCap = 5_000_000_000,
    minMarketCap = 10_000_000,
    minPriceChange7d = 5,
    maxPriceChange7d = 100,
    limit = 50,
    pages = DISCOVER_MARKET_PAGES,
  } = options;

  const cacheKey =
    `discovery_${minVolume24h}_${minMarketCap}_${maxMarketCap}` +
    `_${minPriceChange7d}_${maxPriceChange7d}_${limit}_${pages}`;
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  const cached = readCache(cachePath);
  if (cached) return cached;

  try {
    const safePages =
      Number.isFinite(pages) && pages > 0 ? Math.min(pages, 20) : 1;
    const all = [];
    for (let page = 1; page <= safePages; page++) {
      const url = `${BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
        `&order=market_cap_desc&per_page=250&page=${page}` +
        `&price_change_percentage=24h,7d,30d&sparkline=false`;

      const data = await fetchJson(url);
      if (Array.isArray(data)) {
        all.push(...data);
      }
      if (page < safePages) {
        await sleep(1250);
      }
    }

    const discovered = all
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
    console.warn(`Discovery failed: ${err.message}`);
    return [];
  }
}

function isLikelyStablecoin(coin) {
  if (!coin) return false;
  const id = String(coin.id || "").toLowerCase();
  const symbol = String(coin.symbol || "").toLowerCase();
  const name = String(coin.name || "").toLowerCase();
  if (KNOWN_STABLE_IDS.has(id)) return true;
  if (STABLE_TEXT_RE.test(id) || STABLE_TEXT_RE.test(symbol)) return true;
  return STABLE_NAME_RE.test(name);
}

function meetsQualityGates(coin, gates) {
  const volume24h = num(coin.total_volume);
  const marketCap = num(coin.market_cap);
  const priceChange7d = num(coin.price_change_percentage_7d_in_currency);

  if (volume24h === null || marketCap === null || priceChange7d === null) return false;
  if (volume24h < gates.minVolume24h) return false;
  if (marketCap < gates.minMarketCap) return false;
  if (marketCap > gates.maxMarketCap) return false;
  if (priceChange7d < gates.minPriceChange7d) return false;
  if (priceChange7d > gates.maxPriceChange7d) return false;
  return true;
}

function computeDiscoveryScore(coin, gates, meta) {
  const volume24h = num(coin.total_volume);
  const marketCap = num(coin.market_cap);
  const priceChange7d = num(coin.price_change_percentage_7d_in_currency);

  if (volume24h === null || marketCap === null || priceChange7d === null) return 0;
  const volToMcap = marketCap > 0 ? volume24h / marketCap : null;

  const momentum = clamp(
    (priceChange7d - gates.minPriceChange7d) /
      (gates.maxPriceChange7d - gates.minPriceChange7d),
    0,
    1
  );
  const momentumScore = momentum * 40;

  const liquidity = clamp(
    Math.log10(volume24h + 1) / Math.log10(5_000_000_000 + 1),
    0,
    1
  );
  const liquidityScore = liquidity * 25;

  const turnover = volToMcap === null ? 0 : clamp(volToMcap / 0.2, 0, 1);
  const turnoverScore = turnover * 20;

  const minLog = Math.log10(gates.minMarketCap);
  const maxLog = Math.log10(gates.maxMarketCap);
  const sizeV = clamp(
    (Math.log10(marketCap) - minLog) / (maxLog - minLog),
    0,
    1
  );
  const sizeScore = (1 - sizeV) * 15;

  const trendBonus =
    meta?.trending_rank && meta.trending_total
      ? (1 - (meta.trending_rank - 1) / Math.max(1, meta.trending_total - 1)) *
        10
      : 0;

  return clamp(
    momentumScore + liquidityScore + turnoverScore + sizeScore + trendBonus,
    0,
    100
  );
}

function isEligibleForAutoStage(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const score = num(candidate.discovery_score);
  if (score === null || score < AUTO_STAGE_DISCOVERY_SCORE_MIN) return false;

  const volume24h = num(candidate.total_volume);
  if (volume24h === null || volume24h < AUTO_STAGE_VOLUME_24H_MIN) return false;

  const volToMcap = num(candidate.volume_to_mcap);
  if (volToMcap === null || volToMcap < AUTO_STAGE_VOL_TO_MCAP_MIN) return false;

  const priceChange7d = num(candidate.price_change_percentage_7d);
  if (
    priceChange7d === null ||
    priceChange7d > AUTO_STAGE_PRICE_CHANGE_7D_MAX
  ) {
    return false;
  }

  return true;
}

function autoStageCandidates({ candidates, queueById, generatedAt }) {
  if (!AUTO_STAGE_DISCOVERY) {
    return { staged: [], skipped_reason: "disabled" };
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { staged: [], skipped_reason: "no_candidates" };
  }

  const existingAutoStaged = Array.from(queueById.values()).filter(
    (entry) =>
      entry &&
      entry.status === "STAGED" &&
      (entry.staged_source || "manual") === "auto"
  ).length;

  const remainingCapacity = Math.max(0, AUTO_STAGE_MAX_TOTAL - existingAutoStaged);
  const targetCount = Math.min(AUTO_STAGE_LIMIT, remainingCapacity);
  if (targetCount <= 0) {
    return { staged: [], skipped_reason: "at_capacity" };
  }

  const staged = [];
  for (const candidate of candidates) {
    if (staged.length >= targetCount) break;
    if (!isEligibleForAutoStage(candidate)) continue;

    const idLower = normalizeCoinGeckoId(candidate.id);
    if (!idLower) continue;

    const entry = queueById.get(idLower);
    if (!entry) continue;

    const status = entry.status || "";
    if (status === "IGNORED" || status === "PROMOTED") continue;
    if (status === "STAGED") continue;

    entry.status = "STAGED";
    entry.staged_source = "auto";
    entry.staged_at = entry.staged_at || generatedAt;
    entry.auto_staged = true;

    staged.push({
      coinGeckoId: entry.coinGeckoId || entry.id || candidate.id,
      symbol: entry.symbol || candidate.symbol,
      name: entry.name || candidate.name,
      discovery_score: entry.discovery_score ?? candidate.discovery_score ?? null,
    });
  }

  return { staged, skipped_reason: staged.length ? null : "no_eligible" };
}

async function main() {
  ensureDir(REPORTS_DIR);
  ensureDir(CACHE_DIR);
  ensureDir(CONFIG_DIR);

  console.log("🔍 Discovering trending and new coins...\n");

  // Load existing watchlists + queue to avoid re-suggesting ignored/promoted items.
  const watchlist = readJsonFile(WATCHLIST_PATH, []);
  const stagingWatchlist = readJsonFile(STAGING_WATCHLIST_PATH, []);
  const autoStageIgnoreRaw = readJsonFile(AUTO_STAGE_IGNORE_PATH, []);
  const autoStageIgnoreIds = new Set(
    (Array.isArray(autoStageIgnoreRaw) ? autoStageIgnoreRaw : [])
      .map((id) => normalizeCoinGeckoId(id))
      .filter(Boolean)
  );
  const watchlistIds = new Set(
    watchlist.map((c) => normalizeCoinGeckoId(c?.coinGeckoId)).filter(Boolean)
  );
  const stagingIds = new Set(
    stagingWatchlist
      .map((c) => normalizeCoinGeckoId(c?.coinGeckoId))
      .filter(Boolean)
  );

  const existingQueue = readJsonFile(DISCOVERY_QUEUE_PATH, null);
  const existingQueueCandidates = Array.isArray(existingQueue?.candidates)
    ? existingQueue.candidates
    : [];
  const queueById = new Map();
  for (const entry of existingQueueCandidates) {
    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId || entry?.id);
    if (!idLower) continue;
    queueById.set(idLower, entry);
  }
  const suppressedByQueue = new Set();
  for (const entry of existingQueueCandidates) {
    const status = entry?.status;
    if (status !== "IGNORED" && status !== "PROMOTED") continue;
    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId || entry?.id);
    if (idLower) suppressedByQueue.add(idLower);
  }
  for (const idLower of autoStageIgnoreIds) {
    suppressedByQueue.add(idLower);
  }

  const gates = {
    minVolume24h: 5_000_000,
    minMarketCap: 10_000_000,
    maxMarketCap: 5_000_000_000,
    minPriceChange7d: 5,
    maxPriceChange7d: 100,
  };

  // Fetch trending coins
  console.log("📈 Fetching trending coins...");
  const trending = await fetchTrendingCoins();
  console.log(`Found ${trending.length} trending coins`);

  // Discover coins by criteria
  console.log("\n🔎 Discovering coins by criteria...");
  console.log("  Criteria: $5M+ volume, $10M-$5B market cap, +5% to +100% (7d)");
  const discovered = await discoverCoinsByCriteria({
    ...gates,
    limit: 50,
    pages: DISCOVER_MARKET_PAGES,
  });
  console.log(`Found ${discovered.length} coins meeting criteria`);

  // Fetch market data for trending coins
  const trendingIds = trending.map((c) => c.id).filter(Boolean);
  let trendingMarketData = [];
  if (trendingIds.length > 0) {
    try {
      const url = `${BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
        `&ids=${trendingIds.join(",")}` +
        `&price_change_percentage=24h,7d,30d&sparkline=false&per_page=250`;
      trendingMarketData = await fetchJson(url);
    } catch (err) {
      console.warn(`Failed to fetch market data for trending: ${err.message}`);
    }
  }
  const trendingMarketMap = new Map(trendingMarketData.map((c) => [c.id.toLowerCase(), c]));

  // Combine and deduplicate
  const allCandidates = new Map();
  
  const trendingTotal = trending.length;
  for (let idx = 0; idx < trending.length; idx++) {
    const coin = trending[idx];
    if (!coin?.id) continue;
    const idLower = coin.id.toLowerCase();
    if (watchlistIds.has(idLower)) continue;
    if (suppressedByQueue.has(idLower)) continue;
    const marketData = trendingMarketMap.get(idLower);
    if (!marketData) continue;
    if (isLikelyStablecoin(marketData)) continue;
    if (!meetsQualityGates(marketData, gates)) continue;

    allCandidates.set(idLower, {
      id: marketData.id,
      symbol: marketData.symbol,
      name: marketData.name,
      current_price: num(marketData.current_price),
      market_cap: num(marketData.market_cap),
      total_volume: num(marketData.total_volume),
      price_change_percentage_24h: num(marketData.price_change_percentage_24h_in_currency),
      price_change_percentage_7d: num(marketData.price_change_percentage_7d_in_currency),
      price_change_percentage_30d: num(marketData.price_change_percentage_30d_in_currency),
      market_cap_rank: marketData.market_cap_rank ?? coin.market_cap_rank ?? null,
      source: "trending",
      trending_rank: idx + 1,
      trending_total: trendingTotal,
    });
  }

  for (const coin of discovered) {
    if (!coin?.id) continue;
    const idLower = coin.id.toLowerCase();
    if (watchlistIds.has(idLower)) continue;
    if (suppressedByQueue.has(idLower)) continue;
    if (isLikelyStablecoin(coin)) continue;

    const existing = allCandidates.get(idLower);
    if (existing) {
      existing.source = "trending+criteria";
    } else {
      allCandidates.set(idLower, {
        ...coin,
        source: "criteria",
        trending_rank: null,
        trending_total: null,
      });
    }
  }

  const candidates = Array.from(allCandidates.values())
    .map((c) => {
      const score = computeDiscoveryScore(
        {
          total_volume: c.total_volume,
          market_cap: c.market_cap,
          price_change_percentage_7d_in_currency: c.price_change_percentage_7d,
        },
        gates,
        { trending_rank: c.trending_rank, trending_total: c.trending_total }
      );
      const volToMcap =
        c.market_cap !== null && c.total_volume !== null && c.market_cap > 0
          ? c.total_volume / c.market_cap
          : null;
      return { ...c, discovery_score: score, volume_to_mcap: volToMcap };
    })
    .sort((a, b) => (b.discovery_score || 0) - (a.discovery_score || 0))
    .slice(0, 20); // Top 20 candidates

  console.log(`\n✅ Found ${candidates.length} potential watchlist additions\n`);

  const generatedAt = new Date().toISOString();
  const criteria = {
    min_volume_24h: "$5M",
    min_market_cap: "$10M",
    max_market_cap: "$5B",
    price_change_7d_range: "+5% to +100%",
    excluded: "stablecoins/pegged assets",
    market_pages_scanned: DISCOVER_MARKET_PAGES,
  };

  // Sync queue statuses to reflect current watchlists.
  for (const [idLower, entry] of queueById.entries()) {
    if (watchlistIds.has(idLower)) {
      entry.status = "PROMOTED";
      delete entry.staged_source;
      delete entry.staged_at;
      delete entry.auto_staged;
    } else if (stagingIds.has(idLower)) {
      entry.status = "STAGED";
      if ((entry.staged_source || "manual") !== "auto") {
        entry.staged_source = "manual";
        entry.staged_at = entry.staged_at || generatedAt;
      }
    } else if (entry.status === "STAGED" && (entry.staged_source || "manual") !== "auto") {
      entry.status = "NEW";
      delete entry.staged_source;
      delete entry.staged_at;
    }
    if (!entry.coinGeckoId && entry.id) {
      entry.coinGeckoId = entry.id;
    }
    if (entry.notes === undefined) {
      entry.notes = "";
    }
  }

  // Upsert queue entries for this run so we keep context and state.
  for (const c of candidates) {
    const idLower = normalizeCoinGeckoId(c?.id);
    if (!idLower) continue;
    const existing = queueById.get(idLower);
    if (existing) {
      existing.symbol = c.symbol;
      existing.name = c.name;
      existing.discovery_score = c.discovery_score;
      existing.market_cap = c.market_cap;
      existing.volume_24h = c.total_volume;
      existing.volume_to_mcap = c.volume_to_mcap;
      existing.price_change_7d = c.price_change_percentage_7d;
      existing.market_cap_rank = c.market_cap_rank;
      existing.source = c.source;
      existing.last_seen_at = generatedAt;
      if (!existing.first_seen_at) {
        existing.first_seen_at = generatedAt;
      }
      if (!existing.status) {
        existing.status = stagingIds.has(idLower) ? "STAGED" : "NEW";
      }
      if (existing.status === "NEW" && stagingIds.has(idLower)) {
        existing.status = "STAGED";
      }
    } else {
      queueById.set(idLower, {
        coinGeckoId: c.id,
        symbol: c.symbol,
        name: c.name,
        discovery_score: c.discovery_score,
        market_cap: c.market_cap,
        volume_24h: c.total_volume,
        volume_to_mcap: c.volume_to_mcap,
        price_change_7d: c.price_change_percentage_7d,
        market_cap_rank: c.market_cap_rank,
        source: c.source,
        status: stagingIds.has(idLower) ? "STAGED" : "NEW",
        staged_source: stagingIds.has(idLower) ? "manual" : undefined,
        staged_at: stagingIds.has(idLower) ? generatedAt : undefined,
        notes: "",
        first_seen_at: generatedAt,
        last_seen_at: generatedAt,
      });
    }
  }

  const autoStageResult = autoStageCandidates({
    candidates,
    queueById,
    generatedAt,
  });
  if (autoStageResult.staged.length > 0) {
    console.log(`\nAuto-staged ${autoStageResult.staged.length} discovery coins:`);
    for (const item of autoStageResult.staged) {
      const score =
        typeof item.discovery_score === "number" && Number.isFinite(item.discovery_score)
          ? item.discovery_score.toFixed(1)
          : "n/a";
      console.log(`- ${item.coinGeckoId} | ${item.symbol || "n/a"} | ${item.name || "n/a"} | score=${score}`);
    }
  } else if (AUTO_STAGE_DISCOVERY && autoStageResult.skipped_reason) {
    console.log(`\nAuto-stage: ${autoStageResult.skipped_reason} (0 coins staged).`);
  }

  const updatedQueue = {
    schema_version: 1,
    generated_at: generatedAt,
    criteria,
    candidates: Array.from(queueById.values()).sort(
      (a, b) => (b.discovery_score || 0) - (a.discovery_score || 0)
    ),
  };
  writeJsonFile(DISCOVERY_QUEUE_PATH, updatedQueue);

  // Generate report
  const report = {
    generated_at: generatedAt,
    total_candidates: candidates.length,
    criteria,
    candidates: candidates.map((c) => {
      const idLower = normalizeCoinGeckoId(c.id);
      const queueEntry = queueById.get(idLower);
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        price: c.current_price,
        market_cap: c.market_cap,
        volume_24h: c.total_volume,
        volume_to_mcap: c.volume_to_mcap,
        price_change_7d: c.price_change_percentage_7d,
        market_cap_rank: c.market_cap_rank,
        source: c.source,
        discovery_score: c.discovery_score,
        status: queueEntry?.status || (stagingIds.has(idLower) ? "STAGED" : "NEW"),
        first_seen_at: queueEntry?.first_seen_at || null,
        last_seen_at: queueEntry?.last_seen_at || null,
      };
    }),
  };

  // Save report
  const reportPath = path.join(REPORTS_DIR, "DiscoveryReport.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // Generate markdown summary
  let md = "# Coin Discovery Report\n\n";
  md += `Generated: ${new Date(report.generated_at).toLocaleString()}\n\n`;
  md += `Found **${candidates.length}** potential watchlist additions\n\n`;
  md += "Filters:\n";
  md += `- Excludes stablecoins/pegged assets\n`;
  md += `- Volume >= ${formatUsd(gates.minVolume24h)} (24h)\n`;
  md += `- Market cap ${formatUsd(gates.minMarketCap)}-${formatUsd(gates.maxMarketCap)}\n`;
  md += `- 7d change ${gates.minPriceChange7d}% to ${gates.maxPriceChange7d}%\n`;
  md += `- Scanned ${DISCOVER_MARKET_PAGES} CoinGecko market pages\n\n`;

  md += "## Top Candidates\n\n";
  md += "| Rank | Status | Score | Symbol | Name | Price | Market Cap | Vol 24h | Vol/MCap | 7d | Source |\n";
  md += "|------|--------|-------|--------|------|-------|------------|---------|----------|----|--------|\n";

  candidates.slice(0, 10).forEach((c, idx) => {
    const volToMcapPct =
      typeof c.volume_to_mcap === "number"
        ? formatPct(c.volume_to_mcap * 100, 1).replace(/^\+/, "")
        : "n/a";
    const status =
      queueById.get(normalizeCoinGeckoId(c.id))?.status ||
      (stagingIds.has(normalizeCoinGeckoId(c.id)) ? "STAGED" : "NEW");
    md += `| ${idx + 1} | ${status} | ${c.discovery_score.toFixed(1)} | ${c.symbol} | ${c.name} | ${formatUsd(c.current_price)} | ${formatUsd(c.market_cap)} | ${formatUsd(c.total_volume)} | ${volToMcapPct} | ${formatPct(c.price_change_percentage_7d, 1)} | ${c.source} |\n`;
  });

  md += "\n## What to Do Next (Staging Workflow)\n\n";
  md += "Use discovery → staging → promote so you can scan new coins without polluting your main watchlist.\n\n";
  md += "1. List candidates (NEW/STAGED):\n";
  md += "   `node src/promote_discovery.js list`\n";
  md += "2. Stage one or more coins (adds to `config/watchlist_staging.json`):\n";
  md += `   \`node src/promote_discovery.js stage ${candidates[0]?.id || "coin-id"}\`\n`;
  md += "3. Run the scanner (it scans main + staging):\n";
  md += "   `node src/index.js`\n";
  md += "4. If it looks good, promote into your main watchlist:\n";
  md += `   \`node src/promote_discovery.js promote ${candidates[0]?.id || "coin-id"}\`\n`;
  md += "5. If it's junk, ignore it so it won't be suggested again:\n";
  md += `   \`node src/promote_discovery.js ignore ${candidates[0]?.id || "coin-id"}\`\n`;

  const mdPath = path.join(REPORTS_DIR, "DiscoveryReport.md");
  fs.writeFileSync(mdPath, md, "utf8");

  // Archive this run so new runs don't overwrite context/history.
  const runId = isoToFilename(report.generated_at);
  const historyDir = path.join(REPORTS_DIR, "history", "discovery");
  ensureDir(historyDir);
  fs.writeFileSync(
    path.join(historyDir, `${runId}_DiscoveryReport.json`),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(historyDir, `${runId}_DiscoveryReport.md`),
    md,
    "utf8"
  );

  console.log("📊 Report saved:");
  console.log(`   ${reportPath}`);
  console.log(`   ${mdPath}\n`);

  // Display top candidates
  console.log("🏆 Top 10 Candidates:\n");
  candidates.slice(0, 10).forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.symbol} (${c.name})`);
    const volToMcapPct =
      typeof c.volume_to_mcap === "number"
        ? formatPct(c.volume_to_mcap * 100, 1).replace(/^\+/, "")
        : "n/a";
    console.log(
      `   Score: ${c.discovery_score.toFixed(1)} | 7d: ${formatPct(
        c.price_change_percentage_7d,
        1
      )} | Vol: ${formatUsd(c.total_volume)} | Vol/MCap: ${volToMcapPct}`
    );
    console.log(`   Source: ${c.source}\n`);
  });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exitCode = 1;
});

