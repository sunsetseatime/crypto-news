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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// CoinGecko rate-limit protection
// ---------------------------------------------------------------------------
const COINGECKO_RPM = (() => {
  const raw = process.env.COINGECKO_RPM;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n <= 0) return null; // allow disabling with 0/-1
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  if (COINGECKO_API_KEY && COINGECKO_API_KEY.startsWith("CG-")) return 25;
  if (COINGECKO_API_KEY) return 80;
  return 20;
})();
const COINGECKO_MIN_INTERVAL_MS = COINGECKO_RPM
  ? Math.max(0, Math.ceil(60000 / COINGECKO_RPM))
  : 0;
let coingeckoQueue = Promise.resolve();
let coingeckoLastCallAt = 0;

function scheduleCoinGeckoCall() {
  if (!COINGECKO_MIN_INTERVAL_MS) return Promise.resolve();
  const run = async () => {
    const now = Date.now();
    const waitMs = Math.max(
      0,
      coingeckoLastCallAt + COINGECKO_MIN_INTERVAL_MS - now
    );
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    coingeckoLastCallAt = Date.now();
  };
  const next = coingeckoQueue.then(run, run);
  coingeckoQueue = next;
  return next;
}

const ROOT_DIR = path.join(__dirname, "..");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");
const SIGNAL_ENGINE_DIR = path.join(REPORTS_DIR, "signal_engine");
const SIGNAL_ENGINE_CACHE_DIR = path.join(SIGNAL_ENGINE_DIR, "cache");
const SIGNAL_ENGINE_HISTORY_DIR = path.join(REPORTS_DIR, "history", "signal_engine");
const CATEGORIES_PATH = path.join(ROOT_DIR, "config", "categories.json");

const SIGNAL_ENGINE_CONFIG_PATH = path.join(
  ROOT_DIR,
  "config",
  "signal_engine_projects.json"
);
const SIGNAL_ENGINE_METRIC_REGISTRY_PATH = path.join(
  ROOT_DIR,
  "config",
  "signal_engine_metric_registry.json"
);

const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
const DEFILLAMA_FEES_OVERVIEW_URL =
  "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const DEFILLAMA_TVL_URL = (slug) => `https://api.llama.fi/tvl/${slug}`;

const CACHE_TTL_MINUTES = Number(process.env.SIGNAL_ENGINE_CACHE_TTL_MINUTES || 360);
const CACHE_TTL_MS =
  Number.isFinite(CACHE_TTL_MINUTES) && CACHE_TTL_MINUTES > 0
    ? CACHE_TTL_MINUTES * 60 * 1000
    : 360 * 60 * 1000;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function loadCategoriesConfig() {
  const raw = readJsonFile(CATEGORIES_PATH, null);
  if (!raw || typeof raw !== "object") {
    return { version: 1, notes: null, categories: [] };
  }
  const out = [];
  const items = Array.isArray(raw.categories) ? raw.categories : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    if (!id) continue;
    const name = String(item.name || id).trim();
    const description = String(item.description || "").trim();
    const idsRaw = Array.isArray(item.coin_gecko_ids) ? item.coin_gecko_ids : [];
    const coinIds = Array.from(
      new Set(idsRaw.map((value) => normalizeId(value)).filter(Boolean))
    );
    if (coinIds.length === 0) continue;
    out.push({ id, name, description, coin_gecko_ids: coinIds });
  }
  const versionParsed = Number(raw.version);
  return {
    version: Number.isFinite(versionParsed) ? versionParsed : 1,
    notes: raw.notes || null,
    categories: out,
  };
}

function loadMetricRegistry() {
  const raw = readJsonFile(SIGNAL_ENGINE_METRIC_REGISTRY_PATH, null);
  if (!raw || typeof raw !== "object") {
    return { version: 1, notes: null, byId: new Map() };
  }
  const entries = Array.isArray(raw.projects) ? raw.projects : [];
  const byId = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const coinId = normalizeId(entry.coin_gecko_id);
    if (!coinId) continue;
    byId.set(coinId, {
      statusPageUrl: entry.statusPageUrl || "",
      utilizationSource: entry.utilizationSource || "",
      feesSource: entry.feesSource || "",
      emissionsSource: entry.emissionsSource || "",
      assetValueSource: entry.assetValueSource || "",
      issuerSource: entry.issuerSource || "",
    });
  }
  return {
    version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1,
    notes: raw.notes || null,
    byId,
  };
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function formatUsdCompact(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function isoToFilename(isoString) {
  if (!isoString) {
    return "unknown_time";
  }
  return isoString.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function readCache(filePath, extraKey = null) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > CACHE_TTL_MS) {
    return null;
  }
  const cached = readJsonFile(filePath, null);
  if (!cached) return null;
  if (extraKey && cached.extra_key !== extraKey) return null;
  return cached;
}

function writeCache(filePath, data, extraKey = null) {
  const payload = extraKey ? { ...data, extra_key: extraKey } : data;
  writeJsonFile(filePath, payload);
}

