# Crypto Watchlist Daily Scanner

A **disciplined, rules-based crypto scanner** designed to identify projects that could rise while avoiding the classic retail traps: chasing pumps, getting dumped on by unlocks, and falling for hype without substance.

## Philosophy

> **Layer 1 is the truth** (deterministic, rules-based).  
> **Layer 2 is the narrator** (optional AI summary). It must never invent facts.

This scanner is built on the principle that most retail traders lose money because they:
1. Chase coins that have already pumped 40%+ without a real catalyst
2. Buy into low-volume moves that reverse immediately
3. Get dumped on by VC/team token unlocks
4. Fall for hype and rumors instead of verifiable events

The scanner systematically filters these traps out.

## What It Does

For each coin on your watchlist, the scanner:

| Check | What It Detects |
|-------|-----------------|
| **Volume Confirmation** | Is 24h volume above 7-day average? Price moves without volume are traps. |
| **TA: Volume + Price Structure** | RVOL (today vs 20-day average), trend regime (uptrend/downtrend/range), key levels, and event tags (breakout / reclaim / capitulation / distribution). |
| **Chasing Detection** | Is the coin up >40% (7d) or >20% (24h) without a real catalyst? |
| **Dilution Risk** | Is float <20%? Is FDV >> Market Cap? Are unlocks imminent? |
| **Liquidity Check** | Is there enough volume ($5M+) to actually trade without slippage? |
| **Catalyst Validation** | Is there a real, verifiable event within 14 days with a source link? |

Each coin receives a hygiene label:
- **KEEP (Ready)**: Passed the safety + quality checks, so it’s on your short list. This is **not** an automatic “buy” signal — use **Action** (Buy now / Wait for dip) for timing.
- **WATCH-ONLY**: Interesting, but **something blocks action** right now (example: unlock risk, dilution risk, high ownership concentration, negative news pressure, or weak price/volume structure).
- **DROP (Avoid)**: Fails basic checks (too hard to trade, missing critical data, or serious red flags). Best to skip/remove.

## TA outputs (volume + price structure)

In the dashboard, each coin row shows a compact TA (technical analysis) summary under **Notes** (no click needed).

Click a coin row to see the full TA details + reasons. You can also hover the TA line for a short explanation (a "tooltip" = a small pop-up text box).

- **Regime**: Uptrend / Downtrend / Range (based on higher highs/lows)
- **RVOL**: today's volume compared to its 20-day average ("relative volume")
- **Key levels**: range high/low (recent candles) + breakout/reclaim/hold status
- **Recent tags**: capitulation, relief rally, breakout, failed breakout, distribution
- **Interest Score (0-100)** + **confidence** (higher if cross-venue sanity is enabled)
- **How it affects labels**: confident warning tags (like failed breakout / distribution) can move a coin from KEEP to WATCH-ONLY; strong “hold” setups can help upgrade a near-KEEP coin.

Definitions (1 line each):
- **Candle**: one time period of price action (open/high/low/close)
- **OHLC**: open/high/low/close

Optional settings:
- `SKIP_MARKET_OHLC=1` disables OHLC candles (less TA detail)
- `MARKET_OHLC_DAYS=180` controls how far back candle history goes (allowed: 1, 7, 14, 30, 90, 180, 365)
- `ENABLE_TA_CROSS_VENUE=1` enables a cross-venue sanity check (uses CoinGecko tickers; helps spot venue-specific spikes)

## Quick Start

### Option 1: Double-Click Desktop Shortcut (Easiest!)
1. **Desktop shortcut already created!** Look for "Crypto Scanner" on your desktop
2. Double-click it to run the scanner
3. Reports will open automatically when done

### Option 2: Run from Command Line
```powershell
# Run the scanner
.\run.ps1

# Or directly with Node
node src/signal_engine.js
node src/index.js
node scripts/verify_technical_signals.js

# Or use the batch file
.\Run Scanner.bat

# Or via npm (scan + Signal Engine + automatic sanity check)
npm run scan:watchlist
```

### Option 3: Discover New Coins
```powershell
# Find trending/new coins to add to watchlist
node src/discover.js

# Or double-click
.\Discover Coins.bat
```

