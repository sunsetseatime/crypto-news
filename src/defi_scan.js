// DeFi Protocol Scanner (v1)
// Chains: Ethereum + Solana
// Output: Markdown report + per-run JSON snapshot (local-only)

const fs = require("fs");
const path = require("path");

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

const FOCUS_CHAINS = ["Ethereum", "Solana"];
const VS_CURRENCY = "usd";

// Optional on-chain token holder concentration (Ethereum only via Ethplorer)
const DEFI_ENABLE_ONCHAIN = (() => {
  if (process.env.DEFI_ENABLE_ONCHAIN === "0") {
    return false;
  }
  if (process.env.DEFI_ENABLE_ONCHAIN === "1") {
    return true;
  }
  return (
    Boolean(process.env.ETHERSCAN_API_KEY) ||
    Boolean(process.env.ETHPLORER_API_KEY) ||
    Boolean(process.env.COVALENT_API_KEY)
  );
})();
const ETHPLORER_API_KEY = process.env.ETHPLORER_API_KEY || "freekey";
const ETHPLORER_BASE_URL = "https://api.ethplorer.io";
let ethplorerLastCallAt = 0;

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

const COINGECKO_BASE_URL =
  process.env.COINGECKO_BASE_URL ||
  (COINGECKO_API_KEY
    ? COINGECKO_API_KEY.startsWith("CG-")
      ? DEFAULT_DEMO_BASE_URL
      : DEFAULT_PRO_BASE_URL
    : DEFAULT_DEMO_BASE_URL);

const ROOT_DIR = path.join(__dirname, "..");
const REPORTS_DIR = path.join(ROOT_DIR, "reports", "defi");
const REPORTS_MD_DIR = path.join(REPORTS_DIR, "reports");
const SNAPSHOTS_DIR = path.join(REPORTS_DIR, "snapshots");
const CACHE_DIR = path.join(REPORTS_DIR, "cache");

const CACHE_TTL_MINUTES = Number(process.env.DEFI_CACHE_TTL_MINUTES || 360);
const CACHE_TTL_MS =
  Number.isFinite(CACHE_TTL_MINUTES) && CACHE_TTL_MINUTES > 0
    ? CACHE_TTL_MINUTES * 60 * 1000
    : 360 * 60 * 1000;

const TVL_INCLUDE_MIN = Number(process.env.DEFI_TVL_INCLUDE_MIN || 10_000_000);
const TVL_WATCH_MIN = Number(process.env.DEFI_TVL_WATCH_MIN || 3_000_000);
const TVL_WATCH_MAX = Number(process.env.DEFI_TVL_WATCH_MAX || 10_000_000);
const WATCH_GROWTH_30D_MIN = Number(process.env.DEFI_WATCH_GROWTH_30D_MIN || 50);

const UNIVERSE_LIMIT = Number(process.env.DEFI_UNIVERSE_LIMIT || 120);
const WATCH_PREFILTER_7D_MIN = Number(
  process.env.DEFI_WATCH_PREFILTER_7D_MIN || 20
);
const WATCH_PREFILTER_LIMIT = Number(
  process.env.DEFI_WATCH_PREFILTER_LIMIT || 60
);
const TOP_DEV_FETCH_LIMIT = Number(process.env.DEFI_TOP_DEV_FETCH_LIMIT || 15);
const TOP_ONCHAIN_FETCH_LIMIT = Number(
  process.env.DEFI_TOP_ONCHAIN_FETCH_LIMIT || 10
);

const PROTOCOL_DETAIL_CONCURRENCY = Number(
  process.env.DEFI_PROTOCOL_DETAIL_CONCURRENCY || 6
);