async function fetchJson(url, { timeoutMs = 25_000, headers = {} } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (url.startsWith(COINGECKO_BASE_URL)) {
      await scheduleCoinGeckoCall();
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchMarketData(ids) {
  const cleanIds = Array.from(new Set(ids.map((id) => normalizeId(id)).filter(Boolean)));
  if (cleanIds.length === 0) return [];
  const idsKey = cleanIds.slice().sort().join(",");
  const cachePath = path.join(SIGNAL_ENGINE_CACHE_DIR, "coingecko_markets.json");
  const cached = readCache(cachePath, idsKey);
  if (cached && Array.isArray(cached?.data)) {
    return cached.data;
  }

  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: cleanIds.join(","),
    order: "market_cap_desc",
    per_page: String(Math.min(cleanIds.length, 250)),
    page: "1",
    sparkline: "false",
  });

  const headers = { accept: "application/json" };
  if (COINGECKO_API_KEY) {
    if (COINGECKO_API_KEY_IN_QUERY) {
      params.set(COINGECKO_API_KEY_HEADER, COINGECKO_API_KEY);
    } else {
      headers[COINGECKO_API_KEY_HEADER] = COINGECKO_API_KEY;
    }
  }

  const url = `${COINGECKO_BASE_URL}/coins/markets?${params.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 25_000, headers });
  const out = Array.isArray(data) ? data : [];
  writeCache(cachePath, { data: out }, idsKey);
  return out;
}

async function fetchMarketChart(coinId, { days = 90 } = {}) {
  const id = normalizeId(coinId);
  if (!id) return null;
  const daysNum = Number.isFinite(Number(days)) ? Math.max(1, Math.round(Number(days))) : 90;
  const cachePath = path.join(SIGNAL_ENGINE_CACHE_DIR, `coingecko_market_chart_${id}_${daysNum}d.json`);
  const cached = readCache(cachePath);
  if (cached && typeof cached === "object") {
    return cached;
  }

  const params = new URLSearchParams({
    vs_currency: "usd",
    days: String(daysNum),
    interval: "daily",
  });

  const headers = { accept: "application/json" };
  if (COINGECKO_API_KEY) {
    if (COINGECKO_API_KEY_IN_QUERY) {
      params.set(COINGECKO_API_KEY_HEADER, COINGECKO_API_KEY);
    } else {
      headers[COINGECKO_API_KEY_HEADER] = COINGECKO_API_KEY;
    }
  }

  const url = `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(id)}/market_chart?${params.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 25_000, headers });
  const payload = data && typeof data === "object" ? data : null;
  if (!payload) return null;
  writeCache(cachePath, payload);
  return payload;
}

function sum(values) {
  let total = 0;
  for (const v of Array.isArray(values) ? values : []) {
    if (!Number.isFinite(v)) continue;
    total += v;
  }
  return total;
}

