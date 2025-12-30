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
  if (coin?.chasing) notes.push("chasing");
  if (coin?.thin_fragile) notes.push("thin");
  if (coin?.high_dilution_risk) notes.push("dilution");
  if (coin?.low_liquidity) notes.push("low_liq");
  if (coin?.unlock_confidence === "UNKNOWN") notes.push("unlock_unk");
  if (coin?.unlock_risk_flag) notes.push("unlock_risk");
  if (coin?.has_clean_catalyst) notes.push("catalyst");
  if (coin?.traction_status === "OK") notes.push("traction");
  if (coin?.high_concentration_risk) notes.push("whale_risk");
  return notes;
}

function buildDiffHtml(diffReport) {
  if (!diffReport) {
    return `
      <div class="card">
        <h2>Changes Since Last Run</h2>
        <p class="muted">First scan (no previous history found).</p>
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
    { key: "CRITICAL", title: "Critical" },
    { key: "WARNING", title: "Warning" },
    { key: "POSITIVE", title: "Positive" },
    { key: "INFO", title: "Info" },
  ];

  const prev = formatUtc(diffReport.previous_scan_date);
  const total = (diffReport.changes || []).length;

  const itemsHtml = sections
    .map((s) => {
      const items = bySeverity[s.key];
      if (!items || items.length === 0) return "";
      const list = items
        .map((item) => {
          const tag = item.watchlist_source === "staging" ? " (staging)" : "";
          return `<li><strong>${escapeHtml(item.symbol)}${escapeHtml(
            tag
          )}</strong>: ${escapeHtml(item.description)}</li>`;
        })
        .join("");
      return `
        <div class="diff-group">
          <h3>${badge(s.key, severityClass(s.key))} ${escapeHtml(s.title)} <span class="muted">(${items.length})</span></h3>
          <ul class="compact">${list}</ul>
        </div>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Changes Since Last Run</h2>
        <div class="muted">Previous: ${escapeHtml(prev)} • Changes: ${escapeHtml(total)}</div>
      </div>
      ${
        total === 0
          ? `<p class="muted">No material changes detected.</p>`
          : itemsHtml
      }
    </div>
  `;
}

function buildSupervisorHtml(supervisorResult) {
  if (!supervisorResult || supervisorResult.status !== "ok") {
    return `
      <div class="card">
        <h2>AI Supervisor Summary</h2>
        <p class="muted">AI summary unavailable.</p>
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
        <h3>On-chain Highlights</h3>
        <ul class="compact">
          ${highlights
            .map((h) => {
              const facts = Array.isArray(h?.facts) ? h.facts.filter(Boolean) : [];
              const factsText = facts.length ? facts.join(" • ") : "";
              const risk = h?.risk || "UNKNOWN";
              const riskBadge =
                risk === "HIGH"
                  ? badge("HIGH", "badge-warning")
                  : risk === "OK"
                    ? badge("OK", "badge-positive")
                    : badge(risk, "badge-muted");
              return `<li><strong>${escapeHtml(h?.symbol || "n/a")}</strong> (${escapeHtml(
                h?.chain || "unknown"
              )}) ${riskBadge}: ${escapeHtml(
                factsText
              )}</li>`;
            })
            .join("")}
        </ul>
      `;

  function listVerdicts(title, items) {
    if (!items.length) return "";
    return `
      <h3>${escapeHtml(title)}</h3>
      <ul class="compact">
        ${items
          .map((i) => {
            const why = i?.why ? ` — ${i.why}` : "";
            return `<li><strong>${escapeHtml(i?.symbol || "n/a")}</strong>: ${escapeHtml(
              i?.verdict || ""
            )}${escapeHtml(why)}</li>`;
          })
          .join("")}
      </ul>
    `;
  }

  const manualHtml =
    manual.length === 0
      ? ""
      : `
        <h3>Manual Checks</h3>
        <ul class="compact">
          ${manual.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
        </ul>
      `;

  return `
    <div class="card">
      <h2>AI Supervisor Summary</h2>
      <p>${escapeHtml(supervisorResult.executive_summary || "No summary provided.")}</p>
      ${highlightsHtml}
      ${listVerdicts("Watch Closely", watchClosely)}
      ${listVerdicts("Avoid / Chasing", avoidChasing)}
      ${manualHtml}
    </div>
  `;
}

function buildAlertsHtml(alertsReport) {
  if (!alertsReport) {
    return `
      <div class="card">
        <h2>Alerts</h2>
        <p class="muted">Alerts unavailable (run the scanner again).</p>
      </div>
    `;
  }

  const alerts = Array.isArray(alertsReport.alerts) ? alertsReport.alerts : [];
  const thresholds = alertsReport.thresholds || {};
  const defiThreshold =
    typeof thresholds.defi_score_threshold === "number" &&
    Number.isFinite(thresholds.defi_score_threshold)
      ? thresholds.defi_score_threshold.toFixed(0)
      : "n/a";
  const discoveryThreshold =
    typeof thresholds.discovery_score_threshold === "number" &&
    Number.isFinite(thresholds.discovery_score_threshold)
      ? thresholds.discovery_score_threshold.toFixed(0)
      : "n/a";
  const actionable =
    thresholds.alert_actionable === false ? "off" : "on";

  function sourceBadge(source) {
    const key = String(source || "").toUpperCase();
    switch (key) {
      case "WATCHLIST":
        return badge("WATCHLIST", "badge-positive");
      case "DEFI":
        return badge("DEFI", "badge-info");
      case "DISCOVERY":
        return badge("DISCOVERY", "badge-warning");
      default:
        return badge(key || "ALERT", "badge-muted");
    }
  }

  const listHtml =
    alerts.length === 0
      ? `<p class="muted">No alerts triggered.</p>`
      : `
        <ul class="compact">
          ${alerts
            .slice(0, 10)
            .map((a) => {
              const symbol = a?.symbol ? `<strong>${escapeHtml(a.symbol)}</strong> ` : "";
              const title = escapeHtml(a?.title || "");
              const tag = a?.watchlist_source === "staging" ? ` <span class="muted small">(staging)</span>` : "";
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
              )} more (open Alerts.md).</div>`
            : ""
        }
      `;

  return `
    <div class="card">
      <div class="row space-between">
        <h2>Alerts</h2>
        <div class="muted"><a href="Alerts.md">Open report</a></div>
      </div>
      <div class="muted small">Thresholds: DeFi ≥ ${escapeHtml(defiThreshold)}, Discovery ≥ ${escapeHtml(
    discoveryThreshold
  )}, Actionable=${escapeHtml(actionable)} ƒ?› Generated: ${escapeHtml(
    formatUtc(alertsReport.generated_at)
  )}</div>
      ${listHtml}
    </div>
  `;
}

function buildWatchlistTableHtml({ title, coins, rankBySymbol }) {
  if (!coins.length) {
    return `
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No coins in this list.</p>
      </div>
    `;
  }

  const sorted = [...coins].sort((a, b) => {
    const ra = rankBySymbol.get(a.symbol) || 9999;
    const rb = rankBySymbol.get(b.symbol) || 9999;
    if (ra !== rb) return ra - rb;
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  const rows = sorted
    .map((coin) => {
      const label = coin.hygiene_label || "UNKNOWN";
      const labelBadge = badge(label, labelClass(label));
      const price = formatUsd(num(coin.price));
      const ch7d = formatSignedPct(num(coin.price_change_7d), 2);
      const rs7d = num(coin.relative_strength_7d);
      const rsDisplay =
        rs7d !== null
          ? `${coin.outperforming_btc ? "✓ " : ""}${formatSignedPct(rs7d, 1)}`
          : "n/a";
      const vol = formatUsd(num(coin.volume_24h));

      const notes = notesForCoin(coin);
      const notesHtml =
        notes.length === 0
          ? `<span class="muted">-</span>`
          : notes.map((n) => badge(n, "badge-muted")).join(" ");

      const coinId = coin.coin_gecko_id ? String(coin.coin_gecko_id) : "";
      const geckoUrl = coinId
        ? `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}`
        : null;
      const symbolHtml = geckoUrl
        ? `<a href="${escapeHtml(geckoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
            coin.symbol
          )}</a>`
        : escapeHtml(coin.symbol);

      return `
        <tr data-symbol="${escapeHtml(coin.symbol)}" data-name="${escapeHtml(
        coin.name || ""
      )}">
          <td class="col-symbol">${symbolHtml}<div class="muted small">${escapeHtml(
        coin.name || ""
      )}</div></td>
          <td>${labelBadge}</td>
          <td class="num">${escapeHtml(price)}</td>
          <td class="num">${escapeHtml(ch7d)}</td>
          <td class="num">${escapeHtml(rsDisplay)}</td>
          <td class="num">${escapeHtml(vol)}</td>
          <td>${notesHtml}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table class="table filterable">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Label</th>
              <th class="num">Price</th>
              <th class="num">7d</th>
              <th class="num">vs BTC (7d)</th>
              <th class="num">Vol 24h</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <p class="muted small">Tip: use the search box to filter by symbol/name.</p>
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
      const risk = coin.high_concentration_risk ? "HIGH" : "OK";
      const riskBadge = badge(risk, coin.high_concentration_risk ? "badge-warning" : "badge-positive");

      const holders = coin.onchain.top_holders.slice(0, 10);
      const rows = holders
        .map((h) => {
          const addr = h.address || "";
          const addrShort =
            addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || "n/a";
          const link = h.address_url
            ? `<a href="${escapeHtml(h.address_url)}" target="_blank" rel="noreferrer">${escapeHtml(
                addrShort
              )}</a>`
            : escapeHtml(addrShort);
          return `<tr><td class="num">${escapeHtml(h.rank)}</td><td>${link}</td><td>${escapeHtml(
            h.address_type || "UNKNOWN"
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
      )}</div>
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
        <h2>DeFi Protocol Scanner</h2>
        <p class="muted">No DeFi snapshot found (run <code>node src/defi_scan.js</code>).</p>
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
  const top = (preferTokenMapped ? tokenMappedCandidates : allCandidates).slice(0, 10);

  const rows = top
    .map((p, idx) => {
      const name = p?.name || "n/a";
      const url = p?.links?.defillama || null;
      const protocol = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
        : escapeHtml(name);
      const token = preferTokenMapped ? p?.market?.token_symbol || p?.market?.gecko_id || "n/a" : null;
      const tvl = formatUsd(num(p?.tvl?.focus_current));
      const ch30d = formatSignedPct(num(p?.tvl?.change_30d_pct), 1);
      const ch7d = formatSignedPct(num(p?.tvl?.change_7d_pct), 1);
      const score =
        typeof p?.scores?.total === "number" && Number.isFinite(p.scores.total)
          ? p.scores.total.toFixed(1)
          : "n/a";
      return `
        <tr>
          <td class="num">${escapeHtml(idx + 1)}</td>
          <td>${protocol}</td>
          ${preferTokenMapped ? `<td>${escapeHtml(token)}</td>` : ""}
          <td class="num">${escapeHtml(tvl)}</td>
          <td class="num">${escapeHtml(ch30d)}</td>
          <td class="num">${escapeHtml(ch7d)}</td>
          <td class="num">${escapeHtml(score)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="row space-between">
        <h2>DeFi Protocol Scanner</h2>
        <div class="muted">Run: ${escapeHtml(formatUtc(defiLatest.generated_at))}</div>
      </div>
      <div class="muted small">Buckets: candidates=${buckets.CANDIDATE}, watch=${buckets.WATCH}, avoid=${buckets.AVOID} • <a href="defi/Latest.md">Open report</a></div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Protocol</th>
              ${preferTokenMapped ? "<th>Token</th>" : ""}
              <th class="num">TVL</th>
              <th class="num">30d</th>
              <th class="num">7d</th>
              <th class="num">Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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
              <th>Label</th>
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

function renderDashboard({ layer1Report, diffReport, supervisorResult, defiLatest, alertsReport, backtestStats }) {
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
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="title">Crypto Scanner Dashboard</div>
          <div class="subtitle">Run: ${escapeHtml(runAt)} • Market: ${escapeHtml(
    sources.market_data || "n/a"
  )} • TVL: ${escapeHtml(sources.tvl || "NONE")} • On-chain: ${escapeHtml(
    sources.onchain || "NONE"
  )}</div>
        </div>
        <div class="controls">
          <input id="filter" type="search" placeholder="Filter coins by symbol or name…" />
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2>Quick Links</h2>
        <div>${fileLinksHtml}</div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2>Snapshot</h2>
        <div class="kpis">
          <div class="kpi"><div class="label">Main • KEEP</div><div class="value" style="color:var(--keep)">${escapeHtml(
    counts.main.KEEP
  )}</div></div>
          <div class="kpi"><div class="label">Main • WATCH</div><div class="value" style="color:var(--watch)">${escapeHtml(
    counts.main["WATCH-ONLY"]
  )}</div></div>
          <div class="kpi"><div class="label">Main • DROP</div><div class="value" style="color:var(--drop)">${escapeHtml(
    counts.main.DROP
  )}</div></div>
          <div class="kpi"><div class="label">Staging • Coins</div><div class="value">${escapeHtml(
    stagingCoins.length
  )}</div></div>
        </div>
        <h3 style="margin-top:14px;">Warnings</h3>
        ${warningsHtml}
      </div>

      <div class="grid" style="margin-top:14px;">
        <div class="span-2">
          ${buildAlertsHtml(alertsReport)}
        </div>
        <div class="span-2">
          ${buildDiffHtml(diffReport)}
        </div>
        <div class="span-2">
          ${buildSupervisorHtml(supervisorResult)}
        </div>
        <div class="span-2">
          ${buildBacktestHtml(backtestStats)}
        </div>
        <div class="span-2">
          ${buildDefiHtml(defiLatest)}
        </div>
        <div>
          ${buildWatchlistTableHtml({ title: "Watchlist (Main)", coins: mainCoins, rankBySymbol })}
        </div>
        <div>
          ${buildWatchlistTableHtml({
            title: "Watchlist (Staging)",
            coins: stagingCoins,
            rankBySymbol,
          })}
        </div>
        <div class="span-2">
          ${buildOnchainHtml(coins)}
        </div>
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
