const path = require("path");

const NO_HEADLINES_MESSAGE = "No headlines available at the time of scan.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUtc(isoString) {
  if (!isoString) return "n/a";
  const ms = Date.parse(isoString);
  if (!Number.isFinite(ms)) return "n/a";
  return new Date(ms).toLocaleString();
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
function formatUsdCompact(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return formatUsd(value);
}

function formatSignedUsdCompact(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsdCompact(Math.abs(value))}`;
}

function buildSparkline(values, width = 160, height = 36, ariaLabel = "Trend") {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const points = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  let zeroLine = "";
  if (min < 0 && max > 0) {
    const zeroY = height - ((0 - min) / range) * height;
    zeroLine = `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1" />`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${zeroLine}<polyline fill="none" stroke="rgba(125,211,252,0.9)" stroke-width="2" points="${points}" /></svg>`;
}

function buildSparklineWithGrid(values, width = 160, height = 36, ariaLabel = "Trend", gridCount = 6) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const points = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const gridLines = [];
  if (gridCount > 1) {
    for (let i = 1; i < gridCount; i += 1) {
      const x = (i / gridCount) * width;
      gridLines.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${height}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`);
    }
  }
  let zeroLine = "";
  if (min < 0 && max > 0) {
    const zeroY = height - ((0 - min) / range) * height;
    zeroLine = `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,0.25)" stroke-width="1" />`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${gridLines.join("")}${zeroLine}<polyline fill="none" stroke="rgba(125,211,252,0.9)" stroke-width="2" points="${points}" /></svg>`;
}

function formatSignedPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function badge(text, className) {
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

function buildHowThisWorks(bullets) {
  const items = Array.isArray(bullets) ? bullets.filter(Boolean) : [];
  if (items.length === 0) return "";
  const list = items.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  return `
    <details class="details how-works">
      <summary><span class="summary-title">How this works</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
      <div class="details-body">
        <ul class="compact">${list}</ul>
      </div>
    </details>
  `;
}

function labelClass(label) {
  switch (label) {
    case "KEEP":
      return "badge-keep";
    case "WATCH-ONLY":
      return "badge-watch";
    case "DROP":
      return "badge-drop";
    default:
      return "badge-muted";
  }
}

function friendlyLabel(label) {
  switch (label) {
    case "KEEP":
      return "Ready";
    case "WATCH-ONLY":
      return "Watch";
    case "DROP":
      return "Avoid";
    default:
      return "Unknown";
  }
}

function severityClass(severity) {
  switch (severity) {
    case "CRITICAL":
      return "badge-critical";
    case "WARNING":
      return "badge-warning";
    case "POSITIVE":
      return "badge-positive";
    case "INFO":
      return "badge-info";
    default:
      return "badge-muted";
  }
}

function notesForCoin(coin) {
  const notes = [];
  if (coin?.chasing) notes.push("price chasing");
  if (coin?.thin_fragile) notes.push("volume fading");
  if (coin?.volume_trend === "spike") notes.push("volume jumped");
  if (coin?.high_dilution_risk) notes.push("high dilution");
  if (coin?.low_liquidity) notes.push("low liquidity");
  if (coin?.trend_regime === "Downtrend") notes.push("downtrend");
  // Updated unlock notes to reflect new estimation system
  if (coin?.unlock_risk_flag) {
    notes.push("unlock risk");
  } else if (coin?.unlock_confidence === "ESTIMATED") {
    // Only show if there's meaningful locked supply
    if (coin?.locked_percent && coin.locked_percent > 50) {
      notes.push(`~${Math.round(coin.locked_percent)}% locked`);
    }
  } else if (coin?.unlock_confidence === "UNKNOWN") {
    notes.push("vesting unknown");
  }
  if (coin?.has_clean_catalyst) notes.push("recent catalyst");
  if (Number.isFinite(num(coin?.catalyst_quality_score)) && coin.catalyst_quality_score >= 70) {
    notes.push("strong catalyst");
  }
  if (coin?.traction_status === "OK") notes.push("good traction");
  if (coin?.holder_concentration_level === "HIGH") {
    notes.push("few big holders");
  } else if (coin?.holder_concentration_level === "UNKNOWN") {
    notes.push("holder data missing");
  }
  // GitHub activity notes
  if (coin?.github_archived) {
    notes.push("repo archived");
  } else if (coin?.github_stale) {
    notes.push("code stale (6mo+)");
  } else if (coin?.github_active) {
    notes.push("code active");
  }
  // DeFi knowledge notes (from DeFi scan)
  if (coin?.defi_matched) {
    if (coin?.defi_hack_count > 0) {
      notes.push(`${coin.defi_hack_count} past hacks`);
    }
    if (coin?.defi_audit_status === "NO") {
      notes.push("no audit");
    } else if (coin?.defi_audit_status === "YES") {
      notes.push("audited");
    }
    if (coin?.defi_flags?.tvl_collapse) {
      notes.push("money leaving protocol");
    }
    if (coin?.defi_flags?.liquidity_trap) {
      notes.push("liquidity risk");
    }
  }
  // Entry signal notes
  if (coin?.entry_signal === "strong_buy") {
    notes.push("good entry");
  } else if (coin?.entry_signal === "overbought") {
    notes.push("overbought");
  }
  // News signal notes (plain English)
  const newsActivity = coin?.news_activity;
  if (newsActivity && newsActivity !== "quiet") {
    const sentiment = coin?.news_sentiment || "neutral";
    const tone =
      sentiment === "bullish"
        ? "positive"
        : sentiment === "bearish"
          ? "negative"
          : "mixed";
    const windowLabel = coin?.news_count_24h >= 2 ? "today" : "this week";
    if (coin?.news_is_viral) {
      notes.push(`lots of news ${windowLabel} (${tone})`);
    } else if (newsActivity === "very active") {
      notes.push(`news is very active (${tone})`);
    } else if (newsActivity === "active") {
      notes.push(`news is active (${tone})`);
    } else if (newsActivity === "some") {
      notes.push(`some recent news (${tone})`);
    }
  }
  const pressureScore = num(coin?.news_pressure_score);
  if (pressureScore !== null) {
    if (pressureScore >= 30) {
      notes.push("news pressure positive");
    } else if (pressureScore <= -30) {
      notes.push("news pressure negative");
    }
  }
  if (coin?.context_short_term_only) {
    notes.push("short-term only");
  }
  if (coin?.health_label === "weak") {
    notes.push("weak project health");
  }
  // Take-profit notes
  const tp = coin?.take_profit;
  if (tp?.signal === "moon") {
    notes.push(`target 3 hit (+${Number(tp.profit_pct).toFixed(1)}%)`);
  } else if (tp?.signal === "take_profit_2") {
    notes.push(`target 2 hit (+${Number(tp.profit_pct).toFixed(1)}%)`);
  } else if (tp?.signal === "take_profit_1") {
    notes.push(`target 1 hit (+${Number(tp.profit_pct).toFixed(1)}%)`);
  } else if (tp?.signal === "approaching_target") {
    const level = tp?.approaching_target_level || tp?.highest_target_hit + 1 || 1;
    notes.push(`close to target ${level}`);
  } else if (tp?.signal === "deep_loss") {
    notes.push(`down ${Number(tp.profit_pct).toFixed(1)}%`);
  }
  return notes;
}

// Build a unified daily summary that consolidates findings from all reports
function buildDailySummaryHtml({ layer1Report, diffReport, alertsReport, defiLatest, discoveryReport, supervisorResult }) {
  const coins = layer1Report?.coins || [];
  const mainCoins = coins.filter(c => c.watchlist_source !== "staging");
  const stagingCoins = coins.filter(c => c.watchlist_source === "staging");
  
  // Market condition
  const marketCondition = layer1Report?.market_condition;
  const fearGreed = marketCondition?.fear_greed;
  const marketSignals = marketCondition?.signals;
  const btcMAs = marketCondition?.btc_moving_averages;
  
  // Count decisions
  const keepCount = mainCoins.filter(c => c.hygiene_label === "KEEP").length;
  const watchCount = mainCoins.filter(c => c.hygiene_label === "WATCH-ONLY").length;
  const dropCount = mainCoins.filter(c => c.hygiene_label === "DROP").length;
  
  // Get top performers (outperforming BTC)
  const topPerformers = mainCoins
    .filter(c => c.outperforming_btc === true)
    .sort((a, b) => (b.relative_strength_7d || 0) - (a.relative_strength_7d || 0))
    .slice(0, 3);
  
  // Get coins with catalysts
  const withCatalysts = mainCoins.filter(c => c.has_clean_catalyst === true);
  
  // Get high risk coins
  const highRisk = mainCoins.filter(c => 
    c.holder_concentration_level === "HIGH" || 
    c.high_dilution_risk === true ||
    c.chasing === true
  );
  
  // Get diff summary
  const criticalChanges = (diffReport?.changes || []).filter(c => c.severity === "CRITICAL").length;
  const positiveChanges = (diffReport?.changes || []).filter(c => c.severity === "POSITIVE").length;
  
  // Get discovery count
  const discoveryCount = discoveryReport?.candidates?.length || 0;
  
  // Get DeFi top pick
  const defiProtocols = defiLatest?.protocols || [];
  const topDefi = defiProtocols.filter(p => p?.bucket === "CANDIDATE" && p?.market?.token_symbol).slice(0, 1)[0];
  
  // Build the verdict based on market condition
  let verdict = "";
  let verdictClass = "badge-muted";
  
  // Market condition takes priority
  if (marketSignals?.market_phase === "accumulation") {
    verdict = "ACCUMULATION ZONE - Good time to accumulate";
    verdictClass = "badge-positive";
  } else if (marketSignals?.market_phase === "run" && marketSignals?.warnings?.length === 0) {
    verdict = "MARKET RUNNING - Momentum plays available";
    verdictClass = "badge-positive";
  } else if (marketSignals?.market_phase === "caution") {
    verdict = "MARKET OVERHEATED - Consider taking profits";
    verdictClass = "badge-warning";
  } else if (keepCount > 0) {
    verdict = `${keepCount} coin${keepCount > 1 ? 's' : ''} look${keepCount === 1 ? 's' : ''} actionable`;
    verdictClass = "badge-positive";
  } else if (criticalChanges > 0) {
    verdict = "Nothing actionable - check the warnings";
    verdictClass = "badge-warning";
  } else {
      verdict = "No strong entries today - keep watching";
    verdictClass = "badge-muted";
  }
  
  // Build highlights
  const highlights = [];
  
  // Market condition highlights (priority)
  if (marketSignals?.accumulation?.length > 0) {
    for (const sig of marketSignals.accumulation.slice(0, 2)) {
      highlights.push(`<strong>Market signal:</strong> ${sig.message}`);
    }
  }
  
  if (marketSignals?.run?.length > 0) {
    for (const sig of marketSignals.run.slice(0, 2)) {
      highlights.push(`<strong>Run signal:</strong> ${sig.message}`);
    }
  }
  
  if (marketSignals?.warnings?.length > 0) {
    for (const sig of marketSignals.warnings) {
      highlights.push(`<strong>Warning:</strong> ${sig.message}`);
    }
  }
  
  if (topPerformers.length > 0) {
    highlights.push(`<strong>Beating the market:</strong> ${topPerformers.map(c => c.symbol).join(", ")} outperformed Bitcoin this week`);
  }
  
  if (withCatalysts.length > 0) {
    highlights.push(`<strong>Recent news:</strong> ${withCatalysts.map(c => c.symbol).join(", ")} had project updates in the last 2 weeks`);
  }
  
  if (highRisk.length > 0) {
    const riskSymbols = highRisk.slice(0, 3).map(c => c.symbol).join(", ");
    highlights.push(`<strong>Be careful:</strong> ${riskSymbols}${highRisk.length > 3 ? ` +${highRisk.length - 3} more` : ""} have warning signs`);
  }
  
  if (discoveryCount > 0) {
    highlights.push(`<strong>New discoveries:</strong> Found ${discoveryCount} trending coins worth researching`);
  }
  
  if (topDefi) {
    highlights.push(`<strong>Top DeFi pick:</strong> ${topDefi.name} (${topDefi.market.token_symbol}) with ${formatUsd(num(topDefi.tvl?.focus_current))} locked`);
  }
  
  const highlightsHtml = highlights.length > 0 
    ? `<ul class="compact">${highlights.map(h => `<li>${h}</li>`).join("")}</ul>`
    : `<p class="muted">Run more scans to see daily highlights here.</p>`;
  
  // Build market condition gauge
  let marketGaugeHtml = "";
  if (fearGreed) {
    const fgValue = fearGreed.value;
    let fgColor = "var(--watch)";
    let fgLabel = fearGreed.classification || "Neutral";
    if (fgValue <= 25) {
      fgColor = "var(--keep)";
      fgLabel = "Extreme Fear (accumulate)";
    } else if (fgValue <= 40) {
      fgColor = "#4ade80";
      fgLabel = "Fear (accumulate)";
    } else if (fgValue >= 75) {
      fgColor = "var(--drop)";
      fgLabel = "Extreme Greed (take profits)";
    } else if (fgValue >= 60) {
      fgColor = "var(--warning)";
      fgLabel = "Greed (Be cautious)";
    }
    
    const btcMomentum = btcMAs?.momentum_7d;
    const btcMomentumText = btcMomentum !== undefined 
      ? `BTC ${btcMomentum >= 0 ? "+" : ""}${btcMomentum.toFixed(1)}% this week` 
      : "";
    
    const fgHistory = Array.isArray(fearGreed.history) ? fearGreed.history : [];
    const fgValues30d = fgHistory
      .slice(-30)
      .map((d) => Number(d.value))
      .filter((v) => Number.isFinite(v));
    const fgMin = fgValues30d.length ? Math.min(...fgValues30d) : null;
    const fgMax = fgValues30d.length ? Math.max(...fgValues30d) : null;
    const fgSpark = fgValues30d.length >= 2
      ? buildSparklineWithGrid(fgValues30d, 260, 56, "Sentiment (30 days)", 6)
      : "";
    marketGaugeHtml = `
      <div class="market-gauge" style="margin-bottom: 16px; padding: 12px; background: var(--bg-card); border-radius: 8px; border-left: 4px solid ${fgColor};">
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div>
            <span style="font-size: 38px; font-weight: bold; color: ${fgColor};">${fgValue}</span>
            <span style="color: var(--muted); margin-left: 8px; font-size: 14px;">${fgLabel}</span>
          </div>
          <div style="font-size: 13px; color: var(--muted);">
            Fear & Greed Index - Trend: ${fearGreed.trend || "stable"}${btcMomentumText ? ` - ${btcMomentumText}` : ""}
            ${fgSpark ? `<div class="muted small" style="margin-top:6px;">Sentiment (30d)${fgMin !== null && fgMax !== null ? ` | Range ${fgMin}-${fgMax}` : ""}</div><div class="sparkline fg-sparkline">${fgSpark}</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="card daily-summary">
      <h2>Today's Summary</h2>
      ${marketGaugeHtml}
      <div class="verdict-box">
        <span class="badge ${verdictClass}" style="font-size: 14px; padding: 6px 12px;">${verdict}</span>
      </div>
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-value" style="color: var(--keep);">${keepCount}</div>
          <div class="stat-label">Ready (KEEP)</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: var(--watch);">${watchCount}</div>
          <div class="stat-label">Keep Watching</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: var(--drop);">${dropCount}</div>
          <div class="stat-label">Avoid</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stagingCoins.length}</div>
          <div class="stat-label">Testing</div>
        </div>
      </div>
      <h3 style="margin-top: 16px;">Key Findings</h3>
      ${highlightsHtml}
      ${buildHowThisWorks([
        "Uses Fear and Greed plus BTC weekly momentum for market mood.",
        "Counts come from your watchlist labels (Ready/Watch/Avoid) and staging list.",
        "Key Findings are pulled from outperformance vs BTC, catalysts, risks, discovery, and DeFi.",
        "Why it matters: it tells you if the market is friendly before you act.",
      ])}
    </div>
  `;
}

function buildQuickStartHtml({ layer1Report, diffReport, alertsReport, paperReport }) {
  if (!layer1Report) return "";

  const marketSignals = layer1Report?.market_condition?.signals || {};
  const fearGreed = layer1Report?.market_condition?.fear_greed || null;
  const btcMAs = layer1Report?.market_condition?.btc_moving_averages || null;

  const phaseLabel = (() => {
    switch (marketSignals.market_phase) {
      case "accumulation":
        return "Accumulation (buyers have an edge)";
      case "run":
        return "Run (momentum is strong)";
      case "caution":
        return "Caution (market looks hot)";
      default:
        return "Neutral (no strong signal)";
    }
  })();

  const moodItems = [];
  moodItems.push(`Market phase: ${phaseLabel}`);
  if (fearGreed && Number.isFinite(num(fearGreed.value))) {
    moodItems.push(`Fear & Greed: ${fearGreed.value} (${fearGreed.classification || "n/a"})`);
  }
  if (btcMAs && Number.isFinite(num(btcMAs.momentum_7d))) {
    moodItems.push(`BTC this week: ${formatSignedPct(btcMAs.momentum_7d, 1)}`);
  }

  const plays = Array.isArray(layer1Report?.today_plays?.items)
    ? layer1Report.today_plays.items
    : [];
  const playsHtml =
    plays.length === 0
      ? `<p class="muted small">No clear plays today. Check "What to Play" for context.</p>`
      : plays
          .map((play) => {
            const action = play?.action || "Wait";
            const actionClass =
              action === "Buy"
                ? "quick-play-buy"
                : action === "Avoid"
                  ? "quick-play-avoid"
                  : "quick-play-wait";
            const why = Array.isArray(play?.why) ? play.why.filter(Boolean) : [];
            const whyText = why.length > 0 ? why.join("; ") : "No reason listed.";
            const riskText = play?.main_risk ? String(play.main_risk) : "n/a";
            const sourceText = play?.source_section || play?.source || "n/a";
            return `
              <div class="quick-play ${actionClass}">
                <div class="quick-play-header">
                  <strong>${escapeHtml(play?.symbol || "n/a")}</strong>
                  ${badge(action, action === "Buy" ? "badge-positive" : action === "Avoid" ? "badge-critical" : "badge-warning")}
                  <span class="quick-meta">From: ${escapeHtml(sourceText)}</span>
                </div>
                <div class="quick-meta">Why: ${escapeHtml(whyText)}</div>
                <div class="quick-meta">Main risk: ${escapeHtml(riskText)}</div>
              </div>
            `;
          })
          .join("");

  const riskItems = [];
  const riskSeen = new Set();
  const addRisk = (text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (riskSeen.has(key)) return;
    riskSeen.add(key);
    riskItems.push(clean);
  };

  const warningSignals = Array.isArray(marketSignals.warnings) ? marketSignals.warnings : [];
  for (const warning of warningSignals) {
    addRisk(warning?.message || "");
  }
  const reportWarnings = Array.isArray(layer1Report?.warnings) ? layer1Report.warnings : [];
  for (const warning of reportWarnings) {
    addRisk(warning);
  }
  const alertRisks = Array.isArray(alertsReport?.alerts) ? alertsReport.alerts : [];
  for (const alert of alertRisks.slice(0, 6)) {
    const risks = Array.isArray(alert?.explain?.risks) ? alert.explain.risks : [];
    if (risks.length > 0) addRisk(risks[0]);
    else if (alert?.title) addRisk(alert.title);
  }

  const topRisks = riskItems.slice(0, 3);
  const risksHtml =
    topRisks.length > 0
      ? `<ul class="compact">${topRisks.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
      : `<p class="muted small">No major risks flagged.</p>`;

  const changes = Array.isArray(diffReport?.changes) ? diffReport.changes : [];
  const importantChanges = changes.filter(
    (c) => c?.severity === "CRITICAL" || c?.severity === "WARNING"
  );
  const changeList = (importantChanges.length > 0 ? importantChanges : changes).slice(0, 3);
  const changesHtml =
    changeList.length > 0
      ? `<ul class="compact">${changeList
          .map((c) => {
            const symbol = c?.symbol ? `${c.symbol}: ` : "";
            return `<li><strong>${escapeHtml(symbol)}</strong>${escapeHtml(c?.description || "")}</li>`;
          })
          .join("")}</ul>`
      : `<p class="muted small">No meaningful changes since last run.</p>`;

  const paperOpen = Number.isFinite(num(paperReport?.open_count)) ? paperReport.open_count : null;
  const paperWin =
    Number.isFinite(num(paperReport?.overview?.win_rate_pct))
      ? `${paperReport.overview.win_rate_pct.toFixed(1)}%`
      : "n/a";
  const paperAvg = formatSignedPct(num(paperReport?.overview?.avg_return_pct), 1);
  const paperHtml =
    paperReport
      ? `<div class="muted small">Open trades: ${escapeHtml(paperOpen ?? 0)} | Win rate: ${escapeHtml(paperWin)} | Avg return: ${escapeHtml(paperAvg)}</div>`
      : `<p class="muted small">No paper trading data yet.</p>`;

  const jumpLinks = [
    { href: "#ai-summary", label: "AI Summary" },
    { href: "#today-summary", label: "Today's Summary" },
    { href: "#what-to-play", label: "What to Play" },
    { href: "#best-entries", label: "Best Entries" },
    { href: "#blue-chip-dips", label: "Blue Chip Dips" },
    { href: "#watchlist", label: "Watchlist" },
    { href: "#paper-trading", label: "Paper Trading" },
  ];

  const linksHtml = jumpLinks
    .map((link) => `<a class="chip" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("");

  return `
    <div class="card" id="quick-start">
      <div class="row space-between">
        <h2>Quick Start (30 seconds)</h2>
        <div class="muted small">Read this first</div>
      </div>
      <div class="quick-start-grid">
        <div>
          <h3>Market mood</h3>
          <ul class="compact">${moodItems.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
          <h3 style="margin-top: 14px;">Today's plays (up to 3)</h3>
          ${playsHtml}
        </div>
        <div>
          <h3>Top risks to watch</h3>
          ${risksHtml}
          <h3 style="margin-top: 14px;">What changed since last run</h3>
          ${changesHtml}
          <h3 style="margin-top: 14px;">Paper trading snapshot</h3>
          ${paperHtml}
          <h3 style="margin-top: 14px;">Jump to section</h3>
          <div class="quick-links">${linksHtml}</div>
        </div>
      </div>
      ${buildHowThisWorks([
        "This is a 30-second briefing using the same rules as the full dashboard.",
        "Today's plays come from Best Entries (watchlist) and Blue Chip Dips.",
        "Risks pull from warnings, alerts, and major changes.",
        "Jump links take you to the detailed sections below.",
      ])}
    </div>
  `;
}

function buildTodayFocusHtml({ bestEntriesData, alertsReport, diffReport }) {
  const entries = Array.isArray(bestEntriesData?.best_entries)
    ? bestEntriesData.best_entries.slice(0, 3)
    : [];
  const alerts = Array.isArray(alertsReport?.alerts)
    ? alertsReport.alerts.slice(0, 3)
    : [];
  const changes = Array.isArray(diffReport?.changes)
    ? diffReport.changes.filter((c) => c?.severity === "CRITICAL" || c?.severity === "WARNING").slice(0, 3)
    : [];

  const entryHtml =
    entries.length === 0
      ? `<p class="muted small">No watchlist entries right now.</p>`
      : `<ul class="compact">${entries
          .map((e) => {
            const action =
              e.entry_signal === "strong_buy"
                ? "Strong entry"
                : e.entry_signal === "buy"
                  ? "Entry setup"
                  : "Watch";
            const reason = Array.isArray(e.reasons) && e.reasons.length > 0 ? ` - ${e.reasons[0]}` : "";
            return `<li><strong>${escapeHtml(e.symbol || "")}</strong>: ${escapeHtml(action)}${escapeHtml(reason)}</li>`;
          })
          .join("")}</ul>`;

  const alertHtml =
    alerts.length === 0
      ? `<p class="muted small">No urgent alerts.</p>`
      : `<ul class="compact">${alerts
          .map((a) => {
            const symbol = a?.symbol ? `${a.symbol}: ` : "";
            return `<li><strong>${escapeHtml(symbol)}</strong>${escapeHtml(a?.title || "")}</li>`;
          })
          .join("")}</ul>`;

  const changeHtml =
    changes.length === 0
      ? `<p class="muted small">No critical changes since last scan.</p>`
      : `<ul class="compact">${changes
          .map((c) => {
            const tag = c?.watchlist_source === "staging" ? " (testing)" : "";
            return `<li><strong>${escapeHtml(c?.symbol || "")}${escapeHtml(tag)}</strong>: ${escapeHtml(c?.description || "")}</li>`;
          })
          .join("")}</ul>`;

  return `
    <div class="card focus-card">
      <h2>Today's Focus</h2>
      <div class="focus-grid">
        <div>
          <h3>Top Entries</h3>
          ${entryHtml}
        </div>
        <div>
          <h3>Alerts</h3>
          ${alertHtml}
        </div>
        <div>
          <h3>Changes</h3>
          ${changeHtml}
        </div>
      </div>
      ${buildHowThisWorks([
        "Top Entries come from Best Entries (KEEP coins with good timing).",
        "Alerts are driven by alert rules for big changes or risks.",
        "Changes show only critical or warning items since the last run.",
        "Why it matters: this is the fastest place to start each day.",
      ])}
    </div>
  `;
}

function buildDiscoverySectionHtml(discoveryReport) {
  if (!discoveryReport) {
    return `
      <div class="card">
        <h2>Discovery</h2>
        <p class="muted">No discovery report yet. Run the discovery scan to populate this section.</p>
        ${buildHowThisWorks([
          "Scans the wider market for coins outside your watchlist.",
          "Filters by liquidity, market cap, and 7-day move; excludes stablecoins.",
          "Scores rank by volume, price action, and size.",
          "Why it matters: it finds fresh ideas early.",
          "Results are research leads, not automatic buys.",
        ])}
      </div>
    `;
  }

  const candidates = Array.isArray(discoveryReport.candidates)
    ? discoveryReport.candidates
    : [];
  const top = candidates
    .slice()
    .sort((a, b) => (b.discovery_score || 0) - (a.discovery_score || 0))
    .slice(0, 6);

  if (top.length === 0) {
    return `
      <div class="card">
        <h2>Discovery</h2>
        <p class="muted">No discovery candidates in the latest report.</p>
        ${buildHowThisWorks([
          "Scans the wider market for coins outside your watchlist.",
          "Filters by liquidity, market cap, and 7-day move; excludes stablecoins.",
          "Scores rank by volume, price action, and size.",
          "Why it matters: it finds fresh ideas early.",
          "Results are research leads, not automatic buys.",
        ])}
      </div>
    `;
  }

  const rows = top
    .map((c) => {
      const score = Number.isFinite(c.discovery_score) ? c.discovery_score.toFixed(1) : "n/a";
      const ch7d = Number.isFinite(c.price_change_7d) ? formatSignedPct(c.price_change_7d, 1) : "n/a";
      const vol = Number.isFinite(c.volume_24h) ? formatUsdCompact(c.volume_24h) : "n/a";
      return `
        <div class="play-item play-momentum">
          <span class="play-symbol">${escapeHtml(String(c.symbol || "").toUpperCase())}</span>
          <span class="play-action">Score ${escapeHtml(score)}</span>
          <span class="play-reason">${escapeHtml(`${ch7d} 7d | Vol ${vol}`)}</span>
        </div>
      `;
    })
    .join("");

  const total = discoveryReport.total_candidates || candidates.length || 0;
  const generatedAt = discoveryReport.generated_at ? formatUtc(discoveryReport.generated_at) : "n/a";

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Discovery</h2>
        <div class="muted small">${escapeHtml(total)} candidates | ${escapeHtml(generatedAt)}</div>
      </div>
      <p class="muted small">Fresh coins that match discovery filters. Use as research ideas, not trade signals.</p>
      <div class="play-section">
        ${rows}
      </div>
      ${buildHowThisWorks([
        "Scores rank new coins by liquidity, volume, and recent price action.",
        "Higher scores mean stronger short-term attention, not long-term quality.",
        "Why it matters: it turns a huge market into a short research list.",
        "Always review project basics before adding to your watchlist.",
      ])}
    </div>
  `;
}

function buildStoryCardsHtml(coins) {
  const items = Array.isArray(coins) ? coins : [];
  const withNews = items
    .filter((coin) => Array.isArray(coin?.news_headlines) && coin.news_headlines.length > 0)
    .slice(0, 8);

  if (withNews.length === 0) {
    return `
      <div class="card">
        <h2>Story Cards</h2>
        <p class="muted">${escapeHtml(NO_HEADLINES_MESSAGE)}</p>
        ${buildHowThisWorks([
          "Shows stories only when a coin has recent headlines.",
          "Headlines come from news sources and exchange announcements.",
          "Story cards do not change rankings by themselves.",
          "News pressure uses the same headlines and affects buckets and alerts.",
        ])}
      </div>
    `;
  }

  const cards = withNews
    .map((coin) => {
      const headlines = [...coin.news_headlines]
        .filter((h) => h && h.title)
        .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""));
      const latest = headlines[0];
      const updates = headlines.slice(0, 3)
        .map((headline) => {
          const published = headline.published ? formatUtc(headline.published) : "n/a";
          const source = headline.source ? `(${headline.source})` : "";
          const link = headline.url
            ? `<a href="${escapeHtml(headline.url)}" target="_blank" rel="noreferrer">${escapeHtml(headline.title)}</a>`
            : escapeHtml(headline.title);
          return `<li>${link} <span class="muted small">${escapeHtml(published)} ${escapeHtml(source)}</span></li>`;
        })
        .join("");
      const timeline = headlines.slice(0, 6)
        .map((headline) => {
          const published = headline.published ? formatUtc(headline.published) : "n/a";
          const link = headline.url
            ? `<a href="${escapeHtml(headline.url)}" target="_blank" rel="noreferrer">${escapeHtml(headline.title)}</a>`
            : escapeHtml(headline.title);
          return `<li>${link} <span class="muted small">${escapeHtml(published)}</span></li>`;
        })
        .join("");

      return `
        <div class="card story-card">
          <div class="row space-between">
            <div>
              <h3>${escapeHtml(coin.symbol || "Coin")} story</h3>
              <div class="muted small">${escapeHtml(coin.name || "")}</div>
            </div>
            <div class="muted small">Latest: ${escapeHtml(latest?.published ? formatUtc(latest.published) : "n/a")}</div>
          </div>
          <div class="story-updates">
            <ul class="compact">
              ${updates}
            </ul>
          </div>
          <details class="details" style="margin-top: 8px;">
            <summary><span class="summary-title">Timeline</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
            <div class="details-body">
              <ul class="compact">
                ${timeline}
              </ul>
            </div>
          </details>
        </div>
      `;
    })
    .join("");

  return `
    <div class="card">
      <h2>Story Cards</h2>
      <p class="muted small">Clustered headlines by coin with the most recent updates first.</p>
      <div class="story-grid">
        ${cards}
      </div>
      ${buildHowThisWorks([
        "Shows stories only when a coin has recent headlines.",
        "Headlines are grouped into one story to avoid duplicate noise.",
        "News pressure uses the same headlines and affects buckets and alerts.",
        "Why it matters: you get context quickly without reading every article.",
        "Use this for understanding, not instant trade decisions.",
      ])}
    </div>
  `;
}

function buildOpportunityBucketsHtml(coins) {
  const items = Array.isArray(coins) ? coins : [];
  const buckets = {
    momentum: [],
    catalyst: [],
    narrative: [],
    rebound: [],
    contrarian: [],
    traps: [],
  };

  for (const coin of items) {
    if (coin?.trend_regime === "Downtrend" || coin?.unlock_risk_flag || coin?.low_liquidity) {
      buckets.traps.push(coin);
      continue;
    }
    if (coin?.outperforming_btc && (coin?.entry_signal === "buy" || coin?.entry_signal === "strong_buy")) {
      buckets.momentum.push(coin);
    }
    if (coin?.has_clean_catalyst) {
      buckets.catalyst.push(coin);
    }
    const pressureScore = num(coin?.news_pressure_score);
    const hasNewsPressure =
      pressureScore !== null && Math.abs(pressureScore) >= 20;
    if (hasNewsPressure || (coin?.news_activity && coin.news_activity !== "quiet")) {
      buckets.narrative.push(coin);
    }
    if (coin?.distance_from_high && coin.distance_from_high > 20 && coin?.entry_signal !== "overbought") {
      buckets.rebound.push(coin);
    }
    if (
      coin?.rsi_signal === "oversold" &&
      (coin?.news_pressure_label === "negative" || coin?.news_sentiment === "bearish")
    ) {
      buckets.contrarian.push(coin);
    }
  }

  const card = (title, list, note) => {
    const top = list.slice(0, 6);
    const body = top.length
      ? `<div class="bucket-list">${top.map((c) => `<span class="badge badge-muted">${escapeHtml(c.symbol)}</span>`).join(" ")}</div>`
      : `<div class="muted small">No coins here today.</div>`;
    return `
      <div class="bucket-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="muted small">${escapeHtml(note)}</div>
        ${body}
      </div>
    `;
  };

  return `
    <div class="card">
      <h2>Opportunity Buckets</h2>
      <div class="muted small">Quick buckets to scan in 10 seconds. Labels explain the criteria.</div>
      <div class="bucket-grid">
        ${card("Momentum (confirmed)", buckets.momentum, "Uptrend + strong entry + beating BTC")}
        ${card("Catalyst soon", buckets.catalyst, "Fresh project catalysts or releases")}
        ${card("Narrative accelerating", buckets.narrative, "News activity is building")}
        ${card("Rebound candidates", buckets.rebound, "Meaningful pullback + entry signals")}
        ${card("Contrarian panic", buckets.contrarian, "Oversold + negative tone (high risk)")}
        ${card("Avoid / traps", buckets.traps, "Downtrend, unlock risk, or low liquidity")}
      </div>
      ${buildHowThisWorks([
        "Momentum = uptrend + good entry + beating BTC.",
        "Catalyst = clean project update or release.",
        "Narrative = active news or high news pressure.",
        "Rebound = big dip and not overbought.",
        "Contrarian = oversold with negative tone (high risk).",
        "Avoid = downtrend, unlock risk, or low liquidity.",
      ])}
    </div>
  `;
}

function buildPortfolioGuidanceHtml(guidance) {
  if (!guidance) return "";

  const phase = guidance.market_phase || "neutral";
  const basePct = Number.isFinite(guidance.base_position_pct) ? guidance.base_position_pct : null;
  const defaultPortfolio = Number.isFinite(guidance.portfolio_size_usd) ? guidance.portfolio_size_usd : 5000;

  const keepCap = Number.isFinite(guidance.suggested_max_buy_keep_usd)
    ? formatUsd(guidance.suggested_max_buy_keep_usd)
    : "n/a";
  const watchCap = Number.isFinite(guidance.suggested_max_buy_watch_usd)
    ? formatUsd(guidance.suggested_max_buy_watch_usd)
    : "n/a";

  const volumeLow = Number.isFinite(guidance.volume_low_threshold_usd)
    ? formatUsdCompact(guidance.volume_low_threshold_usd)
    : "n/a";
  const volumeDrop = Number.isFinite(guidance.volume_drop_threshold_usd)
    ? formatUsdCompact(guidance.volume_drop_threshold_usd)
    : "n/a";

  const notes = Array.isArray(guidance.notes) ? guidance.notes : [];
  const notesHtml =
    notes.length > 0
      ? `<ul class="compact">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "";

  return `
    <div class="card" id="positionSizingCard" ${basePct !== null ? `data-base-pct="${basePct}"` : ""} data-phase="${escapeHtml(phase)}">
      <div class="row space-between">
        <h2>Position Sizing</h2>
        <div class="muted small">Market phase: ${escapeHtml(phase)}</div>
      </div>
      <p class="muted small">Max recommended per coin based on portfolio size and risk. It updates sizing only; verdicts update on the next scan.</p>
      <div class="row" style="gap: 12px; flex-wrap: wrap; margin-top: 10px;">
        <label class="muted small" style="display:flex; align-items:center; gap:8px;">
          Portfolio size ($):
          <input id="portfolioSizeInput" type="number" min="0" step="100" value="${escapeHtml(defaultPortfolio)}" style="width: 140px; padding: 6px 8px; border-radius: 10px; border: 1px solid var(--border); background: rgba(0,0,0,0.20); color: var(--text);" />
        </label>
        <span class="muted small">Saved in your browser</span>
      </div>

      <div style="display:flex; gap:18px; flex-wrap: wrap; margin-top: 12px;">
        <div>
          <div class="muted small">Typical max size (Ready)</div>
          <div id="keepCapValue" style="font-weight: 700; font-size: 18px;">${escapeHtml(keepCap)}</div>
        </div>
        <div>
          <div class="muted small">Typical max size (Watch)</div>
          <div id="watchCapValue" style="font-weight: 700; font-size: 18px;">${escapeHtml(watchCap)}</div>
        </div>
        <div title="Liquidity targets scale down for smaller portfolios.">
          <div class="muted small">Liquidity targets</div>
          <div class="muted small">Low: <span id="volumeLowValue">${escapeHtml(volumeLow)}</span> / Drop: <span id="volumeDropValue">${escapeHtml(volumeDrop)}</span></div>
        </div>
      </div>
      ${notesHtml}
      ${buildHowThisWorks([
        "Base size uses your portfolio size and market phase.",
        "Ready coins get a bigger cap; Watch coins get about half.",
        "Risk flags (low liquidity, unlocks, concentration) reduce size.",
        "A volume cap keeps size below about 0.1% of daily volume.",
        "Why it matters: sizing controls risk even when signals look good.",
      ])}
    </div>
  `;
}

// Build "What to Play" recommendations card
function buildDataFreshnessHtml(layer1Report) {
  if (!layer1Report) return "";
  const freshness = layer1Report?.data_freshness || {};
  const sources = layer1Report?.data_sources || {};

  const scanAt = formatUtc(freshness.scan_generated_at || layer1Report?.generated_at);
  const fearAt = formatUtc(freshness.fear_greed_fetched_at);
  const macroAt = formatUtc(freshness.macro_pulse_generated_at);
  const defiAt = formatUtc(freshness.defi_generated_at);
  const defiAge = typeof freshness.defi_age_hours === "number"
    ? `${freshness.defi_age_hours.toFixed(1)}h old`
    : "n/a";
  const ttl = typeof freshness.cache_ttl_minutes === "number" ? `${freshness.cache_ttl_minutes} min cache` : null;

  const missing = [];
  if (sources.unlocks === "NONE") missing.push("Unlock data missing");
  if (sources.catalysts === "NONE") missing.push("Catalyst data missing");
  if (sources.onchain === "NONE") missing.push("On-chain holder data missing");
  if (sources.news === "NONE") missing.push("News data missing");
  if (sources.tvl === "NONE") missing.push("TVL data missing");
  if (sources.developer_data === "NONE") missing.push("Developer activity data missing");

  const missingHtml =
    missing.length > 0
      ? `<ul class="compact">${missing.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="muted small">No major sources missing.</div>`;

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Data Freshness</h2>
        <div class="muted small">${ttl ? escapeHtml(ttl) : ""}</div>
      </div>
      <div class="muted small">Scan time: ${escapeHtml(scanAt)}</div>
      <div class="muted small">Fear & Greed fetched: ${escapeHtml(fearAt)}</div>
      <div class="muted small">Macro pulse generated: ${escapeHtml(macroAt)}</div>
      <div class="muted small">DeFi scan generated: ${escapeHtml(defiAt)} (${escapeHtml(defiAge)})</div>
      <div style="margin-top: 10px;">
        <div class="muted small" style="font-weight: 700;">Missing / limited data</div>
        ${missingHtml}
        <div class="muted small" style="margin-top: 8px;">Per-coin news timestamps are shown in each coin's "Why" section.</div>
      </div>
      ${buildHowThisWorks([
        "Shows last updated times for scan, fear/greed, macro, and DeFi.",
        "Missing sources mean some signals are weaker or incomplete.",
        "Developer activity comes from GitHub and/or CoinGecko when available.",
        "Cache window explains how often data refreshes.",
        "Why it matters: stale data can lead to bad decisions.",
      ])}
    </div>
  `;
}

function buildMacroPulseHtml(macroPulse) {
  if (!macroPulse) return "";
  const etf = macroPulse.etf_flows || {};
  const leverage = macroPulse.leverage || {};
  const btcShare = macroPulse.btc_share || {};
  const altStrength = macroPulse.alt_strength || {};
  const altNews = Array.isArray(macroPulse.alt_news) ? macroPulse.alt_news : [];
  const mood = macroPulse.mood || {};
  const macroCalendar = macroPulse.macro_calendar || {};
  const btcPrice = Number.isFinite(macroPulse.btc_price) ? formatUsd(macroPulse.btc_price) : "n/a";
  const btcChange = Number.isFinite(macroPulse.btc_change_24h)
    ? formatSignedPct(macroPulse.btc_change_24h, 2)
    : "n/a";
  const btcLine = Number.isFinite(macroPulse.btc_price)
    ? `${btcPrice} (${btcChange} 24h)`
    : "n/a";

  const etfToday = Number.isFinite(etf.today_total_musd)
    ? formatSignedUsdCompact(etf.today_total_musd * 1_000_000)
    : "n/a";
  const etfFive = Number.isFinite(etf.five_day_total_musd)
    ? formatSignedUsdCompact(etf.five_day_total_musd * 1_000_000)
    : "n/a";
  const driverText = Array.isArray(etf.top_drivers)
    ? etf.top_drivers
        .map((d) => `${d.ticker} ${formatSignedUsdCompact(d.flow_musd * 1_000_000)}`)
        .join(", ")
    : "";
  const flowValues = Array.isArray(etf.last_rows)
    ? etf.last_rows
        .map((row) => Number.isFinite(row?.total_musd) ? row.total_musd : null)
        .filter((v) => Number.isFinite(v))
    : [];
  const flowSparkline =
    flowValues.length >= 2 ? buildSparkline(flowValues, 140, 32) : "";

  const fundingPct = Number.isFinite(leverage.funding_rate_pct)
    ? `${leverage.funding_rate_pct.toFixed(3)}%`
    : "n/a";
  const fundingLabel = leverage.funding_label || "unknown";
  const oiUsd = Number.isFinite(leverage.open_interest_usd)
    ? formatUsdCompact(leverage.open_interest_usd)
    : "n/a";
  const oiChange = Number.isFinite(leverage.open_interest_change_pct)
    ? `${leverage.open_interest_change_pct.toFixed(2)}%`
    : "n/a";
  const oiLabel = leverage.open_interest_label || "unknown";

  const sharePct = Number.isFinite(btcShare.pct)
    ? `${btcShare.pct.toFixed(1)}%`
    : "n/a";
  const shareChange = Number.isFinite(btcShare.change_24h)
    ? formatSignedPct(btcShare.change_24h, 1)
    : "n/a";
  const shareTrend = btcShare.trend_label || "steady";
  const shareLine = `BTC share: ${sharePct}`;
  const shareDetail = shareChange !== "n/a" ? `${shareTrend}, ${shareChange} in 24h` : shareTrend;

  let altStrengthHtml = "";
  if (altStrength.error) {
    altStrengthHtml = `<div class=\"muted small\">${escapeHtml(altStrength.error)}</div>`;
  } else {
    const stronger = altStrength?.groups?.stronger || [];
    const weaker = altStrength?.groups?.weaker || [];
    const inline = altStrength?.groups?.inline || [];
    const lines = [];
    if (stronger.length) lines.push(`Stronger than BTC: ${stronger.join(", ")}`);
    if (weaker.length) lines.push(`Weaker than BTC: ${weaker.join(", ")}`);
    if (inline.length) lines.push(`About the same: ${inline.join(", ")}`);
    altStrengthHtml = lines.length
      ? lines.map((line) => `<div class=\"muted small\">${escapeHtml(line)}</div>`).join("")
      : `<div class=\"muted small\">Alt strength: n/a</div>`;
  }

  const newsLines = altNews.map((item) => {
    const tone = item?.tone || "neutral";
    const windowLabel = item?.window || "recent";
    const symbol = item?.symbol || "n/a";
    const title = item?.title || "";
    return `${symbol} (${tone}, ${windowLabel}): ${title}`;
  });
  const newsHtml = newsLines.length
    ? newsLines.map((line) => `<div class=\"muted small\">${escapeHtml(line)}</div>`).join("")
    : `<div class=\"muted small\">${escapeHtml(NO_HEADLINES_MESSAGE)}</div>`;

  const moodLabel = mood.label || "Mixed";
  const moodReason = mood.reason || "No clear edge right now.";
  const moodText = moodReason ? `${moodLabel} - ${moodReason}` : moodLabel;

  const upcoming = Array.isArray(macroCalendar.upcoming) ? macroCalendar.upcoming : [];
  const watchlist = Array.isArray(macroCalendar.watchlist) ? macroCalendar.watchlist : [];
  const calendarNote =
    typeof macroCalendar.note === "string" && macroCalendar.note.trim()
      ? macroCalendar.note.trim()
      : "No upcoming macro events listed.";

  const upcomingLines = upcoming.slice(0, 5).map((item) => {
    const impact = item?.impact ? String(item.impact).toUpperCase() : "";
    const region = item?.region || "";
    const when = item?.window || (item?.datetime ? formatUtc(item.datetime) : "");
    const meta = [impact, region, when].filter(Boolean).join(" | ");
    return meta ? `${item?.title || "Event"} (${meta})` : `${item?.title || "Event"}`;
  });
  const upcomingHtml = upcomingLines.length
    ? upcomingLines
        .map((line) => `<div class="muted small">${escapeHtml(line)}</div>`)
        .join("")
    : `<div class="muted small">${escapeHtml(calendarNote)}</div>`;

  const watchLines = watchlist.slice(0, 6).map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return null;
    const title = item.title || "";
    const impact = item.impact ? String(item.impact).toUpperCase() : "";
    return impact ? `${title} (${impact})` : title;
  }).filter(Boolean);
  const watchHtml = watchLines.length
    ? `<div class="macro-note">Always watch: ${escapeHtml(watchLines.join("; "))}</div>`
    : "";

  return `
    <div class="card macro-pulse">
      <div class="row space-between">
        <div>
          <h2>Market Pulse</h2>
          <div class="muted small">BTC: ${escapeHtml(btcLine)}</div>
        </div>
        <div class="muted small">Updated: ${escapeHtml(formatUtc(macroPulse.generated_at))}</div>
      </div>
      <p class="muted small">Context signals only. Use to size risk, not as a trade trigger.</p>
      <div class="macro-grid">
        <div class="macro-block">
          <h4>ETF money flow (spot BTC)</h4>
          ${etf.error ? `<div class="muted">${escapeHtml(etf.error)}</div>` : `
            <div class="macro-stat">Today: ${escapeHtml(etfToday)}</div>
            <div class="muted small">Last 5 days: ${escapeHtml(etfFive)}</div>
            ${flowSparkline ? `<div class="macro-sparkline">${flowSparkline}</div>` : ""}
            ${driverText ? `<div class="muted small">Biggest movers: ${escapeHtml(driverText)}</div>` : ""}
            ${etf.momentum_label ? `<div class="muted small">Momentum: ${escapeHtml(etf.momentum_label)}</div>` : ""}
            ${etf.devil_note ? `<div class="macro-note">${escapeHtml(etf.devil_note)}</div>` : ""}
          `}
        </div>
        <div class="macro-block">
          <h4>Leverage check (BTC futures)</h4>
          ${leverage.error ? `<div class="muted">${escapeHtml(leverage.error)}</div>` : `
            <div class="macro-stat">Funding cost: ${escapeHtml(fundingPct)}</div>
            <div class="muted small">Funding tone: ${escapeHtml(fundingLabel)}</div>
            <div class="muted small">Open positions: ${escapeHtml(oiUsd)} (${escapeHtml(oiLabel)}, ${escapeHtml(oiChange)})</div>
          `}
        </div>
        <div class="macro-block">
          <h4>BTC share and alt strength</h4>
          ${btcShare.error ? `<div class="muted">${escapeHtml(btcShare.error)}</div>` : `
            <div class="macro-stat">${escapeHtml(shareLine)}</div>
            <div class="muted small">${escapeHtml(shareDetail)}</div>
          `}
          ${altStrengthHtml}
        </div>
        <div class="macro-block">
          <h4>Alt news and mood</h4>
          ${newsHtml}
          <div class="macro-note">Mood: ${escapeHtml(moodText)}</div>
        </div>
        <div class="macro-block">
          <h4>Macro calendar</h4>
          ${upcomingHtml}
          ${watchHtml}
        </div>
      </div>
      ${buildHowThisWorks([
        "BTC price and weekly momentum set the backdrop.",
        "ETF flows and funding show big-money pressure.",
        "BTC share and alt strength show where money is rotating.",
        "Alt news and mood summarize headline tone.",
        "Why it matters: it helps you size risk across all coins.",
      ])}
    </div>
  `;
}

function buildCategoryPulseHtml(categoryPulse) {
  if (!categoryPulse || !Array.isArray(categoryPulse.categories)) return "";

  const categories = categoryPulse.categories
    .filter((c) => c && typeof c === "object" && c.member_count > 0)
    .filter((c) => Number.isFinite(num(c.vs_btc_7d)));

  if (categories.length === 0) {
    return "";
  }

  const gateBadge = (story) => {
    const gate = story?.gate || "unknown";
    if (gate === "caution") return badge("News warning", "badge-warning");
    if (gate === "mixed") return badge("News mixed", "badge-info");
    if (gate === "ok") return badge("No red flags", "badge-keep");
    return badge("No headlines", "badge-muted");
  };

  const driversText = (story) => {
    const events = Array.isArray(story?.events) ? story.events : [];
    const labels = events.map((e) => e?.label).filter(Boolean);
    if (labels.length > 0) return labels.slice(0, 3).join(" • ");
    const count = num(story?.news_count_7d);
    if (count !== null && count > 0) return "News is active, but no clear theme yet.";
    return NO_HEADLINES_MESSAGE;
  };

  const renderRows = (list) =>
    list
      .map((cat) => {
        const perf7 = Number.isFinite(num(cat.median_change_7d))
          ? formatSignedPct(num(cat.median_change_7d), 1)
          : "n/a";
        const vsBtc = Number.isFinite(num(cat.vs_btc_7d))
          ? formatSignedPct(num(cat.vs_btc_7d), 1)
          : "n/a";

        const movers = Array.isArray(cat.top_movers_7d) ? cat.top_movers_7d : [];
        const moversHtml = movers.length
          ? movers
              .slice(0, 3)
              .map((m) => {
                const pct = Number.isFinite(num(m?.change_7d))
                  ? formatSignedPct(num(m.change_7d), 1)
                  : "n/a";
                return `<span class="badge badge-muted">${escapeHtml(m?.symbol || "")} ${escapeHtml(pct)}</span>`;
              })
              .join(" ")
          : `<span class="muted small">n/a</span>`;

        const story = cat.story || {};
        const headlineItems = Array.isArray(story.sample_headlines) ? story.sample_headlines : [];
        const headlinesHtml = headlineItems.length
          ? `
              <details class="details" style="margin-top: 8px;">
                <summary><span class="summary-title">Headlines</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
                <div class="details-body">
                  <ul class="compact">
                    ${headlineItems
                      .slice(0, 5)
                      .map((h) => {
                        const title = h?.title || "";
                        const url = h?.url || "";
                        const source = h?.source || "";
                        const when = h?.published ? formatUtc(h.published) : "n/a";
                        const link = url
                          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
                          : escapeHtml(title);
                        const meta = [source, when].filter(Boolean).join(" • ");
                        return `<li>${link}${meta ? ` <span class="muted small">${escapeHtml(meta)}</span>` : ""}</li>`;
                      })
                      .join("")}
                  </ul>
                </div>
              </details>
            `
          : "";

        const missingNote =
          Number.isFinite(num(cat.missing_count)) && num(cat.missing_count) > 0
            ? ` <span class="muted small">(missing ${escapeHtml(String(cat.missing_count))})</span>`
            : "";

        return `
          <tr>
            <td data-label="Category">
              <div style="font-weight: 700;">${escapeHtml(cat.name || cat.id || "")}</div>
              <div class="muted small">${escapeHtml(cat.description || "")}</div>
              <div class="muted small">${escapeHtml(String(cat.member_count))} coins${missingNote}</div>
            </td>
            <td data-label="7d" class="num">${escapeHtml(perf7)}</td>
            <td data-label="Vs BTC (7d)" class="num">${escapeHtml(vsBtc)}</td>
            <td data-label="Top Movers">${moversHtml}</td>
            <td data-label="Why">
              ${gateBadge(story)}
              <div class="muted small" style="margin-top: 6px;">${escapeHtml(driversText(story))}</div>
              ${headlinesHtml}
            </td>
          </tr>
        `;
      })
      .join("");

  const renderTable = (list) => `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="num">7d</th>
            <th class="num">Vs BTC</th>
            <th>Top movers</th>
            <th>Why (headlines)</th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(list)}
        </tbody>
      </table>
    </div>
  `;

  const top = categories.slice(0, 8);
  const remaining = categories.slice(8);

  return `
    <div class="card">
      <div class="row space-between">
        <div>
          <h2>Category Pulse</h2>
          <div class="muted small">What's moving vs BTC (7d) - and why (based on headlines we found).</div>
        </div>
        <div class="muted small">Updated: ${escapeHtml(formatUtc(categoryPulse.generated_at))}</div>
      </div>
      ${renderTable(top)}
      ${
        remaining.length > 0
          ? `
            <details class="details" style="margin-top: 10px;">
              <summary><span class="summary-title">All categories</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
              <div class="details-body">
                ${renderTable(categories)}
              </div>
            </details>
          `
          : ""
      }
      ${buildHowThisWorks([
        "Categories are defined by you in config/categories.json.",
        "We rank categories by the median 7-day move versus BTC.",
        "\"Why\" comes from recent headlines (exchange announcements + coin updates).",
        "Story gate: if headlines look bad (hack/delist/team issues), we show a warning even if price is up.",
        "If we can't find headlines, it may just be money rotating around the market.",
      ])}
    </div>
  `;
}

function buildPlayRecommendationsHtml(playRecs) {
  if (!playRecs) {
    return "";
  }

  const phase = playRecs.market_phase || "neutral";
  const phaseLabels = {
    accumulation: { label: "Accumulation", color: "var(--keep)", desc: "Often a good time to slowly build positions in quality coins" },
    run: { label: "Run", color: "#60a5fa", desc: "Momentum plays may work, but moves can reverse" },
    caution: { label: "Caution", color: "var(--warning)", desc: "Market looks hot - consider taking profits and sizing down" },
    neutral: { label: "Neutral", color: "var(--muted)", desc: "No strong market signal - hold or wait" },
  };
  const phaseInfo = phaseLabels[phase] || phaseLabels.neutral;

  const renderItems = (items, extraClass, actionOverride, limit = 5) => {
    const list = Array.isArray(items) ? items : [];
    return list.slice(0, limit).map((rec) => {
      const actionText = actionOverride || rec?.action || "";
      return `
        <div class="play-item ${extraClass}">
          <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
          <span class="play-action">${escapeHtml(actionText)}</span>
          <span class="play-reason">${escapeHtml(rec.reason || "")}</span>
        </div>
      `;
    }).join("");
  };

  let sectionsHtml = "";

  // TAKE PROFITS (highest priority - money on the table)
  if (playRecs.take_profits?.length > 0) {
    const items = renderItems(playRecs.take_profits, "play-sell", null, 5);
    sectionsHtml += `
      <div class="play-section">
        <h4>Take Profits</h4>
        <p class="play-desc">You are up on these - consider trimming some</p>
        ${items}
      </div>
    `;
  }

  // BEST BUYS
  if (playRecs.best_buys?.length > 0) {
    const items = renderItems(playRecs.best_buys, "play-buy", null, 5);
    sectionsHtml += `
      <div class="play-section">
        <h4>Best Entries</h4>
        <p class="play-desc">Strong fundamentals and a decent entry price</p>
        ${items}
      </div>
    `;
  }

  // MOMENTUM PLAYS
  if (playRecs.momentum_plays?.length > 0) {
    const items = renderItems(playRecs.momentum_plays, "play-momentum", null, 5);
    sectionsHtml += `
      <div class="play-section">
        <h4>Momentum Plays</h4>
        <p class="play-desc">Quick trades - be strict with risk</p>
        ${items}
      </div>
    `;
  }

  // GOOD COINS, NOT AN ENTRY YET
  if (playRecs.watch_for_dip?.length > 0) {
    const items = renderItems(playRecs.watch_for_dip, "play-wait", null, 3);
    sectionsHtml += `
      <div class="play-section">
        <h4>Wait for Entry</h4>
        <p class="play-desc">Worth watching, but wait for a better price</p>
        ${items}
      </div>
    `;
  }

  // AVOID
  if (playRecs.avoid?.length > 0) {
    const items = renderItems(playRecs.avoid, "play-avoid", "Avoid", 3);
    sectionsHtml += `
      <div class="play-section">
        <h4>Avoid</h4>
        <p class="play-desc">Red flags - do not act on these right now</p>
        ${items}
      </div>
    `;
  }

  if (!sectionsHtml) {
    sectionsHtml = `<p class="muted">No specific recommendations right now. Keep watching.</p>`;
  }

  return `
    <div class="card play-recommendations">
      <h2>What to Play</h2>
      <div class="phase-banner" style="background: ${phaseInfo.color}20; border-left: 4px solid ${phaseInfo.color}; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
        <span style="font-size: 18px;"><strong>${escapeHtml(phaseInfo.label)}</strong></span>
        <span style="color: var(--muted); margin-left: 12px;">${escapeHtml(phaseInfo.desc)}</span>
      </div>
      ${sectionsHtml}
      ${buildHowThisWorks([
        "Uses market phase plus watchlist labels (which include dev activity) and entry timing.",
        "Take Profits come from your take-profit tracker.",
        "Best Entries are KEEP coins with good timing and no major risks.",
        "Momentum Plays favor coins beating BTC during runs.",
        "Watch for Entry are good coins with timing not ready.",
        "Avoid is for DROP, chasing, or high-risk coins.",
      ])}
    </div>
  `;
}
function buildBestEntriesHtml(bestEntriesData) {
  if (!bestEntriesData) {
    return "";
  }
  
  const entries = Array.isArray(bestEntriesData.best_entries) ? bestEntriesData.best_entries : [];
  const waitList = Array.isArray(bestEntriesData.wait_list) ? bestEntriesData.wait_list : [];
  const phase = bestEntriesData.market_phase || "neutral";
  
  const phaseBadge = phase === "accumulation" 
    ? `<span class="badge badge-positive" style="margin-left: 8px;">Accumulation phase</span>`
    : phase === "run"
      ? `<span class="badge badge-info" style="margin-left: 8px;">Run phase</span>`
      : phase === "caution"
        ? `<span class="badge badge-warning" style="margin-left: 8px;">Caution phase</span>`
        : "";
  
  if (entries.length === 0 && waitList.length === 0) {
    return `
      <div class="card best-entries">
        <h2>Best Entries Today ${phaseBadge}</h2>
        <p class="muted">No entry signals in your watchlist right now.</p>
        <p class="small muted">Tip: check "What to Play" for entries and wait-for-entry ideas.</p>
      </div>
    `;
  }
  
  const buildItem = (entry, kind) => {
    const entryClass = kind === "wait" ? "play-wait" : (entry.entry_signal === "strong_buy" ? "play-buy" : "play-momentum");
    const action = kind === "wait" ? "Wait for dip" : (entry.entry_signal === "strong_buy" ? "Strong entry" : "Entry setup");
    const rsiText = Number.isFinite(entry.rsi) ? `RSI ${Math.round(entry.rsi)}` : "";
    const dipText = Number.isFinite(entry.distance_from_high) ? `${entry.distance_from_high.toFixed(0)}% off 30d high` : "";
    const statsText = [rsiText, dipText].filter(Boolean).join(" | ");
    const reasonsText = Array.isArray(entry.reasons) && entry.reasons.length > 0 ? entry.reasons.slice(0, 2).join(", ") : (kind === "wait" ? "Good coin, but not an entry yet" : "Technical entry");
    const label = entry.hygiene_label || null;
    const entrySignal = entry.entry_signal || null;
    const labelBadge = label ? `<span style="margin-left: 6px;">${badge(friendlyLabel(label), labelClass(label))}</span>` : "";
    return `
      <div class="play-item ${entryClass}">
        <span class="play-symbol">${escapeHtml(entry.symbol || "")} ${labelBadge}</span>
        <span class="play-action">${escapeHtml(action)}</span>
        <span class="play-reason">${escapeHtml(reasonsText)}${statsText ? ` | ${escapeHtml(statsText)}` : ""}</span>
      </div>
    `;
  };
  
  const entriesHtml = entries.slice(0, 5).map((e) => buildItem(e, "buy")).join("");
  const waitHtml = waitList.slice(0, 5).map((e) => buildItem(e, "wait")).join("");
  
  const waitSection = waitList.length > 0
    ? `
      <div class="play-section" style="margin-top: 14px;">
        <h4>Wait for Entry</h4>
        <p class="play-desc">These are solid coins, but entry timing says to wait for a better dip.</p>
        ${waitHtml}
      </div>
    `
    : "";
  
  return `
    <div class="card best-entries">
      <h2>Best Entries Today ${phaseBadge}</h2>
      <p class="small muted" style="margin-bottom: 12px;">Entry signals (Good/Great) from your watchlist, based on price pullbacks + safety checks.</p>
      <div class="play-section">
        ${entriesHtml}
      </div>
      ${waitSection}
      ${buildHowThisWorks([
        "Only KEEP coins are eligible; KEEP uses project health and dev activity gates.",
        "Dev activity uses GitHub commit recency/repo status or CoinGecko dev data.",
        "Timing score uses RSI and distance from 30-day high/low.",
        "Downtrend coins are excluded unless a strong catalyst and volume spike exist.",
        "High-risk flags remove a coin from this list.",
        "Why it matters: it avoids good coins at bad timing.",
      ])}
    </div>
  `;
}
// Build Blue Chip Opportunities card
function buildBlueChipOpportunitiesHtml(blueChipData) {
  if (!blueChipData) {
    return "";
  }
  
  const opportunities = Array.isArray(blueChipData.opportunities) ? blueChipData.opportunities : [];
  const waitList = Array.isArray(blueChipData.wait_list) ? blueChipData.wait_list : [];
  const scannedCount = blueChipData.scanned_count || 0;
  const marketInFear = blueChipData.market_in_fear;
  
  if (opportunities.length === 0 && waitList.length === 0) {
    return `
      <div class="card blue-chips">
        <h2>Blue Chip Dip Opportunities</h2>
        <p class="muted">Scanned top ${scannedCount} cryptos by market cap - no strong dip opportunities right now.</p>
        <p class="small muted">Blue chips are safer mainly because they have higher liquidity. This section only highlights dips with signs of stabilizing.</p>
      </div>
    `;
  }
  
  const fearBadge = marketInFear 
    ? `<span class="badge badge-positive" style="margin-left: 8px;">Market in Fear = More opportunity (but still be careful)</span>` 
    : "";
  
  const fmtMcap = (mcap) => {
    if (!Number.isFinite(mcap)) return "n/a";
    if (mcap >= 1_000_000_000_000) return `$${(mcap / 1_000_000_000_000).toFixed(2)}T`;
    if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(1)}B`;
    return `$${(mcap / 1_000_000).toFixed(0)}M`;
  };
  
  const buyHtml = opportunities.slice(0, 5).map((opp) => {
    const entryClass = opp.entry_signal === "strong_buy" ? "play-buy" : "play-momentum";
    const action = opp.entry_signal === "strong_buy" ? "Entry signal" : "Entry signal";
    const signalsText = Array.isArray(opp.signals) ? opp.signals.slice(0, 2).join(", ") : "";
    const riskWarnings = Array.isArray(opp.risk_warnings) ? opp.risk_warnings : [];
    const contextSummary = opp.context_summary ? String(opp.context_summary) : "";
    const contextShortTermOnly = opp.context_short_term_only === true;
    const contextNote = contextShortTermOnly
      ? "Context: history suggests short-term only"
      : contextSummary
        ? `Context: ${contextSummary}`
        : "";
    const cautionText = riskWarnings.length > 0 ? ` | Caution: ${riskWarnings[0]}` : "";
    const mcapText = fmtMcap(opp.market_cap);
    const contextText = contextNote ? ` | ${contextNote}` : "";
    return `
      <div class="play-item ${entryClass}">
        <span class="play-symbol">${escapeHtml(opp.symbol || "")}</span>
        <span class="play-action">${escapeHtml(action)}</span>
        <span class="play-reason">${escapeHtml(`${signalsText} | MCap: ${mcapText}${cautionText}${contextText}`)}</span>
      </div>
    `;
  }).join("");
  
  const waitHtml = waitList.slice(0, 5).map((opp) => {
    const signalsText = Array.isArray(opp.signals) ? opp.signals.slice(0, 2).join(", ") : "";
    const riskWarnings = Array.isArray(opp.risk_warnings) ? opp.risk_warnings : [];
    const waitReason = opp.wait_reason ? String(opp.wait_reason) : "Still falling; waiting for stabilization.";
    const contextSummary = opp.context_summary ? String(opp.context_summary) : "";
    const contextShortTermOnly = opp.context_short_term_only === true;
    const contextNote = contextShortTermOnly
      ? "Context: history suggests short-term only"
      : contextSummary
        ? `Context: ${contextSummary}`
        : "";
    const extra = riskWarnings.length > 0 ? ` | Caution: ${riskWarnings[0]}` : "";
    const contextText = contextNote ? ` | ${contextNote}` : "";
    const mcapText = fmtMcap(opp.market_cap);
    return `
      <div class="play-item play-wait">
        <span class="play-symbol">${escapeHtml(opp.symbol || "")}</span>
        <span class="play-action">Wait</span>
        <span class="play-reason">${escapeHtml(`${waitReason} | ${signalsText} | MCap: ${mcapText}${extra}${contextText}`)}</span>
      </div>
    `;
  }).join("");
  
  const buySection = opportunities.length > 0
    ? `
      <div class="play-section">
        <h4>Dip Opportunities</h4>
        <p class="play-desc">These are dips that also look like they are starting to stabilize.</p>
        ${buyHtml}
      </div>
    `
    : "";
  
  const waitSection = waitList.length > 0
    ? `
      <div class="play-section" style="margin-top: 14px;">
        <h4>Wait List (Still Falling)</h4>
        <p class="play-desc">These have dip signals, but are still falling hard today. Better to wait for the drop to slow down.</p>
        ${waitHtml}
      </div>
    `
    : "";
  
  return `
    <div class="card blue-chips">
      <h2>Blue Chip Dip Opportunities ${fearBadge}</h2>
      <p class="small muted" style="margin-bottom: 12px;">Top ${scannedCount} cryptos by market cap - safer mainly because they have higher liquidity</p>
      ${buySection}
      ${waitSection}
      <p class="small muted" style="margin-top: 12px;">If something is still falling fast today, waiting can be safer than trying to catch the exact bottom.</p>
      ${buildHowThisWorks([
        "Scans top market-cap coins for dips and stabilization.",
        "Signals use RSI oversold, dip from 7-day high, and weekly loss.",
        "Moves to Wait list if still falling fast today.",
        "Adds a BCH-style history note when a coin has known structural headwinds.",
        "Coins tagged short-term only are bounce ideas, not long-term holds.",
        "Why it matters: larger coins are usually more liquid and safer.",
      ])}
    </div>
  `;
}
function buildDiffHtml(diffReport) {
  if (!diffReport) {
    return `
      <div class="card">
        <h2>What Changed Today</h2>
        <p class="muted">This is your first scan - future runs will show what's changed.</p>
      </div>
    `;
  }

  const bySeverity = {
    CRITICAL: [],
    WARNING: [],
    POSITIVE: [],
    INFO: [],
  };
  for (const change of diffReport.changes || []) {
    const key = bySeverity[change?.severity] ? change.severity : "INFO";
    bySeverity[key].push(change);
  }

  const sections = [
    { key: "CRITICAL", title: "Needs Attention" },
    { key: "WARNING", title: "Worth Watching" },
    { key: "POSITIVE", title: "Good News" },
  ];

  const prev = formatUtc(diffReport.previous_scan_date);
  const total = (diffReport.changes || []).length;

  const itemsHtml = sections
    .map((s) => {
      const items = bySeverity[s.key];
      if (!items || items.length === 0) return "";
      const list = items
        .map((item) => {
          const tag = item.watchlist_source === "staging" ? " (testing)" : "";
          return `<li><strong>${escapeHtml(item.symbol)}${escapeHtml(
            tag
          )}</strong>: ${escapeHtml(item.description)}</li>`;
        })
        .join("");
      return `
        <div class="diff-group">
          <h3>${escapeHtml(s.title)} <span class="muted">(${items.length})</span></h3>
          <ul class="compact">${list}</ul>
        </div>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="row space-between">
        <h2>What Changed Today</h2>
        <div class="muted">Since ${escapeHtml(prev)}</div>
      </div>
      ${
        total === 0
          ? `<p class="muted">Nothing significant changed since last scan.</p>`
          : itemsHtml
      }
      ${buildHowThisWorks([
        "Compares the last scan to the latest scan.",
        "Shows only Critical and Warning changes by default.",
        "Why it matters: you can spot new risks or improvements quickly.",
        "If empty, nothing changed enough to act.",
      ])}
    </div>
  `;
}

function buildSupervisorHtml(supervisorResult) {
  if (!supervisorResult || supervisorResult.status !== "ok") {
    return `
      <div class="card">
        <h2>AI Summary</h2>
        <p class="muted">AI analysis not available. Set OPENAI_API_KEY to enable this feature.</p>
      </div>
    `;
  }

  const todayBrief = supervisorResult.today_brief || supervisorResult.executive_summary || "No summary provided.";
  const topPlays = Array.isArray(supervisorResult.top_plays) ? supervisorResult.top_plays : [];
  const topRisks = Array.isArray(supervisorResult.top_risks) ? supervisorResult.top_risks : [];
  const oneThing = supervisorResult.one_thing || "";

  const playsHtml =
    topPlays.length === 0
      ? `<p class="muted small">No clear plays today.</p>`
      : `<ul class="compact">${topPlays
          .map((play) => {
            const action = play?.action || "Wait";
            const actionBadge =
              action === "Buy"
                ? badge("Buy", "badge-positive")
                : action === "Avoid"
                  ? badge("Avoid", "badge-critical")
                  : badge("Wait", "badge-warning");
            const why = Array.isArray(play?.why) ? play.why.filter(Boolean) : [];
            const whyText = why.length > 0 ? ` - ${why.join("; ")}` : "";
            const riskText = play?.main_risk ? ` (Risk: ${play.main_risk})` : "";
            const sourceText = play?.source ? ` [${play.source}]` : "";
            return `<li><strong>${escapeHtml(play?.symbol || "n/a")}</strong> ${actionBadge}${escapeHtml(whyText)}${escapeHtml(riskText)}${escapeHtml(sourceText)}</li>`;
          })
          .join("")}</ul>`;

  const risksHtml =
    topRisks.length === 0
      ? `<p class="muted small">No major risks flagged.</p>`
      : `<ul class="compact">${topRisks.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;

  const highlights = Array.isArray(supervisorResult.onchain_highlights)
    ? supervisorResult.onchain_highlights
    : [];
  const watchClosely = Array.isArray(supervisorResult.watch_closely)
    ? supervisorResult.watch_closely
    : [];
  const avoidChasing = Array.isArray(supervisorResult.avoid_chasing)
    ? supervisorResult.avoid_chasing
    : [];
  const manual = Array.isArray(supervisorResult.manual_checks_required)
    ? supervisorResult.manual_checks_required
    : [];

  const highlightsHtml =
    highlights.length === 0
      ? ""
      : `
        <h4>Ownership notes</h4>
        <p class="muted small">Coins where a few wallets hold most of the supply can be risky.</p>
        <ul class="compact">
          ${highlights
            .map((h) => {
              const facts = Array.isArray(h?.facts) ? h.facts.filter(Boolean) : [];
              const factsText = facts.length ? facts.join(" - ") : "";
              const risk = h?.risk || "UNKNOWN";
              const riskBadge =
                risk === "HIGH"
                  ? badge("Risky", "badge-warning")
                  : risk === "OK"
                    ? badge("OK", "badge-positive")
                    : badge("?", "badge-muted");
              return `<li><strong>${escapeHtml(h?.symbol || "n/a")}</strong> ${riskBadge}: ${escapeHtml(
                factsText
              )}</li>`;
            })
            .join("")}
        </ul>
      `;

  function listVerdicts(title, items, explanation) {
    if (!items.length) return "";
    return `
      <h4>${escapeHtml(title)}</h4>
      ${explanation ? `<p class="muted small">${explanation}</p>` : ""}
      <ul class="compact">
        ${items
          .map((i) => {
            const why = i?.why ? ` - ${i.why}` : "";
            return `<li><strong>${escapeHtml(i?.symbol || "n/a")}</strong>${escapeHtml(why)}</li>`;
          })
          .join("")}
      </ul>
    `;
  }

  const manualHtml =
    manual.length === 0
      ? ""
      : `
        <h4>Need more research</h4>
        <p class="muted small">These coins need a manual news check.</p>
        <ul class="compact">
          ${manual.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
        </ul>
      `;

  const detailSections =
    highlightsHtml ||
    watchClosely.length ||
    avoidChasing.length ||
    manual.length
      ? `
        <details class="details">
          <summary><span class="summary-title">More detail</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
          <div class="details-body">
            ${highlightsHtml}
            ${listVerdicts("Be careful with", watchClosely, "Warning flags are showing up.")}
            ${listVerdicts("Do not chase", avoidChasing, "These already pumped without clear support.")}
            ${manualHtml}
          </div>
        </details>
      `
      : "";

  return `
    <div class="card" id="ai-summary">
      <h2>AI Summary</h2>
      <p>${escapeHtml(todayBrief)}</p>
      <h3>Top plays</h3>
      ${playsHtml}
      <h3 style="margin-top: 12px;">Top risks</h3>
      ${risksHtml}
      ${oneThing ? `<div class="muted small" style="margin-top: 10px;"><strong>If you only do one thing:</strong> ${escapeHtml(oneThing)}</div>` : ""}
      ${detailSections}
      ${buildHowThisWorks([
        "AI summarizes only the reports from this scan.",
        "Top plays are picked from the pre-built shortlist, not invented.",
        "Action words are labels, not financial advice.",
        "Use it as a fast briefing before you scroll deeper.",
      ])}
    </div>
  `;
}

function buildAlertsHtml(alertsReport) {
  if (!alertsReport) {
    return `
      <div class="card">
        <h2>Important Alerts</h2>
        <p class="muted">Alerts will appear here after running the scanner.</p>
      </div>
    `;
  }

  const alerts = Array.isArray(alertsReport.alerts) ? alertsReport.alerts : [];

  function sourceBadge(source) {
    const key = String(source || "").toUpperCase();
    switch (key) {
      case "WATCHLIST":
        return badge("Your list", "badge-positive");
      case "DEFI":
        return badge("DeFi", "badge-info");
      case "DISCOVERY":
        return badge("New find", "badge-warning");
      case "BLUE_CHIP_DIP":
        return badge("Blue chip", "badge-info");
      case "NEWS":
        return badge("News", "badge-muted");
      case "VOLUME_NEWS":
        return badge("Volume + news", "badge-muted");
      case "BEST_ENTRY":
        return badge("Best entry", "badge-positive");
      case "IMPROVING":
        return badge("Improving", "badge-positive");
      case "TAKE_PROFIT":
      case "TAKE_PROFIT_APPROACHING":
        return badge("Take profit", "badge-warning");
      default:
        if (key.startsWith("MARKET_")) return badge("Market", "badge-muted");
        return badge(key || "ALERT", "badge-muted");
    }
  }

  const contentHtml =
    alerts.length === 0
      ? `<p class="muted">All clear today.</p>`
      : alerts
          .slice(0, 10)
          .map((a) => {
            const symbol = a?.symbol ? String(a.symbol) : null;
            const title = String(a?.title || "");
            const tag = a?.watchlist_source === "staging" ? " (testing)" : "";
            const headline = symbol ? `${symbol}: ${title}${tag}` : `${title}${tag}`;
            const link = a?.url
              ? `<div class="muted small" style="margin-top: 6px;"><a href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer">Open link</a></div>`
              : "";

            const explain = a?.explain || {};
            const why = Array.isArray(explain?.why) ? explain.why : [];
            const risks = Array.isArray(explain?.risks) ? explain.risks : [];
            const whyHtml = why.length
              ? `<ul class="compact">${why.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
              : `<div class="muted small">No explanation available.</div>`;
            const riskHtml = risks.length
              ? `<ul class="compact">${risks.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
              : `<div class="muted small">No major risks flagged.</div>`;

            return `
              <details class="details">
                <summary>
                  <span class="summary-title">${sourceBadge(a?.source)} ${escapeHtml(headline)}</span>
                  <span class="spacer"></span>
                </summary>
                <div class="details-body">
                  <div style="font-weight:700;">Why</div>
                  ${whyHtml}
                  <div style="font-weight:700; margin-top: 10px;">What could go wrong</div>
                  ${riskHtml}
                  ${link}
                </div>
              </details>
            `;
          })
          .join("");

  const moreHtml =
    alerts.length > 10
      ? `<div class="muted small" style="margin-top: 10px;">...and ${escapeHtml(alerts.length - 10)} more.</div>`
      : "";

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Important Alerts</h2>
        <div class="muted"><a href="Alerts.md">See all</a></div>
      </div>
      <p class="muted small">Click an alert to see why it triggered and what could go wrong.</p>
      ${contentHtml}
      ${moreHtml}
      ${buildHowThisWorks([
        "Triggered on large signal changes or risk flags.",
        "Includes news pressure shifts, major dips, and take-profit hits.",
        "Why it matters: it pulls urgent items to the top.",
        "Open an alert to see the reasons and risks.",
      ])}
    </div>
  `;
}
function buildWatchlistTableHtml({ title, coins, rankBySymbol, defaultOpen = 0 }) {
  if (!coins.length) {
    return `
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No coins here yet.</p>
      </div>
    `;
  }

  const openCount = Number.isFinite(defaultOpen) ? defaultOpen : 0;

  const sorted = [...coins].sort((a, b) => {
    const ra = rankBySymbol.get(a.symbol) || 9999;
    const rb = rankBySymbol.get(b.symbol) || 9999;
    if (ra !== rb) return ra - rb;
    return String(a.symbol).localeCompare(String(b.symbol));
  });


  function explainList(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.length === 0) return `<div class="muted small">n/a</div>`;
    return `<ul class="compact">${list.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
  }

  function renderChecklist(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      return `<div class="muted small">No checklist data.</div>`;
    }
    return list
      .map((item) => {
        const status = item?.status === "pass" ? "pass" : "fail";
        const badgeClass = status === "pass" ? "badge-positive" : "badge-warning";
        const badgeText = status === "pass" ? "OK" : "Needs attention";
        const note = item?.note ? `<div class="muted small">${escapeHtml(item.note)}</div>` : "";
        return `
          <div style="margin: 8px 0;">
            <div class="row" style="gap: 10px; align-items: baseline;">
              <span class="badge ${badgeClass}" style="font-size: 10px;">${badgeText}</span>
              <span>${escapeHtml(item?.label || "")}</span>
            </div>
            ${note}
          </div>
        `;
      })
      .join("");
  }

  function renderScoreBreakdown(breakdown) {
    if (!breakdown) return `<div class="muted small">No score data.</div>`;
    const rows = [
      { label: "Trend/regime", item: breakdown.trend_regime },
      { label: "Entry setup", item: breakdown.entry_setup },
      { label: "Liquidity", item: breakdown.liquidity },
      { label: "News pressure", item: breakdown.news_pressure },
      { label: "News intensity", item: breakdown.news_intensity },
      { label: "Sentiment", item: breakdown.sentiment },
      { label: "Catalyst quality", item: breakdown.catalyst_quality },
      { label: "Project health", item: breakdown.project_health },
      { label: "Risk penalties", item: breakdown.risk_penalty },
    ]
      .map((row) => {
        const score =
          row.item?.score === null || row.item?.score === undefined
            ? "n/a"
            : row.item.score;
        const note = row.item?.note ? `<div class="muted small">${escapeHtml(row.item.note)}</div>` : "";
        const label = row.item?.label ? `<span class="muted small">(${escapeHtml(row.item.label)})</span>` : "";
        return `
          <div class="score-row">
            <div><strong>${escapeHtml(row.label)}</strong> ${label}</div>
            <div class="score-value">${escapeHtml(score)}</div>
            ${note}
          </div>
        `;
      })
      .join("");

    const total = breakdown.total_score ?? "n/a";
    return `
      <div class="score-breakdown">
        <div class="score-total">Score total: <strong>${escapeHtml(total)}</strong></div>
        ${rows}
      </div>
    `;
  }

  const rows = sorted
    .map((coin, idx) => {
      const label = coin.hygiene_label || "UNKNOWN";
      const entrySignal = coin.entry_signal;
      const labelBadge = badge(friendlyLabel(label, entrySignal), labelClass(label));
      const price = formatUsd(num(coin.price));
      const ch7d = num(coin.price_change_7d);
      const ch7dDisplay = ch7d !== null 
        ? `<span style="color: ${ch7d >= 0 ? "var(--keep)" : "var(--drop)"}">${formatSignedPct(ch7d, 1)}</span>`
        : "n/a";
      const beatsBtc = coin.outperforming_btc === true;
      const rsDisplay = beatsBtc ? `<span style="color: var(--keep);">Yes</span>` : `<span class="muted">No</span>`;

      const notes = notesForCoin(coin);
      const notesHtml = notes.length === 0
        ? `<span class="muted">All clear</span>`
        : notes.map((n) => badge(n, "badge-muted")).join(" ");

      const rsi = coin.rsi_14d;
      const distFromHigh = num(coin.distance_from_high);
      let entryHtml = `<span class="muted">-</span>`;
      if (entrySignal) {
        let entryText = "Okay";
        let entryColor = "var(--muted)";
        if (entrySignal === "strong_buy") { entryText = "Great"; entryColor = "var(--keep)"; }
        else if (entrySignal === "buy") { entryText = "Good"; entryColor = "var(--keep)"; }
        else if (entrySignal === "overbought") { entryText = "Wait for entry"; entryColor = "var(--drop)"; }
        else if (entrySignal === "wait") { entryText = "Wait for entry"; entryColor = "var(--watch)"; }

        const entryBlocked =
          coin.hygiene_label !== "KEEP" ||
          coin.holder_concentration_level === "HIGH" ||
          coin.high_dilution_risk === true ||
          coin.unlock_risk_flag === true ||
          coin.low_liquidity === true ||
          (Number.isFinite(num(coin.health_score)) && coin.health_score < 40);

        let rsiNote = "";
        if (rsi !== null) {
          if (rsi < 30) rsiNote = "oversold";
          else if (rsi > 70) rsiNote = "overbought";
        }
        let dipNote = "";
        if (distFromHigh !== null && distFromHigh > 15) { dipNote = `${Math.round(distFromHigh)}% off high`; }
        const flagNote = entryBlocked ? "quality flags" : "";

        if (entryBlocked && (entrySignal === "strong_buy" || entrySignal === "buy")) {
          entryText = "Wait (risk)";
          entryColor = "var(--warning)";
        }

        const subNote = [rsiNote, dipNote, flagNote].filter(Boolean).join(", ");

        entryHtml = `<span style="color: ${entryColor}; font-weight: 600;">${entryText}</span>` +
          (subNote ? `<div class="muted small">${escapeHtml(subNote)}</div>` : "");
      }

      const sparkValues = Array.isArray(coin.price_sparkline_30d) ? coin.price_sparkline_30d : null;
      const sparkHtml = sparkValues ? buildSparkline(sparkValues, 140, 28, "30 day price trend") : "";
      const sparkCell = sparkHtml ? `<div class="sparkline">${sparkHtml}</div>` : `<span class="muted">n/a</span>`;

      const coinId = coin.coin_gecko_id ? String(coin.coin_gecko_id) : "";
      const geckoUrl = coinId ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}` : null;
      const symbolHtml = geckoUrl
        ? `<a href="${escapeHtml(geckoUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(coin.symbol)}</strong></a>`
        : `<strong>${escapeHtml(coin.symbol)}</strong>`;

      const explain = coin?.explain || null;
      const why = Array.isArray(explain?.why) ? explain.why.slice(0, 5) : [];
      const risks = Array.isArray(explain?.risks) ? explain.risks.slice(0, 3) : [];
      const maxBuyUsd = Number.isFinite(explain?.sizing?.suggested_max_buy_usd) ? explain.sizing.suggested_max_buy_usd : null;
      const maxBuyText = maxBuyUsd !== null ? formatUsd(maxBuyUsd) : "n/a";
      const sizingInputs = explain?.sizing?.inputs || {};
      const basePct = Number.isFinite(sizingInputs.base_pct) ? sizingInputs.base_pct : null;
      const labelPct = Number.isFinite(sizingInputs.label_pct) ? sizingInputs.label_pct : null;
      const riskMult = Number.isFinite(sizingInputs.risk_multiplier) ? sizingInputs.risk_multiplier : null;
      const volumeCap = Number.isFinite(sizingInputs.volume_cap_usd) ? sizingInputs.volume_cap_usd : null;
      const newsSource = explain?.news?.source ? String(explain.news.source) : "";
      const newsFetchedAt = explain?.news?.fetched_at ? formatUtc(explain.news.fetched_at) : "";
      const timeHorizon = explain?.time_horizon ? String(explain.time_horizon) : "n/a";
      const invalidation = explain?.invalidation_rule ? String(explain.invalidation_rule) : "n/a";
      const confidenceLevel = explain?.confidence?.level ? String(explain.confidence.level) : "n/a";
      const confidenceReason = explain?.confidence?.reason ? String(explain.confidence.reason) : "";
      const dataConfidence = explain?.data_confidence ? String(explain.data_confidence) : "n/a";
      const context = explain?.context || null;
      const contextSummary = context?.summary ? String(context.summary) : "";
      const contextHeadwinds = Array.isArray(context?.headwinds) ? context.headwinds.filter(Boolean) : [];
      let contextSourceText = "";
      if (context?.source) {
        if (typeof context.source === "string") {
          contextSourceText = context.source;
        } else if (context.source?.path) {
          contextSourceText = context.source.path;
        } else if (context.source?.title) {
          contextSourceText = context.source.title;
        }
      }
      const contextMeta = contextSummary
        ? `
          <div><strong>Context:</strong> ${escapeHtml(contextSummary)}</div>
          ${contextHeadwinds.length > 0 ? `<div><strong>Headwinds:</strong> ${escapeHtml(contextHeadwinds.join("; "))}</div>` : ""}
          ${contextSourceText ? `<div><strong>Context source:</strong> ${escapeHtml(contextSourceText)}</div>` : ""}
        `
        : "";
      const scoreBreakdown = coin?.score_breakdown || null;
      const paperTags = [
        coin?.trend_regime ? `trend:${String(coin.trend_regime).toLowerCase()}` : null,
        coin?.catalyst_type ? `catalyst:${String(coin.catalyst_type).toLowerCase()}` : null,
        coin?.news_sentiment ? `sentiment:${String(coin.news_sentiment).toLowerCase()}` : null,
        coin?.entry_signal ? `signal:${String(coin.entry_signal).toLowerCase()}` : null,
      ].filter(Boolean);
      const paperTradePayload = {
        symbol: coin?.symbol || null,
        coin_gecko_id: coin?.coin_gecko_id || null,
        price: Number.isFinite(num(coin?.price)) ? num(coin.price) : null,
        entry_signal: coin?.entry_signal || null,
        entry_score: Number.isFinite(num(coin?.entry_score)) ? num(coin.entry_score) : null,
        trend_regime: coin?.trend_regime || null,
        catalyst_type: coin?.catalyst_type || null,
        news_sentiment: coin?.news_sentiment || null,
        time_horizon: timeHorizon,
        invalidation_rule: invalidation,
        tags: paperTags,
      };

      const maxBuyAttrs = [
        basePct !== null ? `data-base-pct="${basePct}"` : "",
        labelPct !== null ? `data-label-pct="${labelPct}"` : "",
        riskMult !== null ? `data-risk-mult="${riskMult}"` : "",
        volumeCap !== null ? `data-volume-cap="${volumeCap}"` : "",
      ].filter(Boolean).join(" ");

      const maxBuyHtml = `<span class="max-buy" ${maxBuyAttrs}>${escapeHtml(maxBuyText)}</span>`;
      const pressureScore = num(coin?.news_pressure_score);
      const pressureLabel = coin?.news_pressure_label || "neutral";
      const pressureText = Number.isFinite(pressureScore)
        ? ` | Pressure: ${escapeHtml(pressureLabel)} (${escapeHtml(pressureScore)})`
        : "";
      const eventText = Number.isFinite(num(coin?.news_event_count)) && coin.news_event_count > 0
        ? ` | Events: ${escapeHtml(coin.news_event_count)}`
        : "";
      const headlines = Array.isArray(coin?.news_headlines) ? coin.news_headlines : [];
      const noHeadlinesNote = headlines.length === 0 ? ` | ${escapeHtml(NO_HEADLINES_MESSAGE)}` : "";
      const newsMeta = (newsFetchedAt || newsSource)
        ? `News checked: ${escapeHtml(newsFetchedAt || "n/a")}${newsSource ? ` (source: ${escapeHtml(newsSource)})` : ""}${pressureText}${eventText}${noHeadlinesNote}`
        : `News checked: n/a${pressureText}${eventText}${noHeadlinesNote}`;

      const checklist = explain?.checklist || [];

      const rowId = `row-${String(coin.symbol || "").toLowerCase()}-${idx}`;
      const explainRow = explain
        ? `
          <tr class="explain-row" data-parent-id="${escapeHtml(rowId)}" data-symbol="${escapeHtml(coin.symbol)}" data-name="${escapeHtml(coin.name || "")}">
            <td colspan="9" data-label="">
              <div class="coin-explain">
                <div class="coin-explain-grid">
                  <div>
                    <div class="muted small" style="font-weight: 700;">Why</div>
                    ${explainList(why)}
                  </div>
                  <div>
                    <div class="muted small" style="font-weight: 700;">What could go wrong</div>
                    ${explainList(risks)}
                  </div>
                </div>
                <div class="coin-explain-meta">
                  <div><strong>Time horizon:</strong> ${escapeHtml(timeHorizon)}</div>
                  <div><strong>Invalidation:</strong> ${escapeHtml(invalidation)}</div>
                  <div><strong>Confidence:</strong> ${escapeHtml(confidenceLevel)}${confidenceReason ? ` <span class="muted small">(${escapeHtml(confidenceReason)})</span>` : ""}</div>
                  <div><strong>Data confidence:</strong> ${escapeHtml(dataConfidence)}</div>
                  ${contextMeta}
                </div>
                <div style="margin-top: 10px;">
                  <button class="paper-trade-btn" data-payload="${escapeHtml(JSON.stringify(paperTradePayload))}" title="Optional: adds a manual paper trade idea (copies text).">Manual paper trade</button>
                  <span class="muted small" style="margin-left: 8px;">Optional: copies a manual paper-trade idea to your clipboard.</span>
                </div>
                <div class="muted small" style="margin-top: 8px;">
                  <strong>Max size (rough):</strong> ${maxBuyHtml} | ${newsMeta}
                </div>
                <details class="details" style="margin-top: 10px;">
                  <summary><span class="summary-title">Score breakdown</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
                  <div class="details-body">
                    ${renderScoreBreakdown(scoreBreakdown)}
                  </div>
                </details>
                <details class="details" style="margin-top: 10px;">
                  <summary><span class="summary-title">What we checked</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
                  <div class="details-body">
                    ${renderChecklist(checklist)}
                  </div>
                </details>
              </div>
            </td>
          </tr>
        `
        : "";

      const mainRow = `
        <tr class="watch-row" data-row-id="${escapeHtml(rowId)}" data-symbol="${escapeHtml(coin.symbol)}" data-name="${escapeHtml(coin.name || "")}">
          <td data-label="Details">
            <button class="row-toggle" type="button" aria-expanded="false"><span class="chev">&gt;</span> Click to see our reasons</button>
            <button class="paper-trade-btn paper-trade-mini" data-payload="${escapeHtml(JSON.stringify(paperTradePayload))}" title="Optional: adds a manual paper trade idea (copies text).">Manual paper trade</button>
          </td>
          <td class="col-symbol" data-label="Coin">${symbolHtml}<div class="muted small">${escapeHtml(coin.name || "")}</div></td>
          <td data-label="Verdict">${labelBadge}</td>
          <td class="num" data-label="Price">${escapeHtml(price)}</td>
          <td class="num" data-label="30d">${sparkCell}</td>
          <td class="num" data-label="Week">${ch7dDisplay}</td>
          <td class="num" data-label="Beat BTC?">${rsDisplay}</td>
          <td class="num" data-label="Entry">${entryHtml}</td>
          <td data-label="Notes">${notesHtml}</td>
        </tr>
      `;

      return mainRow + explainRow;
    })
    .join("");

  const entryLegend = `
    <div class="entry-legend muted small" style="margin-top: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
      <strong>Entry guide:</strong>
      <span style="color: var(--keep); margin-left: 8px;">Great</span> = pulled back, better risk/reward
      <span style="color: var(--keep); margin-left: 8px;">Good</span> = reasonable entry point
      <span style="color: var(--watch); margin-left: 8px;">Wait for entry</span> = timing not favorable or quality flags
    </div>
  `;

  return `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table class="table filterable table-condensed watchlist-table" data-default-open="${escapeHtml(String(openCount))}">
          <thead>
            <tr>
              <th></th>
              <th>Coin</th>
              <th>Verdict</th>
              <th class="num">Price</th>
              <th class="num">30d</th>
              <th class="num">Week</th>
              <th class="num" title="Outperformed Bitcoin this week">Beat BTC?</th>
              <th class="num" title="Timing signal for entry quality">Entry</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      ${entryLegend}
      <div class="muted small" style="margin-top: 6px;">Verdict = coin quality. Entry = timing signal. Manual paper trade (optional) is in the first column.</div>
      ${buildHowThisWorks([
        "Verdict uses gates: liquidity, unlock transparency, traction (TVL + dev activity), ownership, trend, health.",
        "Developer activity uses GitHub commit recency/repo status or CoinGecko dev data.",
        "Entry uses timing score from RSI and distance from 30-day high/low.",
        "Details show reasons, risks, sizing, news pressure, and manual paper trading.",
        "Why it matters: it separates coin quality from entry timing.",
      ])}
    </div>
  `;
}
function buildOnchainHtml(coins) {
  const onchainCoins = coins.filter(
    (coin) => coin?.onchain && Array.isArray(coin.onchain.top_holders) && coin.onchain.top_holders.length > 0
  );
  if (onchainCoins.length === 0) {
    return `
      <div class="card">
        <h2>On-chain Holder Snapshot</h2>
        <p class="muted">No on-chain holder data available for this run.</p>
        ${buildHowThisWorks([
          "Shows top holders and how concentrated supply is.",
          "Uses on-chain holder data (Ethplorer/Etherscan).",
          "Why it matters: heavy concentration increases dump risk.",
          "Smart contracts can be staking or treasury wallets, not always bad.",
          "Use this to judge risk before taking an entry.",
        ])}
      </div>
    `;
  }

  const panels = onchainCoins
    .map((coin) => {
      const chain = coin.onchain.chain || "unknown";
      const contractUrl = coin.onchain.contract_url || null;
      const contractAddr = coin.onchain.contract_address || null;
      const top10 = formatPct(num(coin.top_10_holder_percent), 2);
      const top20 = formatPct(num(coin.top_20_holder_percent), 2);
      const level = coin.holder_concentration_level || "UNKNOWN";
      const levelLabel =
        level === "HIGH"
          ? "High"
          : level === "MEDIUM"
            ? "Medium"
            : level === "LOW"
              ? "Low"
              : "Unknown";
      const riskBadge = badge(
        levelLabel,
        level === "HIGH"
          ? "badge-warning"
          : level === "MEDIUM"
            ? "badge-info"
            : level === "LOW"
              ? "badge-positive"
              : "badge-muted"
      );

      const holders = coin.onchain.top_holders.slice(0, 10);
      const rows = holders
        .map((h) => {
          const addr = h.address || "";
          const addrShort =
            addr && addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr || "n/a";
          const displayName = h.holder_label
            ? `${h.holder_label} (${addrShort})`
            : addrShort;
          const link = h.address_url
            ? `<a href="${escapeHtml(h.address_url)}" target="_blank" rel="noreferrer">${escapeHtml(
                displayName
              )}</a>`
            : escapeHtml(displayName);
          const holderKind =
            h.holder_kind ||
            (h.address_type === "CONTRACT"
              ? "Smart contract"
              : h.address_type === "EOA"
                ? "Wallet"
                : "Unknown");
          return `<tr><td class="num">${escapeHtml(h.rank)}</td><td>${link}</td><td>${escapeHtml(
            holderKind
          )}</td><td class="num">${escapeHtml(formatPct(num(h.percent_of_supply), 2))}</td></tr>`;
        })
        .join("");

      const contractHtml =
        contractUrl && contractAddr
          ? `<a href="${escapeHtml(contractUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
              contractAddr
            )}</a>`
          : escapeHtml(contractAddr || "n/a");

      const tag = coin.watchlist_source === "staging" ? " (staging)" : "";
      const breakdown = [];
      if (Number.isFinite(num(coin.top_10_wallet_percent)) && num(coin.top_10_wallet_percent) > 0) {
        breakdown.push(`wallets ${formatPct(num(coin.top_10_wallet_percent), 2)}`);
      }
      if (
        Number.isFinite(num(coin.top_10_exchange_percent)) &&
        num(coin.top_10_exchange_percent) > 0
      ) {
        breakdown.push(`exchanges ${formatPct(num(coin.top_10_exchange_percent), 2)}`);
      }
      if (
        Number.isFinite(num(coin.top_10_contract_percent)) &&
        num(coin.top_10_contract_percent) > 0
      ) {
        breakdown.push(`smart contracts ${formatPct(num(coin.top_10_contract_percent), 2)}`);
      }
      return `
        <details class="details">
          <summary>
            <span class="summary-title">${escapeHtml(coin.symbol)}${escapeHtml(tag)}</span>
            <span class="muted">${escapeHtml(chain)}</span>
            <span class="spacer"></span>
            ${riskBadge}
            <span class="muted small">Top10 ${escapeHtml(top10)} - Top20 ${escapeHtml(top20)}</span>
          </summary>
          <div class="details-body">
            <div class="muted small">Contract: ${contractHtml} - Source: ${escapeHtml(
        coin.onchain.source || "unknown"
      )}${breakdown.length > 0 ? ` - Top10 breakdown: ${escapeHtml(breakdown.join(", "))}` : ""}</div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th class="num">#</th><th>Holder</th><th>Type</th><th class="num">% Supply</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </details>
      `;
    })
    .join("");

  return `
    <div class="card">
      <h2>On-chain Holder Snapshot</h2>
      <p class="muted">Click a coin to expand top holders.</p>
      ${panels}
      ${buildHowThisWorks([
        "Shows top holders and how concentrated supply is.",
        "Uses on-chain holder data (Ethplorer/Etherscan).",
        "Why it matters: heavy concentration increases dump risk.",
        "Smart contracts can be staking or treasury wallets, not always bad.",
        "Use this to judge risk before taking an entry.",
      ])}
    </div>
  `;
}

function buildDefiHtml(defiLatest) {
  if (!defiLatest || !Array.isArray(defiLatest.protocols)) {
    return `
      <div class="card">
        <h2>DeFi Projects</h2>
        <p class="muted">No DeFi data yet. This scans crypto lending/trading platforms to find solid projects.</p>
        ${buildHowThisWorks([
          "Lists top DeFi protocols by money locked (TVL).",
          "Ranks by TVL and recent change.",
          "Why it matters: higher TVL often means more trust and usage.",
          "Token column shows which coin is linked to the protocol.",
          "TVL is a quality hint, not a buy signal.",
        ])}
      </div>
    `;
  }

  const buckets = { CANDIDATE: 0, WATCH: 0, AVOID: 0 };
  for (const p of defiLatest.protocols) {
    if (p?.bucket && buckets[p.bucket] !== undefined) buckets[p.bucket] += 1;
  }

  const allCandidates = defiLatest.protocols.filter((p) => p?.bucket === "CANDIDATE");
  const tokenMappedCandidates = allCandidates.filter(
    (p) => p?.market && typeof p.market === "object" && p.market.market_cap !== null && p.market.volume_24h !== null
  );
  const preferTokenMapped = tokenMappedCandidates.length > 0;
  const top = (preferTokenMapped ? tokenMappedCandidates : allCandidates).slice(0, 5);

  const rows = top
    .map((p, idx) => {
      const name = p?.name || "n/a";
      const url = p?.links?.defillama || null;
      const protocol = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
        : escapeHtml(name);
      const token = preferTokenMapped ? p?.market?.token_symbol || p?.market?.gecko_id || "-" : null;
      const tvl = formatUsd(num(p?.tvl?.focus_current));
      const ch30d = formatSignedPct(num(p?.tvl?.change_30d_pct), 1);
      return `
        <tr>
          <td>${protocol}</td>
          ${preferTokenMapped ? `<td><strong>${escapeHtml(token)}</strong></td>` : ""}
          <td class="num">${escapeHtml(tvl)}</td>
          <td class="num">${escapeHtml(ch30d)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="row space-between">
        <h2>DeFi Projects</h2>
        <div class="muted"><a href="defi/Latest.md">See all ${buckets.CANDIDATE} ></a></div>
      </div>
      <p class="muted small">DeFi = Decentralized Finance (lending, trading platforms). These are the top projects by money locked in them (TVL).</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Project</th>
              ${preferTokenMapped ? "<th>Token</th>" : ""}
              <th class="num">$ Locked</th>
              <th class="num">30-day</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted small" style="margin-top:10px;"><strong>What this means:</strong> Projects with more money locked and growing TVL are generally more trusted. The token column shows which coin you'd use to gain exposure.</p>
      ${buildHowThisWorks([
        "Lists top DeFi protocols by money locked (TVL).",
        "Ranks by TVL and recent change.",
        "Why it matters: higher TVL often means more trust and usage.",
        "Token column shows which coin is linked to the protocol.",
        "TVL is a quality hint, not a buy signal.",
      ])}
    </div>
  `;
}

function buildBacktestHtml(backtestStats) {
  if (!backtestStats) {
    return `
      <div class="card">
        <h2>Backtesting</h2>
        <p class="muted">No backtest stats yet.</p>
        ${buildHowThisWorks([
          "Tracks how past signals performed over time.",
          "Uses historical watchlist signals and outcomes.",
          "Why it matters: it shows which labels work best.",
          "Results are averages, not guarantees.",
          "Use this to improve rules and sizing.",
        ])}
      </div>
    `;
  }

  const acc = backtestStats.accuracy_by_label || {};
  const rowFor = (label) => {
    const r = acc[label] || {};
    const win =
      typeof r.win_rate_14d === "number" ? `${(r.win_rate_14d * 100).toFixed(0)}%` : "n/a";
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(r.count ?? 0)}</td>
        <td class="num">${escapeHtml(formatSignedPct(num(r.avg_return_7d), 1))}</td>
        <td class="num">${escapeHtml(formatSignedPct(num(r.avg_return_14d), 1))}</td>
        <td class="num">${escapeHtml(formatSignedPct(num(r.avg_return_30d), 1))}</td>
        <td class="num">${escapeHtml(win)}</td>
      </tr>
    `;
  };

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Backtesting</h2>
        <div class="muted"><a href="backtest/BacktestReport.md">Open report</a></div>
      </div>
      <div class="muted small">Predictions tracked: ${escapeHtml(backtestStats.predictions_tracked ?? 0)}</div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Decision</th>
              <th class="num">Count</th>
              <th class="num">Avg 7d</th>
              <th class="num">Avg 14d</th>
              <th class="num">Avg 30d</th>
              <th class="num">Win Rate (14d)</th>
            </tr>
          </thead>
          <tbody>
            ${rowFor("KEEP")}
            ${rowFor("WATCH-ONLY")}
            ${rowFor("DROP")}
          </tbody>
        </table>
      </div>
      ${buildHowThisWorks([
        "Tracks how past signals performed over time.",
        "Uses historical watchlist signals and outcomes.",
        "Why it matters: it shows which labels work best.",
        "Results are averages, not guarantees.",
        "Use this to improve rules and sizing.",
      ])}
    </div>
  `;
}

function buildPaperTradingHtml(paperReport) {
  if (!paperReport) {
    return `
      <div class="card">
        <h2>Paper Trading</h2>
        <p class="muted">No paper trading stats yet.</p>
        ${buildHowThisWorks([
          "Each scan can open a pretend trade from Best Entries, Blue Chip Dips, Discovery, or your manual ideas (still one per coin).",
          "Every run refreshes price and profit/loss, and checks if a trade should close.",
          "Trades close if they hit a time limit, a trailing stop, a profit target, or the signal weakens.",
          "All trades and signals are saved in reports/paper/PaperTrades.json and reports/paper/SignalEvents.json.",
          "The dashboard shows open/closed trades and your basic results, split by trade style. It does not auto-change the rules yet.",
        ])}
      </div>
    `;
  }

  const overview = paperReport.overview || {};
  const open = Array.isArray(paperReport.open_positions) ? paperReport.open_positions : [];
  const closed = Array.isArray(paperReport.closed_positions) ? paperReport.closed_positions : [];
  const winRate =
    typeof overview.win_rate_pct === "number" ? `${overview.win_rate_pct.toFixed(1)}%` : "n/a";
  const avgReturn = formatSignedPct(num(overview.avg_return_pct), 1);
  const riskAdjusted =
    typeof overview.expectancy_r === "number" ? `${overview.expectancy_r.toFixed(2)}` : "n/a";
  const avgDays =
    typeof overview.avg_days_held === "number" ? `${overview.avg_days_held.toFixed(1)}d` : "n/a";
  const strategy = paperReport.strategy && typeof paperReport.strategy === "object" ? paperReport.strategy : {};
  const styles = strategy.styles && typeof strategy.styles === "object" ? strategy.styles : {};

  const paperStyleLabel = (styleId) => {
    const key = typeof styleId === "string" ? styleId : "";
    const labelRaw = key && styles[key] && typeof styles[key] === "object" ? styles[key].label : null;
    const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
    return label || (key ? key.replace(/_/g, " ") : "n/a");
  };

  const paperCostModelLabel = (value) => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "n/a";
    const match = raw.match(/^([a-z0-9]+)_fee_([0-9]+(?:p[0-9]+)?)$/i);
    if (!match) return raw.replace(/_/g, " ");
    const exchange = match[1].toUpperCase();
    const feeText = match[2].replace("p", ".");
    const feePct = Number(feeText);
    const feeLabel = Number.isFinite(feePct) ? `${feePct}% fee` : `${feeText}% fee`;
    const suffix =
      Number.isFinite(strategy.fee_pct) && Number.isFinite(feePct) && strategy.fee_pct !== feePct
        ? " (old runs)"
        : "";
    return `${exchange} spot (${feeLabel})${suffix}`;
  };
  const breakdowns = paperReport.breakdowns || {};
  const byScore = Array.isArray(breakdowns.by_score_range) ? breakdowns.by_score_range : [];
  const bySource = Array.isArray(breakdowns.by_source) ? breakdowns.by_source : [];
  const bySignal = Array.isArray(breakdowns.by_entry_signal) ? breakdowns.by_entry_signal : [];
  const byStyle = Array.isArray(breakdowns.by_style) ? breakdowns.by_style : [];
  const byCostModel = Array.isArray(breakdowns.by_cost_model) ? breakdowns.by_cost_model : [];
  const byMarketPhase = Array.isArray(breakdowns.by_market_phase) ? breakdowns.by_market_phase : [];
  const byTrend = Array.isArray(breakdowns.by_trend) ? breakdowns.by_trend : [];
  const byLiquidity = Array.isArray(breakdowns.by_liquidity) ? breakdowns.by_liquidity : [];
  const byNewsPressure = Array.isArray(breakdowns.by_news_pressure) ? breakdowns.by_news_pressure : [];
  const byUnlock = Array.isArray(breakdowns.by_unlock) ? breakdowns.by_unlock : [];
  const byHygiene = Array.isArray(breakdowns.by_hygiene) ? breakdowns.by_hygiene : [];
  const thisRun = paperReport.this_run && typeof paperReport.this_run === "object" ? paperReport.this_run : {};
  const openedThisRunCount =
    Number.isFinite(num(thisRun.opened_count))
      ? thisRun.opened_count
      : Number.isFinite(num(paperReport.trades_added))
        ? paperReport.trades_added
        : 0;
  const closedThisRunCount = Number.isFinite(num(thisRun.closed_count)) ? thisRun.closed_count : 0;
  const openedThisRun = Array.isArray(thisRun.opened) ? thisRun.opened : [];
  const closedThisRun = Array.isArray(thisRun.closed) ? thisRun.closed : [];
  const byStyleFriendly = byStyle.map((row) => ({
    ...row,
    style: paperStyleLabel(row?.style),
  }));
  const byCostModelFriendly = byCostModel.map((row) => ({
    ...row,
    cost_model: paperCostModelLabel(row?.cost_model),
  }));

  const exitReasonLabel = (reason) => {
    switch (String(reason || "")) {
      case "time_stop":
        return "time limit";
      case "take_profit":
        return "profit target";
      case "trailing_stop":
        return "trailing stop";
      case "score_decay":
        return "signal weakened";
      default:
        return reason ? String(reason) : "n/a";
    }
  };

  const openedThisRunHtml =
    openedThisRun.length === 0
      ? `<div class="muted small">Opened this run: none</div>`
      : `<div class="muted small">Opened this run: ${openedThisRun
          .slice(0, 8)
          .map((t) => {
            const symbol = t?.symbol || "n/a";
            const style = t?.style ? ` (${paperStyleLabel(t.style)})` : "";
            return escapeHtml(`${symbol}${style}`);
          })
          .join(", ")}</div>`;

  const closedThisRunHtml =
    closedThisRun.length === 0
      ? `<div class="muted small">Closed this run: none</div>`
      : `<div style="margin-top: 6px;">
          <div class="muted small" style="font-weight:700;">Closed this run</div>
          <ul class="compact">
            ${closedThisRun
               .slice(0, 8)
               .map((t) => {
                 const symbol = t?.symbol || "n/a";
                 const style = t?.style ? paperStyleLabel(t.style) : "";
                 const pnl = formatSignedPct(num(t?.pnl_pct), 1);
                 const reason = exitReasonLabel(t?.exit_reason);
                 const styleHtml = style ? ` <span class="muted small">(${escapeHtml(style)})</span>` : "";
                 return `<li><strong>${escapeHtml(symbol)}</strong>${styleHtml}: ${escapeHtml(pnl)} (${escapeHtml(reason)})</li>`;
               })
               .join("")}
          </ul>
        </div>`;

  function renderPerfTable(title, rows, labelKey) {
    if (!rows.length) return "";
    const body = rows
      .map((row) => {
        const win =
          typeof row.win_rate_pct === "number" ? `${row.win_rate_pct.toFixed(1)}%` : "n/a";
        return `
          <tr>
            <td>${escapeHtml(row[labelKey] || "n/a")}</td>
            <td class="num">${escapeHtml(row.sample_size ?? 0)}</td>
            <td class="num">${escapeHtml(win)}</td>
            <td class="num">${escapeHtml(formatSignedPct(num(row.avg_return_pct), 1))}</td>
            <td class="num">${escapeHtml(row.expectancy_r !== null && row.expectancy_r !== undefined ? row.expectancy_r.toFixed(2) : "n/a")}</td>
          </tr>
        `;
      })
      .join("");
    return `
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>${escapeHtml(title)}</th>
              <th class="num">Sample</th>
              <th class="num">Win rate</th>
              <th class="num">Avg return</th>
              <th class="num">Risk-adjusted</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    `;
  }

  const openRows = open.slice(0, 6).map((trade) => {
    const signal = trade.entry_signal ? String(trade.entry_signal).replace(/_/g, " ") : "n/a";
    const score =
      typeof trade.entry_score === "number" ? trade.entry_score.toFixed(0) : "n/a";
    const tags = Array.isArray(trade.tags) && trade.tags.length > 0 ? trade.tags.join(", ") : "n/a";
    return `
      <tr>
        <td>${escapeHtml(trade.symbol || "n/a")}</td>
        <td>${escapeHtml(trade.source || "n/a")}</td>
        <td>${escapeHtml(paperStyleLabel(trade.style))}</td>
        <td class="num">${escapeHtml(trade.days_held ?? "n/a")}</td>
        <td class="num">${escapeHtml(formatUsd(num(trade.entry_price)))}</td>
        <td class="num">${escapeHtml(formatUsd(num(trade.current_price)))}</td>
        <td class="num">${escapeHtml(formatSignedPct(num(trade.pnl_pct), 1))}</td>
        <td>${escapeHtml(signal)}</td>
        <td class="num">${escapeHtml(score)}</td>
        <td>${escapeHtml(tags)}</td>
      </tr>
    `;
  }).join("");

  const closedRows = closed.slice(0, 6).map((trade) => {
    const signal = trade.entry_signal ? String(trade.entry_signal).replace(/_/g, " ") : "n/a";
    const score =
      typeof trade.entry_score === "number" ? trade.entry_score.toFixed(0) : "n/a";
    const tags = Array.isArray(trade.tags) && trade.tags.length > 0 ? trade.tags.join(", ") : "n/a";
    const outcome = trade.outcome_tag ? String(trade.outcome_tag) : "n/a";
    return `
      <tr>
        <td>${escapeHtml(trade.symbol || "n/a")}</td>
        <td>${escapeHtml(trade.source || "n/a")}</td>
        <td>${escapeHtml(paperStyleLabel(trade.style))}</td>
        <td class="num">${escapeHtml(trade.days_held ?? "n/a")}</td>
        <td class="num">${escapeHtml(formatSignedPct(num(trade.pnl_pct), 1))}</td>
        <td class="num">${escapeHtml(formatUsd(num(trade.exit_price)))}</td>
        <td>${escapeHtml(trade.exit_reason || "n/a")}</td>
        <td>${escapeHtml(signal)}</td>
        <td class="num">${escapeHtml(score)}</td>
        <td>${escapeHtml(outcome)}</td>
        <td>${escapeHtml(tags)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Paper Trading</h2>
        <div class="muted"><a href="paper/PaperReport.md">Open report</a></div>
      </div>
      <div class="muted small" style="margin-top: 6px;">
        <strong>Paper trading in 30 seconds:</strong>
        <ul class="compact" style="margin-top:6px;">
          <li>Auto paper trades run every scan (you do not need to click anything).</li>
          <li>It opens pretend trades from Best Entries, Blue Chip Dips, Discovery (and any manual ideas) and tracks profit/loss over time.</li>
          <li>Trades close on simple rules: profit targets, trailing stop, time limit, or the signal weakens.</li>
          <li>We track two trade styles separately (short 2% vs swing) so the learning doesn't get mixed up.</li>
          <li>New paper trades assume 0% exchange fee (MEXC spot), but we still estimate slippage/spread. (Older trades may show the previous fee setting.)</li>
          <li>The "Manual paper trade" button only adds an extra idea (optional).</li>
        </ul>
      </div>
      <div class="muted small">
        Signals tracked: ${paperReport.signal_events_total ?? 0} | Open trades: ${paperReport.open_count ?? 0} | Closed trades: ${paperReport.closed_count ?? 0}
      </div>
      <div class="muted small" style="margin-top: 6px;">
        This run: opened ${escapeHtml(openedThisRunCount)} | closed ${escapeHtml(closedThisRunCount)}
      </div>
      ${openedThisRunHtml}
      ${closedThisRunHtml}
      <div class="muted small" style="margin-top: 6px;">
        Win rate: ${escapeHtml(winRate)} | Avg return: ${escapeHtml(avgReturn)} | Risk-adjusted score: ${escapeHtml(riskAdjusted)} | Avg hold: ${escapeHtml(avgDays)}
      </div>
      <div class="muted small">
        Risk-adjusted score = average profit compared to the stop size (the % drop that would close a trade). Higher is better.
      </div>
      <div class="muted small" style="margin-top: 6px;">
        Tip: to add your own manual ideas, click "Manual paper trade" on a coin, then paste into <code>reports/paper/PaperTradeIntents.json</code> before the next run.
      </div>
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Source</th>
              <th>Style</th>
              <th class="num">Days</th>
              <th class="num">Entry</th>
              <th class="num">Current</th>
              <th class="num">Profit/Loss</th>
              <th>Signal</th>
              <th class="num">Score</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            ${
              openRows ||
              `<tr><td colspan="10" class="muted">No open trades.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top: 12px;">
        <table class="table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Source</th>
              <th>Style</th>
              <th class="num">Days</th>
              <th class="num">Profit/Loss</th>
              <th class="num">Exit</th>
              <th>Reason</th>
              <th>Signal</th>
              <th class="num">Score</th>
              <th>Outcome</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            ${
              closedRows ||
              `<tr><td colspan="11" class="muted">No closed trades yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div style="margin-top: 14px;">
        <h3>Performance dashboard</h3>
        <div class="muted small">Win rate and returns by signal quality.</div>
        ${renderPerfTable("Trade style", byStyleFriendly, "style")}
        ${renderPerfTable("Fees assumption", byCostModelFriendly, "cost_model")}
        ${renderPerfTable("Score range", byScore, "range")}
        ${renderPerfTable("Signal source", bySource, "source")}
        ${renderPerfTable("Entry signal", bySignal, "signal")}
        <details class="details" style="margin-top: 10px;">
          <summary><span class="summary-title">More learning breakdowns</span><span class="spacer"></span><span class="muted small">show/hide</span></summary>
          <div class="details-body">
            ${renderPerfTable("Market phase", byMarketPhase, "market_phase")}
            ${renderPerfTable("Trend", byTrend, "trend")}
            ${renderPerfTable("Liquidity", byLiquidity, "liquidity")}
            ${renderPerfTable("News pressure", byNewsPressure, "news_pressure")}
            ${renderPerfTable("Unlock risk", byUnlock, "unlock")}
            ${renderPerfTable("Hygiene label", byHygiene, "hygiene")}
          </div>
        </details>
      </div>
      <div style="margin-top: 12px;">
        <h3>Post-mortem prompts</h3>
        <ul class="compact">
          ${(paperReport.post_mortem_prompts || [])
            .map((prompt) => `<li>${escapeHtml(prompt)}</li>`)
            .join("")}
        </ul>
      </div>
      ${buildHowThisWorks([
        "Each scan can open a pretend trade from Best Entries, Blue Chip Dips, Discovery, or your manual ideas (still one per coin).",
        "Every run refreshes price and profit/loss, and checks if a trade should close.",
        "Trades close if they hit a time limit, a trailing stop, a profit target, or the signal weakens.",
        "All trades and signals are saved in reports/paper/PaperTrades.json and reports/paper/SignalEvents.json.",
        "The dashboard shows open/closed trades and your basic results, split by trade style. It does not auto-change the rules yet.",
      ])}
    </div>
  `;
}

function buildFunnelHtml(funnelStats, backtestStats) {
  if (!funnelStats && !backtestStats) {
    return `
      <div class="card">
        <h2>Discovery Funnel</h2>
        <p class="muted">Run discovery and the daily scanner to build this section.</p>
        <div class="muted small" style="margin-top: 10px;">
          <div><strong>What this is:</strong> a simple pipeline for turning "new finds" into "kept coins".</div>
          <div style="margin-top: 8px;"><strong>How to use it:</strong></div>
          <ul class="compact">
            <li>Run <code>node src/discover.js</code> to find new candidates.</li>
            <li>Move the good ones into <strong>Staging</strong> (your trial list).</li>
            <li>Run the daily scanner for a few days and see how they behave.</li>
            <li>Promote winners to the main watchlist; ignore the rest.</li>
          </ul>
        </div>
        ${buildHowThisWorks([
          "Tracks how discovery ideas move into staging and the main list.",
          "Uses Discovery report plus watchlist history.",
          "Why it matters: it shows if your discovery process works.",
          "Use it to measure how many new coins earn promotion.",
        ])}
      </div>
    `;
  }

  const funnel = funnelStats || {};
  const byStatus = funnel.by_status || {};
  const totalDiscovered = funnel.total_discovered || 0;

  const toPct = (value) => (typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a");
  const stagedPct = toPct(funnel.conversion_rate_staging);
  const promotedPct = toPct(funnel.conversion_rate_main);

  const howToHtml = `
    <div class="muted small" style="margin-top: 6px;">
      <div><strong>What this is:</strong> a scorecard for your discovery pipeline. It shows what happened to coins found by Discovery.</div>
      <div style="margin-top: 8px;"><strong>How to read it:</strong></div>
      <ul class="compact">
        <li><strong>Pending</strong>: discovered, but not reviewed yet.</li>
        <li><strong>Staging</strong>: added to your staging watchlist to test for a few days.</li>
        <li><strong>Promoted</strong>: moved into your main watchlist.</li>
        <li><strong>Ignored</strong>: you decided it is not worth tracking.</li>
      </ul>
      <div class="muted" style="margin-top: 6px;">So far: ${stagedPct} reached Staging, and ${promotedPct} made it to your main watchlist.</div>
    </div>
  `;

  const funnelBarHtml = totalDiscovered > 0 ? `
    <div class="funnel-visual">
      <div class="funnel-bar">
        <div class="funnel-segment" style="flex: ${byStatus.NEW || 0}; background: var(--muted);" title="Pending: ${byStatus.NEW || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.STAGED || 0}; background: var(--watch);" title="Staging: ${byStatus.STAGED || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.PROMOTED || 0}; background: var(--keep);" title="Promoted: ${byStatus.PROMOTED || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.IGNORED || 0}; background: var(--drop);" title="Ignored: ${byStatus.IGNORED || 0}"></div>
      </div>
      <div class="funnel-labels">
        <span style="color: var(--muted)">${byStatus.NEW || 0} pending</span>
        <span style="color: var(--watch)">${byStatus.STAGED || 0} staging</span>
        <span style="color: var(--keep)">${byStatus.PROMOTED || 0} promoted</span>
        <span style="color: var(--drop)">${byStatus.IGNORED || 0} ignored</span>
      </div>
    </div>
  ` : `<p class="muted">No discovery data yet. Run <code>node src/discover.js</code> to create it.</p>`;

  // Performance comparison
  const stagingPerf = funnel.staging_performance || {};
  const mainPerf = funnel.main_performance || {};
  const verdictRaw = funnel.verdict || "Keep running daily scans to build data.";
  const verdictClean = String(verdictRaw).replace(/[^ -~]+/g, " ").replace(/\s+/g, " ").trim();

  const perfHtml = (stagingPerf.sample_size > 0 || mainPerf.sample_size > 0) ? `
    <div class="perf-comparison">
      <div class="perf-box">
        <div class="perf-label">Main Watchlist</div>
        <div class="perf-value">${formatSignedPct(num(mainPerf.avg_return_14d), 1)}</div>
        <div class="perf-sample">${mainPerf.sample_size || 0} coins measured</div>
      </div>
      <div class="perf-vs">vs</div>
      <div class="perf-box">
        <div class="perf-label">Staging Picks</div>
        <div class="perf-value">${formatSignedPct(num(stagingPerf.avg_return_14d), 1)}</div>
        <div class="perf-sample">${stagingPerf.sample_size || 0} coins measured</div>
      </div>
    </div>
    <div class="verdict-box">${escapeHtml(verdictClean)}</div>
  ` : "";

  // Best/Worst from backtest
  const best = backtestStats?.best_14d || [];
  const worst = backtestStats?.worst_14d || [];
  const flagEffectiveness = backtestStats?.flag_effectiveness_14d || [];

  const bestWorstHtml = (best.length > 0 || worst.length > 0) ? `
    <div class="best-worst-grid">
      <div class="best-section">
        <h4>Best Picks (14d)</h4>
        ${best.slice(0, 3).map(b => `
          <div class="pick-item pick-good">
            <span class="pick-symbol">${escapeHtml(b.symbol)}</span>
            <span class="pick-return">${formatSignedPct(num(b.return_14d_pct), 1)}</span>
            <span class="pick-reason">${escapeHtml(b.why_good || "")}</span>
          </div>
        `).join("")}
      </div>
      <div class="worst-section">
        <h4>Worst Picks (14d)</h4>
        ${worst.slice(0, 3).map(w => `
          <div class="pick-item pick-bad">
            <span class="pick-symbol">${escapeHtml(w.symbol)}</span>
            <span class="pick-return">${formatSignedPct(num(w.return_14d_pct), 1)}</span>
            <span class="pick-reason">${escapeHtml(w.why_bad || "")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  // Which rules helped
  const getRuleConfidence = (rule) => {
    if (rule?.confidence) return rule.confidence;
    const countWith = num(rule?.count_with) || 0;
    const countWithout = num(rule?.count_without) || 0;
    const minCount = Math.min(countWith, countWithout);
    if (minCount >= 20) return "high";
    if (minCount >= 8) return "medium";
    return "low";
  };
  const helpfulRules = flagEffectiveness
    .filter(r => r.count_with >= 2 && r.count_without >= 2 && r.edge_14d !== null)
    .sort((a, b) => Math.abs(b.edge_14d || 0) - Math.abs(a.edge_14d || 0))
    .slice(0, 4);

  const rulesHtml = helpfulRules.length > 0 ? `
    <div class="rules-section">
      <h4>Which Rules Helped (14d)</h4>
      <div class="rules-grid">
        ${helpfulRules.map(r => {
          const edge = r.edge_14d || 0;
          const isGood = edge > 5;
          const isBad = edge < -5;
          const color = isGood ? "var(--keep)" : isBad ? "var(--drop)" : "var(--muted)";
          const confidenceRaw = getRuleConfidence(r);
          const confidenceLabel = typeof confidenceRaw === "string"
            ? confidenceRaw.charAt(0).toUpperCase() + confidenceRaw.slice(1)
            : "Unknown";
          return `
            <div class="rule-item" style="border-left: 3px solid ${color}">
              <div class="rule-name">${escapeHtml(r.label || r.flag)}</div>
              <div class="rule-edge" style="color: ${color}">${formatSignedPct(edge, 1)} edge</div>
              <div class="rule-verdict">${escapeHtml(r.verdict || "")}</div>
              <div class="rule-meta">Confidence: ${escapeHtml(confidenceLabel)}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  ` : "";

  // Data coverage
  const coverage = backtestStats?.data_coverage || {};
  const coverageHtml = `
    <div class="coverage-info">
      <span>Data: ${coverage.with_14d_outcome || 0} coins have 14-day results</span>
      ${coverage.awaiting_7d > 0 ? `<span class="muted"> | ${coverage.awaiting_7d} awaiting 7d</span>` : ""}
    </div>
  `;

  return `
    <div class="card funnel-card">
      <div class="row space-between">
        <h2>Discovery Funnel</h2>
        <span class="muted small">${totalDiscovered} coins discovered</span>
      </div>
      ${howToHtml}
      ${funnelBarHtml}
      ${perfHtml}
      ${bestWorstHtml}
      ${rulesHtml}
      ${coverageHtml}
      <div class="muted small" style="margin-top: 12px;">
        <a href="backtest/BacktestReport.md">View full backtest report</a>
      </div>
      ${buildHowThisWorks([
        "Tracks how discovery ideas move into staging and the main list.",
        "Uses Discovery report plus watchlist history.",
        "Why it matters: it shows if your discovery process works.",
        "Promoted vs ignored tells you how strict your filter is.",
        "Use the rule stats to adjust what you keep.",
      ])}
    </div>
  `;
}

function renderDashboard({ layer1Report, diffReport, supervisorResult, defiLatest, alertsReport, backtestStats, funnelStats, macroPulse, paperReport, discoveryReport }) {
  const coins = Array.isArray(layer1Report?.coins) ? layer1Report.coins : [];
  const mainCoins = coins.filter((c) => (c.watchlist_source || "main") !== "staging");
  const stagingCoins = coins.filter((c) => c.watchlist_source === "staging");

  const rankBySymbol = new Map();
  for (const entry of layer1Report?.ranking?.ranked || []) {
    if (entry?.symbol && Number.isFinite(entry?.rank)) {
      rankBySymbol.set(entry.symbol, entry.rank);
    }
  }

  const counts = {
    main: { KEEP: 0, "WATCH-ONLY": 0, DROP: 0, UNKNOWN: 0 },
    staging: { KEEP: 0, "WATCH-ONLY": 0, DROP: 0, UNKNOWN: 0 },
  };
  for (const coin of coins) {
    const list = coin.watchlist_source === "staging" ? "staging" : "main";
    const label = coin.hygiene_label || "UNKNOWN";
    if (counts[list][label] === undefined) counts[list][label] = 0;
    counts[list][label] += 1;
  }

  const runAt = formatUtc(layer1Report?.generated_at);
  const sources = layer1Report?.data_sources || {};

  const fileLinks = [
    { name: "Summary.md", href: "Summary.md" },
    { name: "MacroPulse.md", href: "MacroPulse.md" },
    { name: "Layer1Report.json", href: "Layer1Report.json" },
    { name: "Alerts.md", href: "Alerts.md" },
    { name: "Alerts.json", href: "Alerts.json" },
    { name: "DiffReport.json", href: "DiffReport.json" },
    { name: "SupervisorSummary.json", href: "SupervisorSummary.json" },
    { name: "BacktestReport.md", href: path.posix.join("backtest", "BacktestReport.md") },
    { name: "PaperReport.md", href: path.posix.join("paper", "PaperReport.md") },
    { name: "DiscoveryReport.md", href: "DiscoveryReport.md" },
    { name: "DeFi Latest.md", href: path.posix.join("defi", "Latest.md") },
  ];

  const fileLinksHtml = fileLinks
    .map((l) => `<a class="chip" href="${escapeHtml(l.href)}">${escapeHtml(l.name)}</a>`)
    .join("");

  const warnings = Array.isArray(layer1Report?.warnings) ? layer1Report.warnings : [];
  const warningsHtml =
    warnings.length === 0
      ? `<span class="muted">None</span>`
      : `<ul class="compact">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crypto Scanner Dashboard</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #0f1a2b;
        --panel2: #0c1526;
        --text: #e6edf3;
        --muted: #9fb0c0;
        --border: rgba(255,255,255,0.08);
        --keep: #1fdf7a;
        --watch: #f7c845;
        --drop: #ff5a6b;
        --info: #66a8ff;
        --critical: #ff5a6b;
        --warning: #f7c845;
        --positive: #1fdf7a;
        --shadow: 0 10px 30px rgba(0,0,0,0.35);
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(1200px 800px at 20% 0%, #12284a 0%, var(--bg) 55%);
        color: var(--text);
        font-family: var(--sans);
        line-height: 1.35;
      }
      a { color: #a7d1ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      code { font-family: var(--mono); font-size: 0.95em; }
      .container { max-width: 1180px; margin: 0 auto; padding: 24px; }
      .header { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
      .title { font-size: 24px; font-weight: 750; letter-spacing: 0.2px; }
      .subtitle { color: var(--muted); font-size: 13px; }
      .row { display: flex; gap: 12px; align-items: center; }
      .space-between { justify-content: space-between; }
      .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
      @media (min-width: 980px) {
        .grid { grid-template-columns: 1fr 1fr; }
        .grid .span-2 { grid-column: span 2; }
      }
      .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
        box-shadow: var(--shadow);
      }
      .card h2 { margin: 0 0 10px; font-size: 16px; letter-spacing: 0.2px; }
      .card h3 { margin: 12px 0 8px; font-size: 14px; color: var(--text); }
      .muted { color: var(--muted); }
      .small { font-size: 12px; }
      .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .kpi {
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: rgba(0,0,0,0.12);
      }
      .kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
      .kpi .value { font-size: 18px; font-weight: 700; margin-top: 6px; }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        font-size: 12px;
        line-height: 18px;
        margin-right: 6px;
        background: rgba(0,0,0,0.18);
      }
      .badge-muted { color: var(--muted); }
      .badge-keep { color: var(--keep); }
      .badge-watch { color: var(--watch); }
      .badge-drop { color: var(--drop); }
      .badge-critical { color: var(--critical); }
      .badge-warning { color: var(--warning); }
      .badge-positive { color: var(--positive); }
      .badge-info { color: var(--info); }
      .chip {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(0,0,0,0.12);
        font-size: 12px;
        margin-right: 8px;
        margin-top: 8px;
      }
      .table-wrap { overflow: auto; border-radius: 12px; border: 1px solid var(--border); }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
      th { text-align: left; font-size: 12px; color: var(--muted); letter-spacing: 0.4px; position: sticky; top: 0; background: rgba(11,18,32,0.98); }
      tr:hover td { background: rgba(255,255,255,0.02); }
      .num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); }
      .col-symbol { min-width: 180px; }
      .sparkline { width: 120px; max-width: 160px; }
      .sparkline svg { display: block; width: 100%; height: 28px; }
      .fg-sparkline { width: 260px; max-width: 100%; }
      .fg-sparkline svg { height: 56px; }
      .table-condensed th:nth-child(5),
      .table-condensed td:nth-child(5),
      .table-condensed th:nth-child(7),
      .table-condensed td:nth-child(7) { display: none; }
      tr.explain-row td { background: rgba(0,0,0,0.10); }
      tr.explain-row td { padding-top: 0; padding-bottom: 14px; }
      tr.explain-row { display: none; }
      tr.explain-row.is-open { display: table-row; }
      .watch-row { cursor: pointer; }
      .row-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 12px;
        background: rgba(255,255,255,0.03);
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
        text-align: left;
      }
      .watch-row.is-open .row-toggle { color: var(--text); }
      .watch-row.is-open .row-toggle .chev { transform: rotate(90deg); }
      .row-toggle .chev { display: inline-block; transition: transform 0.2s ease; }
      .coin-explain { padding: 10px 0 2px; }
      .coin-explain-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; }
      @media (max-width: 980px) { .coin-explain-grid { grid-template-columns: 1fr; } }
      .coin-explain h4 { margin: 0 0 6px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; }
      .coin-explain-meta { margin-top: 10px; display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
      .coin-explain-meta strong { color: var(--text); }
      .score-breakdown { display: grid; gap: 10px; }
      .score-total { font-size: 12px; color: var(--muted); }
      .score-row { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: rgba(0,0,0,0.18); }
      .score-value { font-family: var(--mono); font-weight: 700; }
      .paper-trade-btn {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 6px 10px;
        background: rgba(31,223,122,0.12);
        color: var(--text);
        font-size: 12px;
        cursor: pointer;
      }
      .paper-trade-btn:hover { background: rgba(31,223,122,0.2); }
      .paper-trade-mini { margin-left: 0; margin-top: 6px; padding: 6px 10px; font-size: 12px; }
      .max-buy { font-family: var(--mono); font-weight: 700; }
      ul.compact { margin: 8px 0 0; padding-left: 18px; }
      ul.compact li { margin: 4px 0; }
      .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      input[type="search"] {
        width: min(520px, 100%);
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: rgba(0,0,0,0.20);
        color: var(--text);
        outline: none;
      }
      input[type="search"]::placeholder { color: rgba(159,176,192,0.7); }
      details.details {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        background: rgba(0,0,0,0.12);
        margin-top: 10px;
      }
      details.details summary { cursor: pointer; list-style: none; display: flex; gap: 10px; align-items: center; }
      details.details summary::-webkit-details-marker { display:none; }
      .summary-title { font-weight: 700; }
      .spacer { flex: 1; }
      .details-body { margin-top: 10px; }
      .daily-summary { background: linear-gradient(180deg, rgba(31,223,122,0.08), rgba(255,255,255,0.02)); border-color: rgba(31,223,122,0.3); }
      .daily-summary .verdict-box { margin: 12px 0; }
      .summary-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; text-align: center; }
      @media (max-width: 600px) { .summary-stats { grid-template-columns: repeat(2, 1fr); } }
      .summary-stats .stat { padding: 12px 8px; background: rgba(0,0,0,0.15); border-radius: 10px; }
      .summary-stats .stat-value { font-size: 24px; font-weight: 700; }
      .summary-stats .stat-label { font-size: 11px; color: var(--muted); margin-top: 4px; }
      .help-section { background: rgba(102,168,255,0.08); border-color: rgba(102,168,255,0.3); }
      .story-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 12px; }
      .story-card { background: rgba(0,0,0,0.2); }
      .story-updates ul { margin-top: 8px; }
      .bucket-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 12px; }
      .bucket-card { padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: rgba(0,0,0,0.18); }
      .bucket-list { margin-top: 8px; }
      .focus-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 10px; }
      .collapsible-section { margin-top: 14px; }
      .collapsible-section summary { cursor: pointer; padding: 14px; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); border: 1px solid var(--border); border-radius: 14px; list-style: none; display: flex; justify-content: space-between; align-items: center; }
      .collapsible-section summary::-webkit-details-marker { display: none; }
      .collapsible-section summary h2 { margin: 0; font-size: 16px; }
      .collapsible-section[open] summary { border-radius: 14px 14px 0 0; }
      .collapsible-section .section-content { padding: 0 16px 16px; border: 1px solid var(--border); border-top: none; border-radius: 0 0 14px 14px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); }
      
      /* Discovery Funnel Styles */
      .funnel-card { margin-top: 14px; }
      .funnel-visual { margin: 16px 0; }
      .funnel-bar { display: flex; height: 20px; border-radius: 10px; overflow: hidden; gap: 2px; }
      .funnel-segment { min-width: 4px; transition: all 0.3s ease; }
      .funnel-labels { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 12px; }
      .perf-comparison { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 20px 0; }
      .perf-box { text-align: center; padding: 16px 24px; background: rgba(255,255,255,0.03); border-radius: 12px; min-width: 140px; }
      .perf-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      .perf-value { font-size: 24px; font-weight: 700; }
      .perf-sample { font-size: 11px; color: var(--muted); margin-top: 4px; }
      .perf-vs { font-size: 14px; color: var(--muted); }
      .verdict-box { text-align: center; padding: 12px 16px; background: rgba(255,255,255,0.02); border-radius: 8px; margin-bottom: 16px; }
      .best-worst-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
      @media (max-width: 640px) { .best-worst-grid { grid-template-columns: 1fr; } }
      .best-section h4, .worst-section h4 { margin: 0 0 8px 0; font-size: 13px; }
      .pick-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin: 4px 0; border-radius: 6px; font-size: 12px; }
      .pick-good { background: rgba(31,223,122,0.08); border-left: 3px solid var(--keep); }
      .pick-bad { background: rgba(255,90,107,0.08); border-left: 3px solid var(--drop); }
      .pick-symbol { font-weight: 600; min-width: 50px; }
      .pick-return { font-family: var(--mono); min-width: 60px; }
      .pick-reason { color: var(--muted); font-size: 11px; }
      .rules-section { margin: 16px 0; }
      .rules-section h4 { margin: 0 0 12px 0; font-size: 13px; }
      .rules-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
      .rule-item { padding: 10px 12px; background: rgba(255,255,255,0.02); border-radius: 6px; }
      .rule-name { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
      .rule-edge { font-size: 14px; font-weight: 600; font-family: var(--mono); }
      .rule-verdict { font-size: 10px; color: var(--muted); margin-top: 2px; }
      .rule-meta { font-size: 10px; color: var(--muted); margin-top: 2px; }
      .coverage-info { font-size: 11px; color: var(--muted); padding-top: 8px; border-top: 1px solid var(--border); }
      
      /* Play Recommendations Styles */
      .play-recommendations { background: linear-gradient(180deg, rgba(96,165,250,0.08), rgba(255,255,255,0.02)); border-color: rgba(96,165,250,0.3); }
      .best-entries { background: linear-gradient(180deg, rgba(34,197,94,0.08), rgba(255,255,255,0.02)); border-color: rgba(34,197,94,0.3); }
      .blue-chips { background: linear-gradient(180deg, rgba(168,85,247,0.08), rgba(255,255,255,0.02)); border-color: rgba(168,85,247,0.3); }
      .macro-pulse { background: linear-gradient(180deg, rgba(14,165,233,0.08), rgba(255,255,255,0.02)); border-color: rgba(14,165,233,0.3); }
      .macro-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 10px; }
      .macro-block { padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.16); }
      .macro-stat { font-size: 18px; font-weight: 700; margin: 6px 0; }
      .macro-note { font-size: 12px; color: var(--muted); margin-top: 6px; }
      .macro-sparkline { margin-top: 6px; }
      .macro-sparkline svg { display: block; width: 100%; height: 36px; }
      .badge-momentum { background: rgba(251,191,36,0.2); color: #fbbf24; }
      .play-section { margin-bottom: 20px; }
      .play-section h4 { margin: 0 0 6px 0; font-size: 14px; }
      .play-desc { font-size: 12px; color: var(--muted); margin: 0 0 10px 0; }
      .play-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin: 6px 0; border-radius: 8px; background: rgba(0,0,0,0.15); }
      .play-symbol { font-weight: 700; min-width: 60px; font-size: 14px; }
      .play-action { font-size: 13px; min-width: 180px; }
      .play-reason { font-size: 12px; color: var(--muted); }
      .play-buy { border-left: 3px solid var(--keep); }
      .play-sell { border-left: 3px solid #f59e0b; background: rgba(245,158,11,0.08); }
      .play-momentum { border-left: 3px solid #60a5fa; }
      .play-wait { border-left: 3px solid var(--muted); }
      .play-avoid { border-left: 3px solid var(--drop); background: rgba(255,90,107,0.05); }
      .quick-start-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; }
      .quick-play { border-radius: 10px; padding: 10px 12px; margin: 8px 0; border: 1px solid var(--border); background: rgba(0,0,0,0.18); }
      .quick-play-buy { border-left: 3px solid var(--keep); }
      .quick-play-wait { border-left: 3px solid var(--warning); }
      .quick-play-avoid { border-left: 3px solid var(--drop); }
      .quick-play-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .quick-meta { font-size: 12px; color: var(--muted); }
      .quick-links { display: flex; flex-wrap: wrap; gap: 8px; }
      @media (max-width: 900px) {
        .quick-start-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 700px) {
        .play-item { flex-direction: column; align-items: flex-start; gap: 4px; }
        .play-action { min-width: auto; }
      }
      @media (max-width: 720px) {
        table.table thead { display: none; }
        table.table tbody tr { display: block; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; }
        table.table td { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); padding: 8px 10px; }
        table.table td:last-child { border-bottom: none; }
        table.table td::before {
          content: attr(data-label);
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        tr.explain-row td { display: block; }
        tr.explain-row.is-open { display: block; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="title">Crypto Scanner Dashboard</div>
          <div class="subtitle">Last updated: ${escapeHtml(runAt)}</div>
        </div>
        <div class="controls">
          <input id="filter" type="search" placeholder="Search your coins..." />
        </div>
      </div>

      <!-- QUICK START -->
      <div style="margin-top:14px;">
        ${buildQuickStartHtml({ layer1Report, diffReport, alertsReport, paperReport })}
      </div>

      <!-- AI SUMMARY -->
      <div style="margin-top:14px;">
        ${buildSupervisorHtml(supervisorResult)}
      </div>

      <!-- DAILY SUMMARY -->
      <div style="margin-top:14px;" id="today-summary">
        ${buildDailySummaryHtml({ layer1Report, diffReport, alertsReport, defiLatest, discoveryReport, supervisorResult })}
      </div>

      <!-- WHAT TO PLAY - ACTIONABLE RECOMMENDATIONS -->
      <div style="margin-top:14px;" id="what-to-play">
        ${buildPlayRecommendationsHtml(layer1Report?.play_recommendations)}
      </div>

      <!-- BEST ENTRIES TODAY -->
      <div style="margin-top:14px;" id="best-entries">
        ${buildBestEntriesHtml(layer1Report?.best_entries)}
      </div>

      <!-- BLUE CHIP DIP OPPORTUNITIES -->
      <div style="margin-top:14px;" id="blue-chip-dips">
        ${buildBlueChipOpportunitiesHtml(layer1Report?.blue_chip_opportunities)}
      </div>

      <!-- TODAY'S FOCUS -->
      <div style="margin-top:14px;">
        ${buildTodayFocusHtml({ bestEntriesData: layer1Report?.best_entries, alertsReport, diffReport })}
      </div>

      <div style="margin-top:14px;">
        ${buildDiscoverySectionHtml(discoveryReport)}
      </div>

      <!-- OPPORTUNITY BUCKETS -->
      <div style="margin-top:14px;">
        ${buildOpportunityBucketsHtml(coins)}
      </div>

      <!-- YOUR WATCHLIST -->
      <div style="margin-top:14px;" id="watchlist">
        ${buildWatchlistTableHtml({ title: "Your Watchlist", coins: mainCoins, rankBySymbol, defaultOpen: 3 })}
      </div>
      <div style="margin-top:14px;">
        ${buildWatchlistTableHtml({ title: "Testing (Staging)", coins: stagingCoins, rankBySymbol, defaultOpen: 0 })}
      </div>

      <!-- MARKET PULSE -->
      <div style="margin-top:14px;">
        ${buildMacroPulseHtml(macroPulse)}
      </div>

      <!-- CATEGORY PULSE -->
      <div style="margin-top:14px;">
        ${buildCategoryPulseHtml(layer1Report?.category_pulse)}
      </div>

      <!-- DATA FRESHNESS -->
      <div style="margin-top:14px;">
        ${buildDataFreshnessHtml(layer1Report)}
      </div>

      <!-- POSITION SIZING -->
      <div style="margin-top:14px;">
        ${buildPortfolioGuidanceHtml(layer1Report?.portfolio_guidance)}
      </div>

      <!-- STORY CARDS -->
      <div style="margin-top:14px;">
        ${buildStoryCardsHtml(coins)}
      </div>

      <!-- WHAT CHANGED & ALERTS -->
      <div class="grid" style="margin-top:14px;">
        <div>
          ${buildDiffHtml(diffReport)}
        </div>
        <div>
          ${buildAlertsHtml(alertsReport)}
        </div>
      </div>
<!-- EXPANDABLE SECTIONS FOR MORE DETAIL -->
      <details class="collapsible-section" open id="defi-scan">
        <summary><h2>DeFi Scan</h2><span class="muted small">Click to expand/collapse</span></summary>
        <div class="section-content">
          ${buildDefiHtml(defiLatest)}
        </div>
      </details>

      <details class="collapsible-section">
        <summary><h2>Ownership Details</h2><span class="muted small">Who holds these coins?</span></summary>
        <div class="section-content">
          ${buildOnchainHtml(coins)}
        </div>
      </details>

      <details class="collapsible-section" open id="paper-trading">
        <summary><h2>Paper Trading</h2><span class="muted small">How are the signals performing?</span></summary>
        <div class="section-content">
          ${buildPaperTradingHtml(paperReport)}
        </div>
      </details>

      <details class="collapsible-section" open id="backtest-history">
        <summary><h2>Backtest & History</h2><span class="muted small">How accurate is this scanner?</span></summary>
        <div class="section-content">
          ${buildFunnelHtml(funnelStats, backtestStats)}
          ${buildBacktestHtml(backtestStats)}
        </div>
      </details>

      <!-- HELP SECTION -->
      <div class="card help-section" style="margin-top:14px;">
        <h2>How to Read This Dashboard</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 12px;">
          <div>
            <h3 style="color: var(--keep);">Ready (KEEP)</h3>
            <p class="small muted">These coins passed safety and quality checks. They have decent trading volume, aren't overly controlled by a few wallets, and show signs of real project activity.</p>
          </div>
          <div>
            <h3 style="color: var(--watch);">Keep Watching (WATCH)</h3>
            <p class="small muted">Interesting but not ready yet. Maybe missing data, or has some warning signs. Keep an eye on them but don't act without more research.</p>
          </div>
          <div>
            <h3 style="color: var(--drop);">Avoid (DROP)</h3>
            <p class="small muted">Failed basic checks. Could be too illiquid (hard to exit), or has serious red flags. Better to skip these.</p>
          </div>
          <div>
            <h3>Testing (Staging)</h3>
            <p class="small muted">New coins the scanner found. They're being tested before adding to your main list. Promote winners, ignore the rest.</p>
          </div>
        </div>
        <div class="muted small" style="margin-top: 10px;">
          Entry setup = timing signal (see the "Entry" column). Strong entry = best timing today. Ready (KEEP) is quality, Entry is timing.
        </div>
        ${buildHowThisWorks([
          "This is a quick glossary for the labels used on the page.",
          "Why it matters: it helps friends read the dashboard correctly.",
          "Use it as a reference when labels feel confusing.",
        ])}
      </div>

      <!-- QUICK LINKS AT BOTTOM -->
      <div class="card" style="margin-top:14px;">
        <h2>All Reports</h2>
        <div>${fileLinksHtml}</div>
        ${buildHowThisWorks([
          "Links to the raw reports behind the dashboard.",
          "Why it matters: the full detail and history live there.",
          "Use these if you want to share or download data.",
        ])}
      </div>
    </div>

    <script>
  (function () {
    const input = document.getElementById("filter");
    const tables = Array.from(document.querySelectorAll("table.filterable"));
    function applyFilter() {
      const q = (input?.value || "").trim().toLowerCase();
      for (const table of tables) {
        const rows = Array.from(table.tBodies[0].rows);
        for (const row of rows) {
          if (!q) { row.style.display = ""; continue; }
          const hay = ((row.dataset.symbol || "") + " " + (row.dataset.name || "")).toLowerCase();
          row.style.display = hay.includes(q) ? "" : "none";
        }
      }
    }
    if (input) input.addEventListener("input", applyFilter);

    function toggleExplain(row) {
      if (!row) return;
      const rowId = row.getAttribute("data-row-id");
      if (!rowId) return;
      const explainRow = document.querySelector('tr.explain-row[data-parent-id="' + rowId + '"]');
      if (!explainRow) return;
      const isOpen = explainRow.classList.toggle("is-open");
      row.classList.toggle("is-open", isOpen);
      const toggle = row.querySelector(".row-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    for (const row of document.querySelectorAll("tr.watch-row")) {
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        toggleExplain(row);
      });
      const toggleBtn = row.querySelector(".row-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleExplain(row);
        });
      }
    }

    for (const table of document.querySelectorAll("table.watchlist-table")) {
      const openCount = Number(table.dataset.defaultOpen || 0);
      if (!Number.isFinite(openCount) || openCount <= 0) continue;
      const rows = Array.from(table.querySelectorAll("tr.watch-row")).slice(0, openCount);
      for (const row of rows) {
        toggleExplain(row);
      }
    }

    function formatUsd(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
      const digits = Math.abs(value) >= 1 ? 2 : 6;
      return "$" + value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    }

    function formatUsdCompact(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
      const abs = Math.abs(value);
      if (abs >= 1e12) return "$" + (value / 1e12).toFixed(2) + "T";
      if (abs >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
      if (abs >= 1e6) return "$" + (value / 1e6).toFixed(2) + "M";
      if (abs >= 1e3) return "$" + (value / 1e3).toFixed(2) + "K";
      return formatUsd(value);
    }

    function marketPhaseBasePositionPct(phase) {
      switch (phase) {
        case "accumulation": return 0.1;
        case "caution": return 0.03;
        case "run":
        case "neutral":
        default: return 0.07;
      }
    }

    function computeLiquidityThresholds(portfolioSize) {
      const multiplier = Math.max(0.1, Math.min(1, portfolioSize / 100000));
      const volumeLow = Math.max(250000, Math.round(5000000 * multiplier));
      const volumeDrop = Math.max(50000, Math.round(1000000 * multiplier));
      return { volumeLow, volumeDrop };
    }

    function updateSizing() {
      const card = document.getElementById("positionSizingCard");
      const inputEl = document.getElementById("portfolioSizeInput");
      if (!card || !inputEl) return;

      const raw = Number(inputEl.value);
      const portfolioSize = Number.isFinite(raw) && raw > 0 ? raw : 0;
      localStorage.setItem("portfolio_size_usd", String(portfolioSize));

      const phase = card.dataset.phase || "neutral";
      const basePct = card.dataset.basePct ? Number(card.dataset.basePct) : marketPhaseBasePositionPct(phase);
      const keepCap = portfolioSize * basePct;
      const watchCap = portfolioSize * basePct * 0.5;

      const keepCapEl = document.getElementById("keepCapValue");
      const watchCapEl = document.getElementById("watchCapValue");
      if (keepCapEl) keepCapEl.textContent = formatUsd(keepCap);
      if (watchCapEl) watchCapEl.textContent = formatUsd(watchCap);

      const { volumeLow, volumeDrop } = computeLiquidityThresholds(portfolioSize);
      const lowEl = document.getElementById("volumeLowValue");
      const dropEl = document.getElementById("volumeDropValue");
      if (lowEl) lowEl.textContent = formatUsdCompact(volumeLow);
      if (dropEl) dropEl.textContent = formatUsdCompact(volumeDrop);

      const maxBuyEls = Array.from(document.querySelectorAll("span.max-buy"));
      for (const el of maxBuyEls) {
        const base = el.dataset.basePct ? Number(el.dataset.basePct) : null;
        const labelPct = el.dataset.labelPct ? Number(el.dataset.labelPct) : null;
        const risk = el.dataset.riskMult ? Number(el.dataset.riskMult) : null;
        const volumeCap = el.dataset.volumeCap ? Number(el.dataset.volumeCap) : null;
        if (!Number.isFinite(base) || !Number.isFinite(labelPct) || !Number.isFinite(risk)) continue;
        const portfolioCap = portfolioSize * base * labelPct * risk;
        const suggested = Number.isFinite(volumeCap) ? Math.min(portfolioCap, volumeCap) : portfolioCap;
        el.textContent = formatUsd(suggested);
      }
    }

    (function initSizing() {
      const inputEl = document.getElementById("portfolioSizeInput");
      if (!inputEl) return;
      const saved = localStorage.getItem("portfolio_size_usd");
      if (saved && Number.isFinite(Number(saved))) {
        inputEl.value = String(Number(saved));
      } else if (!inputEl.value) {
        inputEl.value = "5000";
      }
      inputEl.addEventListener("input", updateSizing);
      updateSizing();
    })();

    function handlePaperTradeClick(event) {
      const btn = event.target.closest(".paper-trade-btn");
      if (!btn) return;
      const raw = btn.getAttribute("data-payload");
      if (!raw) return;
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
      if (!payload) return;
      const intent = {
        created_at: new Date().toISOString(),
        source: "dashboard",
        ...payload,
      };
       const text = JSON.stringify(intent, null, 2);
       if (navigator.clipboard && navigator.clipboard.writeText) {
         navigator.clipboard.writeText(text).then(() => {
          alert("Copied a MANUAL paper-trade idea (this does not place a trade). Next step: paste into reports/paper/PaperTradeIntents.json before the next scan run.");
         }).catch(() => {
           alert("Unable to copy automatically. Use the console to access the payload.");
           console.log(text);
         });
      } else {
        alert("Clipboard not available. Use the console to access the payload.");
        console.log(text);
      }
    }

    document.addEventListener("click", handlePaperTradeClick);
  })();
</script>
  </body>
</html>`;
}

module.exports = { renderDashboard };