function computeVolumeTotals(marketChart) {
  const raw = Array.isArray(marketChart?.total_volumes) ? marketChart.total_volumes : [];
  const volumes = raw
    .map((entry) => num(entry?.[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (volumes.length < 8) {
    return {
      total7d: null,
      total7d_prev: null,
      change_7dover7d: null,
      total30d: null,
      total30d_prev: null,
      change_30dover30d: null,
      points: volumes.length,
    };
  }

  const last7 = volumes.slice(-7);
  const prev7 = volumes.length >= 14 ? volumes.slice(-14, -7) : null;
  const total7d = sum(last7);
  const total7dPrev = prev7 ? sum(prev7) : null;
  const change7 =
    Number.isFinite(total7dPrev) && total7dPrev > 0
      ? ((total7d - total7dPrev) / total7dPrev) * 100
      : null;

  const last30 = volumes.length >= 30 ? volumes.slice(-30) : null;
  const prev30 = volumes.length >= 60 ? volumes.slice(-60, -30) : null;
  const total30d = last30 ? sum(last30) : null;
  const total30dPrev = prev30 ? sum(prev30) : null;
  const change30 =
    Number.isFinite(total30dPrev) && total30dPrev > 0
      ? ((total30d - total30dPrev) / total30dPrev) * 100
      : null;

  return {
    total7d: Number.isFinite(total7d) ? total7d : null,
    total7d_prev: Number.isFinite(total7dPrev) ? total7dPrev : null,
    change_7dover7d: Number.isFinite(change7) ? change7 : null,
    total30d: Number.isFinite(total30d) ? total30d : null,
    total30d_prev: Number.isFinite(total30dPrev) ? total30dPrev : null,
    change_30dover30d: Number.isFinite(change30) ? change30 : null,
    points: volumes.length,
  };
}

function scoreFromPctChange(changePct, { mid = 0, width = 40 } = {}) {
  if (!Number.isFinite(changePct)) return { value: null, confidence: "low", note: "Missing data." };
  const normalized = clamp((changePct - mid) / width, -1, 1);
  const score = Math.round((normalized + 1) * 50);
  return { value: score, confidence: "medium", note: `Based on change: ${formatPct(changePct, 1)}` };
}

function statusFromSignals(signals) {
  const items = Array.isArray(signals) ? signals : [];
  const improving = items.filter((s) => s?.state === "improving").length;
  const worsening = items.filter((s) => s?.state === "worsening").length;
  if (worsening >= 1 && improving === 0) return "Monitor";
  if (improving >= 2) return "Warming Up";
  return "Monitor";
}

function signalFromPct(changePct, { up = 10, down = -10 } = {}) {
  if (!Number.isFinite(changePct)) {
    return { state: "unknown", why: "Not enough data yet.", confidence: "low" };
  }
  if (changePct >= up) {
    return { state: "improving", why: `Up ${formatPct(changePct, 1)} (month over month).`, confidence: "medium" };
  }
  if (changePct <= down) {
    return { state: "worsening", why: `Down ${formatPct(changePct, 1)} (month over month).`, confidence: "medium" };
  }
  return { state: "stable", why: `Roughly flat (${formatPct(changePct, 1)} month over month).`, confidence: "medium" };
}

function buildNicheUniverse(categoriesConfig) {
  const categories = Array.isArray(categoriesConfig?.categories)
    ? categoriesConfig.categories
    : [];
  const byId = new Map();
  for (const category of categories) {
    if (!category?.id || !Array.isArray(category?.coin_gecko_ids)) continue;
    byId.set(String(category.id), new Set(category.coin_gecko_ids));
  }

  const ai = Array.from(byId.get("ai_compute") || new Set());
  const rwa = Array.from(byId.get("rwa") || new Set());
  const picks = Array.from(
    new Set([
      ...(byId.get("oracles_data") || new Set()),
      ...(byId.get("infra_middleware") || new Set()),
    ])
  );

  return {
    ai_compute: ai,
    rwa,
    picks_and_shovels: picks,
  };
}

function buildMarketMetaMap(marketData) {
  const map = new Map();
  for (const entry of Array.isArray(marketData) ? marketData : []) {
    const id = normalizeId(entry?.id);
    if (!id) continue;
    map.set(id, {
      symbol: entry?.symbol ? String(entry.symbol).toUpperCase() : "",
      name: entry?.name ? String(entry.name) : id,
    });
  }
  return map;
}

function calcCoverageBySignal({ niche, hasFees, hasUtilization, hasStatus, hasEmissions, hasAssetValue, hasIssuer }) {
  return {
    "AI-1": niche === "ai_compute" ? Boolean(hasFees || hasUtilization) : false,
    "AI-2": niche === "ai_compute" ? Boolean(hasFees && hasEmissions) : false,
    "AI-3": niche === "ai_compute" ? Boolean(hasStatus) : false,
    "RWA-1": niche === "rwa" ? Boolean(hasAssetValue) : false,
    "RWA-2": niche === "rwa" ? Boolean(hasIssuer) : false,
    "PS-1": niche === "picks_and_shovels" ? Boolean(hasFees) : false,
    "PS-2": niche === "picks_and_shovels" ? Boolean(hasUtilization) : false,
  };
}

function calcCoverageScore(coverageBySignal) {
  return Object.values(coverageBySignal || {}).filter(Boolean).length;
}

function calcEvidenceScore({ niche, hasFees, hasUtilization, hasStatus, hasEmissions, hasAssetValue, hasIssuer }) {
  let score = 0;
  if (niche === "ai_compute") {
    if (hasFees) score += 40;
    if (hasUtilization) score += 25;
    if (hasStatus) score += 20;
    if (hasEmissions) score += 15;
  } else if (niche === "rwa") {
    if (hasAssetValue) score += 40;
    if (hasIssuer) score += 30;
    if (hasFees) score += 20;
    if (hasStatus) score += 10;
  } else if (niche === "picks_and_shovels") {
    if (hasFees) score += 50;
    if (hasUtilization) score += 20;
    if (hasStatus) score += 15;
    if (hasEmissions) score += 15;
  }
  return clamp(score, 0, 100);
}

function calcScore({ evidenceScore, coverageScore }) {
  const coveragePct = (coverageScore / 7) * 100;
  return clamp(0.6 * evidenceScore + 0.4 * coveragePct, 0, 100);
}

function buildSuggestionRecord({
  niche,
  coinId,
  meta,
  feesInfo,
  defillamaInfo,
  registryEntry,
  isTracked,
}) {
  const hasFees = Number.isFinite(num(feesInfo?.total30d)) || Boolean(registryEntry?.feesSource);
  const hasUtilization = Boolean(registryEntry?.utilizationSource);
  const hasStatus = Boolean(registryEntry?.statusPageUrl);
  const hasEmissions = Boolean(registryEntry?.emissionsSource);
  const hasAssetValue = Boolean(registryEntry?.assetValueSource) || Number.isFinite(num(defillamaInfo?.tvl));
  const hasIssuer = Boolean(registryEntry?.issuerSource);

  const coverageBySignal = calcCoverageBySignal({
    niche,
    hasFees,
    hasUtilization,
    hasStatus,
    hasEmissions,
    hasAssetValue,
    hasIssuer,
  });
  const coverageScore = calcCoverageScore(coverageBySignal);
  const evidenceScore = calcEvidenceScore({
    niche,
    hasFees,
    hasUtilization,
    hasStatus,
    hasEmissions,
    hasAssetValue,
    hasIssuer,
  });
  const score = calcScore({ evidenceScore, coverageScore });

  const reasons = [];
  if (niche === "ai_compute") {
    if (hasFees) reasons.push("Fees/revenue series available");
    if (hasUtilization) reasons.push("Utilization proxy configured");
    if (hasStatus) reasons.push("Status page available (reliability)");
    if (hasEmissions) reasons.push("Emissions/unlocks source configured");
  } else if (niche === "rwa") {
    if (hasAssetValue) reasons.push("Asset-value series available (TVL proxy OK)");
    if (hasIssuer) reasons.push("Issuer/concentration source configured");
    if (hasFees) reasons.push("Fees/revenue series available");
  } else if (niche === "picks_and_shovels") {
    if (hasFees) reasons.push("Fees/revenue series available");
    if (hasUtilization) reasons.push("Utilization/client proxy configured");
    if (hasStatus) reasons.push("Status page available (reliability)");
  }
  if (isTracked) reasons.push("Already tracked in Signal Engine");

  const missing = [];
  if (niche === "ai_compute") {
    if (!hasFees) missing.push("Fees/revenue series");
    if (!hasUtilization) missing.push("Utilization proxy");
    if (!hasEmissions) missing.push("Emissions/unlocks source");
    if (!hasStatus) missing.push("Status page (reliability)");
  } else if (niche === "rwa") {
    if (!hasAssetValue) missing.push("Asset-value series");
    if (!hasIssuer) missing.push("Issuer/concentration source");
  } else if (niche === "picks_and_shovels") {
    if (!hasFees) missing.push("Fees/revenue series");
    if (!hasUtilization) missing.push("Utilization/client proxy");
  }

  const sources = {
    fees: hasFees ? (registryEntry?.feesSource || (defillamaInfo?.slug ? `defillama:${defillamaInfo.slug}` : "defillama")) : "",
    revenue: hasFees ? (registryEntry?.feesSource || (defillamaInfo?.slug ? `defillama:${defillamaInfo.slug}` : "defillama")) : "",
    utilization: registryEntry?.utilizationSource || "",
    status: registryEntry?.statusPageUrl || "",
    emissions: registryEntry?.emissionsSource || "",
    assetValue: registryEntry?.assetValueSource || (Number.isFinite(num(defillamaInfo?.tvl)) ? "defillama:tvl" : ""),
    issuer: registryEntry?.issuerSource || "",
  };

  return {
    id: coinId,
    symbol: meta?.symbol || "",
    name: meta?.name || coinId,
    score: Math.round(score * 10) / 10,
    evidenceScore: Math.round(evidenceScore * 10) / 10,
    coverageScore,
    reasons,
    missing,
    sources,
    isTracked,
    coverageBySignal,
  };
}

function listHistoryFiles(historyDir, suffix) {
  if (!fs.existsSync(historyDir)) return [];
  return fs
    .readdirSync(historyDir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(historyDir, name))
    .sort()
    .reverse();
}

function renderMarkdown(report, suggestionsReport) {
  const lines = [];
  const generatedAt = report?.generated_at || new Date().toISOString();
  lines.push("# Signal Engine (Fundamentals)");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("This is a low-noise fundamentals monitor. It is not a trading bot and it does not use price alerts.");
  lines.push("");

  const suggestions = suggestionsReport?.niches || null;
  if (suggestions) {
    lines.push("## Candidate Suggestions (Needs Approval)");
    lines.push("");
    lines.push("Top 5 per niche (data-first ranking). These do NOT auto-update the tracked list.");
    lines.push("");

    const nicheOrder = [
      { id: "ai_compute", title: "AI Compute" },
      { id: "rwa", title: "RWA (Real-World Assets)" },
      { id: "picks_and_shovels", title: "Picks & Shovels (Data / Infra)" },
    ];

    for (const niche of nicheOrder) {
      const list = Array.isArray(suggestions?.[niche.id]) ? suggestions[niche.id] : [];
      if (list.length === 0) continue;
      lines.push(`### ${niche.title}`);
      lines.push("");
      for (const item of list) {
        const label = item?.symbol ? `${item.symbol} (${item.name || item.id})` : `${item.name || item.id}`;
        const score = Number.isFinite(num(item?.score)) ? item.score : "n/a";
        const coverage = Number.isFinite(num(item?.coverageScore)) ? `${item.coverageScore}/7` : "n/a";
        const tracked = item?.isTracked ? " (already tracked)" : "";
        const lowCoverage = item?.lowCoverageOverride ? " (low coverage - limited options)" : "";
        lines.push(`- **${label}**${tracked} - Score ${score} | Coverage ${coverage}${lowCoverage}`);
        const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
        const missing = Array.isArray(item?.missing) ? item.missing : [];
        if (reasons.length > 0) {
          lines.push(`  - Reasons: ${reasons.join("; ")}`);
        }
        if (missing.length > 0) {
          lines.push(`  - Missing: ${missing.join("; ")}`);
        }
        lines.push(`  - Promote: \`node src/signal_engine_promote.js promote ${item.id}\``);
      }
      lines.push("");
    }
  }

  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  if (warnings.length > 0) {
    lines.push("## Data warnings");
    for (const w of warnings.slice(0, 10)) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  const byNiche = new Map();
  for (const item of report?.candidates || []) {
    const niche = item?.niche || "unknown";
    if (!byNiche.has(niche)) byNiche.set(niche, []);
    byNiche.get(niche).push(item);
  }

  const nicheOrder = [
    { id: "ai_compute", title: "AI Compute" },
    { id: "rwa", title: "RWA (Real-World Assets)" },
    { id: "picks_shovels", title: "Picks & Shovels (Data / Infra)" },
  ];

  lines.push("## Candidates");
  lines.push("");

  for (const niche of nicheOrder) {
    const list = byNiche.get(niche.id) || [];
    if (list.length === 0) continue;
    lines.push(`### ${niche.title}`);
    lines.push("");
    for (const c of list) {
      const name = c?.name || c?.coin_gecko_id || "Unknown";
      const symbol = c?.symbol ? ` (${c.symbol})` : "";
      const status = c?.status || "Monitor";
      const growth = c?.scores?.growth?.value;
      const quality = c?.scores?.quality?.value;
      const survivability = c?.scores?.survivability?.value;
      const growthText = Number.isFinite(growth) ? String(growth) : "n/a";
      const qualityText = Number.isFinite(quality) ? String(quality) : "n/a";
      const survivText = Number.isFinite(survivability) ? String(survivability) : "n/a";

      lines.push(`- **${name}${symbol}** - Status: **${status}**`);
      lines.push(
        `  - Scores: Growth ${growthText} | Quality ${qualityText} | Survivability ${survivText}`
      );

      const metrics = c?.metrics || {};
      const usage30d = num(metrics?.usage_total30d_usd) ?? num(metrics?.fees_total30d_usd);
      const usageMoM = num(metrics?.usage_change_30dover30d_pct) ?? num(metrics?.fees_change_30dover30d_pct);
      const usageSource =
        metrics?.usage_source === "defillama_fees"
          ? "DefiLlama fees"
          : metrics?.usage_source === "coingecko_volume"
            ? "CoinGecko volume"
            : "";

      if (Number.isFinite(usage30d)) {
        const sourceNote = usageSource ? ` (source: ${usageSource})` : "";
        lines.push(
          `  - Usage (30d): ${formatUsdCompact(usage30d)} (${formatPct(
            usageMoM,
            1
          )} vs prior 30d)${sourceNote}`
        );
      } else {
        lines.push("  - Usage (30d): n/a");
      }
      if (Number.isFinite(num(metrics?.tvl_usd))) {
        lines.push(`  - TVL (proxy): ${formatUsdCompact(metrics.tvl_usd)}`);
      } else {
        lines.push("  - TVL (proxy): n/a");
      }

      const signals = Array.isArray(c?.signals) ? c.signals : [];
      if (signals.length > 0) {
        lines.push("  - Signals:");
        for (const s of signals) {
          const code = s?.code || "Signal";
          const state = s?.state || "unknown";
          const why = s?.why || "";
          lines.push(`    - ${code}: ${state}${why ? ` - ${why}` : ""}`);
        }
      }
    }
    lines.push("");
  }

  lines.push("## Next steps");
  lines.push("");
  lines.push("- If a score shows `n/a`, that means we still need a clean data source for that metric.");
  lines.push("- To change the 7 candidates, edit: `config/signal_engine_projects.json`");
  lines.push("- This report is generated by: `node src/signal_engine.js`");
  lines.push("");

  return lines.join("\n");
}

async function buildSignalEngineReport() {
  ensureDir(SIGNAL_ENGINE_DIR);
  ensureDir(SIGNAL_ENGINE_CACHE_DIR);
  ensureDir(SIGNAL_ENGINE_HISTORY_DIR);

  const nowIso = new Date().toISOString();
  const warnings = [];
  const categoriesConfig = loadCategoriesConfig();
  const metricRegistry = loadMetricRegistry();

  const config = readJsonFile(SIGNAL_ENGINE_CONFIG_PATH, null);
  const candidatesRaw = Array.isArray(config?.candidates) ? config.candidates : [];
  const candidates = candidatesRaw
    .map((c) => {
      const coinId = normalizeId(c?.coin_gecko_id);
      if (!coinId) return null;
      const niche = String(c?.niche || "").trim();
      return {
        coin_gecko_id: coinId,
        symbol: c?.symbol ? String(c.symbol).toUpperCase() : null,
        name: c?.name ? String(c.name) : coinId,
        niche: niche || "unknown",
        defillama_slug: c?.defillama_slug ? String(c.defillama_slug).trim() : null,
        manual: c?.manual && typeof c.manual === "object" ? c.manual : {},
      };
    })
    .filter(Boolean);

  const trackedIds = new Set(candidates.map((c) => c.coin_gecko_id));
  const nicheUniverse = buildNicheUniverse(categoriesConfig);
  const suggestionIds = Array.from(
    new Set([
      ...nicheUniverse.ai_compute,
      ...nicheUniverse.rwa,
      ...nicheUniverse.picks_and_shovels,
    ])
  );

  if (suggestionIds.length === 0) {
    warnings.push("No suggestion universe found in config/categories.json.");
  }

  if (!config) {
    warnings.push("Missing config: config/signal_engine_projects.json");
  } else if (candidates.length === 0) {
    warnings.push("No Signal Engine candidates configured yet.");
  }

  const allIds = Array.from(new Set([...trackedIds, ...suggestionIds]));
  const allIdsKey = allIds.slice().sort().join(",");
  const protocolMapKey = `v2|${allIdsKey}`;

  const protocolMapCachePath = path.join(SIGNAL_ENGINE_CACHE_DIR, "defillama_protocol_map.json");
  let defillamaMap = readCache(protocolMapCachePath, protocolMapKey);
  if (!defillamaMap) {
    try {
      const protocols = await fetchJson(DEFILLAMA_PROTOCOLS_URL);
      const byGeckoId = {};
      const want = new Set(allIds);
      for (const p of Array.isArray(protocols) ? protocols : []) {
        const gecko = normalizeId(p?.gecko_id);
        const parentSlug = normalizeId(p?.parentProtocolSlug);
        const slug = p?.slug ? String(p.slug).trim() : null;
        const slugKey = normalizeId(slug);
        const tvl = num(p?.tvl);
        const tvlValue = Number.isFinite(tvl) ? tvl : 0;
        if (!slug) continue;

        const matchKey = (() => {
          if (gecko && want.has(gecko)) return gecko;
          if (parentSlug && want.has(parentSlug)) return parentSlug;
          if (slugKey && want.has(slugKey)) return slugKey;
          return null;
        })();
        if (!matchKey) continue;

        if (!byGeckoId[matchKey] || tvlValue > (num(byGeckoId[matchKey]?.tvl) || 0)) {
          byGeckoId[matchKey] = {
            slug,
            name: p?.name || slug,
            category: p?.category || null,
            tvl: tvlValue,
          };
        }
      }
      defillamaMap = { generated_at: nowIso, by_gecko_id: byGeckoId };
      writeCache(protocolMapCachePath, defillamaMap, protocolMapKey);
    } catch (err) {
      warnings.push(`DefiLlama protocol map unavailable: ${err.message}`);
      defillamaMap = { generated_at: nowIso, by_gecko_id: {} };
    }
  }

  const byGeckoId = defillamaMap?.by_gecko_id && typeof defillamaMap.by_gecko_id === "object"
    ? defillamaMap.by_gecko_id
    : {};

  for (const c of candidates) {
    if (c.defillama_slug) continue;
    const found = byGeckoId[c.coin_gecko_id];
    if (found?.slug) {
      c.defillama_slug = found.slug;
    }
  }

  const slugsKey = Array.from(
    new Set(
      allIds
        .map((id) => byGeckoId[id]?.slug)
        .filter(Boolean)
    )
  )
    .slice()
    .sort()
    .join(",");

  const feesOverviewCachePath = path.join(SIGNAL_ENGINE_CACHE_DIR, "defillama_fees_overview.json");
  let feesOverview = readCache(feesOverviewCachePath, slugsKey);
  if (!feesOverview) {
    try {
      const raw = await fetchJson(DEFILLAMA_FEES_OVERVIEW_URL);
      const rows = Array.isArray(raw?.protocols) ? raw.protocols : [];
      const bySlug = {};
      const want = new Set(
        allIds.map((id) => byGeckoId[id]?.slug).filter(Boolean)
      );
      for (const row of rows) {
        const slug = row?.slug ? String(row.slug) : null;
        if (!slug || !want.has(slug)) continue;
        bySlug[slug] = {
          total24h: num(row.total24h),
          total7d: num(row.total7d),
          total30d: num(row.total30d),
          total30DaysAgo: num(row.total30DaysAgo),
          change_7dover7d: num(row.change_7dover7d),
          change_30dover30d: num(row.change_30dover30d),
          updated: nowIso,
        };
      }
      feesOverview = { generated_at: nowIso, by_slug: bySlug };
      writeCache(feesOverviewCachePath, feesOverview, slugsKey);
    } catch (err) {
      warnings.push(`DefiLlama fees overview unavailable: ${err.message}`);
      feesOverview = { generated_at: nowIso, by_slug: {} };
    }
  }

  const feesBySlug = feesOverview?.by_slug && typeof feesOverview.by_slug === "object"
    ? feesOverview.by_slug
    : {};

  let marketMeta = new Map();
  try {
    const marketData = await fetchMarketData(suggestionIds);
    marketMeta = buildMarketMetaMap(marketData);
  } catch (err) {
    warnings.push(`CoinGecko metadata unavailable: ${err.message}`);
    marketMeta = new Map();
  }

  async function fetchTvl(slug) {
    if (!slug) return null;
    const cachePath = path.join(SIGNAL_ENGINE_CACHE_DIR, `defillama_tvl_${slug}.json`);
    const cached = readCache(cachePath, slug);
    if (cached && Number.isFinite(num(cached?.tvl_usd))) {
      return cached.tvl_usd;
    }
    try {
      const tvl = await fetchJson(DEFILLAMA_TVL_URL(slug));
      const tvlUsd = num(tvl);
      if (tvlUsd === null) return null;
      writeCache(cachePath, { tvl_usd: tvlUsd, fetched_at: nowIso }, slug);
      return tvlUsd;
    } catch {
      return null;
    }
  }

  const registryById = metricRegistry?.byId instanceof Map ? metricRegistry.byId : new Map();

  function buildSuggestionsForNiche(nicheKey, ids) {
    const items = ids
      .map((coinIdRaw) => {
        const coinId = normalizeId(coinIdRaw);
        if (!coinId) return null;
        const meta =
          marketMeta.get(coinId) ||
          {
            symbol: "",
            name: byGeckoId[coinId]?.name || coinId,
          };
        const defillamaInfo = byGeckoId[coinId] || {};
        const feesInfo = defillamaInfo?.slug ? feesBySlug[defillamaInfo.slug] || null : null;
        const registryEntry = registryById.get(coinId) || {};
        const isTracked = trackedIds.has(coinId);

        return buildSuggestionRecord({
          niche: nicheKey,
          coinId,
          meta,
          feesInfo,
          defillamaInfo,
          registryEntry,
          isTracked,
        });
      })
      .filter(Boolean);

    let eligible = items.filter((item) => {
      if (nicheKey === "ai_compute") return item.coverageBySignal?.["AI-1"];
      if (nicheKey === "rwa") return item.coverageBySignal?.["RWA-1"];
      if (nicheKey === "picks_and_shovels") return item.coverageBySignal?.["PS-1"];
      return false;
    });

    const untracked = eligible.filter((item) => !item.isTracked);
    const pool = untracked.length > 0 ? untracked : eligible;

    let recommended = pool.filter((item) => item.coverageScore >= 3);
    let lowCoverageOverride = false;
    if (recommended.length === 0) {
      recommended = pool.slice();
      lowCoverageOverride = true;
    }

    recommended.sort((a, b) => (b.score || 0) - (a.score || 0));
    const top = recommended.slice(0, 5).map((item) => {
      if (lowCoverageOverride) {
        return { ...item, lowCoverageOverride: true };
      }
      return item;
    });

    return top;
  }

  const suggestionsReport = {
    generatedAt: nowIso,
    rulesVersion: "v1",
    niches: {
      ai_compute: buildSuggestionsForNiche("ai_compute", nicheUniverse.ai_compute),
      rwa: buildSuggestionsForNiche("rwa", nicheUniverse.rwa),
      picks_and_shovels: buildSuggestionsForNiche("picks_and_shovels", nicheUniverse.picks_and_shovels),
    },
  };

  const suggestionsPath = path.join(
    SIGNAL_ENGINE_DIR,
    "signal_engine_candidate_suggestions.json"
  );
  writeJsonFile(suggestionsPath, suggestionsReport);

  const pendingPath = path.join(
    SIGNAL_ENGINE_DIR,
    "signal_engine_projects.pending.json"
  );
  writeJsonFile(pendingPath, {
    generatedAt: nowIso,
    rulesVersion: "v1",
    notes: "Review these suggestions before updating config/signal_engine_projects.json.",
    niches: {
      ai_compute: suggestionsReport.niches.ai_compute.slice(0, 3),
      rwa: suggestionsReport.niches.rwa.slice(0, 2),
      picks_and_shovels: suggestionsReport.niches.picks_and_shovels.slice(0, 2),
    },
  });

  const outCandidates = [];
  for (const c of candidates) {
    const slug = c.defillama_slug || null;
    const fees = slug ? feesBySlug[slug] || null : null;
    const tvlUsd = slug ? await fetchTvl(slug) : null;

    const feesMoM = num(fees?.change_30dover30d);
    const feesWoW = num(fees?.change_7dover7d);
    const fees30d = num(fees?.total30d);

    let usageSource = null;
    let usage30d = null;
    let usage30dPrev = null;
    let usageMoM = null;
    let usageWoW = null;
    let usagePoints = null;

    if (Number.isFinite(fees30d)) {
      usageSource = "defillama_fees";
      usage30d = fees30d;
      usage30dPrev = num(fees?.total30DaysAgo);
      usageMoM = feesMoM;
      usageWoW = feesWoW;
    } else {
      try {
        const marketChart = await fetchMarketChart(c.coin_gecko_id, { days: 90 });
        const totals = computeVolumeTotals(marketChart);
        if (Number.isFinite(num(totals?.total30d))) {
          usageSource = "coingecko_volume";
          usage30d = totals.total30d;
          usage30dPrev = totals.total30d_prev;
          usageMoM = totals.change_30dover30d;
          usageWoW = totals.change_7dover7d;
          usagePoints = totals.points;
        }
      } catch {
        // ignore volume proxy failures
      }
    }

    const growthScore = scoreFromPctChange(usageMoM, { mid: 0, width: 40 });
    const qualityScore = Number.isFinite(usageWoW)
      ? {
          value: clamp(100 - Math.round(Math.abs(usageWoW) * 2), 0, 100),
          confidence: "medium",
          note: `Based on weekly stability: ${formatPct(usageWoW, 1)} vs prior week.`,
        }
      : { value: null, confidence: "low", note: "Missing data." };
    const survivabilityScore = { value: null, confidence: "low", note: "Not enough survivability data yet." };

    const signals = [];
    const usageSourceLabel =
      usageSource === "defillama_fees"
        ? "DefiLlama fees (proxy)"
        : usageSource === "coingecko_volume"
          ? "CoinGecko volume (proxy)"
          : "n/a";
    if (c.niche === "ai_compute") {
      const ai1 = signalFromPct(usageMoM, { up: 10, down: -10 });
      signals.push({
        code: "AI-1",
        name: "Paid Utilization Proxy (fees)",
        ...ai1,
        source: usageSourceLabel,
      });
      signals.push({
        code: "AI-2",
        name: "Revenue vs Incentives Ratio",
        state: "unknown",
        why: "Needs emissions data (manual) and 2+ quarters of history.",
        confidence: "low",
        source: "manual",
      });
      signals.push({
        code: "AI-3",
        name: "Reliability Trend",
        state: "unknown",
        why: "Needs an incident log or a public status-page feed.",
        confidence: "low",
        source: "manual",
      });
    } else if (c.niche === "rwa") {
      signals.push({
        code: "RWA-1",
        name: "Assets Under Tokenization (AUT) Growth",
        state: "unknown",
        why: "Needs an AUT data source (TVL can be used as a temporary proxy).",
        confidence: "low",
        source: "manual / proxy",
      });
      signals.push({
        code: "RWA-2",
        name: "Issuer Diversity",
        state: "unknown",
        why: "Needs issuer list and concentration data.",
        confidence: "low",
        source: "manual",
      });
    } else if (c.niche === "picks_shovels") {
      const ps1 = signalFromPct(usageMoM, { up: 5, down: -15 });
      signals.push({
        code: "PS-1",
        name: "Revenue Retention Proxy (fees stability)",
        ...ps1,
        source: usageSourceLabel,
      });
      signals.push({
        code: "PS-2",
        name: "Revenue per User / Client",
        state: "unknown",
        why: "Needs a per-project active client proxy.",
        confidence: "low",
        source: "manual",
      });
    }

    const status = statusFromSignals(signals);

    outCandidates.push({
      coin_gecko_id: c.coin_gecko_id,
      symbol: c.symbol,
      name: c.name,
      niche: c.niche,
      status,
      sources: {
        defillama_slug: slug,
      },
      metrics: {
        fees_total24h_usd: num(fees?.total24h),
        fees_total7d_usd: num(fees?.total7d),
        fees_total30d_usd: fees30d,
        fees_total30d_prev_usd: num(fees?.total30DaysAgo),
        fees_change_7dover7d_pct: feesWoW,
        fees_change_30dover30d_pct: feesMoM,
        usage_total30d_usd: usage30d,
        usage_total30d_prev_usd: usage30dPrev,
        usage_change_7dover7d_pct: usageWoW,
        usage_change_30dover30d_pct: usageMoM,
        usage_source: usageSource,
        usage_points: usagePoints,
        tvl_usd: tvlUsd,
      },
      signals,
      scores: {
        growth: growthScore,
        quality: qualityScore,
        survivability: survivabilityScore,
      },
    });
  }

  const report = {
    generated_at: nowIso,
    candidate_count: outCandidates.length,
    warnings,
    data_sources: {
      defillama: "https://defillama.com (fees + TVL proxies where available)",
      coingecko: "https://www.coingecko.com (metadata for suggestions)",
    },
    candidates: outCandidates,
  };

  const jsonPath = path.join(SIGNAL_ENGINE_DIR, "SignalEngine.json");
  const mdPath = path.join(SIGNAL_ENGINE_DIR, "SignalEngine.md");
  writeJsonFile(jsonPath, report);
  fs.writeFileSync(mdPath, renderMarkdown(report, suggestionsReport), "utf8");

  const runId = isoToFilename(nowIso);
  const historyJsonPath = path.join(SIGNAL_ENGINE_HISTORY_DIR, `${runId}_SignalEngine.json`);
  writeJsonFile(historyJsonPath, report);

  return report;
}

async function main() {
  try {
    const report = await buildSignalEngineReport();
    const count = report?.candidate_count || 0;
    console.log(`Signal Engine: wrote ${count} candidate(s) to reports/signal_engine/SignalEngine.md`);
    process.exit(0);
  } catch (err) {
    try {
      ensureDir(SIGNAL_ENGINE_DIR);
      const fallback = {
        generated_at: new Date().toISOString(),
        candidate_count: 0,
        warnings: [`Signal Engine failed to run: ${err.message}`],
        candidates: [],
      };
      writeJsonFile(path.join(SIGNAL_ENGINE_DIR, "SignalEngine.json"), fallback);
      fs.writeFileSync(
        path.join(SIGNAL_ENGINE_DIR, "SignalEngine.md"),
        renderMarkdown(fallback, null),
        "utf8"
      );
    } catch {
      // ignore secondary failures
    }
    console.warn(`Signal Engine failed (soft): ${err.message}`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
