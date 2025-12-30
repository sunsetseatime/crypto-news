# Features Roadmap: Backtesting, Diff Report, Portfolio Mode

This document specifies three new features for the Crypto Watchlist Scanner. Each feature is designed to be implemented independently but works best when combined.

**Priority Order:**
1. **Diff Report** – Quick win, high daily value
2. **Portfolio Mode** – Makes scanner personal and actionable
3. **Backtesting Module** – Proves the scanner works over time

---

## Feature 1: Backtesting Module

### Overview
Track the scanner's predictions over time and measure accuracy. Answers: *"Does this scanner actually help me make money?"*

### Goals
- Record predictions at scan time
- Track price outcomes after 7, 14, and 30 days
- Generate accuracy reports grouped by hygiene label
- Identify which flags are most predictive

### Data Model

#### Prediction Record Schema
Each prediction should capture the following fields:

```json
{
  "prediction_id": "2025-12-24T18-39-33Z_ZK",
  "symbol": "ZK",
  "name": "zkSync",
  "coin_gecko_id": "zksync",
  "scan_date": "2025-12-24T18:39:33.000Z",
  "price_at_scan": 0.22,
  "market_cap_at_scan": 850000000,
  "volume_24h_at_scan": 45000000,
  "hygiene_label": "KEEP",
  "flags": {
    "chasing": false,
    "unlock_risk": false,
    "high_concentration_risk": false,
    "has_clean_catalyst": true,
    "low_liquidity": false,
    "high_dilution_risk": false
  },
  "outcomes": {
    "price_7d": null,
    "price_14d": null,
    "price_30d": null,
    "return_7d_pct": null,
    "return_14d_pct": null,
    "return_30d_pct": null,
    "outcome_updated_at": null
  }
}
```

### File Structure

```
reports/
  backtest/
    predictions.json       # Array of all prediction records
    BacktestReport.md      # Human-readable accuracy report
    BacktestReport.json    # Machine-readable accuracy stats
```

### Implementation Steps

#### Step 1: Record Predictions
**When:** Runs automatically after every scan (in `src/index.js`)

