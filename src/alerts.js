const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPORTS_DIR = path.join(__dirname, "..", "reports");
const CACHE_DIR = path.join(REPORTS_DIR, "cache");
const ALT_STRENGTH_STATE_PATH = path.join(CACHE_DIR, "alt_strength_state.json");

function normalizeId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSignedPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function readJson(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getAltStrengthMode(groups) {
  const stronger = Array.isArray(groups?.stronger) ? groups.stronger.length : 0;
  const weaker = Array.isArray(groups?.weaker) ? groups.weaker.length : 0;
  const inline = Array.isArray(groups?.inline) ? groups.inline.length : 0;

  let mode = "mixed";
  if (stronger >= 4 && stronger >= weaker + 2) {
    mode = "alts leading";
  } else if (weaker >= 4 && weaker >= stronger + 2) {
    mode = "alts lagging";
  }

  return { mode, stronger, weaker, inline };
}

function loadAltStrengthState() {
  return readJson(ALT_STRENGTH_STATE_PATH, null);
}

function saveAltStrengthState(state) {
  if (!state) return;
  writeJson(ALT_STRENGTH_STATE_PATH, state);
}

function formatUsdCompact(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const fmt = (n) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  if (abs >= 1e12) return `$${fmt(value / 1e12)}T`;
  if (abs >= 1e9) return `$${fmt(value / 1e9)}B`;
  if (abs >= 1e6) return `$${fmt(value / 1e6)}M`;
  if (abs >= 1e3) return `$${fmt(value / 1e3)}K`;
  return `$${fmt(value)}`;
}

function explainAlert(alert) {
  const why = [];
  const risks = [];

  const source = String(alert?.source || "").toLowerCase();
  const symbol = alert?.symbol ? String(alert.symbol) : "this coin";
  const details = alert?.details || {};

  const pushUnique = (list, value) => {
    if (!value) return;
    const text = String(value).trim();
    if (!text) return;
    if (list.includes(text)) return;
    list.push(text);
  };

  if (source === "blue_chip_dip") {
    pushUnique(why, "This is a large, liquid coin that pulled back from a recent high.");
    if (Number.isFinite(details.dip_from_7d_high)) {
      pushUnique(why, `Dip from recent high: ${details.dip_from_7d_high.toFixed(1)}%.`);
    }
    if (Number.isFinite(details.rsi)) {
      pushUnique(why, `Momentum indicator (RSI) is ${details.rsi.toFixed(0)}.`);
    }
    if (details.entry_signal) {
      pushUnique(why, `Entry signal: ${String(details.entry_signal).replace(/_/g, " ")}.`);
    }

    const warnings = Array.isArray(details.risk_warnings) ? details.risk_warnings : [];
    for (const w of warnings) pushUnique(risks, w);
    pushUnique(risks, "Even blue chips can keep dropping; consider waiting for stabilization.");
  } else if (source.startsWith("market_")) {
    pushUnique(why, "This alert comes from the overall market condition checks (not a single coin).");
    if (details.signal_type) pushUnique(why, `Signal: ${details.signal_type}.`);
    if (details.strength) pushUnique(why, `Strength: ${details.strength}.`);
    if (details.recommendation) pushUnique(why, `Suggested action: ${details.recommendation}.`);
    pushUnique(risks, "Market conditions can change quickly; avoid oversized bets.");
    pushUnique(risks, "If you are unsure, wait for confirmation and use smaller size.");
  } else if (source === "btc_share_shift") {
    pushUnique(why, "BTC market share moved meaningfully in the last 24 hours (rotation signal).");
    if (details.btc_share_pct) pushUnique(why, `BTC share now: ${details.btc_share_pct}.`);
    if (Number.isFinite(details.change_24h)) {
      pushUnique(why, `Change in 24h: ${details.change_24h.toFixed(2)}%.`);
    }
    pushUnique(risks, "Rotation can reverse fast; do not chase late moves.");
    pushUnique(risks, "Use smaller size until the trend persists.");
  } else if (source === "alt_strength_flip") {
    pushUnique(why, "A quick check of major alts vs BTC flipped direction (rotation signal).");
    if (details.mode) pushUnique(why, `Now: ${details.mode}.`);
    if (details.previous_mode) pushUnique(why, `Previously: ${details.previous_mode}.`);
    pushUnique(risks, "This is a small sample signal; it can flip back.");
    pushUnique(risks, "Avoid forcing trades on mixed signals.");
  } else if (source === "best_entry") {
    pushUnique(why, "This coin ranks high for entry timing among your watchlist.");
    if (details.entry_signal) pushUnique(why, `Entry signal: ${String(details.entry_signal).replace(/_/g, " ")}.`);
    if (Number.isFinite(details.rsi)) pushUnique(why, `RSI: ${details.rsi.toFixed(0)}.`);
    if (details.hygiene_label) pushUnique(why, `Verdict: ${details.hygiene_label}.`);
    pushUnique(risks, "A good entry can still fail if the market turns down.");
    pushUnique(risks, "Check recent news and use a stop or smaller size.");
  } else if (source === "signal_score") {
    pushUnique(why, "This coin has a strong overall signal score and an actionable entry setup.");
    if (details.entry_signal) pushUnique(why, `Entry signal: ${String(details.entry_signal).replace(/_/g, " ")}.`);
    if (Number.isFinite(details.total_score)) pushUnique(why, `Signal score: ${details.total_score}.`);
    if (details.trend_regime) pushUnique(why, `Trend: ${details.trend_regime}.`);
    pushUnique(risks, "High scores can still fail if the market turns down.");
    pushUnique(risks, "Double-check liquidity, unlocks, and news before sizing up.");
  } else if (source === "take_profit" || source === "take_profit_approaching") {
    pushUnique(why, "This alert is based on your portfolio entry price and current price.");
    if (Number.isFinite(details.profit_pct)) pushUnique(why, `Current profit: ${details.profit_pct.toFixed(1)}%.`);
    if (details.signal) pushUnique(why, `Signal: ${String(details.signal).replace(/_/g, " ")}.`);
    pushUnique(risks, "Profits can disappear quickly in crypto; consider taking some off.");
    pushUnique(risks, "Be careful with limit orders in low-liquidity markets.");
  } else if (source === "defi_hack" || source === "defi_no_audit" || source === "defi_tvl_collapse") {
    pushUnique(why, "This alert flags DeFi-specific safety risks for a watchlist coin.");
    if (details.defi_protocol) pushUnique(why, `Protocol match: ${details.defi_protocol}.`);
    if (Number.isFinite(details.hack_count)) pushUnique(why, `Known hacks: ${details.hack_count}.`);
    if (Number.isFinite(details.hack_total_usd)) pushUnique(why, `Total lost: ${formatUsdCompact(details.hack_total_usd)}.`);
    if (details.audit_status) pushUnique(why, `Audit status: ${details.audit_status}.`);
    pushUnique(risks, "Smart contract risk can be sudden and total (not like slow price moves).");
    pushUnique(risks, "If you do anything, keep size small and prefer audited projects.");
  } else if (source === "volume_news") {
    pushUnique(why, "This coin has a jump in trading activity alongside an increase in news.");
    if (details.volume_ratio_label) pushUnique(why, `Volume change: ${details.volume_ratio_label}.`);
    if (details.sentiment) pushUnique(why, `News tone: ${details.sentiment}.`);
    pushUnique(risks, "Volume spikes can fade quickly; avoid buying after a large move.");
    pushUnique(risks, "Make sure the news is real and relevant, not recycled hype.");
  } else if (source === "news") {
    pushUnique(why, "This coin has unusually active news coverage recently.");
    if (Number.isFinite(details.news_count_24h) && details.news_count_24h > 0) {
      pushUnique(why, `News today: ${details.news_count_24h}.`);
    } else if (Number.isFinite(details.news_count_7d)) {
      pushUnique(why, `News this week: ${details.news_count_7d}.`);
    }
    if (details.sentiment) pushUnique(why, `News tone: ${details.sentiment}.`);
    pushUnique(risks, "News-driven moves can reverse once attention drops.");
    pushUnique(risks, "Double-check the top headline before trading.");
  } else if (source === "watchlist") {
    pushUnique(why, `${symbol} is marked as KEEP and has a clean catalyst in the last 14 days.`);
    if (details.catalyst) pushUnique(why, `Catalyst: ${details.catalyst}.`);
    if (details.hygiene_label) pushUnique(why, `Verdict: ${details.hygiene_label}.`);
    pushUnique(risks, "Catalysts can fail to deliver; avoid betting too much on one event.");
    pushUnique(risks, "Watch for unlocks, dilution, and sudden bad news.");
  } else if (source === "improving") {
    pushUnique(why, `${symbol} looks better than the last scan.`);
    if (details.from_label && details.to_label) {
      pushUnique(why, `Rating changed from ${details.from_label} to ${details.to_label}.`);
    }
    if (details.from_entry_signal && details.to_entry_signal) {
      pushUnique(why, "Entry timing also improved.");
    }
    pushUnique(risks, "An improvement does not guarantee price goes up next; still check news and unlocks.");
    pushUnique(risks, "If liquidity is low, keep size small and use limit orders.");
  } else if (source === "discovery") {
    pushUnique(why, "This coin was flagged by the discovery scanner as a high-score candidate.");
    if (details.status) pushUnique(why, `Discovery status: ${details.status}.`);
    if (Number.isFinite(details.market_cap)) pushUnique(why, `Market cap: ${formatUsdCompact(details.market_cap)}.`);
    if (Number.isFinite(details.volume_24h)) pushUnique(why, `24h volume: ${formatUsdCompact(details.volume_24h)}.`);
    pushUnique(risks, "New finds can be very volatile; treat as watch-first.");
    pushUnique(risks, "Liquidity can drop fast; use small size and avoid market orders.");
  } else if (source === "defi") {
    pushUnique(why, "This protocol scored well in the DeFi scan.");
    if (details.bucket) pushUnique(why, `Bucket: ${details.bucket}.`);
    if (Number.isFinite(details.score)) pushUnique(why, `Score: ${details.score}.`);
    if (Number.isFinite(details.tvl)) pushUnique(why, `TVL: ${formatUsdCompact(details.tvl)}.`);
    pushUnique(risks, "A high score does not remove smart contract risk.");
    pushUnique(risks, "Always check audits, TVL trend, and recent exploits.");
  } else {
    pushUnique(why, "This alert is triggered by the scanner rules.");
    if (alert?.title) pushUnique(why, String(alert.title));
    pushUnique(risks, "If the reason is unclear, open the full report links for details.");
    pushUnique(risks, "Use smaller size on unclear signals.");
  }

  return {
    why: why.slice(0, 3),
    risks: risks.slice(0, 2),
  };
}

function computeAlerts({
  layer1Report,
  previousLayer1Report,
  defiLatest,
  discoveryQueue,
  macroPulse,
  thresholds,
}) {
  const generatedAt = new Date().toISOString();
  const alerts = [];

  const alertOnActionable = thresholds.alert_actionable !== false;
  const defiThreshold = num(thresholds.defi_score_threshold);
  const discoveryThreshold = num(thresholds.discovery_score_threshold);
  const signalThreshold = num(thresholds.signal_score_threshold);

  const coins = Array.isArray(layer1Report?.coins) ? layer1Report.coins : [];
  const marketCondition = layer1Report?.market_condition?.signals;
  const prevCoins = Array.isArray(previousLayer1Report?.coins)
    ? previousLayer1Report.coins
    : [];
  const prevById = new Map();
  for (const prev of prevCoins) {
    const idKey = normalizeId(prev?.coin_gecko_id) || normalizeId(prev?.symbol);
    if (idKey && !prevById.has(idKey)) prevById.set(idKey, prev);
  }

  const hygieneRank = (label) => {
    switch (label) {
      case "DROP":
        return 0;
      case "WATCH-ONLY":
        return 1;
      case "KEEP":
        return 2;
      default:
        return -1;
    }
  };

  const friendlyHygiene = (label) => {
    switch (label) {
      case "KEEP":
        return "Buy";
      case "WATCH-ONLY":
        return "Watch";
      case "DROP":
        return "Avoid";
      default:
        return "Unknown";
    }
  };

  const entryRank = (signal) => {
    switch (signal) {
      case "overbought":
        return 0;
      case "wait":
        return 1;
      case "buy":
        return 2;
      case "strong_buy":
        return 3;
      default:
        return -1;
    }
  };

  const friendlyEntry = (signal) => {
    switch (signal) {
      case "strong_buy":
        return "Very good entry";
      case "buy":
        return "Good entry";
      case "wait":
        return "Wait for a better price";
      case "overbought":
        return "Too hot (overbought)";
      default:
        return "Unknown";
    }
  };

  const didSignalChange = (coin, prev, { requireNewsChange = false } = {}) => {
    if (!prev) return true;
    const scoreNow = num(coin?.score_breakdown?.total_score);
    const scorePrev = num(prev?.score_breakdown?.total_score);
    const scoreDelta =
      scoreNow !== null && scorePrev !== null ? Math.abs(scoreNow - scorePrev) : null;
    const entryChanged = (coin?.entry_signal || null) !== (prev?.entry_signal || null);
    const trendChanged = (coin?.trend_regime || null) !== (prev?.trend_regime || null);
    const newsChanged =
      (coin?.news_activity || null) !== (prev?.news_activity || null) ||
      (coin?.news_count_24h || 0) !== (prev?.news_count_24h || 0) ||
      (coin?.news_count_7d || 0) !== (prev?.news_count_7d || 0);

    if (requireNewsChange) return newsChanged;
    if (entryChanged || trendChanged) return true;
    if (scoreDelta !== null && scoreDelta >= 5) return true;
    return false;
  };
  
  // === MARKET CONDITION ALERTS (HIGHEST PRIORITY) ===
  // Accumulation alerts - time to buy
  if (marketCondition?.accumulation?.length > 0) {
    for (const signal of marketCondition.accumulation) {
      const strengthTag = signal.strength === "strong" ? "STRONG " : "";
      const priority = signal.strength === "strong" ? 100 : 80;
      alerts.push({
        key: `market:accumulation:${signal.signal}`,
        source: "market_accumulation",
        watchlist_source: null,
        symbol: "MARKET",
        title: `${strengthTag}ACCUMULATION: ${signal.message}`,
        score: priority,
        url: null,
        details: {
          signal_type: signal.signal,
          strength: signal.strength,
          recommendation: "Consider buying / DCA",
        },
      });
    }
  }
  
  // Run alerts - momentum plays
  if (marketCondition?.run?.length > 0) {
    for (const signal of marketCondition.run) {
      const strengthTag = signal.strength === "strong" ? "STRONG " : "";
      const priority = signal.strength === "strong" ? 70 : 60;
      alerts.push({
        key: `market:run:${signal.signal}`,
        source: "market_run",
        watchlist_source: null,
        symbol: "MARKET",
        title: `${strengthTag}RUN STARTING: ${signal.message}`,
        score: priority,
        url: null,
        details: {
          signal_type: signal.signal,
          strength: signal.strength,
          recommendation: "Quick momentum play (5-10%)",
        },
      });
    }
  }
  
  // Warning alerts
  if (marketCondition?.warnings?.length > 0) {
    for (const signal of marketCondition.warnings) {
      alerts.push({
        key: `market:warning:${signal.signal}`,
        source: "market_warning",
        watchlist_source: null,
        symbol: "MARKET",
        title: ` CAUTION: ${signal.message}`,
        score: 50,
        url: null,
        details: {
          signal_type: signal.signal,
          recommendation: "Consider taking profits",
        },
      });
    }
  }
  
  // === MACRO PULSE ALERTS (BTC share shifts + alt strength flips) ===
  const btcShareChange = num(macroPulse?.btc_share?.change_24h);
  if (btcShareChange !== null) {
    const absChange = Math.abs(btcShareChange);
    if (absChange >= 0.5) {
      const changeText = absChange.toFixed(1);
      const sharePct = num(macroPulse?.btc_share?.pct);
      const shareText = sharePct !== null ? `${sharePct.toFixed(1)}%` : "n/a";
      const title =
        btcShareChange > 0
          ? `BTC share up ${changeText}% in 24h - BTC taking share from alts`
          : `BTC share down ${changeText}% in 24h - alts gaining share`;
      const score = 60 + Math.min(20, Math.round(absChange * 10));
      alerts.push({
        key: `macro:btc_share:${btcShareChange > 0 ? "up" : "down"}`,
        source: "btc_share_shift",
        watchlist_source: null,
        symbol: "MARKET",
        title,
        score,
        url: null,
        details: {
          btc_share_pct: shareText,
          change_24h: btcShareChange,
        },
      });
    }
  }

  if (macroPulse?.alt_strength?.groups) {
    const { mode, stronger, weaker, inline } = getAltStrengthMode(
      macroPulse.alt_strength.groups
    );
    const prev = loadAltStrengthState();
    const prevMode = prev?.mode;
    const prevTs = prev?.timestamp ? Date.parse(prev.timestamp) : null;
    const ageHours =
      Number.isFinite(prevTs) ? (Date.now() - prevTs) / (1000 * 60 * 60) : null;

    if (mode !== "mixed" && prevMode && mode !== prevMode && (ageHours === null || ageHours >= 6)) {
      const title =
        mode === "alts leading"
          ? "Alt strength flipped: more alts beating BTC"
          : "Alt strength flipped: more alts lagging BTC";
      alerts.push({
        key: `macro:alt_strength:${mode.replace(/\s+/g, "_")}`,
        source: "alt_strength_flip",
        watchlist_source: null,
        symbol: "MARKET",
        title,
        score: 55,
        url: null,
        details: {
          mode,
          stronger,
          weaker,
          inline,
          previous_mode: prevMode || null,
        },
      });
    }

    saveAltStrengthState({
      mode,
      stronger,
      weaker,
      inline,
      timestamp: new Date().toISOString(),
    });
  }
  
  // === BLUE CHIP DIP ALERTS (safer plays) ===
  const blueChipOpps = layer1Report?.blue_chip_opportunities?.opportunities || [];
  for (const opp of blueChipOpps.slice(0, 5)) { // Top 5 opportunities

    const priority = opp.signal_strength + (opp.market_in_fear ? 10 : 0);
    const riskWarnings = Array.isArray(opp.risk_warnings) ? opp.risk_warnings : [];
    const cautionTag = riskWarnings.length > 0 ? " (caution)" : "";
    const score = Math.max(0, priority - (riskWarnings.length > 0 ? 10 : 0));
    alerts.push({
      key: `bluechip:dip:${opp.coin_gecko_id}`,
      source: "blue_chip_dip",
      watchlist_source: null,
      symbol: opp.symbol,
      title: `${opp.name} dip: ${opp.signals.slice(0, 2).join(", ")}${cautionTag}`,
      score,
      url: `https://www.coingecko.com/en/coins/${encodeURIComponent(opp.coin_gecko_id)}`,
      details: {
        price: opp.price,
        market_cap: opp.market_cap,
        change_7d: opp.change_7d,
        rsi: opp.rsi,
        dip_from_7d_high: opp.dip_from_7d_high,
        entry_signal: opp.entry_signal,
        signal_strength: opp.signal_strength,
        all_signals: opp.signals,
        risk_warnings: riskWarnings,
        news_signal: opp.news_signal || null,
        news_sentiment: opp.news_sentiment || null,
        news_headline: opp.news_headline || null,
      },
    });
  }
  
  // === DEFI RISK ALERTS (hacks, no audits, TVL collapse) ===
  for (const coin of coins) {
    if (!coin.defi_matched) continue;
    
    // Past hack alert (high priority warning)
    if (coin.defi_hack_count > 0) {
      alerts.push({
        key: `defi_hack:${coin.coin_gecko_id || coin.symbol}`,
        source: "defi_hack",
        watchlist_source: coin.watchlist_source,
        symbol: coin.symbol,
        title: ` ${coin.symbol} has ${coin.defi_hack_count} past hack${coin.defi_hack_count > 1 ? 's' : ''} ($${(coin.defi_hack_total_usd / 1000000).toFixed(1)}M lost)`,
        score: 80,
        url: coin.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          hack_count: coin.defi_hack_count,
          hack_total_usd: coin.defi_hack_total_usd,
          defi_protocol: coin.defi_protocol_name,
        },
      });
    }
    
    // No audit warning
    if (coin.defi_audit_status === "NO" && coin.hygiene_label !== "DROP") {
      alerts.push({
        key: `defi_no_audit:${coin.coin_gecko_id || coin.symbol}`,
        source: "defi_no_audit",
        watchlist_source: coin.watchlist_source,
        symbol: coin.symbol,
        title: ` ${coin.symbol} has NO audit - higher smart contract risk`,
        score: 40,
        url: null,
        details: {
          audit_status: coin.defi_audit_status,
          defi_protocol: coin.defi_protocol_name,
        },
      });
    }
    
    // TVL collapse warning
    if (coin.defi_flags?.tvl_collapse) {
      alerts.push({
        key: `defi_tvl_collapse:${coin.coin_gecko_id || coin.symbol}`,
        source: "defi_tvl_collapse",
        watchlist_source: coin.watchlist_source,
        symbol: coin.symbol,
        title: ` ${coin.symbol} TVL collapsing - users leaving the protocol`,
        score: 60,
        url: null,
        details: {
          defi_tvl: coin.defi_tvl,
          defi_tvl_change_30d: coin.defi_tvl_change_30d,
        },
      });
    }
  }
  
  // === BEST ENTRIES TODAY (from watchlist) ===
  const bestEntries = layer1Report?.best_entries?.best_entries || [];
  for (const entry of bestEntries.slice(0, 3)) { // Top 3 best entries
    if (entry.entry_signal !== "strong_buy" && entry.entry_signal !== "buy") continue;
    const prev = prevById.get(normalizeId(entry?.coin_gecko_id) || normalizeId(entry?.symbol) || "");
    if (prev && !didSignalChange(entry, prev)) continue;

    const priority = entry.adjusted_score;
    const reasonsText = entry.reasons.slice(0, 2).join(", ");
    
    alerts.push({
      key: `best_entry:${entry.coin_gecko_id || entry.symbol}`,
      source: "best_entry",
      watchlist_source: null,
      symbol: entry.symbol,
      title: `Best Entry: ${entry.symbol} - ${reasonsText || entry.action}`,
      score: priority,
      url: entry.coin_gecko_id 
        ? `https://www.coingecko.com/en/coins/${encodeURIComponent(entry.coin_gecko_id)}`
        : null,
      details: {
        entry_signal: entry.entry_signal,
        entry_score: entry.entry_score,
        adjusted_score: entry.adjusted_score,
        rsi: entry.rsi,
        distance_from_high: entry.distance_from_high,
        price: entry.price,
        hygiene_label: entry.hygiene_label,
        reasons: entry.reasons,
        action: entry.action,
      },
    });
  }

  // === SIGNAL SCORE ALERTS (score-based signals) ===
  if (Number.isFinite(signalThreshold)) {
    for (const coin of coins) {
      const totalScore = num(coin?.score_breakdown?.total_score);
      if (totalScore === null || totalScore < signalThreshold) continue;
      if (coin?.entry_signal !== "strong_buy" && coin?.entry_signal !== "buy") continue;
      if (coin?.trend_regime === "Downtrend") continue;
      const prev = prevById.get(normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "");
      if (prev && !didSignalChange(coin, prev)) continue;

      const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
      alerts.push({
        key: `signal_score:${idKey}:${totalScore}`,
        source: "signal_score",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: `${coin?.symbol || "Coin"} strong signal score (${totalScore})`,
        score: totalScore,
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          entry_signal: coin?.entry_signal || null,
          total_score: totalScore,
          trend_regime: coin?.trend_regime || null,
        },
      });
    }
  }
  
  // === TAKE-PROFIT ALERTS (highest priority) ===
  for (const coin of coins) {
    const tp = coin?.take_profit;
    if (!tp || !tp.signal) continue;

    const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
    const profitPct = tp.profit_pct;

    if (tp.signal === "moon" || tp.signal === "take_profit_2" || tp.signal === "take_profit_1") {
      const targetHit = tp.highest_target_hit;
      alerts.push({
        key: `takeprofit:${idKey}:${targetHit}`,
        source: "take_profit",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: `Target ${targetHit} hit! +${profitPct.toFixed(1)}%`,
        score: profitPct,
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          entry_price: tp.entry_price,
          current_price: tp.current_price,
          profit_pct: profitPct,
          profit_usd: tp.profit_usd,
          days_held: tp.days_held,
          signal: tp.signal,
        },
      });
    } else if (tp.signal === "approaching_target") {
      const targetLevel = tp.approaching_target_level || tp.highest_target_hit + 1 || 1;
      const targetPct = tp.approaching_target_pct || tp.next_target || null;
      const delta = tp.approaching_delta_pct;
      const deltaText =
        typeof delta === "number" && Number.isFinite(delta)
          ? `${delta.toFixed(1)}% away`
          : "close";
      alerts.push({
        key: `takeprofit:approaching:${idKey}:${targetLevel}`,
        source: "take_profit_approaching",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: `Close to target ${targetLevel} (${deltaText})`,
        score: profitPct,
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          entry_price: tp.entry_price,
          current_price: tp.current_price,
          profit_pct: profitPct,
          profit_usd: tp.profit_usd,
          next_target: targetPct,
          approaching_delta_pct: delta,
          days_held: tp.days_held,
          signal: tp.signal,
        },
      });
    }
  }

  // === VOLUME + NEWS ALERTS (potential breakout) ===
  for (const coin of coins) {
    if (coin?.volume_trend !== "spike") continue;
    const newsActivity = coin?.news_activity || "quiet";
    if (newsActivity === "quiet") continue;
    const prev = prevById.get(normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "");
    if (prev && !didSignalChange(coin, prev, { requireNewsChange: true })) continue;

    const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
    const sentiment = coin?.news_sentiment || "neutral";
    const tone =
      sentiment === "bullish"
        ? "positive"
        : sentiment === "bearish"
          ? "negative"
          : "mixed";
    const volumeRatio = num(coin?.volume_ratio);
    const ratioLabel =
      typeof volumeRatio === "number" && Number.isFinite(volumeRatio)
        ? `${volumeRatio.toFixed(1)}x`
        : "spike";
    const scoreBase = typeof volumeRatio === "number" && Number.isFinite(volumeRatio)
      ? Math.min(90, Math.round(volumeRatio * 20))
      : 40;

    alerts.push({
      key: `volume_news:${idKey}`,
      source: "volume_news",
      watchlist_source: coin?.watchlist_source || "main",
      symbol: coin?.symbol || "n/a",
      title: `Volume jump with news (${tone})`,
      score: scoreBase + (newsActivity === "very active" ? 10 : 0),
      url: coin?.coin_gecko_id
        ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
        : null,
      details: {
        volume_trend: coin?.volume_trend,
        volume_ratio: volumeRatio,
        volume_ratio_label: ratioLabel,
        news_activity: newsActivity,
        news_source: coin?.news_source || null,
        sentiment,
      },
    });
  }

  // === NEWS ALERTS (viral/very active news) ===
  for (const coin of coins) {
    const news24h = coin?.news_count_24h || 0;
    const news7d = coin?.news_count_7d || 0;
    const newsActivity = coin?.news_activity || "quiet";
    const newsIsViral = coin?.news_is_viral === true || newsActivity === "very active";

    if (newsIsViral) {
      const prev = prevById.get(normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "");
      if (prev && !didSignalChange(coin, prev, { requireNewsChange: true })) continue;
      const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
      const sentiment = coin?.news_sentiment || "neutral";
      const tone =
        sentiment === "bullish"
          ? "positive"
          : sentiment === "bearish"
            ? "negative"
            : "mixed";
      const countLabel =
        news24h > 0
          ? `${news24h} item${news24h === 1 ? "" : "s"} today`
          : `${news7d} item${news7d === 1 ? "" : "s"} this week`;

      alerts.push({
        key: `news:${idKey}:${new Date().toISOString().slice(0, 10)}`,
        source: "news",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: `Lots of news: ${countLabel} (${tone})`,
        score: news24h * 10 + news7d * 2 + (sentiment === "bullish" ? 5 : sentiment === "bearish" ? -5 : 0),
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          news_count_24h: news24h,
          news_count_7d: news7d,
          sentiment: sentiment,
          sentiment_score: coin?.news_sentiment_score,
          news_activity: newsActivity,
          news_source: coin?.news_source || null,
          headlines: coin?.news_headlines?.slice(0, 2) || [],
        },
      });
    }
  }

  // === ACTIONABLE ALERTS (KEEP + catalyst) ===
  if (alertOnActionable) {
    for (const coin of coins) {
      const hasCatalyst = coin?.has_clean_catalyst === true;
      const isKeep = coin?.hygiene_label === "KEEP";
      if (!hasCatalyst || !isKeep) continue;
      const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
      alerts.push({
        key: `watchlist:${idKey}`,
        source: "watchlist",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: "Actionable (KEEP + catalyst)",
        score: null,
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          hygiene_label: coin?.hygiene_label || null,
          catalyst: coin?.clean_catalyst || null,
        },
      });
    }
  }

  // === IMPROVING COINS (since last run) ===
  if (prevById.size > 0) {
    const improvements = [];
    for (const coin of coins) {
      const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || null;
      if (!idKey) continue;
      const prev = prevById.get(idKey);
      if (!prev) continue;

      const fromLabelRaw = prev?.hygiene_label || "UNKNOWN";
      const toLabelRaw = coin?.hygiene_label || "UNKNOWN";
      const fromLabel = friendlyHygiene(fromLabelRaw);
      const toLabel = friendlyHygiene(toLabelRaw);

      const fromEntry = prev?.entry_signal || null;
      const toEntry = coin?.entry_signal || null;

      const labelImproved = hygieneRank(toLabelRaw) > hygieneRank(fromLabelRaw);
      const entryImproved = entryRank(toEntry) > entryRank(fromEntry);

      if (!labelImproved && !entryImproved) continue;

      let score = 55;
      if (labelImproved) {
        const diff = hygieneRank(toLabelRaw) - hygieneRank(fromLabelRaw);
        score = 70 + diff * 10;
      } else if (entryImproved) {
        const diff = entryRank(toEntry) - entryRank(fromEntry);
        score = 55 + diff * 5;
      }

      const reasons = [];
      if (labelImproved) reasons.push(`Rating changed from ${fromLabel} to ${toLabel}.`);
      if (entryImproved) {
        reasons.push(`Entry timing changed from ${friendlyEntry(fromEntry)} to ${friendlyEntry(toEntry)}.`);
      }

      const prevDate = String(previousLayer1Report?.generated_at || "").slice(0, 10) || "unknown";
      const symbol = coin?.symbol || "n/a";

      improvements.push({
        key: `improving:${idKey}:${prevDate}:${toLabelRaw}:${toEntry || "none"}`,
        source: "improving",
        watchlist_source: coin?.watchlist_source || "main",
        symbol,
        title: `${symbol} is improving since the last scan`,
        score,
        url: coin?.coin_gecko_id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.coin_gecko_id)}`
          : null,
        details: {
          from_label: fromLabel,
          to_label: toLabel,
          from_label_raw: fromLabelRaw,
          to_label_raw: toLabelRaw,
          from_entry_signal: fromEntry,
          to_entry_signal: toEntry,
          reasons,
        },
      });
    }

    improvements.sort((a, b) => (b.score || 0) - (a.score || 0));
    alerts.push(...improvements.slice(0, 6));
  }

  if (Number.isFinite(defiThreshold) && defiLatest && Array.isArray(defiLatest.protocols)) {
    for (const protocol of defiLatest.protocols) {
      const totalScore = num(protocol?.scores?.total);
      if (totalScore === null || totalScore < defiThreshold) continue;
      if (protocol?.bucket && protocol.bucket !== "CANDIDATE") continue;

      const slug = normalizeId(protocol?.slug) || normalizeId(protocol?.name) || "unknown";
      alerts.push({
        key: `defi:${slug}`,
        source: "defi",
        watchlist_source: null,
        symbol: protocol?.market?.token_symbol || protocol?.market?.gecko_id || null,
        title: `${protocol?.name || "Protocol"} score ${totalScore.toFixed(1)}`,
        score: totalScore,
        url: protocol?.links?.defillama || protocol?.links?.website || null,
        details: {
          bucket: protocol?.bucket || null,
          token_gecko_id: protocol?.market?.gecko_id || null,
          tvl: protocol?.tvl?.focus_current ?? null,
          tvl_30d: protocol?.tvl?.change_30d_pct ?? null,
          tvl_7d: protocol?.tvl?.change_7d_pct ?? null,
        },
      });
    }
  }

  if (
    Number.isFinite(discoveryThreshold) &&
    discoveryQueue &&
    Array.isArray(discoveryQueue.candidates)
  ) {
    for (const candidate of discoveryQueue.candidates) {
      const score = num(candidate?.discovery_score);
      if (score === null || score < discoveryThreshold) continue;
      const status = candidate?.status || "NEW";
      if (status !== "NEW" && status !== "STAGED") continue;
      const idLower = normalizeId(candidate?.coinGeckoId || candidate?.id);
      if (!idLower) continue;

      alerts.push({
        key: `discovery:${idLower}`,
        source: "discovery",
        watchlist_source: null,
        symbol: candidate?.symbol ? String(candidate.symbol).toUpperCase() : null,
        title: `${candidate?.name || idLower} discovery score ${score.toFixed(1)}`,
        score,
        url: `https://www.coingecko.com/en/coins/${encodeURIComponent(idLower)}`,
        details: {
          status,
          market_cap: candidate?.market_cap ?? null,
          volume_24h: candidate?.volume_24h ?? null,
          price_change_7d: candidate?.price_change_7d ?? null,
        },
      });
    }
  }

  alerts.sort((a, b) => {
    const scoreA = a.score === null ? -Infinity : a.score;
    const scoreB = b.score === null ? -Infinity : b.score;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return String(a.key).localeCompare(String(b.key));
  });

  for (const alert of alerts) {
    alert.explain = explainAlert(alert);
  }

  return {
    generated_at: generatedAt,
    thresholds: {
      defi_score_threshold: Number.isFinite(defiThreshold) ? defiThreshold : null,
      discovery_score_threshold: Number.isFinite(discoveryThreshold)
        ? discoveryThreshold
        : null,
      signal_score_threshold: Number.isFinite(signalThreshold) ? signalThreshold : null,
      alert_actionable: alertOnActionable,
    },
    alerts,
  };
}

