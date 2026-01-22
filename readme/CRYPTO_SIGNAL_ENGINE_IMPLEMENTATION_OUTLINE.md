# Crypto Signal Engine — Implementation Outline (Narrowed Spec)

Date: 2026-01-22

## Plain-English summary

- This adds a **new “fundamentals monitor”** next to the existing scanner.
- It tracks a **small, fixed list** of projects in **3 niches** and watches **hard-to-fake signals** (usage that people pay for, revenue vs incentives, reliability, RWA issuer diversity).
- It is **not a trading bot** and it does **not** create price-based alerts.

## Current status in this repo (v0 implemented)

- The Signal Engine now runs as a separate script: `src/signal_engine.js`
- It writes a report to:
  - `reports/signal_engine/SignalEngine.md`
  - `reports/signal_engine/SignalEngine.json`
- It also writes suggestions to:
  - `reports/signal_engine/signal_engine_candidate_suggestions.json`
  - `reports/signal_engine/signal_engine_projects.pending.json` (review-only)
- It shows up on the dashboard as a new section: `reports/Dashboard.html`
- The dashboard also shows **Suggested for Signal Engine** (top 5 per niche, needs approval).
- Discovery items now show a small “Signal Engine: in-scope” hint when they match your niche category lists (AI Compute / RWA / Picks & Shovels).

How to run it (local):
1) Run the normal scan: `.\run.ps1` (or `.\Run Scanner.bat`)
2) Open: `reports/Dashboard.html`

How to choose your 7 candidates:
1) Open: `config/signal_engine_projects.json`
2) Edit the 3/2/2 candidate list (this is not a buy list)

How to approve a suggestion:
1) Run: `node src/signal_engine_promote.js list`
2) Promote one: `node src/signal_engine_promote.js promote <coingecko-id>`

Optional data registry:
- Add known sources in `config/signal_engine_metric_registry.json`
  - `statusPageUrl`, `utilizationSource`, `feesSource`, `emissionsSource`, `assetValueSource`, `issuerSource`

Definitions (1 line each):
- **Candidate**: a project we decide to track on purpose.
- **Signal**: a pattern that matters (example: “paid usage is rising for months”).
- **Metric**: the number we measure (example: “protocol revenue per day”).
- **Proxy**: a “best available” stand-in when the perfect metric is not public yet.
- **Cadence**: how often we refresh a metric.

---

## 1) Scope (fixed)

### Niches + slots
- **AI Compute**: 3 candidates
- **RWA (Real-World Assets)**: 2 candidates
- **Picks & Shovels (Data / Infra)**: 2 candidates

### Entry criteria (all niches)

A project becomes a candidate only if **at least 2 are true**:
- Generates protocol fees or revenue
- Has non-trivial usage from non-insiders
- Serves a real external customer (business, dev team, institution)

Important rule:
- Candidates are tagged by niche and **not compared “globally”** across niches.

---

## 2) How this fits into this repo (recommended approach)

Current repo behavior (today):
- `src/index.js` runs the watchlist scan and writes reports like `reports/Dashboard.html`.
- Scheduled runs use `run_scheduled.ps1` and `.github/workflows/daily-scan-pages.yml`.

How we incorporate the Signal Engine (proposal):
- Add a **separate daily job** (new Node script) that writes to `reports/signal_engine/`.
- Optionally add a **new section** inside `reports/Dashboard.html` (so everything is in one place).

Why “separate job” first:
- Keeps the new fundamentals engine from accidentally breaking the existing watchlist scanner.
- Lets us iterate on data sources and confidence scoring without touching trading/price logic.

---

## 3) Outputs (what you will see)

Recommended new files (generated daily):
- `reports/signal_engine/SignalEngine.json` (full structured data)
- `reports/signal_engine/SignalEngine.md` (plain-English summary)
- `reports/signal_engine/Alerts.json` and `reports/signal_engine/Alerts.md` (only the allowed alert types)

Optional dashboard integration:
- Add a “**Signal Engine (Fundamentals)**” section in `reports/Dashboard.html`
  - One table per niche (AI Compute / RWA / Picks & Shovels)
  - Each row: project, status, 3 scores, the 7 signals (good/ok/bad), last update, confidence

---

## 4) Data model (minimal, matches your spec)

We can store this as a small SQLite file (single local database file).
- Suggested path: `reports/signal_engine/signal_engine.sqlite`

Tables (simple meaning):
- `projects`: the candidates (name, niche, IDs, notes)
- `metric_registry`: the “dictionary” of metrics (what a metric means + how often to refresh it)
- `metrics`: which metrics apply to which projects (and any per-project overrides)
- `project_metrics_daily`: daily metric values (with source + confidence)
- `signals`: computed signal states (improving/stable/worsening + explanation)
- `alerts`: deduped alerts (only the allowed alert types)

Each daily metric row stores (per your spec):
- `value`
- `source`
- `confidence` (high / medium / low)
- `last_updated`

Note:
- This repo currently uses lots of JSON snapshots. SQLite is optional, but it will make “trend over months” work much better.

