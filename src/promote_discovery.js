const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "config");
const WATCHLIST_PATH = path.join(CONFIG_DIR, "watchlist.json");
const STAGING_WATCHLIST_PATH = path.join(CONFIG_DIR, "watchlist_staging.json");
const DISCOVERY_QUEUE_PATH = path.join(CONFIG_DIR, "discovery_queue.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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

function formatUsd(value) {
  if (!Number.isFinite(value)) return "n/a";
  const digits = Math.abs(value) >= 1 ? 2 : 6;
  return (
    "$" +
    value.toLocaleString("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    })
  );
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function buildEmptyQueue() {
  return {
    schema_version: 1,
    generated_at: null,
    criteria: null,
    candidates: [],
  };
}

function loadState() {
  ensureDir(CONFIG_DIR);

  const watchlist = readJsonFile(WATCHLIST_PATH, []);
  const staging = readJsonFile(STAGING_WATCHLIST_PATH, []);
  const queue = readJsonFile(DISCOVERY_QUEUE_PATH, buildEmptyQueue());

  const watchlistArr = Array.isArray(watchlist) ? watchlist : [];
  const stagingArr = Array.isArray(staging) ? staging : [];
  const candidatesArr = Array.isArray(queue?.candidates) ? queue.candidates : [];

  const queueById = new Map();
  for (const entry of candidatesArr) {
    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId || entry?.id);
    if (!idLower) continue;
    if (!entry.coinGeckoId && entry.id) {
      entry.coinGeckoId = entry.id;
    }
    if (entry.notes === undefined) {
      entry.notes = "";
    }
    queueById.set(idLower, entry);
  }

  const watchlistById = new Map();
  for (const entry of watchlistArr) {
    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId);
    if (!idLower) continue;
    watchlistById.set(idLower, entry);
  }

  const stagingById = new Map();
  for (const entry of stagingArr) {
    const idLower = normalizeCoinGeckoId(entry?.coinGeckoId);
    if (!idLower) continue;
    stagingById.set(idLower, entry);
  }

  return {
    watchlist: watchlistArr,
    staging: stagingArr,
    queue: { ...buildEmptyQueue(), ...(queue || {}), candidates: candidatesArr },
    queueById,
    watchlistById,
    stagingById,
  };
}

function saveState(state) {
  writeJsonFile(WATCHLIST_PATH, state.watchlist);
  writeJsonFile(STAGING_WATCHLIST_PATH, state.staging);
  writeJsonFile(DISCOVERY_QUEUE_PATH, state.queue);
}

function toWatchlistEntry(candidate, existing = null) {
  const symbol = (candidate?.symbol || existing?.symbol || "").toUpperCase();
  const name = candidate?.name || existing?.name || "";
  const coinGeckoId = candidate?.coinGeckoId || candidate?.id || existing?.coinGeckoId || "";
  return {
    symbol,
    name,
    coinGeckoId,
    category: existing?.category || "discovery",
    urls: existing?.urls || { official: "", x: "", blog: "", github: "" },
    notes: existing?.notes || "",
  };
}

function usage(exitCode = 0) {
  const msg = [
    "Discovery Queue Manager",
    "",
    "Usage:",
    "  node src/promote_discovery.js list [--all]",
    "  node src/promote_discovery.js stage <coinGeckoId...>",
    "  node src/promote_discovery.js promote <coinGeckoId...>",
    "  node src/promote_discovery.js ignore <coinGeckoId...>",
    "  node src/promote_discovery.js unstage <coinGeckoId...>",
    "  node src/promote_discovery.js unignore <coinGeckoId...>",
    "",
    "Notes:",
    "  - Run discovery first: node src/discover.js",
    "  - Staging list: config/watchlist_staging.json (scanned by src/index.js)",
    "  - Main watchlist: config/watchlist.json",
    "",
  ].join("\n");
  console.log(msg);
  process.exitCode = exitCode;
}

function listQueue({ all = false } = {}) {
  const state = loadState();
  const entries = Array.from(state.queueById.values());
  const filtered = all
    ? entries
    : entries.filter((e) => e?.status === "NEW" || e?.status === "STAGED");

  filtered.sort((a, b) => (b.discovery_score || 0) - (a.discovery_score || 0));

  if (filtered.length === 0) {
    console.log(
      all
        ? "No discovery queue entries yet. Run: node src/discover.js"
        : "No NEW/STAGED entries. Use --all to view everything."
    );
    return;
  }

  console.log(
    `Discovery queue (${all ? "ALL" : "NEW+STAGED"}): ${filtered.length} entries\n`
  );
  for (const entry of filtered.slice(0, 50)) {
    const id = entry.coinGeckoId || entry.id || "n/a";
    const score =
      typeof entry.discovery_score === "number" && Number.isFinite(entry.discovery_score)
        ? entry.discovery_score.toFixed(1)
        : "n/a";
    const symbol = entry.symbol ? entry.symbol.toUpperCase() : "n/a";
    const name = entry.name || "n/a";
    const mc = formatUsd(entry.market_cap);
    const vol = formatUsd(entry.volume_24h);
    const ch7d = formatPct(entry.price_change_7d);
    const status = entry.status || "NEW";
    console.log(
      `- ${id} | ${status} | score=${score} | ${symbol} | ${name} | mc=${mc} | vol=${vol} | 7d=${ch7d}`
    );
  }
  if (filtered.length > 50) {
    console.log(`\n(Showing top 50 of ${filtered.length})`);
  }
}

function requireIds(args) {
  const ids = args.map(normalizeCoinGeckoId).filter(Boolean);
  if (ids.length === 0) {
    usage(1);
    return null;
  }
  return ids;
}

function stage(ids) {
  const state = loadState();
  let changed = false;

  for (const idLower of ids) {
    if (state.watchlistById.has(idLower)) {
      console.log(`- ${idLower}: already in main watchlist (skipping)`);
      const q = state.queueById.get(idLower);
      if (q) {
        if (q.status !== "PROMOTED") {
          q.status = "PROMOTED";
          changed = true;
        }
      }
      continue;
    }

    const q = state.queueById.get(idLower);
    if (!q) {
      console.log(`- ${idLower}: not in discovery queue (run node src/discover.js)`);
      continue;
    }
    if (q.status === "IGNORED") {
      console.log(`- ${idLower}: status=IGNORED (use unignore first)`);
      continue;
    }
    if (q.status === "PROMOTED") {
      console.log(`- ${idLower}: status=PROMOTED (already handled)`);
      continue;
    }

    if (state.stagingById.has(idLower)) {
      console.log(`- ${idLower}: already staged`);
      if (q.status !== "STAGED") {
        q.status = "STAGED";
        changed = true;
      }
      continue;
    }

    const entry = toWatchlistEntry({ ...q, coinGeckoId: q.coinGeckoId || q.id });
    state.staging.push(entry);
    state.stagingById.set(idLower, entry);
    q.status = "STAGED";
    changed = true;
    console.log(`- ${idLower}: staged`);
  }

  if (changed) {
    state.queue.candidates = Array.from(state.queueById.values());
    saveState(state);
  }
}

function promote(ids) {
  const state = loadState();
  let changed = false;

  for (const idLower of ids) {
    if (state.watchlistById.has(idLower)) {
      console.log(`- ${idLower}: already in main watchlist`);
      const q = state.queueById.get(idLower);
      if (q) {
        if (q.status !== "PROMOTED") {
          q.status = "PROMOTED";
          changed = true;
        }
      }
      continue;
    }

    const staged = state.stagingById.get(idLower) || null;
    const q = state.queueById.get(idLower) || null;
    if (!staged && !q) {
      console.log(`- ${idLower}: not staged and not in queue`);
      continue;
    }

    const entry = staged
      ? toWatchlistEntry(null, staged)
      : toWatchlistEntry({ ...q, coinGeckoId: q.coinGeckoId || q.id });

    state.watchlist.push(entry);
    state.watchlistById.set(idLower, entry);
    changed = true;

    if (staged) {
      state.staging = state.staging.filter(
        (c) => normalizeCoinGeckoId(c?.coinGeckoId) !== idLower
      );
      state.stagingById.delete(idLower);
    }

    if (q) {
      q.status = "PROMOTED";
    } else {
      const now = new Date().toISOString();
      state.queueById.set(idLower, {
        coinGeckoId: entry.coinGeckoId,
        symbol: entry.symbol,
        name: entry.name,
        status: "PROMOTED",
        notes: "",
        first_seen_at: now,
        last_seen_at: now,
      });
    }

    console.log(`- ${idLower}: promoted`);
  }

  if (changed) {
    state.queue.candidates = Array.from(state.queueById.values());
    saveState(state);
  }
}

function ignore(ids) {
  const state = loadState();
  let changed = false;

  for (const idLower of ids) {
    if (state.watchlistById.has(idLower)) {
      console.log(
        `- ${idLower}: is in main watchlist (remove it manually if you intend to ignore)`
      );
    }

    const q = state.queueById.get(idLower);
    if (!q) {
      const now = new Date().toISOString();
      state.queueById.set(idLower, {
        coinGeckoId: idLower,
        symbol: "",
        name: "",
        status: "IGNORED",
        notes: "",
        first_seen_at: now,
        last_seen_at: now,
      });
      changed = true;
      console.log(`- ${idLower}: added to queue as IGNORED`);
    } else {
      q.status = "IGNORED";
      changed = true;
      console.log(`- ${idLower}: marked IGNORED`);
    }

    if (state.stagingById.has(idLower)) {
      state.staging = state.staging.filter(
        (c) => normalizeCoinGeckoId(c?.coinGeckoId) !== idLower
      );
      state.stagingById.delete(idLower);
      changed = true;
      console.log(`  removed from staging`);
    }
  }

  if (changed) {
    state.queue.candidates = Array.from(state.queueById.values());
    saveState(state);
  }
}

function unstage(ids) {
  const state = loadState();
  let changed = false;

  for (const idLower of ids) {
    if (!state.stagingById.has(idLower)) {
      console.log(`- ${idLower}: not staged`);
      continue;
    }

    state.staging = state.staging.filter(
      (c) => normalizeCoinGeckoId(c?.coinGeckoId) !== idLower
    );
    state.stagingById.delete(idLower);
    changed = true;
    console.log(`- ${idLower}: unstaged`);

    const q = state.queueById.get(idLower);
    if (q && q.status === "STAGED") {
      q.status = "NEW";
    }
  }

  if (changed) {
    state.queue.candidates = Array.from(state.queueById.values());
    saveState(state);
  }
}

function unignore(ids) {
  const state = loadState();
  let changed = false;

  for (const idLower of ids) {
    const q = state.queueById.get(idLower);
    if (!q) {
      console.log(`- ${idLower}: not in queue`);
      continue;
    }
    if (q.status !== "IGNORED") {
      console.log(`- ${idLower}: status=${q.status || "NEW"} (no change)`);
      continue;
    }
    q.status = "NEW";
    changed = true;
    console.log(`- ${idLower}: unignored (status=NEW)`);
  }

  if (changed) {
    state.queue.candidates = Array.from(state.queueById.values());
    saveState(state);
  }
}

function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage(0);
    return;
  }

  if (command === "list") {
    listQueue({ all: rest.includes("--all") });
    return;
  }

  const ids = requireIds(rest);
  if (!ids) return;

  switch (command) {
    case "stage":
      stage(ids);
      return;
    case "promote":
      promote(ids);
      return;
    case "ignore":
      ignore(ids);
      return;
    case "unstage":
      unstage(ids);
      return;
    case "unignore":
      unignore(ids);
      return;
    default:
      console.log(`Unknown command: ${command}\n`);
      usage(1);
  }
}

main();
