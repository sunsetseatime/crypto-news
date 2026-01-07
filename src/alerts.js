const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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

function computeAlerts({ layer1Report, defiLatest, discoveryQueue, thresholds }) {
  const generatedAt = new Date().toISOString();
  const alerts = [];

  const alertOnActionable = thresholds.alert_actionable !== false;
  const defiThreshold = num(thresholds.defi_score_threshold);
  const discoveryThreshold = num(thresholds.discovery_score_threshold);

  const coins = Array.isArray(layer1Report?.coins) ? layer1Report.coins : [];
  const marketCondition = layer1Report?.market_condition?.signals;
  
  // === MARKET CONDITION ALERTS (HIGHEST PRIORITY) ===
  // Accumulation alerts - time to buy
  if (marketCondition?.accumulation?.length > 0) {
    for (const signal of marketCondition.accumulation) {
      const emoji = signal.strength === "strong" ? "🟢💰" : "🟡";
      const priority = signal.strength === "strong" ? 100 : 80;
      alerts.push({
        key: `market:accumulation:${signal.signal}`,
        source: "market_accumulation",
        watchlist_source: null,
        symbol: "MARKET",
        title: `${emoji} ACCUMULATION: ${signal.message}`,
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
      const emoji = signal.strength === "strong" ? "🚀" : "📈";
      const priority = signal.strength === "strong" ? 70 : 60;
      alerts.push({
        key: `market:run:${signal.signal}`,
        source: "market_run",
        watchlist_source: null,
        symbol: "MARKET",
        title: `${emoji} RUN STARTING: ${signal.message}`,
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
        title: `⚠️ CAUTION: ${signal.message}`,
        score: 50,
        url: null,
        details: {
          signal_type: signal.signal,
          recommendation: "Consider taking profits",
        },
      });
    }
  }
  
  // === BLUE CHIP DIP ALERTS (safer plays) ===
  const blueChipOpps = layer1Report?.blue_chip_opportunities?.opportunities || [];
  for (const opp of blueChipOpps.slice(0, 5)) { // Top 5 opportunities
    const emoji = opp.entry_signal === "strong_buy" ? "🟢💎" : "🔵";
    const priority = opp.signal_strength + (opp.market_in_fear ? 10 : 0);
    alerts.push({
      key: `bluechip:dip:${opp.coin_gecko_id}`,
      source: "blue_chip_dip",
      watchlist_source: null,
      symbol: opp.symbol,
      title: `${emoji} ${opp.name} dip: ${opp.signals.slice(0, 2).join(", ")}`,
      score: priority,
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
        title: `🚨 ${coin.symbol} has ${coin.defi_hack_count} past hack${coin.defi_hack_count > 1 ? 's' : ''} ($${(coin.defi_hack_total_usd / 1000000).toFixed(1)}M lost)`,
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
        title: `⚠️ ${coin.symbol} has NO audit - higher smart contract risk`,
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
        title: `📉 ${coin.symbol} TVL collapsing - users leaving the protocol`,
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
    
    const emoji = entry.entry_signal === "strong_buy" ? "🎯" : "🔵";
    const priority = entry.adjusted_score;
    const reasonsText = entry.reasons.slice(0, 2).join(", ");
    
    alerts.push({
      key: `best_entry:${entry.coin_gecko_id || entry.symbol}`,
      source: "best_entry",
      watchlist_source: null,
      symbol: entry.symbol,
      title: `${emoji} Best Entry: ${entry.symbol} - ${reasonsText || entry.action}`,
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
  
  // === TAKE-PROFIT ALERTS (highest priority) ===
  for (const coin of coins) {
    const tp = coin?.take_profit;
    if (!tp || !tp.signal) continue;
    
    const idKey = normalizeId(coin?.coin_gecko_id) || normalizeId(coin?.symbol) || "unknown";
    const profitPct = tp.profit_pct;
    
    if (tp.signal === "moon" || tp.signal === "take_profit_2" || tp.signal === "take_profit_1") {
      const targetHit = tp.highest_target_hit;
      const emoji = tp.signal === "moon" ? "🌙" : tp.signal === "take_profit_2" ? "💰" : "📈";
      alerts.push({
        key: `takeprofit:${idKey}:${targetHit}`,
        source: "take_profit",
        watchlist_source: coin?.watchlist_source || "main",
        symbol: coin?.symbol || "n/a",
        title: `${emoji} Target ${targetHit} hit! +${profitPct.toFixed(1)}%`,
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
    }
  }
  
  // === NEWS ALERTS (viral/very active news) ===
  for (const coin of coins) {
    const news24h = coin?.news_count_24h || 0;
    const news7d = coin?.news_count_7d || 0;
    const newsActivity = coin?.news_activity || "quiet";
    const newsIsViral = coin?.news_is_viral === true || newsActivity === "very active";

    if (newsIsViral) {
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

  return {
    generated_at: generatedAt,
    thresholds: {
      defi_score_threshold: Number.isFinite(defiThreshold) ? defiThreshold : null,
      discovery_score_threshold: Number.isFinite(discoveryThreshold)
        ? discoveryThreshold
        : null,
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
    lines.push("## 🌐 Market Condition");
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
    lines.push("## 💎 Blue Chip Dips (Safer Plays)");
    lines.push("");
    lines.push("Top cryptos with buy signals - higher liquidity, lower risk:");
    lines.push("");
    for (const alert of blueChipAlerts) {
      const d = alert.details || {};
      lines.push(`- **${alert.symbol}** - ${alert.title.replace(/^[🟢💎🔵]+\s*/, "").replace(`${alert.symbol} dip: `, "")}`);
      const price = d.price ? `$${d.price.toLocaleString()}` : "n/a";
      const rsi = d.rsi ? `RSI ${d.rsi.toFixed(0)}` : "";
      const dip = d.dip_from_7d_high ? `-${d.dip_from_7d_high.toFixed(1)}% from high` : "";
      const extras = [rsi, dip].filter(Boolean).join(" | ");
      if (extras) {
        lines.push(`  - Price: ${price} | ${extras}`);
      }
      lines.push(`  - Signal: ${d.entry_signal === "strong_buy" ? "🟢 STRONG BUY" : "🔵 BUY"}`);
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


