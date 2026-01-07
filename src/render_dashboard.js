const path = require("path");

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
  if (coin?.high_dilution_risk) notes.push("high dilution");
  if (coin?.low_liquidity) notes.push("low liquidity");
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
  if (coin?.traction_status === "OK") notes.push("good traction");
  if (coin?.holder_concentration_level === "HIGH") {
    notes.push("few big holders");
  } else if (coin?.holder_concentration_level === "UNKNOWN") {
    notes.push("holder data missing");
  }
  // GitHub activity notes
  if (coin?.github_archived) {
    notes.push("⚠️ repo archived");
  } else if (coin?.github_stale) {
    notes.push("⚠️ code stale (6mo+)");
  } else if (coin?.github_active) {
    notes.push("✓ code active");
  }
  // DeFi knowledge notes (from DeFi scan)
  if (coin?.defi_matched) {
    if (coin?.defi_hack_count > 0) {
      notes.push(`🚨 ${coin.defi_hack_count} past hacks`);
    }
    if (coin?.defi_audit_status === "NO") {
      notes.push("⚠️ no audit");
    } else if (coin?.defi_audit_status === "YES") {
      notes.push("✓ audited");
    }
    if (coin?.defi_flags?.tvl_collapse) {
      notes.push("⚠️ TVL collapsing");
    }
    if (coin?.defi_flags?.liquidity_trap) {
      notes.push("⚠️ liquidity trap");
    }
  }
  // Entry signal notes
  if (coin?.entry_signal === "strong_buy") {
    notes.push("🎯 strong entry");
  } else if (coin?.entry_signal === "overbought") {
    notes.push("⚠️ overbought");
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
  // Take-profit notes
  const tp = coin?.take_profit;
  if (tp?.signal === "moon") {
    notes.push(`🌙 +${tp.profit_pct}%`);
  } else if (tp?.signal === "take_profit_2") {
    notes.push(`💰 +${tp.profit_pct}%`);
  } else if (tp?.signal === "take_profit_1") {
    notes.push(`📈 +${tp.profit_pct}%`);
  } else if (tp?.signal === "deep_loss") {
    notes.push(`🔻 ${tp.profit_pct}%`);
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
    verdict = "🟢 ACCUMULATION ZONE — Good time to buy";
    verdictClass = "badge-positive";
  } else if (marketSignals?.market_phase === "run" && marketSignals?.warnings?.length === 0) {
    verdict = "🚀 MARKET RUNNING — Momentum plays available";
    verdictClass = "badge-positive";
  } else if (marketSignals?.market_phase === "caution") {
    verdict = "⚠️ MARKET OVERHEATED — Consider taking profits";
    verdictClass = "badge-warning";
  } else if (keepCount > 0) {
    verdict = `${keepCount} coin${keepCount > 1 ? 's' : ''} look${keepCount === 1 ? 's' : ''} good to buy`;
    verdictClass = "badge-positive";
  } else if (criticalChanges > 0) {
    verdict = "Nothing actionable — check the warnings";
    verdictClass = "badge-warning";
  } else {
    verdict = "No strong buy signals today — keep watching";
    verdictClass = "badge-muted";
  }
  
  // Build highlights
  const highlights = [];
  
  // Market condition highlights (priority)
  if (marketSignals?.accumulation?.length > 0) {
    for (const sig of marketSignals.accumulation.slice(0, 2)) {
      const emoji = sig.strength === "strong" ? "🟢💰" : "🟡";
      highlights.push(`${emoji} <strong>Buy signal:</strong> ${sig.message}`);
    }
  }
  
  if (marketSignals?.run?.length > 0) {
    for (const sig of marketSignals.run.slice(0, 2)) {
      const emoji = sig.strength === "strong" ? "🚀" : "📈";
      highlights.push(`${emoji} <strong>Run signal:</strong> ${sig.message}`);
    }
  }
  
  if (marketSignals?.warnings?.length > 0) {
    for (const sig of marketSignals.warnings) {
      highlights.push(`⚠️ <strong>Warning:</strong> ${sig.message}`);
    }
  }
  
  if (topPerformers.length > 0) {
    highlights.push(`📈 <strong>Beating the market:</strong> ${topPerformers.map(c => c.symbol).join(", ")} outperformed Bitcoin this week`);
  }
  
  if (withCatalysts.length > 0) {
    highlights.push(`🚀 <strong>Recent news:</strong> ${withCatalysts.map(c => c.symbol).join(", ")} had project updates in the last 2 weeks`);
  }
  
  if (highRisk.length > 0) {
    const riskSymbols = highRisk.slice(0, 3).map(c => c.symbol).join(", ");
    highlights.push(`⚠️ <strong>Be careful:</strong> ${riskSymbols}${highRisk.length > 3 ? ` +${highRisk.length - 3} more` : ""} have warning signs`);
  }
  
  if (discoveryCount > 0) {
    highlights.push(`🔍 <strong>New discoveries:</strong> Found ${discoveryCount} trending coins worth researching`);
  }
  
  if (topDefi) {
    highlights.push(`🏦 <strong>Top DeFi pick:</strong> ${topDefi.name} (${topDefi.market.token_symbol}) with ${formatUsd(num(topDefi.tvl?.focus_current))} locked`);
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
      fgLabel = "Extreme Fear (BUY)";
    } else if (fgValue <= 40) {
      fgColor = "#4ade80";
      fgLabel = "Fear (Good to buy)";
    } else if (fgValue >= 75) {
      fgColor = "var(--drop)";
      fgLabel = "Extreme Greed (SELL)";
    } else if (fgValue >= 60) {
      fgColor = "var(--warning)";
      fgLabel = "Greed (Be cautious)";
    }
    
    const btcMomentum = btcMAs?.momentum_7d;
    const btcMomentumText = btcMomentum !== undefined 
      ? `BTC ${btcMomentum >= 0 ? "+" : ""}${btcMomentum.toFixed(1)}% this week` 
      : "";
    
    marketGaugeHtml = `
      <div class="market-gauge" style="margin-bottom: 16px; padding: 12px; background: var(--bg-card); border-radius: 8px; border-left: 4px solid ${fgColor};">
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div>
            <span style="font-size: 32px; font-weight: bold; color: ${fgColor};">${fgValue}</span>
            <span style="color: var(--muted); margin-left: 8px;">${fgLabel}</span>
          </div>
          <div style="font-size: 13px; color: var(--muted);">
            Fear & Greed Index • Trend: ${fearGreed.trend || "stable"}${btcMomentumText ? ` • ${btcMomentumText}` : ""}
          </div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="card daily-summary">
      <h2>📋 Today's Summary</h2>
      ${marketGaugeHtml}
      <div class="verdict-box">
        <span class="badge ${verdictClass}" style="font-size: 14px; padding: 6px 12px;">${verdict}</span>
      </div>
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-value" style="color: var(--keep);">${keepCount}</div>
          <div class="stat-label">Ready to Buy</div>
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
    </div>
  `;
}