function renderAlertsMarkdown(alertsReport) {
  const lines = [];
  lines.push("# Alerts");
  lines.push("");
  lines.push(`Generated: ${alertsReport.generated_at}`);
  lines.push("");
  lines.push("## Thresholds");
  lines.push(
    `- DeFi score >= ${alertsReport.thresholds.defi_score_threshold ?? "n/a"}`
  );
  lines.push(
    `- Discovery score >= ${alertsReport.thresholds.discovery_score_threshold ?? "n/a"}`
  );
  lines.push(
    `- Signal score >= ${alertsReport.thresholds.signal_score_threshold ?? "n/a"}`
  );
  lines.push(
    `- Actionable (KEEP + catalyst): ${alertsReport.thresholds.alert_actionable ? "on" : "off"}`
  );
  lines.push("");

  // Separate alerts by type for prominence
  const marketAlerts = (alertsReport.alerts || []).filter(a => 
    a.source?.startsWith("market_")
  );
  const blueChipAlerts = (alertsReport.alerts || []).filter(a =>
    a.source === "blue_chip_dip"
  );
  const otherAlerts = (alertsReport.alerts || []).filter(a => 
    !a.source?.startsWith("market_") && a.source !== "blue_chip_dip"
  );
  
  // Market Condition Section (most important)
  if (marketAlerts.length > 0) {
    lines.push("## Market Condition");
    lines.push("");
    for (const alert of marketAlerts) {
      lines.push(`- ${alert.title}`);
      if (alert.details?.recommendation) {
        lines.push(`  - **Action:** ${alert.details.recommendation}`);
      }
    }
    lines.push("");
  }
  
  // Blue Chip Dip Opportunities (safer plays)
  if (blueChipAlerts.length > 0) {
    lines.push("## Blue Chip Dips");
    lines.push("");
    lines.push("Top cryptos with buy signals - higher liquidity, lower risk:");
    lines.push("");
    for (const alert of blueChipAlerts) {
      const d = alert.details || {};
      lines.push(`- **${alert.symbol}** - ${alert.title}`);
      const price = d.price ? `$${d.price.toLocaleString()}` : "n/a";
      const rsi = d.rsi ? `RSI ${d.rsi.toFixed(0)}` : "";
      const dip = d.dip_from_7d_high ? `-${d.dip_from_7d_high.toFixed(1)}% from high` : "";
      const extras = [rsi, dip].filter(Boolean).join(" | ");
      if (extras) {
        lines.push(`  - Price: ${price} | ${extras}`);
      }
      lines.push(`  - Signal: ${d.entry_signal === "strong_buy" ? "STRONG BUY" : "BUY"}`);
    }
    lines.push("");
  }
  
  lines.push("## Alerts");
  if (!alertsReport.alerts || alertsReport.alerts.length === 0) {
    lines.push("- None");
    lines.push("");
    return lines.join("\n");
  }

  for (const alert of otherAlerts) {
    const parts = [];
    parts.push(`[${alert.source.toUpperCase()}]`);
    if (alert.symbol) parts.push(String(alert.symbol));
    parts.push(alert.title);
    if (alert.source === "discovery" && alert.details?.status) {
      parts.push(`(${alert.details.status})`);
    }
    if (alert.source === "watchlist" && alert.watchlist_source === "staging") {
      parts.push("(staging)");
    }
    lines.push(`- ${parts.join(" ")}`);
    if (alert.url) {
      lines.push(`  - ${alert.url}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function loadAlertState(statePath) {
  const state = readJson(statePath, { seen_keys: [] });
  const keys = Array.isArray(state?.seen_keys) ? state.seen_keys : [];
  return { seen_keys: new Set(keys.map((k) => String(k))) };
}

function saveAlertState(statePath, state) {
  writeJson(statePath, { seen_keys: Array.from(state.seen_keys.values()) });
}

function toPowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function maybeShowPopup(alertsReport, { enabled, statePath } = {}) {
  if (!enabled) return { shown: false, reason: "disabled" };
  if (process.platform !== "win32") return { shown: false, reason: "non-windows" };
  if (!alertsReport.alerts || alertsReport.alerts.length === 0) {
    return { shown: false, reason: "no_alerts" };
  }

  const state = loadAlertState(statePath);
  const newAlerts = alertsReport.alerts.filter((a) => !state.seen_keys.has(a.key));
  for (const alert of alertsReport.alerts) {
    state.seen_keys.add(alert.key);
  }
  saveAlertState(statePath, state);

  if (newAlerts.length === 0) {
    return { shown: false, reason: "no_new_alerts" };
  }

  const top = newAlerts.slice(0, 6);
  const messageLines = ["Crypto Scanner Alerts:"];
  for (const alert of top) {
    const scoreText =
      typeof alert.score === "number" && Number.isFinite(alert.score)
        ? ` (${alert.score.toFixed(1)})`
        : "";
    messageLines.push(
      `- [${alert.source.toUpperCase()}] ${alert.symbol ? `${alert.symbol} ` : ""}${alert.title}${scoreText}`
    );
  }
  if (newAlerts.length > top.length) {
    messageLines.push(`...and ${newAlerts.length - top.length} more.`);
  }
  const message = messageLines.join("\n");

  const ps = [
    "Add-Type -AssemblyName PresentationFramework | Out-Null;",
    `[System.Windows.MessageBox]::Show('${toPowerShellSingleQuoted(
      message
    )}','Crypto Scanner') | Out-Null;`,
  ].join(" ");

  execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  return { shown: true, count: newAlerts.length };
}

module.exports = {
  computeAlerts,
  renderAlertsMarkdown,
  readJson,
  writeJson,
  maybeShowPopup,
};
