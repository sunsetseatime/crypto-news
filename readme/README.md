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
| **Chasing Detection** | Is the coin up >40% (7d) or >20% (24h) without a real catalyst? |
| **Dilution Risk** | Is float <20%? Is FDV >> Market Cap? Are unlocks imminent? |
| **Liquidity Check** | Is there enough volume ($5M+) to actually trade without slippage? |
| **Catalyst Validation** | Is there a real, verifiable event within 14 days with a source link? |

Each coin receives a hygiene label:
- **KEEP**: Passes 3-4 gates, no severe warnings
- **WATCH-ONLY**: Interesting but blocked by unlock risk, dilution, or weak signals
- **DROP**: Fails trackability, liquidity, or credibility checks

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
node src/index.js

# Or use the batch file
.\Run Scanner.bat
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

**3) Deploy**
- Open your Vercel URL and click **Chat** (bottom-right)
- Paste the same `CHAT_PASSWORD` into the chat panel once (it saves in your browser)
- Click a coin row to auto-select it, then ask follow-up questions

Notes:
- The chat is education-focused and will not pretend to know facts that are not in your reports.
- Exchange wallets are treated as lower “single whale” risk, but only when the report explicitly labels them as an exchange.

## Output

| File | Description |
|------|-------------|
| `reports/Layer1Report.json` | Raw deterministic data for all coins |
| `reports/Summary.md` | Human-readable summary table |
| `reports/Dashboard.html` | Local dashboard UI (opens in your browser) |
| `reports/Alerts.md` | Alerts for this run (high-score / actionable items) |
| `reports/Alerts.json` | Alerts (structured JSON) |
| `reports/SupervisorSummary.json` | AI summary (only if `OPENAI_API_KEY` is set) |
| `reports/DiffReport.json` | Changes since the last run (for “what’s new”) |
| `reports/backtest/BacktestReport.md` | Backtest stats report |
| `reports/backtest/predictions.json` | Prediction history used for backtesting |
| `reports/defi/Latest.md` | Latest DeFi protocol scan report |
| `reports/defi/snapshots/*.json` | Historical DeFi scan snapshots |

## Configuration

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
- Enable discovery auto-staging (so top discovery picks get scanned daily in the staging section) via `AUTO_STAGE_DISCOVERY=1`.
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

# Discovery auto-stage (optional)
# - Adds top discovery picks into the staging scan automatically.
AUTO_STAGE_DISCOVERY=1
# - Stage up to N coins per run
AUTO_STAGE_LIMIT=2
# - Only stage when score/flow is strong (defaults shown)
AUTO_STAGE_DISCOVERY_SCORE_MIN=90
AUTO_STAGE_VOLUME_24H_MIN=10000000
AUTO_STAGE_VOL_TO_MCAP_MIN=0.05
AUTO_STAGE_PRICE_CHANGE_7D_MAX=60
# - Cap total auto-staged coins (prevents watchlist bloat)
AUTO_STAGE_MAX_TOTAL=25

# Advanced CoinGecko config (usually auto-detected)
COINGECKO_API_KEY_HEADER=x_cg_demo_api_key
```

**Note**: Demo keys (starting with `CG-`) are automatically detected and use the correct endpoint.

## Rate Limits & Caching

- CoinGecko public endpoints rate limit aggressively
- Responses are cached under `reports/cache/` for **6 hours** by default
- If you hit 429 errors:
  - Wait a minute and re-run, or
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