**Discovery finds coins that:**
- Are trending on CoinGecko
- Have $5M+ daily volume
- Market cap between $10M-$5B
- Up 5-100% in 7 days (not pump & dump)
- Exclude stablecoins/pegged assets
- Scan more than top 250 (set `DISCOVER_MARKET_PAGES`, default: 5)
- Not already in your main watchlist
- Won't re-suggest coins you marked `IGNORED` or already `PROMOTED`

**Recommended workflow (discovery → staging → promote)**
```powershell
# 1) Run discovery (writes reports + updates the local queue)
node src/discover.js

# 2) List the queue (NEW/STAGED)
node src/promote_discovery.js list

# 3) Stage one or more coins (adds to config/watchlist_staging.json)
node src/promote_discovery.js stage <coingecko-id>

# 4) Run the scanner (it scans main + staging, but keeps them separate in Summary.md)
node src/index.js
node scripts/verify_technical_signals.js

# 5) Promote winners into your main watchlist (or ignore junk)
node src/promote_discovery.js promote <coingecko-id>
node src/promote_discovery.js ignore <coingecko-id>
```

### Option 4: DeFi Protocol Scanner (ETH + SOL)
```powershell
# Run the DeFi protocol scanner
node src/defi_scan.js

# Or double-click
.\Run DeFi Scanner.bat
```

### Option 5: Run Daily Automatically (Windows Task Scheduler)
Creates a daily scheduled task that runs (in order):
1) Discovery (`src/discover.js`)
2) DeFi scan (`src/defi_scan.js`)
3) Watchlist scan (`src/index.js`)

```powershell
# Create/update the daily task (default: 08:00 local time)
.\setup_daily_schedule.ps1

# Pick a different time (24h format)
.\setup_daily_schedule.ps1 -Time "21:30"

# Remove the task
.\setup_daily_schedule.ps1 -Remove
```

Logs are written to `reports/logs/scheduled_*.log`.

### Option 6: Run Daily on GitHub Actions + Publish to GitHub Pages

Runs daily even when your PC is off, and publishes the latest dashboard to a URL.

1) Push this repo to GitHub (main branch)
2) In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**
3) In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Recommended: `COINGECKO_API_KEY` (avoids shared-runner rate limits)
   - Optional: `OPENAI_API_KEY` (enables `SupervisorSummary.json`)
4) Run the workflow once: **Actions → “Daily Scan (Pages)” → Run workflow**

If your repo is private and you’re on GitHub Free, Pages will prompt you to upgrade or make the repo public.
- If you keep it private: the workflow still runs and uploads an artifact you can download (`crypto-news-site`).
- If you’re on a paid plan and Pages is enabled for a private repo: set repo variable `ENABLE_PAGES=1` so the workflow deploys to Pages.

Notes:
- The chat answers from your reports by default.
- Turn on **Research mode** in Chat to pull extra info + links for the selected coin (CoinGecko + GitHub + free RSS news feeds + the project’s blog feed when available).
- Schedule/time is configured in `.github/workflows/daily-scan-pages.yml` (cron is UTC).
- The workflow keeps small state (history/backtest/discovery queue) via Actions cache so “Diff”/backtests work across runs.

### Option 7: Host the Dashboard on Vercel (with a Chat Panel)

If you already use Vercel, this repo also includes a small Next.js app that:
- Shows the latest dashboard UI by loading it from your GitHub Pages site
- Adds a chat panel so you can ask questions in plain English (coin-by-coin or general)

You still keep GitHub Actions as the “daily engine” that generates the reports. Vercel is just the nicer UI host.

**1) Create a Vercel project**
- Import this GitHub repo into Vercel

**2) Set Vercel Environment Variables**
- `REPORTS_BASE_URL` = your GitHub Pages site URL (no trailing slash)  
  Example: `https://<your-user>.github.io/<your-repo>`
- `OPENAI_API_KEY` = your OpenAI key (server-side only)
- `CHAT_PASSWORD` = a strong private password (required, prevents public abuse)
- Optional: `OPENAI_MODEL_CHAT` = defaults to `gpt-4o-mini`
- Optional: `OPENAI_MODEL_CHAT_RESEARCH` = defaults to `gpt-5.2` (used only when Research mode is ON)
- Optional: `COINGECKO_API_KEY` = improves “what does this project do?” answers (avoids public rate limits)