// Build "What to Play" recommendations card
function buildPlayRecommendationsHtml(playRecs) {
  if (!playRecs) {
    return "";
  }
  
  const phase = playRecs.market_phase || "neutral";
  const phaseLabels = {
    accumulation: { emoji: "🟢", label: "ACCUMULATION", color: "var(--keep)", desc: "Buy quality coins for long-term holds" },
    run: { emoji: "🚀", label: "RUN", color: "#60a5fa", desc: "Quick momentum plays available" },
    caution: { emoji: "⚠️", label: "CAUTION", color: "var(--warning)", desc: "Consider taking profits" },
    neutral: { emoji: "⏸️", label: "NEUTRAL", color: "var(--muted)", desc: "No strong signals - hold or wait" },
  };
  const phaseInfo = phaseLabels[phase] || phaseLabels.neutral;
  
  // Build sections
  let sectionsHtml = "";
  
  // TAKE PROFITS (highest priority - money on the table)
  if (playRecs.take_profits?.length > 0) {
    const items = playRecs.take_profits.slice(0, 5).map(rec => `
      <div class="play-item play-sell">
        <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
        <span class="play-action">💰 ${escapeHtml(rec.action)}</span>
        <span class="play-reason">${escapeHtml(rec.reason)}</span>
      </div>
    `).join("");
    sectionsHtml += `
      <div class="play-section">
        <h4>💰 Take Profits</h4>
        <p class="play-desc">You're up on these - consider selling some</p>
        ${items}
      </div>
    `;
  }
  
  // BEST BUYS (during accumulation or run)
  if (playRecs.best_buys?.length > 0) {
    const items = playRecs.best_buys.slice(0, 5).map(rec => `
      <div class="play-item play-buy">
        <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
        <span class="play-action">🟢 ${escapeHtml(rec.action)}</span>
        <span class="play-reason">${escapeHtml(rec.reason)}</span>
      </div>
    `).join("");
    sectionsHtml += `
      <div class="play-section">
        <h4>🟢 Best Buys</h4>
        <p class="play-desc">Strong fundamentals, good entry point</p>
        ${items}
      </div>
    `;
  }
  
  // MOMENTUM PLAYS (during runs)
  if (playRecs.momentum_plays?.length > 0) {
    const items = playRecs.momentum_plays.slice(0, 5).map(rec => `
      <div class="play-item play-momentum">
        <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
        <span class="play-action">🚀 ${escapeHtml(rec.action)}</span>
        <span class="play-reason">${escapeHtml(rec.reason)}</span>
      </div>
    `).join("");
    sectionsHtml += `
      <div class="play-section">
        <h4>🚀 Momentum Plays</h4>
        <p class="play-desc">Leading the rally - quick trades (5-10% target)</p>
        ${items}
      </div>
    `;
  }
  
  // WATCH FOR DIP
  if (playRecs.watch_for_dip?.length > 0) {
    const items = playRecs.watch_for_dip.slice(0, 3).map(rec => `
      <div class="play-item play-wait">
        <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
        <span class="play-action">⏸️ ${escapeHtml(rec.action)}</span>
        <span class="play-reason">${escapeHtml(rec.reason)}</span>
      </div>
    `).join("");
    sectionsHtml += `
      <div class="play-section">
        <h4>⏸️ Wait for Better Entry</h4>
        <p class="play-desc">Good coins but not the right time yet</p>
        ${items}
      </div>
    `;
  }
  
  // AVOID
  if (playRecs.avoid?.length > 0) {
    const items = playRecs.avoid.slice(0, 3).map(rec => `
      <div class="play-item play-avoid">
        <span class="play-symbol">${escapeHtml(rec.symbol)}</span>
        <span class="play-action">❌ Avoid</span>
        <span class="play-reason">${escapeHtml(rec.reason)}</span>
      </div>
    `).join("");
    sectionsHtml += `
      <div class="play-section">
        <h4>❌ Stay Away</h4>
        <p class="play-desc">Red flags - don't buy these right now</p>
        ${items}
      </div>
    `;
  }
  
  if (!sectionsHtml) {
    sectionsHtml = `<p class="muted">No specific recommendations right now. Keep watching.</p>`;
  }
  
  return `
    <div class="card play-recommendations">
      <h2>🎯 What to Play</h2>
      <div class="phase-banner" style="background: ${phaseInfo.color}20; border-left: 4px solid ${phaseInfo.color}; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
        <span style="font-size: 18px;">${phaseInfo.emoji} <strong>${phaseInfo.label}</strong></span>
        <span style="color: var(--muted); margin-left: 12px;">${phaseInfo.desc}</span>
      </div>
      ${sectionsHtml}
    </div>
  `;
}