const STABLECOIN_CATEGORY_RE = /(stable|cdp)/i;

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

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function formatUsd(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
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

function formatPct(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPctAbs(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(digits)}%`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchCoinGeckoCoinDetails(coinGeckoId) {
  if (!coinGeckoId) {
    return null;
  }
  const safeId = String(coinGeckoId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const cachePath = path.join(CACHE_DIR, `coingecko_coin_${safeId}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const url =
    `${COINGECKO_BASE_URL}/coins/${coinGeckoId}` +
    `?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
  const data = await fetchJson(url);
  writeCache(cachePath, data);
  return data || null;
}

function normalizeEvmAddress(address) {
  if (!address) {
    return null;
  }
  const value = String(address).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }
  if (value.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return value;
}

function extractEthereumContractAddress(coinDetails) {
  const detailPlatforms =
    coinDetails?.detail_platforms &&
    typeof coinDetails.detail_platforms === "object"
      ? coinDetails.detail_platforms
      : null;
  const platforms =
    coinDetails?.platforms && typeof coinDetails.platforms === "object"
      ? coinDetails.platforms
      : null;

  const fromDetail = normalizeEvmAddress(
    detailPlatforms?.ethereum?.contract_address
  );
  if (fromDetail) {
    return fromDetail;
  }
  const fromPlatforms = normalizeEvmAddress(platforms?.ethereum);
  if (fromPlatforms) {
    return fromPlatforms;
  }
  return null;
}

async function fetchEthplorerTopHolders(contractAddress, limit = 20) {
  const contract = normalizeEvmAddress(contractAddress);
  if (!contract) {
    return null;
  }

  const cachePath = path.join(
    CACHE_DIR,
    `ethplorer_holders_${contract.toLowerCase()}.json`
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

  const url =
    `${ETHPLORER_BASE_URL}/getTopTokenHolders/${contract}` +
    `?apiKey=${encodeURIComponent(String(ETHPLORER_API_KEY))}` +
    `&limit=${encodeURIComponent(limit)}`;
  const payload = await fetchJson(url, {}, 1);

  const holders = Array.isArray(payload?.holders) ? payload.holders : null;
  if (!holders || holders.length === 0) {
    return null;
  }

  const items = holders
    .slice(0, limit)
    .map((h, idx) => ({
      rank: idx + 1,
      address: h?.address || null,
      percent: num(h?.share),
    }))
    .filter((h) => h.address && h.percent !== null);

  if (items.length === 0) {
    return null;
  }

  const result = { items, source: "ethplorer" };
  writeCache(cachePath, result);
  return result;
}

function evaluateHolderConcentrationFromPercents(holdersData) {
  const items = Array.isArray(holdersData?.items) ? holdersData.items : null;
  if (!items || items.length === 0) {
    return {
      top_10_holder_percent: null,
      top_20_holder_percent: null,
      high_concentration_risk: false,
      holder_confidence: "UNKNOWN",
    };
  }

  const top10 = items
    .slice(0, 10)
    .map((h) => num(h.percent))
    .filter((v) => v !== null)
    .reduce((sum, v) => sum + v, 0);
  const top20 = items
    .slice(0, 20)
    .map((h) => num(h.percent))
    .filter((v) => v !== null)
    .reduce((sum, v) => sum + v, 0);

  const top10Pct = Number.isFinite(top10) ? top10 : null;
  const top20Pct = Number.isFinite(top20) ? top20 : null;
  const high =
    (top10Pct !== null && top10Pct > 50) || (top20Pct !== null && top20Pct > 70);

  return {
    top_10_holder_percent: top10Pct,
    top_20_holder_percent: top20Pct,
    high_concentration_risk: high,
    holder_confidence: "MEDIUM",
  };
}

function scoreTokenRiskFromHolders(holderInfo) {
  const top10 = num(holderInfo?.top_10_holder_percent);
  const top20 = num(holderInfo?.top_20_holder_percent);

  if (top10 === null && top20 === null) {
    return { score: 5, reason: "unknown" };
  }

  if ((top10 !== null && top10 > 50) || (top20 !== null && top20 > 70)) {
    return { score: 0, reason: "high_concentration" };
  }

  if (top10 !== null && top10 >= 30) {
    return { score: 5, reason: "moderate_concentration" };
  }

  return { score: 10, reason: "healthy_distribution" };
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
  const headers = {
    accept: "application/json",
    ...(options.headers || {}),
  };
  let requestUrl = url;

  if (COINGECKO_API_KEY && url.startsWith(COINGECKO_BASE_URL)) {
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
      if (requestUrl.startsWith(COINGECKO_BASE_URL)) {
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

async function fetchDefiLlamaProtocols() {
  const cachePath = path.join(CACHE_DIR, "defillama_protocols.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const data = await fetchJson("https://api.llama.fi/protocols", {}, 1);
  writeCache(cachePath, data);
  return data;
}

async function fetchDefiLlamaProtocol(slug) {
  const safeSlug = String(slug || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cachePath = path.join(CACHE_DIR, `defillama_protocol_${safeSlug}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const data = await fetchJson(`https://api.llama.fi/protocol/${slug}`, {}, 1);
  writeCache(cachePath, data);
  return data;
}

async function fetchDefiLlamaHacks() {
  const cachePath = path.join(CACHE_DIR, "defillama_hacks.json");
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const data = await fetchJson("https://api.llama.fi/hacks", {}, 1);
  writeCache(cachePath, data);
  return data;
}

async function fetchCoinGeckoMarkets(coinGeckoIds) {
  const ids = coinGeckoIds.filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  const cachePath = path.join(
    CACHE_DIR,
    `coingecko_markets_${ids.length}.json`
  );
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }

  const chunks = [];
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const all = [];
  for (const chunk of chunks) {
    const url =
      `${COINGECKO_BASE_URL}/coins/markets?vs_currency=${VS_CURRENCY}` +
      `&ids=${chunk.join(",")}` +
      `&price_change_percentage=24h,7d,30d&sparkline=false&per_page=250&page=1`;
    const data = await fetchJson(url);
    if (Array.isArray(data)) {
      all.push(...data);
    }
    await sleep(600);
  }

  writeCache(cachePath, all);
  return all;
}