1. After `Layer1Report.json` is generated, iterate through all coins
2. For each coin with valid price data, create a prediction record
3. Use `{scan_date_iso}_{symbol}` as the unique `prediction_id`
4. Append to `reports/backtest/predictions.json` (create if doesn't exist)
5. Skip if a prediction with the same ID already exists (idempotent)

#### Step 2: Track Outcomes
**When:** Runs automatically with every scan OR via separate command

1. Load `predictions.json`
2. Find predictions where:
   - `outcomes.price_7d` is null AND scan_date is >= 7 days ago
   - `outcomes.price_14d` is null AND scan_date is >= 14 days ago
   - `outcomes.price_30d` is null AND scan_date is >= 30 days ago
3. Fetch current prices from CoinGecko for those coins
4. Calculate returns: `((current_price - price_at_scan) / price_at_scan) * 100`
5. Update the prediction record with outcome data
6. Save updated `predictions.json`

#### Step 3: Generate Accuracy Report
**When:** After outcomes are updated

1. Group predictions by `hygiene_label` (KEEP, WATCH-ONLY, DROP)
2. For each group, calculate:
   - Count of predictions
   - Average return at 7d, 14d, 30d
   - Win rate (% of predictions with positive return)
   - Best prediction (highest return)
   - Worst prediction (lowest return)
3. Calculate flag effectiveness:
   - For each flag (catalyst, unlock_risk, etc.), compare returns when flag=true vs flag=false
4. Generate `BacktestReport.md` with summary tables

### Output: BacktestReport.md

```markdown
# Backtest Report

Generated: 2025-01-15T10:00:00Z
Predictions tracked: 150
Oldest prediction: 2024-12-01

## Accuracy by Label

| Label | Count | Avg 7d | Avg 14d | Avg 30d | Win Rate (14d) |
|-------|-------|--------|---------|---------|----------------|
| KEEP | 45 | +8.2% | +12.5% | +18.3% | 78% |
| WATCH-ONLY | 80 | +2.1% | +4.3% | +6.1% | 55% |
| DROP | 25 | -3.5% | -8.2% | -12.4% | 28% |

## Flag Effectiveness

| Flag | With Flag | Without Flag | Edge |
|------|-----------|--------------|------|
| has_clean_catalyst | +15.2% | +5.1% | +10.1% |
| unlock_risk | -4.3% | +8.7% | -13.0% |
| high_concentration_risk | -2.1% | +7.2% | -9.3% |

## Best Predictions (14d)
1. MORPHO: KEEP → +45% (catalyst: v2 launch)
2. ZK: KEEP → +32% (clean entry, no flags)

## Worst Predictions (14d)
1. XYZ: KEEP → -25% (unlock risk triggered after scan)
2. ABC: WATCH-ONLY → -18% (whale dump)
```

### CLI Command (Optional)
```bash
# Update outcomes and generate report
node src/backtest.js

# Just view current stats (no fetch)
node src/backtest.js --report-only
```

---

## Feature 2: Watchlist Diff Report

### Overview
Show what changed since the last scan instead of the full report. Answers: *"What's new today?"*

### Goals
- Compare current scan to previous scan
- Detect label changes, new flags, cleared flags
- Prioritize changes by severity
- Add "Changes Since Last Run" section to Summary.md

### Change Types

| Change Type | Severity | Example |
|-------------|----------|---------|
| Label downgrade | 🚨 CRITICAL | KEEP → DROP |
| Label upgrade | ✅ POSITIVE | DROP → KEEP |
| New risk flag triggered | ⚠️ WARNING | unlock_risk: false → true |
| Risk flag cleared | ✅ POSITIVE | chasing: true → false |
| Catalyst detected | ℹ️ INFO | has_clean_catalyst: false → true |
| Significant price move | ℹ️ INFO | Price changed > ±10% |
| New coin in watchlist | ℹ️ INFO | First appearance |
| Coin removed from watchlist | ℹ️ INFO | Was present, now gone |

### Severity Ranking
1. **🚨 CRITICAL** – Requires immediate attention
   - Label downgrade (KEEP → WATCH-ONLY, KEEP → DROP, WATCH-ONLY → DROP)
   - Unlock risk triggered on a portfolio coin (if portfolio mode enabled)
   
2. **⚠️ WARNING** – Should review soon
   - Any label change
   - New risk flag: unlock_risk, high_concentration_risk, chasing, low_liquidity
   
3. **✅ POSITIVE** – Good news
   - Label upgrade
   - Risk flag cleared
   - Catalyst detected
   
4. **ℹ️ INFO** – FYI
   - Price moved significantly
   - New/removed coins

### Implementation Steps

#### Step 1: Load Previous Scan
1. Check `reports/history/watchlist/` for the most recent `*_Layer1Report.json`
2. If no previous scan exists, skip diff generation (first run)
3. Parse the previous report into a Map keyed by symbol

#### Step 2: Compare Coins
For each coin in current scan:
1. Check if coin exists in previous scan
2. If new coin: record as "NEW_COIN" change
3. If exists: compare fields:
   - `hygiene_label` (string equality)
   - `chasing` (boolean)
   - `unlock_risk_flag` (boolean)
   - `high_concentration_risk` (boolean)
   - `has_clean_catalyst` (boolean)
   - `low_liquidity` (boolean)
   - `price` (% change > 10%)

For each coin in previous scan but NOT in current:
1. Record as "REMOVED_COIN" change

#### Step 3: Build Change List
```json
{
  "previous_scan_date": "2025-12-23T18:29:20Z",
  "current_scan_date": "2025-12-24T18:39:33Z",
  "changes": [
    {
      "symbol": "ZK",
      "severity": "CRITICAL",
      "type": "LABEL_DOWNGRADE",
      "description": "Label changed KEEP → WATCH-ONLY",
      "details": {
        "previous_label": "KEEP",
        "current_label": "WATCH-ONLY",
        "reason": "unlock_risk triggered"
      }
    },
    {
      "symbol": "EIGEN",
      "severity": "WARNING",
      "type": "FLAG_TRIGGERED",
      "description": "New flag: high_concentration_risk",
      "details": {
        "flag": "high_concentration_risk",
        "previous": false,
        "current": true
      }
    }
  ]
}
```

#### Step 4: Inject into Summary.md
Add a new section at the TOP of Summary.md (before AI Supervisor Summary):

```markdown
## Changes Since Last Run
Previous scan: 2025-12-23 18:29 UTC

### 🚨 Critical (1)
- **ZK**: Label changed KEEP → WATCH-ONLY (unlock risk triggered)

### ⚠️ Warning (2)
- **EIGEN**: New flag: high_concentration_risk
- **TAIKO**: Chasing flag triggered (7d +45%)

### ✅ Positive (1)
- **MORPHO**: Catalyst detected (GitHub release Dec 22)

### ℹ️ Info (1)
- **IO**: Price +15% since last scan

---
```

### File Changes
- Modify `src/index.js` to:
  1. Load previous scan before generating summary
  2. Compute diff
  3. Pass diff to `buildSummary()` function
  4. Optionally save `reports/DiffReport.json` for programmatic access

### Edge Cases
- **First run:** No previous scan exists → Skip diff section, show "First scan - no previous data"
- **Coin renamed:** Match by `coin_gecko_id` not just `symbol`
- **Multiple scans same day:** Use most recent previous scan that is NOT the current scan

---

## Feature 3: Portfolio Mode

### Overview
Input your actual holdings. Prioritize warnings for coins you own. Answers: *"Should I be worried about MY money?"*

### Goals
- Track user's actual holdings with entry prices
- Calculate unrealized P&L
- Prioritize portfolio coins in diff report
- Warn about concentration risk
- Show portfolio health summary

### Data Model

#### Portfolio Config Schema
File: `config/portfolio.json`

```json
{
  "schema_version": 1,
  "updated_at": "2025-12-24T10:00:00Z",
  "holdings": [
    {
      "symbol": "ZK",
      "coin_gecko_id": "zksync",
      "amount": 1000,
      "entry_price_usd": 0.15,
      "entry_date": "2025-11-15",
      "notes": "Bought on Binance"
    },
    {
      "symbol": "EIGEN",
      "coin_gecko_id": "eigenlayer",
      "amount": 500,
      "entry_price_usd": 3.50,
      "entry_date": "2025-12-01",
      "notes": ""
    }
  ]
}
```

#### Enriched Portfolio Data (computed at scan time)
```json
{
  "symbol": "ZK",
  "coin_gecko_id": "zksync",
  "amount": 1000,
  "entry_price_usd": 0.15,
  "current_price_usd": 0.22,
  "entry_value_usd": 150,
  "current_value_usd": 220,
  "unrealized_pnl_usd": 70,
  "unrealized_pnl_pct": 46.67,
  "percent_of_portfolio": 35.5,
  "hygiene_label": "KEEP",
  "flags": {
    "chasing": false,
    "unlock_risk": false
  },
  "warnings": []
}
```

### Implementation Steps

#### Step 1: Load Portfolio
1. Check if `config/portfolio.json` exists
2. If not, portfolio mode is disabled (graceful degradation)
3. Validate schema, warn on invalid entries
4. Build a Map of holdings keyed by `coin_gecko_id`

#### Step 2: Enrich Portfolio Data
During scan, for each coin in Layer1Report:
1. Check if coin is in portfolio
2. If yes, calculate:
   - `current_value_usd = amount * current_price`
   - `entry_value_usd = amount * entry_price_usd`
   - `unrealized_pnl_usd = current_value - entry_value`
   - `unrealized_pnl_pct = (pnl / entry_value) * 100`
3. After all coins processed:
   - `total_portfolio_value = sum of all current_value_usd`
   - `percent_of_portfolio = (coin_value / total_value) * 100`

#### Step 3: Generate Warnings
For each portfolio holding:
- **Concentration Warning:** `percent_of_portfolio > 30%`
- **Label Warning:** `hygiene_label != "KEEP"`
- **Risk Flag Warning:** Any risk flag is true (unlock_risk, concentration, chasing)
- **Loss Warning:** `unrealized_pnl_pct < -20%`

#### Step 4: Modify Diff Report
When generating the diff report:
1. Check if changed coin is in portfolio
2. If yes, prepend 💰 icon and mark as higher priority
3. Portfolio coins with CRITICAL/WARNING changes always appear first

#### Step 5: Add Portfolio Summary to Summary.md
New section in Summary.md:

```markdown
## Your Portfolio

| Coin | Amount | Entry | Current | P&L | % Portfolio | Label | Warnings |
|------|--------|-------|---------|-----|-------------|-------|----------|
| 💰 ZK | 1,000 | $0.15 | $0.22 | +46.7% | 35% | KEEP | concentration |
| 💰 EIGEN | 500 | $3.50 | $3.20 | -8.6% | 26% | WATCH-ONLY | label, unlock_risk |
| 💰 TAIKO | 2,000 | $1.80 | $1.95 | +8.3% | 39% | WATCH-ONLY | concentration, chasing |

**Total Value:** $620.00
**Total P&L:** +$85.00 (+15.9%)

### ⚠️ Portfolio Warnings
- **Concentration Risk:** TAIKO is 39% of portfolio (max recommended: 30%)
- **Concentration Risk:** ZK is 35% of portfolio
- **Label Warning:** EIGEN is WATCH-ONLY with unlock_risk flag
- **Label Warning:** TAIKO is WATCH-ONLY with chasing flag
```

### File Changes
- New file: `config/portfolio.json` (user-created)
- Modify `src/index.js`:
  1. Load portfolio at start
  2. Enrich portfolio data after scan
  3. Pass portfolio to `buildSummary()` and diff functions
  4. Add portfolio summary section to output

### CLI Commands (Optional)
```bash
# Add a holding
node src/portfolio.js add ZK 1000 --entry-price 0.15 --entry-date 2025-11-15

# Remove a holding
node src/portfolio.js remove ZK

# List holdings
node src/portfolio.js list

# Show portfolio value (uses cached prices)
node src/portfolio.js value
```

### Edge Cases
- **Coin not in watchlist:** Warn user that portfolio coin is not being scanned
- **Missing entry price:** Calculate P&L as "unknown", still show current value
- **Zero amount:** Ignore holding (treat as removed)
- **Duplicate entries:** Merge amounts, use earliest entry date, average entry price

---

## Integration: How Features Work Together

```
┌─────────────────────────────────────────────────────────────────┐
│                         SCAN FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Load config/watchlist.json                                  │
│  2. Load config/portfolio.json (if exists)                      │
│  3. Load previous Layer1Report.json (for diff)                  │
│                                                                  │
│  4. Fetch market data (CoinGecko, DefiLlama, etc.)             │
│  5. Score coins, assign labels                                  │
│                                                                  │
│  6. BACKTEST: Record predictions to predictions.json            │
│  7. BACKTEST: Update outcomes for old predictions               │
│                                                                  │
│  8. DIFF: Compare to previous scan, build change list           │
│  9. DIFF: Prioritize portfolio coins in changes                 │
│                                                                  │
│  10. PORTFOLIO: Enrich with holdings data                       │
│  11. PORTFOLIO: Calculate P&L, concentration warnings           │
│                                                                  │
│  12. Generate Summary.md with:                                  │
│      - Changes Since Last Run (top)                             │
│      - Your Portfolio section                                    │
│      - Standard watchlist table                                  │
│      - AI Supervisor summary                                     │
│                                                                  │
│  13. Save all reports to reports/                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Suggested Implementation Order

### Phase 1: Diff Report (Estimated: 2-3 hours)
- Highest daily value, lowest complexity
- Foundation for portfolio prioritization

### Phase 2: Portfolio Mode (Estimated: 3-4 hours)
- Builds on diff report
- Makes scanner personal

### Phase 3: Backtesting (Estimated: 4-6 hours)
- Most complex, requires outcome tracking
- Highest long-term value for proving scanner works

---

## Success Metrics

| Feature | Success Metric |
|---------|---------------|
| Diff Report | Time to review daily scan drops from 5 min → 30 sec |
| Portfolio Mode | User catches a warning on a held coin before losing money |
| Backtesting | KEEP coins outperform WATCH-ONLY by >5% over 14 days |

---

## Open Questions

1. **Backtest frequency:** Track outcomes daily, or only when scan runs?
2. **Portfolio sync:** Should holdings auto-update from exchange APIs?
3. **Alerting:** Add optional Telegram/Discord alerts for CRITICAL changes?
4. **Historical portfolio:** Track portfolio value over time for charts?