// Build Best Entries Today card
function buildBestEntriesHtml(bestEntriesData) {
  if (!bestEntriesData) {
    return "";
  }
  
  const entries = bestEntriesData.best_entries || [];
  const phase = bestEntriesData.market_phase || "neutral";
  
  if (entries.length === 0) {
    return `
      <div class="card best-entries">
        <h2>🎯 Best Entries Today</h2>
        <p class="muted">No strong entry opportunities in your watchlist right now.</p>
        <p class="small muted">Entry signals update when coins hit RSI oversold or pull back from highs.</p>
      </div>
    `;
  }
  
  const phaseBadge = phase === "accumulation" 
    ? `<span class="badge badge-positive" style="margin-left: 8px;">Accumulation Phase = Buy</span>`
    : phase === "run"
      ? `<span class="badge badge-momentum" style="margin-left: 8px;">Run Phase = Quick trades</span>`
      : "";
  
  const entriesHtml = entries.map(entry => {
    const entryClass = entry.entry_signal === "strong_buy" ? "play-buy" : "play-momentum";
    const entryEmoji = entry.entry_signal === "strong_buy" ? "🟢" : "🔵";
    const rsiText = entry.rsi ? `RSI ${Math.round(entry.rsi)}` : "";
    const dipText = entry.distance_from_high ? `${entry.distance_from_high.toFixed(0)}% from high` : "";
    const statsText = [rsiText, dipText].filter(Boolean).join(" | ");
    const reasonsText = entry.reasons.length > 0 ? entry.reasons.slice(0, 2).join(", ") : "Technical entry";
    const labelBadge = entry.hygiene_label === "KEEP" 
      ? `<span class="badge badge-positive" style="font-size:9px;">KEEP</span>` 
      : "";
    
    return `
      <div class="play-item ${entryClass}">
        <span class="play-symbol">${escapeHtml(entry.symbol)} ${labelBadge}</span>
        <span class="play-action">${entryEmoji} ${entry.action}</span>
        <span class="play-reason">${escapeHtml(reasonsText)}${statsText ? ` | ${statsText}` : ""}</span>
      </div>
    `;
  }).join("");
  
  return `
    <div class="card best-entries">
      <h2>🎯 Best Entries Today ${phaseBadge}</h2>
      <p class="small muted" style="margin-bottom: 12px;">
        Your watchlist coins ranked by entry quality (RSI, dip from high, fundamentals)
      </p>
      <div class="play-section">
        ${entriesHtml}
      </div>
      <p class="small muted" style="margin-top: 12px;">
        💡 Entry score combines: RSI, dip from 30d high, dev activity, news activity, hygiene checks
      </p>
    </div>
  `;
}