async function fetchCoinGeckoDeveloperData(coinGeckoId) {
  if (!coinGeckoId) {
    return null;
  }
  const safeId = String(coinGeckoId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const cachePath = path.join(CACHE_DIR, `coingecko_dev_${safeId}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return cached;
  }
  const url =
    `${COINGECKO_BASE_URL}/coins/${coinGeckoId}` +
    `?localization=false&tickers=false&market_data=false&community_data=false&developer_data=true&sparkline=false`;
  const data = await fetchJson(url);
  const dev = data?.developer_data || null;
  writeCache(cachePath, dev);
  return dev;
}

function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) {
        return;
      }
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workerCount = clamp(concurrency, 1, 20);
  const workers = Array.from({ length: workerCount }, () => worker());
  return Promise.all(workers).then(() => results);
}

function getFocusTvlFromProtocolListRow(protocolRow) {
  const chainTvls = protocolRow?.chainTvls;
  let sum = 0;
  if (chainTvls && typeof chainTvls === "object" && !Array.isArray(chainTvls)) {
    for (const chain of FOCUS_CHAINS) {
      const v = chainTvls[chain];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
      }
    }
  }
  if (sum === 0) {
    const chain = protocolRow?.chain;
    if (chain === "Ethereum" || chain === "Solana") {
      sum = num(protocolRow?.tvl) || 0;
    }
  }
  return sum;
}

function buildFocusTvlSeries(protocolDetail) {
  const chainTvls = protocolDetail?.chainTvls;
  const byDate = new Map();
  let hasChainSeries = false;

  if (chainTvls && typeof chainTvls === "object" && !Array.isArray(chainTvls)) {
    for (const chain of FOCUS_CHAINS) {
      const entry = chainTvls[chain];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const tvlSeries = Array.isArray(entry.tvl) ? entry.tvl : null;
      if (!tvlSeries) {
        continue;
      }
      hasChainSeries = true;
      for (const point of tvlSeries) {
        const date = Number(point.date);
        const tvl = num(point.totalLiquidityUSD) ?? num(point.value);
        if (!Number.isFinite(date) || tvl === null) {
          continue;
        }
        byDate.set(date, (byDate.get(date) || 0) + tvl);
      }
    }
  }

  if (hasChainSeries && byDate.size > 0) {
    return Array.from(byDate.entries())
      .map(([date, tvl]) => ({ date, tvl }))
      .sort((a, b) => a.date - b.date);
  }

  const tvl = protocolDetail?.tvl;
  if (Array.isArray(tvl)) {
    return tvl
      .map((point) => ({
        date: Number(point.date),
        tvl: num(point.totalLiquidityUSD) ?? num(point.value),
      }))
      .filter((p) => Number.isFinite(p.date) && p.tvl !== null)
      .sort((a, b) => a.date - b.date);
  }

  return null;
}

function getTvlAtOrBefore(series, targetDate) {
  if (!series || series.length === 0) {
    return null;
  }
  let lo = 0;
  let hi = series.length - 1;
  let bestIndex = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (series[mid].date <= targetDate) {
      bestIndex = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return bestIndex >= 0 ? series[bestIndex].tvl : null;
}

function pctChange(current, past) {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0) {
    return null;
  }
  return ((current - past) / past) * 100;
}

function isStablecoinCategory(category) {
  if (!category) {
    return false;
  }
  return STABLECOIN_CATEGORY_RE.test(String(category));
}

function scoreTraction(focusTvl, tvlChange30d, tvlChange7d) {
  const focus = num(focusTvl);
  const tvlBase = focus && focus > 0 ? focus : null;

  let sizeScore = 10;
  if (tvlBase !== null) {
    const minLog = Math.log10(TVL_INCLUDE_MIN);
    const maxLog = Math.log10(1_000_000_000);
    const v = clamp((Math.log10(tvlBase) - minLog) / (maxLog - minLog), 0, 1);
    sizeScore = v * 20;
  }

  let momentumScore = 10;
  if (tvlChange30d !== null) {
    const v = clamp((tvlChange30d + 20) / 120, 0, 1);
    momentumScore = v * 20;
    if (tvlChange7d !== null && tvlChange7d < 0) {
      momentumScore = clamp(momentumScore - 2, 0, 20);
    }
  }

  return {
    score: clamp(sizeScore + momentumScore, 0, 40),
    sizeScore: clamp(sizeScore, 0, 20),
    momentumScore: clamp(momentumScore, 0, 20),
  };
}

function scoreDev(commits4w) {
  if (commits4w === null) {
    return { score: 10, reason: "unknown" };
  }
  const v = clamp(Math.log1p(commits4w) / Math.log1p(50), 0, 1);
  return { score: v * 20, reason: "coingecko" };
}

function scoreSecurity(auditStatus, hackCount) {
  const auditScore =
    auditStatus === "YES" ? 10 : auditStatus === "NO" ? 0 : 5;
  const hackPenalty = hackCount > 0 ? -5 : 0;
  return clamp(auditScore + hackPenalty, 0, 15);
}

function scoreMarket(marketCap, volume24h) {
  if (marketCap === null || volume24h === null) {
    return { score: 7.5, reason: "unknown" };
  }
  const volToMcap = marketCap > 0 ? volume24h / marketCap : 0;
  const ratioNorm = clamp((volToMcap - 0.01) / 0.09, 0, 1);
  const volNorm = clamp(
    (Math.log10(Math.max(1, volume24h)) - Math.log10(1_000_000)) /
      (Math.log10(1_000_000_000) - Math.log10(1_000_000)),
    0,
    1
  );
  const score = 15 * (0.6 * ratioNorm + 0.4 * volNorm);
  return { score: clamp(score, 0, 15), reason: "coingecko" };
}

function buildProtocolReasons(proto) {
  const reasons = [];
  reasons.push(
    `TVL (ETH+SOL): ${formatUsd(proto.tvl.focus_current)} (30d: ${formatPct(
      proto.tvl.change_30d_pct
    )}, 7d: ${formatPct(proto.tvl.change_7d_pct)})`
  );
  const holderSuffix =
    proto.onchain && proto.onchain.top_10_holder_percent !== null
      ? ` | holders top10 ${formatPctAbs(
          proto.onchain.top_10_holder_percent
        )}, top20 ${formatPctAbs(proto.onchain.top_20_holder_percent)} (risk: ${
          proto.onchain.high_concentration_risk ? "HIGH" : "OK"
        })`
      : "";

  if (proto.market.market_cap !== null && proto.market.volume_24h !== null) {
    const ratio =
      proto.market.market_cap > 0
        ? (proto.market.volume_24h / proto.market.market_cap) * 100
        : null;
    reasons.push(
      `Token liquidity: vol ${formatUsd(proto.market.volume_24h)} / mcap ${formatUsd(
        proto.market.market_cap
      )}${ratio !== null ? ` (~${ratio.toFixed(1)}%)` : ""}${holderSuffix}`
    );
  } else {
    reasons.push(
      `Token liquidity: unknown (no reliable CoinGecko mapping)${holderSuffix}`
    );
  }
  if (proto.dev.commit_count_4_weeks !== null) {
    reasons.push(`Dev activity: ${proto.dev.commit_count_4_weeks} commits (4w)`);
  } else {
    reasons.push("Dev activity: unknown");
  }
  if (proto.security.audit_status !== "UNKNOWN") {
    reasons.push(`Audits: ${proto.security.audit_status.toLowerCase()}`);
  } else {
    reasons.push("Audits: unknown");
  }
  if (proto.security.hack_count > 0) {
    reasons.push(
      `Past hacks: ${proto.security.hack_count} (${formatUsd(
        proto.security.hack_total_usd
      )} total)`
    );
  } else {
    reasons.push("Past hacks: none found (DefiLlama)");
  }

  const flags = [];
  if (proto.flags.tvl_collapse) flags.push("TVL collapsing");
  if (proto.flags.liquidity_trap) flags.push("liquidity trap");
  if (proto.flags.dead_dev) flags.push("dead dev");
  if (proto.flags.whale_concentration) flags.push("whale concentration");
  if (flags.length) {
    reasons.push(`Red flags: ${flags.join(", ")}`);
  }

  return reasons.slice(0, 6);
}

function buildLinks(protocolRow, protocolDetail) {
  const slug = protocolRow?.slug || protocolDetail?.slug;
  const auditLinks = Array.isArray(protocolDetail?.audit_links)
    ? protocolDetail.audit_links.filter(Boolean)
    : Array.isArray(protocolRow?.audit_links)
      ? protocolRow.audit_links.filter(Boolean)
      : [];

  return {
    website: protocolDetail?.url || protocolRow?.url || null,
    defillama: slug ? `https://defillama.com/protocol/${slug}` : null,
    twitter: protocolDetail?.twitter
      ? `https://x.com/${protocolDetail.twitter.replace(/^@/, "")}`
      : protocolRow?.twitter
        ? `https://x.com/${String(protocolRow.twitter).replace(/^@/, "")}`
        : null,
    audit_links: auditLinks,
    github_orgs: Array.isArray(protocolDetail?.github)
      ? protocolDetail.github.filter(Boolean)
      : Array.isArray(protocolRow?.github)
        ? protocolRow.github.filter(Boolean)
        : [],
  };
}

function pickBucket(focusTvl, tvlChange30d, avoid) {
  if (avoid) return "AVOID";
  if (focusTvl >= TVL_INCLUDE_MIN) return "CANDIDATE";
  if (
    focusTvl >= TVL_WATCH_MIN &&
    focusTvl < TVL_WATCH_MAX &&
    tvlChange30d !== null &&
    tvlChange30d >= WATCH_GROWTH_30D_MIN
  ) {
    return "WATCH";
  }
  return "IGNORE";
}

function buildMarkdownReport({ snapshot, previousSnapshot }) {
  const lines = [];
  const runDate = new Date(snapshot.generated_at);

  lines.push("# DeFi Protocol Scanner (ETH + SOL)");
  lines.push("");
  lines.push(`Run: ${runDate.toISOString()}`);
  lines.push(
    `Filters: include TVL >= ${formatUsd(
      snapshot.config.tvl_include_min
    )}, watch ${formatUsd(snapshot.config.tvl_watch_min)}-${formatUsd(
      snapshot.config.tvl_watch_max
    )} with >= ${snapshot.config.watch_growth_30d_min}% 30d growth`
  );
  lines.push("Excluded: stablecoin/CDP categories.");
  lines.push("");

  const candidates = snapshot.protocols
    .filter((p) => p.bucket === "CANDIDATE")
    .sort((a, b) => b.scores.total - a.scores.total);
  const watchlist = snapshot.protocols
    .filter((p) => p.bucket === "WATCH")
    .sort((a, b) => b.scores.total - a.scores.total);
  const avoid = snapshot.protocols
    .filter((p) => p.bucket === "AVOID")
    .sort((a, b) => b.scores.total - a.scores.total);

  lines.push("## Top 10");
  lines.push("| Rank | Protocol | TVL (ETH+SOL) | 30d | 7d | Score | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  candidates.slice(0, 10).forEach((p, idx) => {
    const link = p.links.defillama
      ? `[${p.name}](${p.links.defillama})`
      : p.name;
    const notes = [];
    if (p.market.market_cap === null) notes.push("no token map");
    if (p.dev.commit_count_4_weeks === null) notes.push("dev unk");
    if (p.security.audit_status === "UNKNOWN") notes.push("audit unk");
    if (p.security.hack_count > 0) notes.push("hacks");
    if (p.flags.whale_concentration) notes.push("whale risk");
    lines.push(
      `| ${idx + 1} | ${link} | ${formatUsd(p.tvl.focus_current)} | ${formatPct(
        p.tvl.change_30d_pct
      )} | ${formatPct(p.tvl.change_7d_pct)} | ${p.scores.total.toFixed(
        1
      )} | ${notes.join(", ") || "-"} |`
    );
  });
  lines.push("");

  const tokenMapped = candidates
    .filter((p) => p.market.market_cap !== null && p.market.volume_24h !== null)
    .sort((a, b) => b.scores.total - a.scores.total);

  lines.push("## Top Token-Mapped (Investable)");
  if (tokenMapped.length === 0) {
    lines.push("- None (most candidates lack reliable CoinGecko token mapping).");
  } else {
    lines.push("| Rank | Protocol | Token | Vol/MCap | Holders Top10 | Score | Notes |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    tokenMapped.slice(0, 10).forEach((p, idx) => {
      const link = p.links.defillama
        ? `[${p.name}](${p.links.defillama})`
        : p.name;
      const token = p.market.token_symbol || p.market.gecko_id || "n/a";
      const volToMcapPct =
        p.market.volume_to_mcap !== null
          ? `${(p.market.volume_to_mcap * 100).toFixed(1)}%`
          : "n/a";
      const holdersTop10 =
        p.onchain && p.onchain.top_10_holder_percent !== null
          ? `${formatPctAbs(p.onchain.top_10_holder_percent)} (${
              p.onchain.high_concentration_risk ? "HIGH" : "OK"
            })`
          : "n/a";
      const notes = [];
      if (p.flags.whale_concentration) notes.push("whale risk");
      if (p.flags.liquidity_trap) notes.push("liquidity trap");
      if (p.flags.tvl_collapse) notes.push("TVL collapsing");
      lines.push(
        `| ${idx + 1} | ${link} | ${token} | ${volToMcapPct} | ${holdersTop10} | ${p.scores.total.toFixed(
          1
        )} | ${notes.join(", ") || "-"} |`
      );
    });
  }
  lines.push("");

  lines.push("## Watchlist");
  if (watchlist.length === 0) {
    lines.push("- None");
  } else {
    watchlist.slice(0, 20).forEach((p) => {
      const link = p.links.defillama
        ? `[${p.name}](${p.links.defillama})`
        : p.name;
      lines.push(
        `- ${link}: TVL ${formatUsd(p.tvl.focus_current)}, 30d ${formatPct(
          p.tvl.change_30d_pct
        )}, score ${p.scores.total.toFixed(1)}`
      );
    });
  }
  lines.push("");

  lines.push("## Avoid");
  if (avoid.length === 0) {
    lines.push("- None");
  } else {
    avoid.slice(0, 20).forEach((p) => {
      const link = p.links.defillama
        ? `[${p.name}](${p.links.defillama})`
        : p.name;
      const why = [];
      if (p.flags.liquidity_trap) why.push("liquidity trap");
      if (p.flags.tvl_collapse) why.push("TVL collapse");
      if (p.flags.dead_dev) why.push("dead dev");
      lines.push(
        `- ${link}: ${why.join(", ") || "red flags"}, score ${p.scores.total.toFixed(
          1
        )}`
      );
    });
  }
  lines.push("");

  lines.push("## Movers Since Last Run");
  if (!previousSnapshot) {
    lines.push("- No previous run found.");
  } else {
    const prevBySlug = new Map(
      previousSnapshot.protocols.map((p) => [p.slug, p])
    );
    const deltas = snapshot.protocols
      .map((p) => {
        const prev = prevBySlug.get(p.slug);
        if (!prev) return null;
        return {
          name: p.name,
          score_delta: p.scores.total - prev.scores.total,
          tvl_delta: p.tvl.focus_current - prev.tvl.focus_current,
        };
      })
      .filter(Boolean);

    const gainers = [...deltas]
      .filter((d) => d.score_delta > 0)
      .sort((a, b) => b.score_delta - a.score_delta)
      .slice(0, 5);
    const losers = [...deltas]
      .filter((d) => d.score_delta < 0)
      .sort((a, b) => a.score_delta - b.score_delta)
      .slice(0, 5);

    lines.push("**Top Gainers**");
    if (gainers.length === 0) lines.push("- None");
    gainers.forEach((d) => {
      lines.push(
        `- ${d.name}: score ${formatPct(d.score_delta)} | TVL ${formatUsd(
          d.tvl_delta
        )}`
      );
    });
    lines.push("");
    lines.push("**Top Losers**");
    if (losers.length === 0) lines.push("- None");
    losers.forEach((d) => {
      lines.push(
        `- ${d.name}: score ${formatPct(d.score_delta)} | TVL ${formatUsd(
          d.tvl_delta
        )}`
      );
    });
  }
  lines.push("");

  lines.push("## Details (Top 10)");
  candidates.slice(0, 10).forEach((p) => {
    lines.push(`### ${p.name}`);
    lines.push(
      `Score: **${p.scores.total.toFixed(1)}** (Traction ${p.scores.traction.toFixed(
        1
      )}/40, Dev ${p.scores.dev.toFixed(1)}/20, Security ${p.scores.security.toFixed(
        1
      )}/15, Market ${p.scores.market.toFixed(1)}/15, Token ${p.scores.token_risk.toFixed(
        1
      )}/10)`
    );
    lines.push("");
    for (const reason of p.reasons) {
      lines.push(`- ${reason}`);
    }
    const linkLines = [];
    if (p.links.website) linkLines.push(`[website](${p.links.website})`);
    if (p.links.twitter) linkLines.push(`[x](${p.links.twitter})`);
    if (p.links.audit_links && p.links.audit_links.length > 0)
      linkLines.push(`[audits](${p.links.audit_links[0]})`);
    if (p.links.defillama) linkLines.push(`[defillama](${p.links.defillama})`);
    if (linkLines.length) {
      lines.push("");
      lines.push(linkLines.join(" | "));
    }
    lines.push("");
  });

  return lines.join("\n");
}