**3) Deploy**
- Open your Vercel URL and click **Chat** (bottom-right)
- Paste the same `CHAT_PASSWORD` into the chat panel once (it saves in your browser)
- Click a coin row to auto-select it, then ask follow-up questions
- Optional: turn on **Research mode** in the chat for deeper info + links (CoinGecko/GitHub/RSS/blog)

Notes:
- The chat is education-focused and answers from your reports (and can pull extra research sources when Research mode is on).
- When it uses news/research links, it will include the publisher name + link so you can verify.
- Exchange wallets are treated as lower “single whale” risk, but only when the report explicitly labels them as an exchange.

## Output

| File | Description |
|------|-------------|
| `reports/Layer1Report.json` | Raw deterministic data for all coins |
| `reports/Summary.md` | Human-readable summary table |
| `reports/MacroPulse.md` | Daily macro pulse (ETF money flow, BTC leverage check, BTC share, alt headlines) |
| `reports/Dashboard.html` | Local dashboard UI (opens in your browser) |
| `reports/signal_engine/SignalEngine.md` | Signal Engine fundamentals report (low-noise, niche-based) |
| `reports/signal_engine/SignalEngine.json` | Signal Engine data (structured JSON) |
| `reports/signal_engine/signal_engine_candidate_suggestions.json` | Signal Engine candidate suggestions (needs approval) |
| `reports/signal_engine/signal_engine_projects.pending.json` | Pending shortlist for review (does not auto-apply) |
| `reports/Alerts.md` | Alerts for this run (high-score / actionable items) |
| `reports/Alerts.json` | Alerts (structured JSON) |
| `reports/SupervisorSummary.json` | AI summary (only if `OPENAI_API_KEY` is set) |
| `reports/DiffReport.json` | Changes since the last run (for “what’s new”) |
| `reports/backtest/BacktestReport.md` | Backtest stats report |
| `reports/backtest/predictions.json` | Prediction history used for backtesting |
| `reports/paper/PaperReport.md` | Paper trading stats (open/closed trades, performance) |
| `reports/paper/PaperReport.json` | Paper trading stats (structured JSON, includes a recent 14-day activity window) |
| `reports/paper/SignalEvents.json` | Logged signal events used for paper trading |
| `reports/paper/PaperTrades.json` | Paper trade ledger (open + closed positions) |
| `reports/defi/Latest.md` | Latest DeFi protocol scan report |
| `reports/defi/snapshots/*.json` | Historical DeFi scan snapshots |
| `reports/MacroPulse.json` | Macro pulse data (flows, leverage, share, alt strength/news) |

## Configuration

### Signal Engine (fundamentals candidates)
Edit `config/signal_engine_projects.json` to choose your fixed 7 candidates:
- 3 = AI Compute
- 2 = RWA
- 2 = Picks & Shovels (Data / Infra)

Optional: add known data sources per project in `config/signal_engine_metric_registry.json`:
- `statusPageUrl`
- `utilizationSource`
- `feesSource`
- `emissionsSource`
- `assetValueSource`
- `issuerSource`

The Signal Engine tries to use the best available **Usage** proxy:
- **DefiLlama fees** (best, when available)
- Otherwise **CoinGecko trading volume** (fallback proxy)

If the dashboard shows **not tracked** for a metric, it usually means we do not have a data source for *that specific metric* yet (example: TVL for some non-DeFi projects).  
`defillama_slug` = the short name in the DefiLlama URL (example: `the-graph`). The Signal Engine tries to auto-detect this, but if it is wrong/missing you can set it in `config/signal_engine_projects.json`.

If you want **more “new projects” per niche**, expand the niche lists in `config/categories.json` (example: add more `coin_gecko_ids` under `rwa`).

Promote a suggested candidate into the tracked 7 (with confirmation):
```powershell
node src/signal_engine_promote.js promote <coingecko-id>
```

### Paper Trading (learning mode)
Paper trading runs automatically on each scan and logs pretend trades so we can learn what signals work.

Edit `config/paper_trading.json`:
- `cooldown_days`: how long to wait before re-entering the same coin after a trade closes (prevents one coin from dominating results).
- `ruleset_mode`: `ab` to split new trades into **Ruleset A vs B** (A/B test), or `a` / `b` to force one ruleset.
- `account_start_usd`: used for the **pretend balance** curve (closed trades only; not limited by cash).
- `styles`: trade styles (targets/stops/time limits).