// Build Blue Chip Opportunities card
function buildBlueChipOpportunitiesHtml(blueChipData) {
  if (!blueChipData) {
    return "";
  }
  
  const opportunities = blueChipData.opportunities || [];
  const scannedCount = blueChipData.scanned_count || 0;
  const marketInFear = blueChipData.market_in_fear;
  
  if (opportunities.length === 0) {
    return `
      <div class="card blue-chips">
        <h2>💎 Blue Chip Scanner</h2>
        <p class="muted">Scanned top ${scannedCount} cryptos by market cap — no strong dip opportunities right now.</p>
        <p class="small muted">Blue chips = safer plays with high liquidity. Alerts fire when they enter buy zones.</p>
      </div>
    `;
  }
  
  const fearBadge = marketInFear 
    ? `<span class="badge badge-positive" style="margin-left: 8px;">Market in Fear = Extra Opportunity</span>` 
    : "";
  
  const oppsHtml = opportunities.slice(0, 5).map(opp => {
    const entryClass = opp.entry_signal === "strong_buy" ? "play-buy" : "play-momentum";
    const entryEmoji = opp.entry_signal === "strong_buy" ? "🟢" : "🔵";
    const signalsText = opp.signals.slice(0, 2).join(", ");
    const mcapText = opp.market_cap >= 1_000_000_000_000 
      ? `$${(opp.market_cap / 1_000_000_000_000).toFixed(2)}T`
      : opp.market_cap >= 1_000_000_000 
        ? `$${(opp.market_cap / 1_000_000_000).toFixed(1)}B`
        : `$${(opp.market_cap / 1_000_000).toFixed(0)}M`;
    
    return `
      <div class="play-item ${entryClass}">
        <span class="play-symbol">${escapeHtml(opp.symbol)}</span>
        <span class="play-action">${entryEmoji} ${opp.entry_signal === "strong_buy" ? "Strong buy" : "Buy signal"}</span>
        <span class="play-reason">${escapeHtml(signalsText)} | MCap: ${mcapText}</span>
      </div>
    `;
  }).join("");
  
  return `
    <div class="card blue-chips">
      <h2>💎 Blue Chip Scanner ${fearBadge}</h2>
      <p class="small muted" style="margin-bottom: 12px;">
        Top ${scannedCount} cryptos by market cap — safer plays with high liquidity
      </p>
      <div class="play-section">
        <h4>🔔 Dip Opportunities</h4>
        <p class="play-desc">These top cryptos are showing buy signals</p>
        ${oppsHtml}
      </div>
      <p class="small muted" style="margin-top: 12px;">
        💡 Blue chips are safer because: higher liquidity, institutional backing, less manipulation risk
      </p>
    </div>
  `;
}