---

## 5) Signals (exact set) + what data we need

### A) AI Compute — 3 signals

AI-1: Paid Utilization Proxy
- Metric: paid compute jobs OR paid inference calls (on-chain or billing proxy)
- Signal: sustained growth over 30–90 days
- Data challenge: many teams don’t publish “paid job count”
- Practical approach:
  - **Best**: protocol-specific “jobs / calls” endpoints (per project)
  - **Fallback proxy (low confidence)**: on-chain fees/revenue related to compute usage

AI-2: Revenue vs Incentives Ratio
- Metric: protocol revenue ÷ emissions
- Signal: ratio improving quarter-over-quarter
- Data challenge: “emissions” is not always a clean API value
- Practical approach:
  - Revenue: DefiLlama fees/revenue where available, or Token Terminal if you use it
  - Emissions: start with a small manual table per project (then automate later)

AI-3: Reliability Trend
- Metric: incident count + severity over time
- Signal: declining incident frequency over rolling windows
- Practical approach (low-noise):
  - Start with a simple manual incident log (date, severity, link)
  - Optional upgrade: scrape a public status page RSS/Atom if the project has one

### B) RWA — 2 signals

RWA-1: Assets Under Tokenization (AUT) Growth
- Metric: total on-chain value of tokenized assets
- Signal: steady asset growth across quarters
- Practical approach:
  - Pull from an RWA dataset (example: RWA-focused APIs) if available
  - Or compute from a curated list of asset tokens (supply × price) as a fallback

RWA-2: Issuer Diversity
- Metric: number of active issuers + top-5 concentration
- Signal: declining concentration over time
- Practical approach:
  - Same dataset as RWA-1 (issuer list + asset values)
  - Compute: top-5 share and count of issuers with meaningful size

### C) Picks & Shovels — 2 signals

PS-1: Revenue Retention Proxy
- Metric: protocol revenue stability across market cycles
- Signal: revenue holds up during market drawdowns
- Practical approach:
  - Use existing “market phase” context already in this repo (BTC + sentiment)
  - Measure revenue drop during a defined “drawdown window”
  - No price alerts; price is only used to define the “downturn period”

PS-2: Revenue per User / Client
- Metric: revenue ÷ active clients (proxy)
- Signal: increasing over time
- Data challenge: “active clients” is rarely public
- Practical approach:
  - Per-project client proxy (defined in config), examples:
    - unique paying addresses
    - unique contracts calling an oracle/feed
    - number of paying API keys (only if published)
  - If we can’t measure clients yet: keep the signal but mark confidence low

---

## 6) Alerts (non-noisy, only these)

Allowed alert types:
- “Revenue ↑ while incentives ↓”
- “Utilization stable post-reward reduction”
- “Incident rate improving”
- “New RWA issuer added”
- “Issuer concentration worsened materially”
- “Revenue resilience during drawdown”

Anti-noise rules (recommended):
- Never alert on a single-day move
- Require confirmation (example: 7-day average) before alerting
- Deduplicate alerts (same project + same alert type + same cause)

---

## 7) Scoring + status (simple and interpretable)

Each project has 3 scores (0–100):
- Growth Score: revenue/usage trend
- Quality Score: revenue vs incentives + stability (less “spiky” = higher)
- Survivability Score: concentration risk + incentive dependency

Overall project status:
- **Monitor**: weak or noisy signals
- **Warming Up**: 2+ improving signals
- **Conviction Building**: signals persist 2+ quarters
- **Thesis Broken**: key signal reverses

Implementation note:
- We can compute scores from the 7 signals directly (transparent, easy to trust).

---

## 8) Configuration files (what we would add)

Proposed new config (human-editable):
- `config/signal_engine_projects.json`
  - Your 7 candidates, niche tags, and “how to fetch” notes per metric
- `config/signal_engine_metric_registry.json`
  - Definition of metrics (name, unit, cadence, default confidence)
- Optional (if we start manual for missing data):
  - `config/signal_engine_incidents.json`
  - `config/signal_engine_emissions_overrides.json`

---

## 9) Phased implementation plan (so we don’t boil the ocean)

Phase 0 (paper design)
- Pick the initial 7 candidates (3/2/2).
- Decide the “best available” data source per signal per project.

Phase 1 (data collection)
- Collect daily metric values with caching.
- Store daily history (SQLite or JSON snapshots).

Phase 2 (signals + scores)
- Compute the 7 signals (improving/stable/worsening).
- Compute the 3 scores + status labels.

Phase 3 (alerts)
- Implement the 6 alert types with de-duplication.
- Write `reports/signal_engine/Alerts.md` in plain English.

Phase 4 (dashboard)
- Add a dashboard section (or a separate HTML report) that stays low-noise.

---

## 10) Decisions to make (we’ll do these one-by-one)

The 2 biggest decisions that affect everything:
- Do we store history in **SQLite** (recommended) or stay with **JSON-only**?
- Do we run this as a **separate script** first, or **merge into `src/index.js`** right away?