function loadPreviousSnapshot() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    return null;
  }
  const files = fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) {
    return null;
  }
  const previousPath = path.join(SNAPSHOTS_DIR, files[0]);
  try {
    return JSON.parse(fs.readFileSync(previousPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  ensureDir(REPORTS_DIR);
  ensureDir(REPORTS_MD_DIR);
  ensureDir(SNAPSHOTS_DIR);
  ensureDir(CACHE_DIR);

  console.log("Fetching DefiLlama protocols...");
  const protocols = await fetchDefiLlamaProtocols();

  const filtered = protocols
    .filter(
      (p) =>
        Array.isArray(p.chains) &&
        p.chains.some((c) => FOCUS_CHAINS.includes(c))
    )
    .filter((p) => p.category !== "CEX")
    .filter((p) => !isStablecoinCategory(p.category))
    .map((p) => ({
      ...p,
      focusTvl: getFocusTvlFromProtocolListRow(p),
      change_7d: num(p.change_7d),
    }))
    .filter((p) => Number.isFinite(p.focusTvl) && p.focusTvl > 0);

  const universe = filtered
    .filter((p) => p.focusTvl >= TVL_INCLUDE_MIN)
    .sort((a, b) => b.focusTvl - a.focusTvl)
    .slice(0, UNIVERSE_LIMIT);

  const watchPrefilter = filtered
    .filter((p) => p.focusTvl >= TVL_WATCH_MIN && p.focusTvl < TVL_WATCH_MAX)
    .filter((p) => p.change_7d !== null && p.change_7d >= WATCH_PREFILTER_7D_MIN)
    .sort((a, b) => (b.change_7d || 0) - (a.change_7d || 0))
    .slice(0, WATCH_PREFILTER_LIMIT);

  const selectedMap = new Map();
  for (const p of [...universe, ...watchPrefilter]) {
    if (!p.slug) continue;
    selectedMap.set(p.slug, p);
  }
  const selected = Array.from(selectedMap.values());

  console.log(
    `Selected ${selected.length} protocols for detail fetch (universe ${universe.length} + watch prefilter ${watchPrefilter.length}).`
  );

  console.log("Fetching DefiLlama hacks...");
  const hacks = await fetchDefiLlamaHacks();
  const hacksById = new Map();
  for (const h of Array.isArray(hacks) ? hacks : []) {
    const id = num(h.defillamaId);
    if (id === null) continue;
    if (!hacksById.has(id)) hacksById.set(id, []);
    hacksById.get(id).push(h);
  }

  console.log("Fetching protocol details...");
  const details = await mapWithConcurrency(
    selected,
    PROTOCOL_DETAIL_CONCURRENCY,
    async (p, idx) => {
      try {
        const d = await fetchDefiLlamaProtocol(p.slug);
        if (idx % 10 === 0 && idx > 0) {
          console.log(`Progress: ${idx}/${selected.length} protocol details...`);
        }
        return { slug: p.slug, detail: d };
      } catch (err) {
        return { slug: p.slug, detail: null, error: err.message };
      }
    }
  );
  const detailBySlug = new Map(details.map((d) => [d.slug, d.detail]));

  const coinGeckoIds = selected
    .map((p) => p.gecko_id)
    .filter(Boolean)
    .map((id) => String(id));
  const marketRows = await fetchCoinGeckoMarkets(Array.from(new Set(coinGeckoIds)));
  const marketById = new Map(marketRows.map((r) => [r.id, r]));

  const previousSnapshot = loadPreviousSnapshot();

  const runAt = new Date().toISOString();
  const protocolsOut = [];

  for (const p of selected) {
    const detail = detailBySlug.get(p.slug) || null;
    const series = detail ? buildFocusTvlSeries(detail) : null;
    const currentFromSeries =
      series && series.length ? series[series.length - 1].tvl : null;
    const currentFocusTvl =
      (num(detail?.currentChainTvls?.Ethereum) || 0) +
      (num(detail?.currentChainTvls?.Solana) || 0);
    const focusCurrent =
      currentFocusTvl > 0
        ? currentFocusTvl
        : currentFromSeries !== null
          ? currentFromSeries
          : num(p.focusTvl) || 0;

    const lastDate =
      series && series.length ? series[series.length - 1].date : null;
    const tvl7 = lastDate ? getTvlAtOrBefore(series, lastDate - 7 * 86400) : null;
    const tvl30 = lastDate
      ? getTvlAtOrBefore(series, lastDate - 30 * 86400)
      : null;
    const change7d = pctChange(focusCurrent, tvl7);
    const change30d = pctChange(focusCurrent, tvl30);

    const market = p.gecko_id ? marketById.get(p.gecko_id) : null;
    const marketCap = num(market?.market_cap);
    const volume24h = num(market?.total_volume);
    const volToMcap =
      marketCap !== null && volume24h !== null && marketCap > 0
        ? volume24h / marketCap
        : null;

    const auditLinks = Array.isArray(detail?.audit_links)
      ? detail.audit_links.filter(Boolean)
      : Array.isArray(p.audit_links)
        ? p.audit_links.filter(Boolean)
        : [];
    const audits = num(detail?.audits) ?? num(p.audits);
    const auditStatus =
      audits !== null
        ? audits > 0 || auditLinks.length > 0
          ? "YES"
          : "NO"
        : auditLinks.length > 0
          ? "YES"
          : "UNKNOWN";

    const hackList = hacksById.get(num(p.id)) || [];
    const hackCount = hackList.length;
    const hackTotal = hackList.reduce((sum, h) => sum + (num(h.amount) || 0), 0);
    const hackSources = hackList
      .map((h) => h.source)
      .filter(Boolean)
      .slice(0, 3);

    // Phase 1: dev unknown; fill later for top results.
    const devCommits4w = null;

    const traction = scoreTraction(focusCurrent, change30d, change7d);
    const dev = scoreDev(devCommits4w);
    const securityScore = scoreSecurity(auditStatus, hackCount);
    const marketScore = scoreMarket(marketCap, volume24h);
    const tokenRiskScore = 5;

    const liquidityTrap =
      marketCap !== null &&
      volume24h !== null &&
      (volume24h < 1_000_000 ||
        (volToMcap !== null && volToMcap < 0.005 && volume24h < 5_000_000));
    const tvlCollapse =
      change30d !== null && change7d !== null && change30d <= -30 && change7d <= -10;

    const avoid = liquidityTrap || tvlCollapse;
    const bucket = pickBucket(focusCurrent, change30d, avoid);

    const knownFields = [
      change30d !== null,
      marketCap !== null && volume24h !== null,
      audits !== null || auditLinks.length > 0,
      hackCount >= 0,
      devCommits4w !== null,
    ];
    const coverage = knownFields.filter(Boolean).length / knownFields.length;

    const protocolOut = {
      defillama_id: num(p.id),
      slug: p.slug,
      name: p.name,
      category: p.category || null,
      chains: Array.isArray(p.chains) ? p.chains : [],
      focus_chains: FOCUS_CHAINS,
      links: buildLinks(p, detail),
      tvl: {
        focus_current: focusCurrent,
        tvl_7d_ago: tvl7,
        tvl_30d_ago: tvl30,
        change_7d_pct: change7d,
        change_30d_pct: change30d,
        source: "defillama",
      },
      market: {
        gecko_id: p.gecko_id || null,
        token_symbol: market?.symbol ? String(market.symbol).toUpperCase() : null,
        token_name: market?.name || null,
        market_cap: marketCap,
        volume_24h: volume24h,
        volume_to_mcap: volToMcap,
        price_change_7d: num(market?.price_change_percentage_7d_in_currency),
      },
      dev: {
        commit_count_4_weeks: devCommits4w,
        github_orgs: Array.isArray(p.github)
          ? p.github
          : Array.isArray(detail?.github)
            ? detail.github
            : [],
        source: "unknown",
      },
      security: {
        audits,
        audit_links: auditLinks,
        audit_status: auditStatus,
        hack_known: hackCount > 0,
        hack_count: hackCount,
        hack_total_usd: hackTotal,
        hack_sources: hackSources,
        source: "defillama",
      },
      flags: {
        tvl_collapse: tvlCollapse,
        liquidity_trap: liquidityTrap,
        dead_dev: false,
        whale_concentration: false,
      },
      scores: {
        total: 0,
        traction: traction.score,
        dev: dev.score,
        security: securityScore,
        market: marketScore.score,
        token_risk: tokenRiskScore,
        coverage,
      },
      bucket,
      reasons: [],
      onchain: null,
    };

    protocolOut.scores.total =
      protocolOut.scores.traction +
      protocolOut.scores.dev +
      protocolOut.scores.security +
      protocolOut.scores.market +
      protocolOut.scores.token_risk;

    protocolOut.reasons = buildProtocolReasons(protocolOut);

    protocolsOut.push(protocolOut);
  }

  // Enrich dev activity for top protocols (to stay within CoinGecko rate limits).
  const prelimCandidates = protocolsOut
    .filter((p) => p.bucket === "CANDIDATE")
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, TOP_DEV_FETCH_LIMIT)
    .filter((p) => p.market.gecko_id);

  if (prelimCandidates.length > 0) {
    console.log(`Fetching CoinGecko dev data for top ${prelimCandidates.length}...`);
    for (const [idx, p] of prelimCandidates.entries()) {
      try {
        const devData = await fetchCoinGeckoDeveloperData(p.market.gecko_id);
        const commits4w = num(devData?.commit_count_4_weeks);
        const devScore = scoreDev(commits4w);
        p.dev.commit_count_4_weeks = commits4w;
        p.dev.source = devScore.reason;
        p.scores.dev = devScore.score;
        p.scores.total =
          p.scores.traction +
          p.scores.dev +
          p.scores.security +
          p.scores.market +
          p.scores.token_risk;
        p.flags.dead_dev = commits4w !== null && commits4w === 0;
        p.reasons = buildProtocolReasons(p);
      } catch {
        // Leave as unknown.
      }
      if (idx < prelimCandidates.length - 1) {
        await sleep(2200);
      }
    }
  }

  // Enrich token holder concentration for top candidates (Ethereum tokens only, to stay fast + within rate limits).
  if (DEFI_ENABLE_ONCHAIN && TOP_ONCHAIN_FETCH_LIMIT > 0) {
    const onchainTargets = protocolsOut
      .filter((p) => p.bucket === "CANDIDATE" && p.market.gecko_id)
      .sort((a, b) => b.scores.total - a.scores.total)
      .slice(0, TOP_ONCHAIN_FETCH_LIMIT);

    if (onchainTargets.length > 0) {
      console.log(
        `Fetching token holder concentration for top ${onchainTargets.length} candidates (Ethereum only)...`
      );

      for (const [idx, proto] of onchainTargets.entries()) {
        try {
          const coinDetails = await fetchCoinGeckoCoinDetails(proto.market.gecko_id);
          const contract = extractEthereumContractAddress(coinDetails);
          if (!contract) {
            continue;
          }

          const holdersData = await fetchEthplorerTopHolders(contract, 20);
          const holderInfo = evaluateHolderConcentrationFromPercents(holdersData);
          const tokenRisk = scoreTokenRiskFromHolders(holderInfo);

          proto.onchain = {
            chain: "ethereum",
            contract_address: contract,
            contract_url: `https://etherscan.io/address/${contract}`,
            source: holdersData?.source || "ethplorer",
            top_10_holder_percent: holderInfo.top_10_holder_percent,
            top_20_holder_percent: holderInfo.top_20_holder_percent,
            high_concentration_risk: holderInfo.high_concentration_risk,
            holder_confidence: holderInfo.holder_confidence,
          };

          proto.flags.whale_concentration = holderInfo.high_concentration_risk;
          proto.scores.token_risk = tokenRisk.score;
          proto.scores.total =
            proto.scores.traction +
            proto.scores.dev +
            proto.scores.security +
            proto.scores.market +
            proto.scores.token_risk;
          proto.reasons = buildProtocolReasons(proto);
        } catch {
          // Leave as unknown.
        }

        if (idx < onchainTargets.length - 1) {
          await sleep(2200);
        }
      }
    }
  }

  // Remove WATCH items that don't meet the 30d momentum requirement (if 30d could not be computed).
  for (const p of protocolsOut) {
    if (p.bucket === "WATCH") {
      if (p.tvl.change_30d_pct === null || p.tvl.change_30d_pct < WATCH_GROWTH_30D_MIN) {
        p.bucket = "IGNORE";
      }
    }
  }

  const snapshot = {
    generated_at: runAt,
    config: {
      chains: FOCUS_CHAINS,
      tvl_include_min: TVL_INCLUDE_MIN,
      tvl_watch_min: TVL_WATCH_MIN,
      tvl_watch_max: TVL_WATCH_MAX,
      watch_growth_30d_min: WATCH_GROWTH_30D_MIN,
      universe_limit: UNIVERSE_LIMIT,
      watch_prefilter_7d_min: WATCH_PREFILTER_7D_MIN,
      watch_prefilter_limit: WATCH_PREFILTER_LIMIT,
      top_dev_fetch_limit: TOP_DEV_FETCH_LIMIT,
      top_onchain_fetch_limit: TOP_ONCHAIN_FETCH_LIMIT,
      onchain_enabled: DEFI_ENABLE_ONCHAIN,
    },
    protocols: protocolsOut
      .filter((p) => p.bucket !== "IGNORE")
      .sort((a, b) => b.scores.total - a.scores.total),
  };

  const reportMd = buildMarkdownReport({ snapshot, previousSnapshot });

  const runId = isoToFilename(snapshot.generated_at);
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${runId}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  const reportName = `${runId.slice(0, 10)}_defi_scan.md`;
  const reportPath = path.join(REPORTS_MD_DIR, reportName);
  fs.writeFileSync(reportPath, reportMd, "utf8");

  fs.writeFileSync(
    path.join(REPORTS_DIR, "Latest.json"),
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(REPORTS_DIR, "Latest.md"), reportMd, "utf8");

  console.log(`\nSaved snapshot: ${snapshotPath}`);
  console.log(`Saved report:   ${reportPath}`);
  console.log(`Saved latest:   ${path.join(REPORTS_DIR, "Latest.md")}`);
}

main().catch((err) => {
  console.error("DeFi scan failed:", err.message);
  process.exitCode = 1;
});