function buildDiffHtml(diffReport) {
  if (!diffReport) {
    return `
      <div class="card">
        <h2>🔄 What Changed Today</h2>
        <p class="muted">This is your first scan — future runs will show what's changed.</p>
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
    { key: "CRITICAL", title: "🚨 Needs Attention", emoji: "🚨" },
    { key: "WARNING", title: "⚠️ Worth Watching", emoji: "⚠️" },
    { key: "POSITIVE", title: "✅ Good News", emoji: "✅" },
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
        <h2>🔄 What Changed Today</h2>
        <div class="muted">Since ${escapeHtml(prev)}</div>
      </div>
      ${
        total === 0
          ? `<p class="muted">Nothing significant changed since last scan.</p>`
          : itemsHtml
      }
    </div>
  `;
}

function buildSupervisorHtml(supervisorResult) {
  if (!supervisorResult || supervisorResult.status !== "ok") {
    return `
      <div class="card">
        <h2>🤖 AI Analysis</h2>
        <p class="muted">AI analysis not available. Set OPENAI_API_KEY to enable this feature.</p>
      </div>
    `;
  }

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
        <h3>🔍 Who Owns These Coins?</h3>
        <p class="muted small">Coins where a few wallets hold most of the supply can be risky — big holders can dump and crash the price.</p>
        <ul class="compact">
          ${highlights
            .map((h) => {
              const facts = Array.isArray(h?.facts) ? h.facts.filter(Boolean) : [];
              const factsText = facts.length ? facts.join(" • ") : "";
              const risk = h?.risk || "UNKNOWN";
              const riskBadge =
                risk === "HIGH"
                  ? badge("⚠️ RISKY", "badge-warning")
                  : risk === "OK"
                    ? badge("✓ OK", "badge-positive")
                    : badge("?", "badge-muted");
              return `<li><strong>${escapeHtml(h?.symbol || "n/a")}</strong> ${riskBadge}: ${escapeHtml(
                factsText
              )}</li>`;
            })
            .join("")}
        </ul>
      `;

  function listVerdicts(title, emoji, items, explanation) {
    if (!items.length) return "";
    return `
      <h3>${emoji} ${escapeHtml(title)}</h3>
      ${explanation ? `<p class="muted small">${explanation}</p>` : ""}
      <ul class="compact">
        ${items
          .map((i) => {
            const why = i?.why ? ` — ${i.why}` : "";
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
        <h3>📋 Need More Research</h3>
        <p class="muted small">These coins need you to manually check recent news or announcements.</p>
        <ul class="compact">
          ${manual.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
        </ul>
      `;

  return `
    <div class="card">
      <h2>🤖 AI Analysis</h2>
      <p>${escapeHtml(supervisorResult.executive_summary || "No summary provided.")}</p>
      ${highlightsHtml}
      ${listVerdicts("Be Careful With", "⚠️", watchClosely, "These coins have warning signs — don't buy without doing more research.")}
      ${listVerdicts("Don't Chase", "🛑", avoidChasing, "These already pumped big without a clear reason — buying now is risky.")}
      ${manualHtml}
    </div>
  `;
}

function buildAlertsHtml(alertsReport) {
  if (!alertsReport) {
    return `
      <div class="card">
        <h2>🔔 Important Alerts</h2>
        <p class="muted">Alerts will appear here after running the scanner.</p>
      </div>
    `;
  }

  const alerts = Array.isArray(alertsReport.alerts) ? alertsReport.alerts : [];

  function sourceBadge(source) {
    const key = String(source || "").toUpperCase();
    switch (key) {
      case "WATCHLIST":
        return badge("📊 YOUR LIST", "badge-positive");
      case "DEFI":
        return badge("🏦 DEFI", "badge-info");
      case "DISCOVERY":
        return badge("🔍 NEW FIND", "badge-warning");
      default:
        return badge(key || "ALERT", "badge-muted");
    }
  }

  const listHtml =
    alerts.length === 0
      ? `<p class="muted">✓ Nothing urgent today — all clear!</p>`
      : `
        <ul class="compact">
          ${alerts
            .slice(0, 10)
            .map((a) => {
              const symbol = a?.symbol ? `<strong>${escapeHtml(a.symbol)}</strong> ` : "";
              const title = escapeHtml(a?.title || "");
              const tag = a?.watchlist_source === "staging" ? ` <span class="muted small">(testing)</span>` : "";
              const label = `${symbol}${title}`;
              const content = a?.url
                ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer">${label}</a>`
                : label;
              return `<li>${sourceBadge(a?.source)} ${content}${tag}</li>`;
            })
            .join("")}
        </ul>
        ${
          alerts.length > 10
            ? `<div class="muted small">...and ${escapeHtml(
                alerts.length - 10
              )} more.</div>`
            : ""
        }
      `;

  return `
    <div class="card">
      <div class="row space-between">
        <h2>🔔 Important Alerts</h2>
        <div class="muted"><a href="Alerts.md">See all →</a></div>
      </div>
      <p class="muted small">Coins that scored high in today's scans or have actionable signals.</p>
      ${listHtml}
    </div>
  `;
}

function buildWatchlistTableHtml({ title, coins, rankBySymbol }) {
  if (!coins.length) {
    return `
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No coins here yet. Add coins to your watchlist to track them.</p>
      </div>
    `;
  }

  const sorted = [...coins].sort((a, b) => {
    const ra = rankBySymbol.get(a.symbol) || 9999;
    const rb = rankBySymbol.get(b.symbol) || 9999;
    if (ra !== rb) return ra - rb;
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  // Helper to make decision more readable
  function friendlyLabel(label) {
    switch (label) {
      case "KEEP": return "✅ Buy";
      case "WATCH-ONLY": return "👀 Watch";
      case "DROP": return "🚫 Avoid";
      default: return "❓ Unknown";
    }
  }

  const rows = sorted
    .map((coin) => {
      const label = coin.hygiene_label || "UNKNOWN";
      const friendlyLabelText = friendlyLabel(label);
      const labelBadge = badge(friendlyLabelText, labelClass(label));
      const price = formatUsd(num(coin.price));
      const ch7d = num(coin.price_change_7d);
      const ch7dDisplay = ch7d !== null 
        ? `<span style="color: ${ch7d >= 0 ? 'var(--keep)' : 'var(--drop)'}">${formatSignedPct(ch7d, 1)}</span>`
        : "n/a";
      const rs7d = num(coin.relative_strength_7d);
      const beatsBtc = coin.outperforming_btc === true;
      const rsDisplay = beatsBtc 
        ? `<span style="color: var(--keep);">✓ Yes</span>` 
        : `<span class="muted">No</span>`;

      const notes = notesForCoin(coin);
      // Show ALL notes - no truncation
      const notesHtml =
        notes.length === 0
          ? `<span class="muted">All clear ✓</span>`
          : notes.map((n) => badge(n, "badge-muted")).join(" ");

      // Entry signal display - simplified and clear
      const entrySignal = coin.entry_signal;
      const rsi = coin.rsi_14d;
      const distFromHigh = num(coin.distance_from_high);
      let entryHtml = '<span class="muted">-</span>';
      if (entrySignal) {
        // Simplified entry display with clear meaning
        let entryText = "";
        let entryColor = "var(--muted)";
        
        if (entrySignal === "strong_buy") {
          entryText = "Great";
          entryColor = "var(--keep)";
        } else if (entrySignal === "buy") {
          entryText = "Good";
          entryColor = "var(--keep)";
        } else if (entrySignal === "overbought") {
          entryText = "Wait";
          entryColor = "var(--drop)";
        } else {
          entryText = "Okay";
          entryColor = "var(--muted)";
        }
        
        // Show RSI in plain language
        let rsiNote = "";
        if (rsi !== null) {
          if (rsi < 30) rsiNote = "oversold";
          else if (rsi > 70) rsiNote = "overbought";
        }
        
        // Show dip from high if significant
        let dipNote = "";
        if (distFromHigh !== null && distFromHigh > 15) {
          dipNote = `${Math.round(distFromHigh)}% off high`;
        }
        
        const subNote = [rsiNote, dipNote].filter(Boolean).join(", ");
        entryHtml = `<span style="color: ${entryColor}; font-weight: 500;">${entryText}</span>` +
                   (subNote ? `<div class="muted small">${escapeHtml(subNote)}</div>` : "");
      }

      const coinId = coin.coin_gecko_id ? String(coin.coin_gecko_id) : "";
      const geckoUrl = coinId
        ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}`
        : null;
      const symbolHtml = geckoUrl
        ? `<a href="${escapeHtml(geckoUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(
            coin.symbol
          )}</strong></a>`
        : `<strong>${escapeHtml(coin.symbol)}</strong>`;

      return `
        <tr data-symbol="${escapeHtml(coin.symbol)}" data-name="${escapeHtml(
        coin.name || ""
      )}">
          <td class="col-symbol">${symbolHtml}<div class="muted small">${escapeHtml(
        coin.name || ""
      )}</div></td>
          <td>${labelBadge}</td>
          <td class="num">${escapeHtml(price)}</td>
          <td class="num">${ch7dDisplay}</td>
          <td class="num">${rsDisplay}</td>
          <td class="num">${entryHtml}</td>
          <td>${notesHtml}</td>
        </tr>
      `;
    })
    .join("");

  // Legend for Entry column
  const entryLegend = `
    <div class="entry-legend muted small" style="margin-top: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
      <strong>Entry Guide:</strong>
      <span style="color: var(--keep); margin-left: 8px;">Great</span> = price dipped, good time to buy
      <span style="color: var(--keep); margin-left: 8px;">Good</span> = reasonable entry point
      <span style="color: var(--muted); margin-left: 8px;">Okay</span> = neither cheap nor expensive
      <span style="color: var(--drop); margin-left: 8px;">Wait</span> = price ran up recently, wait for dip
    </div>
  `;

  return `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table class="table filterable">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Verdict</th>
              <th class="num">Price</th>
              <th class="num">Week</th>
              <th class="num">Beat BTC?</th>
              <th class="num">Entry</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      ${entryLegend}
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
            addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || "n/a";
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
            <span class="muted small">Top10 ${escapeHtml(top10)} • Top20 ${escapeHtml(top20)}</span>
          </summary>
          <div class="details-body">
            <div class="muted small">Contract: ${contractHtml} • Source: ${escapeHtml(
        coin.onchain.source || "unknown"
      )}${breakdown.length > 0 ? ` • Top10 breakdown: ${escapeHtml(breakdown.join(", "))}` : ""}</div>
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
    </div>
  `;
}

function buildDefiHtml(defiLatest) {
  if (!defiLatest || !Array.isArray(defiLatest.protocols)) {
    return `
      <div class="card">
        <h2>🏦 DeFi Projects</h2>
        <p class="muted">No DeFi data yet. This scans crypto lending/trading platforms to find solid projects.</p>
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
      const token = preferTokenMapped ? p?.market?.token_symbol || p?.market?.gecko_id || "—" : null;
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
        <h2>🏦 Top DeFi Projects</h2>
        <div class="muted"><a href="defi/Latest.md">See all ${buckets.CANDIDATE} →</a></div>
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
      <p class="muted small" style="margin-top:10px;">💡 <strong>What this means:</strong> Projects with more money locked and growing TVL are generally more trusted. The token column shows what coin you'd buy to invest in these projects.</p>
    </div>
  `;
}

function buildBacktestHtml(backtestStats) {
  if (!backtestStats) {
    return `
      <div class="card">
        <h2>Backtesting</h2>
        <p class="muted">No backtest stats yet.</p>
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
    </div>
  `;
}

function buildFunnelHtml(funnelStats, backtestStats) {
  if (!funnelStats && !backtestStats) {
    return `
      <div class="card">
        <h2>📊 Discovery Funnel & Performance</h2>
        <p class="muted">Run the scanner daily to build performance data.</p>
      </div>
    `;
  }

  // Discovery funnel section
  const funnel = funnelStats || {};
  const byStatus = funnel.by_status || {};
  const totalDiscovered = funnel.total_discovered || 0;
  
  const funnelBarHtml = totalDiscovered > 0 ? `
    <div class="funnel-visual">
      <div class="funnel-bar">
        <div class="funnel-segment" style="flex: ${byStatus.NEW || 0}; background: var(--muted);" title="Pending review: ${byStatus.NEW || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.STAGED || 0}; background: var(--watch);" title="Staging: ${byStatus.STAGED || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.PROMOTED || 0}; background: var(--keep);" title="Promoted: ${byStatus.PROMOTED || 0}"></div>
        <div class="funnel-segment" style="flex: ${byStatus.IGNORED || 0}; background: var(--drop);" title="Ignored: ${byStatus.IGNORED || 0}"></div>
      </div>
      <div class="funnel-labels">
        <span style="color: var(--muted)">⏳ ${byStatus.NEW || 0} pending</span>
        <span style="color: var(--watch)">🧪 ${byStatus.STAGED || 0} staging</span>
        <span style="color: var(--keep)">✅ ${byStatus.PROMOTED || 0} promoted</span>
        <span style="color: var(--drop)">❌ ${byStatus.IGNORED || 0} ignored</span>
      </div>
    </div>
  ` : '<p class="muted">No discovery data yet. Run: node src/discover.js</p>';

  // Performance comparison
  const stagingPerf = funnel.staging_performance || {};
  const mainPerf = funnel.main_performance || {};
  const verdict = funnel.verdict || "Keep running daily scans to build data.";
  
  const perfHtml = (stagingPerf.sample_size > 0 || mainPerf.sample_size > 0) ? `
    <div class="perf-comparison">
      <div class="perf-box">
        <div class="perf-label">📋 Main Watchlist</div>
        <div class="perf-value">${formatSignedPct(num(mainPerf.avg_return_14d), 1)}</div>
        <div class="perf-sample">${mainPerf.sample_size || 0} coins measured</div>
      </div>
      <div class="perf-vs">vs</div>
      <div class="perf-box">
        <div class="perf-label">🧪 Staging Picks</div>
        <div class="perf-value">${formatSignedPct(num(stagingPerf.avg_return_14d), 1)}</div>
        <div class="perf-sample">${stagingPerf.sample_size || 0} coins measured</div>
      </div>
    </div>
    <div class="verdict-box">${escapeHtml(verdict)}</div>
  ` : '';
  
  // Best/Worst from backtest
  const best = backtestStats?.best_14d || [];
  const worst = backtestStats?.worst_14d || [];
  const flagEffectiveness = backtestStats?.flag_effectiveness_14d || [];
  
  const bestWorstHtml = (best.length > 0 || worst.length > 0) ? `
    <div class="best-worst-grid">
      <div class="best-section">
        <h4>🏆 Best Picks (14d)</h4>
        ${best.slice(0, 3).map(b => `
          <div class="pick-item pick-good">
            <span class="pick-symbol">${escapeHtml(b.symbol)}</span>
            <span class="pick-return">${formatSignedPct(num(b.return_14d_pct), 1)}</span>
            <span class="pick-reason">${escapeHtml(b.why_good || '')}</span>
          </div>
        `).join('')}
      </div>
      <div class="worst-section">
        <h4>⚠️ Worst Picks (14d)</h4>
        ${worst.slice(0, 3).map(w => `
          <div class="pick-item pick-bad">
            <span class="pick-symbol">${escapeHtml(w.symbol)}</span>
            <span class="pick-return">${formatSignedPct(num(w.return_14d_pct), 1)}</span>
            <span class="pick-reason">${escapeHtml(w.why_bad || '')}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';
  
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
      <h4>🔍 Which Rules Help?</h4>
      <div class="rules-grid">
        ${helpfulRules.map(r => {
          const edge = r.edge_14d || 0;
          const isGood = edge > 5;
          const isBad = edge < -5;
          const color = isGood ? 'var(--keep)' : isBad ? 'var(--drop)' : 'var(--muted)';
          const confidenceRaw = getRuleConfidence(r);
          const confidenceLabel = typeof confidenceRaw === "string"
            ? confidenceRaw.charAt(0).toUpperCase() + confidenceRaw.slice(1)
            : "Unknown";
          return `
            <div class="rule-item" style="border-left: 3px solid ${color}">
              <div class="rule-name">${escapeHtml(r.label || r.flag)}</div>
              <div class="rule-edge" style="color: ${color}">${formatSignedPct(edge, 1)} edge</div>
              <div class="rule-verdict">${escapeHtml(r.verdict || '')}</div>
              <div class="rule-meta">Confidence: ${escapeHtml(confidenceLabel)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';
  
  // Data coverage
  const coverage = backtestStats?.data_coverage || {};
  const coverageHtml = `
    <div class="coverage-info">
      <span>📊 Data: ${coverage.with_14d_outcome || 0} coins have 14-day results</span>
      ${coverage.awaiting_7d > 0 ? `<span class="muted"> | ⏳ ${coverage.awaiting_7d} awaiting 7d</span>` : ''}
    </div>
  `;

  return `
    <div class="card funnel-card">
      <div class="row space-between">
        <h2>📊 Discovery Funnel</h2>
        <span class="muted small">${totalDiscovered} coins discovered</span>
      </div>
      ${funnelBarHtml}
      ${perfHtml}
      ${bestWorstHtml}
      ${rulesHtml}
      ${coverageHtml}
      <div class="muted small" style="margin-top: 12px;">
        <a href="backtest/BacktestReport.md">View full backtest report →</a>
      </div>
    </div>
  `;
}

function renderDashboard({ layer1Report, diffReport, supervisorResult, defiLatest, alertsReport, backtestStats, funnelStats }) {
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
    { name: "Layer1Report.json", href: "Layer1Report.json" },
    { name: "Alerts.md", href: "Alerts.md" },
    { name: "Alerts.json", href: "Alerts.json" },
    { name: "DiffReport.json", href: "DiffReport.json" },
    { name: "SupervisorSummary.json", href: "SupervisorSummary.json" },
    { name: "BacktestReport.md", href: path.posix.join("backtest", "BacktestReport.md") },
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
      @media (max-width: 700px) {
        .play-item { flex-direction: column; align-items: flex-start; gap: 4px; }
        .play-action { min-width: auto; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="title">📊 Crypto Scanner</div>
          <div class="subtitle">Last updated: ${escapeHtml(runAt)}</div>
        </div>
        <div class="controls">
          <input id="filter" type="search" placeholder="Search your coins..." />
        </div>
      </div>

      <!-- DAILY SUMMARY - THE MAIN THING TO READ -->
      <div style="margin-top:14px;">
        ${buildDailySummaryHtml({ layer1Report, diffReport, alertsReport, defiLatest, discoveryReport: null, supervisorResult })}
      </div>
      
      <!-- WHAT TO PLAY - ACTIONABLE RECOMMENDATIONS -->
      <div style="margin-top:14px;">
        ${buildPlayRecommendationsHtml(layer1Report?.play_recommendations)}
      </div>
      
      <!-- BEST ENTRIES TODAY -->
      <div style="margin-top:14px;">
        ${buildBestEntriesHtml(layer1Report?.best_entries)}
      </div>
      
      <!-- BLUE CHIP DIP OPPORTUNITIES -->
      <div style="margin-top:14px;">
        ${buildBlueChipOpportunitiesHtml(layer1Report?.blue_chip_opportunities)}
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

      <!-- YOUR WATCHLIST -->
      <div class="grid" style="margin-top:14px;">
        <div>
          ${buildWatchlistTableHtml({ title: "📋 Your Watchlist", coins: mainCoins, rankBySymbol })}
        </div>
        <div>
          ${buildWatchlistTableHtml({
            title: "🧪 Testing (Staging)",
            coins: stagingCoins,
            rankBySymbol,
          })}
        </div>
      </div>

      <!-- EXPANDABLE SECTIONS FOR MORE DETAIL -->
      <details class="collapsible-section" open>
        <summary><h2>🤖 AI Analysis & DeFi</h2><span class="muted small">Click to expand/collapse</span></summary>
        <div class="section-content">
          <div class="grid" style="margin-top:14px;">
            <div>
              ${buildSupervisorHtml(supervisorResult)}
            </div>
            <div>
              ${buildDefiHtml(defiLatest)}
            </div>
          </div>
        </div>
      </details>

      <details class="collapsible-section">
        <summary><h2>🔍 Ownership Details</h2><span class="muted small">Who holds these coins?</span></summary>
        <div class="section-content">
          ${buildOnchainHtml(coins)}
        </div>
      </details>

      <details class="collapsible-section">
        <summary><h2>📈 Backtest & History</h2><span class="muted small">How accurate is this scanner?</span></summary>
        <div class="section-content">
          ${buildFunnelHtml(funnelStats, backtestStats)}
          ${buildBacktestHtml(backtestStats)}
        </div>
      </details>

      <!-- HELP SECTION -->
      <div class="card help-section" style="margin-top:14px;">
        <h2>❓ How to Read This Dashboard</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 12px;">
          <div>
            <h3 style="color: var(--keep);">✅ Ready to Buy (KEEP)</h3>
            <p class="small muted">These coins passed all safety checks. They have good trading volume, aren't overly controlled by a few wallets, and show signs of real project activity.</p>
          </div>
          <div>
            <h3 style="color: var(--watch);">👀 Keep Watching (WATCH)</h3>
            <p class="small muted">Interesting but not ready yet. Maybe missing data, or has some warning signs. Keep an eye on them but don't buy without more research.</p>
          </div>
          <div>
            <h3 style="color: var(--drop);">🚫 Avoid (DROP)</h3>
            <p class="small muted">Failed basic checks. Could be too illiquid (hard to sell), or has serious red flags. Better to skip these.</p>
          </div>
          <div>
            <h3>🧪 Testing (Staging)</h3>
            <p class="small muted">New coins the scanner found. They're being tested before adding to your main list. Promote winners, ignore the rest.</p>
          </div>
        </div>
      </div>

      <!-- QUICK LINKS AT BOTTOM -->
      <div class="card" style="margin-top:14px;">
        <h2>📁 All Reports</h2>
        <div>${fileLinksHtml}</div>
      </div>
    </div>

    <script>
      (function () {
        const input = document.getElementById("filter");
        const tables = Array.from(document.querySelectorAll("table.filterable"));
        function applyFilter() {
          const q = (input.value || "").trim().toLowerCase();
          for (const table of tables) {
            const rows = Array.from(table.tBodies[0].rows);
            for (const row of rows) {
              if (!q) { row.style.display = ""; continue; }
              const hay = (row.dataset.symbol + " " + row.dataset.name).toLowerCase();
              row.style.display = hay.includes(q) ? "" : "none";
            }
          }
        }
        input.addEventListener("input", applyFilter);
      })();
    </script>
  </body>
</html>`;
}

module.exports = { renderDashboard };


