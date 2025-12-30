# DeFi Protocol Scanner (v1)

## V1 Decisions (final)

**Chains**
- Ethereum + Solana

**Output**
- A Markdown report file (one page)

**Run cadence**
- Run locally ~2x per week (manual run)

**Minimum size filter**
- Default include: protocols with TVL >= $10m
- Exceptions: a small "watch" bucket for $3m-$10m only if momentum is strong (e.g., big 30-day growth)

---

## What the app does

A local app you run on your PC that:
- Refreshes data
- Scores protocols
- Writes a one-page Markdown report
- Saves historical snapshots in a local DB (SQLite) so week-to-week comparison is meaningful

---

## What it stores locally (SQLite)

- Projects: protocol name, chain(s), category, links
- Snapshots: metrics per run (so you can compare week-to-week)
- Scores + reasons (so you trust the results)
- Optional notes: your manual comments

---

## Data inputs (v1, free-first)

Pull these per protocol:

### Traction
- TVL (current)
- 7d and 30d TVL change (momentum)

### Market quality (token metrics)
- Token market cap + 24h volume (via CoinGecko)
- Liquidity health proxy: volume relative to market cap

### Dev health (only when linkable)
- Last release date or last commit date
- Commits in last 30 days

### Security maturity (light-touch v1)
- Audit link exists? (yes/no/unknown)
- Past hack known? (yes/no/unknown)

### Token risk
- Mostly unknown in v1 (until a reliable unlock source is added later)
- Should not dominate scoring in v1

---

## Scoring rubric (v1)

Score out of 100:
- Traction: 40
- Dev health: 20
- Security maturity: 15
- Market quality: 15
- Token risk: 10

Rules:
- If data is missing: mark **Unknown** and do not heavily penalize.

### Hard red-flag overrides
Even if the score is high, drop into **Avoid** if:
- Obvious market-trap signals (extreme low volume / impossible to exit)
- Clearly dead dev activity for a long period (and no reason why)
- TVL collapsing hard with no recovery trend

---

## Report format

Save as: `reports/YYYY-MM-DD_defi_scan.md`

Sections:
- Top 10 candidates (table with score + key reasons)
- Watchlist (good momentum but missing data / newer)
- Avoid (red flags)
- Biggest movers since last run (score change + why)
- Deep dive links (docs, GitHub, audits)

Each protocol entry includes:
- Score + subscores
- Why it scored this (3-6 plain-language bullets)

---

## Discovery mode (universe selection)

How it finds ~50-100:
- Pull a broad DeFi protocol directory list
- Filter to Ethereum + Solana
- Apply the TVL filter
- De-duplicate
- Keep a stable "universe" list so week-to-week comparison is meaningful

Controls:
- Pin projects to your watchlist
- Ignore noisy ones

---

## UI screens (future)

- Dashboard (Run Scan, last run time, quick stats)
- Protocol List (filters by chain/category, add to Watchlist, Ignore)
- Protocol Detail (metrics, links, score breakdown, notes)
- Scoreboard (sortable by total score and subscores)
- Reports (list past Markdown reports, open locally)

---

## Cursor build prompt (for later)

Build a local "DeFi Protocol Scanner" app that runs on my PC.

Chains: Ethereum + Solana.

Run button: "Run Scan".

Store all results locally in SQLite.

On each run: fetch protocol list (discovery), fetch metrics, compute scores, and generate a single Markdown report file.

Track historical snapshots so the UI can show "change since last run" and "30d trend".

Provide screens:
- Dashboard (Run Scan, last run time, quick stats)
- Protocol List (filters by chain/category, add to Watchlist, Ignore)
- Protocol Detail (metrics, links, score breakdown, notes)
- Scoreboard (sortable by total score and subscores)
- Reports (list of past Markdown reports, open locally)

Scoring rubric out of 100:
- Traction 40, Dev 20, Security 15, Market quality 15, Token risk 10.

If data missing: mark Unknown; don't heavily penalise.

Red-flag overrides: very low volume/liquidity trap, dead dev activity, sharp sustained TVL collapse.

Output: save Markdown to `/reports` with date in filename. Include Top 10, Watchlist, Avoid, Movers, and links.