Note: Ruleset **B** is stricter and uses the TA signals (volume + structure) to avoid obvious “bad entries” like distribution / failed breakouts when data is available.

### Watchlist
Edit `config/watchlist.json` to manage your tracked coins:
```json
{
  "symbol": "ZK",
  "name": "zkSync",
  "coinGeckoId": "zksync",
  "category": "L2",
  "urls": { 
    "official": "https://zksync.io", 
    "x": "https://twitter.com/zksync", 
    "blog": "https://blog.zksync.io", 
    "github": "https://github.com/matter-labs/zksync-era" 
  },
  "notes": ""
}
```

### Staging Watchlist (Discovery Funnel)
Use `config/watchlist_staging.json` as a safe sandbox for newly discovered coins.
- The scanner reads **both** lists on each run.
- `reports/Summary.md` shows **Watchlist** and **Staging Watchlist** separately so your main list stays clean.

Optional:
- Discovery auto-staging is **always on** (the scanner will add a few top discovery picks into staging each run).
- Block specific CoinGecko IDs from being auto-staged by adding them to `config/auto_stage_ignore.json`.

### Address Book (Optional: Label Exchange Wallets)
If a big holder is an exchange wallet, that can look like “one whale” even though it may represent many customers.

You can label known wallets (like exchanges) so reports are clearer:
- File: `config/address_book.json`
- Format:

```json
{
  "entries": [
    {
      "chain": "ethereum",
      "address": "0x1111111111111111111111111111111111111111",
      "label": "Example Exchange (exchange)",
      "category": "exchange"
    }
  ]
}
```

**Important**: 
- Fill in the `github` URL for catalyst detection (GitHub releases)
- Fill in the `blog` URL for RSS feed catalyst detection (the scanner will try common RSS paths like `/feed`, `/rss`, `/feed.xml`)
- The scanner will automatically match projects to DefiLlama for TVL and unlock data

### Environment Variables
Create a `.env` file in the repo root:

```env
# CoinGecko (required for data)
COINGECKO_API_KEY=your_key_here

# OpenAI (optional - for AI supervisor summary)
OPENAI_API_KEY=your_key_here
OPENAI_MODEL_SUPERVISOR=gpt-4o  # Default: gpt-4o (flagship model)

# On-chain holder analysis
# Ethereum (recommended free option - Ethplorer has a public "freekey" tier)
ETHPLORER_API_KEY=freekey
#
# Optional explorer keys (used when available; note some holder endpoints are paid on certain explorers)
ETHERSCAN_API_KEY=your_key_here
BSCSCAN_API_KEY=your_key_here
POLYGONSCAN_API_KEY=your_key_here
ARBISCAN_API_KEY=your_key_here
OPTIMISM_API_KEY=your_key_here
BASESCAN_API_KEY=your_key_here
#
# Covalent/GoldRush (multi-chain holders; trial then paid)
COVALENT_API_KEY=your_key_here

# Optional: label known wallets (exchanges, burn wallets, etc.)
# Defaults to config/address_book.json if unset.
ADDRESS_BOOK_PATH=.\config\address_book.json

# Alerts (local-only)
# - DeFi protocol alert threshold (score out of 100). Set to "off" to disable.
ALERT_DEFI_SCORE_THRESHOLD=70
# - Discovery coin alert threshold (score out of 100). Set to "off" to disable.
ALERT_DISCOVERY_SCORE_THRESHOLD=80
# - Watchlist "actionable" alerts (KEEP + catalyst). Set 0 to disable.
ALERT_ACTIONABLE=1
# - Windows popup when NEW alerts appear (deduped via reports/alert_state.json). Set 1 to enable.
ALERT_POPUP=0

# Take-profit alerts (optional)
# - Targets in % and an "approaching target" buffer (percentage points).
TAKE_PROFIT_TARGET_1=15
TAKE_PROFIT_TARGET_2=30
TAKE_PROFIT_TARGET_3=50
TAKE_PROFIT_APPROACH_BUFFER=2

# Discovery auto-stage (always on)
# - Adds top discovery picks into the staging scan automatically.
# - Control how many/which coins with the settings below.
# - Note: `AUTO_STAGE_DISCOVERY` is no longer used (auto-staging is always enabled).
# - Stage up to N coins per run
AUTO_STAGE_LIMIT=4
# - Only stage when score/flow is strong (defaults shown)
AUTO_STAGE_DISCOVERY_SCORE_MIN=85
AUTO_STAGE_VOLUME_24H_MIN=10000000
AUTO_STAGE_VOL_TO_MCAP_MIN=0.05
AUTO_STAGE_PRICE_CHANGE_7D_MAX=60
# - Cap total auto-staged coins (prevents watchlist bloat)
AUTO_STAGE_MAX_TOTAL=25

# DeFi scan freshness (always auto-runs when Latest.json is missing or stale)
DEFI_STALE_HOURS=24

# Advanced CoinGecko config (usually auto-detected)
COINGECKO_API_KEY_HEADER=x_cg_demo_api_key
```

