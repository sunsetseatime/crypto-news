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

  lines.push("## Alerts");
  if (!alertsReport.alerts || alertsReport.alerts.length === 0) {
    lines.push("- None");
    lines.push("");
    return lines.join("\n");
  }

  for (const alert of alertsReport.alerts) {
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

