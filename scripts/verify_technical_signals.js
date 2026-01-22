const fs = require("fs");
const path = require("path");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function expectedEntrySignalFromScore(score) {
  if (!isFiniteNumber(score)) return null;
  if (score >= 75) return "strong_buy";
  if (score >= 60) return "buy";
  if (score >= 40) return "wait";
  return "overbought";
}

function computePctVs(a, b) {
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

function closeEnough(a, b, tolerance = 0.05) {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

function main() {
  const argPath = process.argv[2] ? String(process.argv[2]).trim() : "";
  const reportPath = argPath
    ? path.resolve(process.cwd(), argPath)
    : path.join(process.cwd(), "reports", "Layer1Report.json");

  if (!fs.existsSync(reportPath)) {
    console.error("TA sanity check failed: could not find the report file.");
    console.error(`- Expected: ${reportPath}`);
    console.error("- Fix: run `npm run scan:watchlist` first.");
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.error("TA sanity check failed: could not parse the report JSON.");
    console.error(`- File: ${reportPath}`);
    console.error(`- Error: ${err?.message || String(err)}`);
    process.exit(2);
  }

  const issues = [];
  const coins = Array.isArray(report?.coins) ? report.coins : [];
  let scoredCoins = 0;

  const pushIssue = (symbol, message) => {
    issues.push({ symbol: symbol || "?", message });
  };

  for (const coin of coins) {
    const symbol = String(coin?.symbol || "").trim() || String(coin?.coin_gecko_id || "").trim() || "?";
    const price = coin?.price;

    const score = coin?.entry_score;
    const signal = coin?.entry_signal;
    if (score !== null && score !== undefined) {
      scoredCoins += 1;
      if (!isFiniteNumber(score)) {
        pushIssue(symbol, `entry_score is not a number (${String(score)})`);
      } else {
        if (score < 0 || score > 100) {
          pushIssue(symbol, `entry_score is out of range (0–100): ${score}`);
        }
        const expected = expectedEntrySignalFromScore(score);
        if (expected && signal !== expected) {
          pushIssue(symbol, `entry_signal "${signal}" does not match entry_score ${score} (expected "${expected}")`);
        }
      }
    } else if (signal !== null && signal !== undefined) {
      pushIssue(symbol, `entry_signal is set ("${signal}") but entry_score is missing`);
    }

    const rsi = coin?.rsi_14d;
    const rsiSignal = coin?.rsi_signal;
    if (rsi !== null && rsi !== undefined) {
      if (!isFiniteNumber(rsi)) {
        pushIssue(symbol, `rsi_14d is not a number (${String(rsi)})`);
      } else if (rsi < 0 || rsi > 100) {
        pushIssue(symbol, `rsi_14d is out of range (0–100): ${rsi}`);
      } else if (rsiSignal === "oversold" && !(rsi < 30)) {
        pushIssue(symbol, `rsi_signal is "oversold" but rsi_14d is ${rsi} (expected < 30)`);
      } else if (rsiSignal === "overbought" && !(rsi > 70)) {
        pushIssue(symbol, `rsi_signal is "overbought" but rsi_14d is ${rsi} (expected > 70)`);
      } else if (rsiSignal === "neutral" && (rsi < 30 || rsi > 70)) {
        pushIssue(symbol, `rsi_signal is "neutral" but rsi_14d is ${rsi} (expected 30–70)`);
      }
    }

    const maFields = [
      { ma: "ma_20d", pct: "price_vs_ma_20_pct" },
      { ma: "ma_50d", pct: "price_vs_ma_50_pct" },
      { ma: "ma_200d", pct: "price_vs_ma_200_pct" },
    ];
    for (const { ma, pct } of maFields) {
      const maValue = coin?.[ma];
      const pctValue = coin?.[pct];

      if (maValue !== null && maValue !== undefined && !isFiniteNumber(maValue)) {
        pushIssue(symbol, `${ma} is not a number (${String(maValue)})`);
        continue;
      }
      if (maValue !== null && maValue !== undefined && isFiniteNumber(maValue) && maValue <= 0) {
        pushIssue(symbol, `${ma} is not > 0 (${maValue})`);
      }

      if (pctValue !== null && pctValue !== undefined && !isFiniteNumber(pctValue)) {
        pushIssue(symbol, `${pct} is not a number (${String(pctValue)})`);
        continue;
      }

      if (
        isFiniteNumber(price) &&
        isFiniteNumber(maValue) &&
        isFiniteNumber(pctValue)
      ) {
        const expectedPct = computePctVs(price, maValue);
        if (expectedPct !== null && !closeEnough(pctValue, expectedPct, 0.08)) {
          pushIssue(
            symbol,
            `${pct} looks inconsistent (stored ${pctValue.toFixed(4)} vs expected ${expectedPct.toFixed(4)})`
          );
        }
      }
    }

    const distHigh = coin?.distance_from_high;
    if (distHigh !== null && distHigh !== undefined && !isFiniteNumber(distHigh)) {
      pushIssue(symbol, `distance_from_high is not a number (${String(distHigh)})`);
    }
    const distLow = coin?.distance_from_low;
    if (distLow !== null && distLow !== undefined && !isFiniteNumber(distLow)) {
      pushIssue(symbol, `distance_from_low is not a number (${String(distLow)})`);
    }
  }

  const blue = report?.blue_chip_opportunities || null;
  const opps = Array.isArray(blue?.opportunities) ? blue.opportunities : [];
  let blueChecked = 0;
  for (const opp of opps) {
    const symbol = String(opp?.symbol || "").trim() || String(opp?.coin_gecko_id || "").trim() || "?";
    blueChecked += 1;

    const rsi = opp?.rsi;
    if (rsi !== null && rsi !== undefined) {
      if (!isFiniteNumber(rsi)) {
        pushIssue(symbol, `blue chip rsi is not a number (${String(rsi)})`);
      } else if (rsi < 0 || rsi > 100) {
        pushIssue(symbol, `blue chip rsi is out of range (0–100): ${rsi}`);
      }
    }

    const signals = Array.isArray(opp?.signals) ? opp.signals : [];
    for (const s of signals) {
      const text = String(s || "");
      const match = text.match(/RSI oversold\s*\((\d+(?:\.\d+)?)\)/i);
      if (!match) continue;
      const n = Number(match[1]);
      if (Number.isFinite(n) && isFiniteNumber(rsi) && n !== Math.round(rsi)) {
        pushIssue(symbol, `blue chip RSI text (${n}) does not match rsi value (${rsi})`);
      }
    }
  }

  console.log("TA sanity check");
  console.log(`- Report: ${path.relative(process.cwd(), reportPath)}`);
  console.log(`- Coins checked: ${coins.length} (with entry_score: ${scoredCoins})`);
  console.log(`- Blue chip opportunities checked: ${blueChecked}`);
  console.log(`- Issues found: ${issues.length}`);

  if (issues.length > 0) {
    console.log("");
    console.log("First issues:");
    for (const issue of issues.slice(0, 20)) {
      console.log(`- ${issue.symbol}: ${issue.message}`);
    }
    if (issues.length > 20) {
      console.log(`- ...and ${issues.length - 20} more`);
    }
    process.exit(1);
  }

  console.log("- Result: PASS");
  process.exit(0);
}

main();