**Note**: Demo keys (starting with `CG-`) are automatically detected and use the correct endpoint.

## Rate Limits & Caching

- CoinGecko public endpoints rate limit aggressively
- Responses are cached under `reports/cache/` for **6 hours** by default
- If you hit 429 errors:
  - Wait a minute and re-run, or
  - Set `MARKET_CHART_DAYS=30` to pull less price history (faster, fewer chart points), or
  - Set `SKIP_MARKET_CHART=1` to skip per-coin chart calls

## Current Features

The scanner now includes:

| Feature | Status | Data Source |
|---------|--------|-------------|
| Unlock data | ✅ Implemented | DefiLlama Unlocks API (free) - flags unlocks >1% supply or >$10M |
| Catalyst checking | ✅ Implemented | GitHub Releases + RSS Feeds (free) |
| Relative strength vs BTC | ✅ Implemented | CoinGecko market data |
| Traction data (TVL/dev) | ✅ Implemented | DefiLlama TVL + CoinGecko Developer Data (free) |
| **On-chain holder analysis** | ✅ **NEW!** | Ethplorer (Ethereum) + explorers where supported; Covalent/GoldRush fallback. |
| Progress logging | ✅ Implemented | Real-time scan progress |
| Alerts | ✅ **NEW!** | Local thresholds + Dashboard card (`reports/Alerts.md`) |
| Signal Engine (Fundamentals) | ✅ **NEW!** | Usage proxy = DefiLlama fees (when available) or CoinGecko volume (fallback) + TVL (proxy) + manual config (`config/signal_engine_projects.json`) |
| Signal Engine Candidate Suggestions | ✅ **NEW!** | Data-first suggestions + coverage scoring (`signal_engine_candidate_suggestions.json`) |

**Notes**: 
- Some coins may show `unlock_confidence: UNKNOWN` if not listed on DefiLlama
- Catalyst detection works with GitHub repository URLs OR blog RSS feeds in `config/watchlist.json`
- Unlock risk is flagged when unlocks exceed 1% of circulating supply OR $10M value
- **On-chain analysis** uses Ethplorer (Ethereum) and explorer APIs where supported; if a holder endpoint is unavailable, use Covalent/GoldRush as the fallback.
- On-chain holder analysis currently supports EVM chains (Ethereum/BSC/Polygon/Arbitrum/Optimism/Base). Solana token holder analysis is not included in v1.
- The system tries free explorers first, then falls back to Covalent if you have that key set
- Ownership concentration is graded **Low / Medium / High / Unknown** based on how much supply the top holders control (and what type of holders they are).
- `reports/Summary.md` includes an “On-chain Holder Snapshot” section when data is available (top holders + wallet/smart contract hints).
- **Free tier limits**: 5 calls/sec, 100k calls/day per explorer (plenty for daily scanning)

## Creating a Desktop Shortcut (If Needed)

If you need to recreate the desktop shortcut:

**Windows PowerShell:**
```powershell
.\create-shortcut.ps1
```

**Or manually:**
1. Right-click on `Run Scanner.bat`
2. Select "Create shortcut"
3. Drag the shortcut to your desktop
4. Rename it to "Crypto Scanner"

## Detailed Specification

See [SPECIFICATION.md](# Crypto Watchlist Daily Scanner (Determ.md) for the complete design document including:
- All data sources and fallback logic
- Exact thresholds for each flag
- JSON schemas for AI supervisor
- Ranking algorithm details

DeFi protocol scanner v1 spec: `DEFI_PROTOCOL_SCANNER_V1.md`

## License

MIT
