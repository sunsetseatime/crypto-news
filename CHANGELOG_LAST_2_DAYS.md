# Changelog: Last 2 Days

**Period**: Recent development session  
**Focus**: Investment decision features, technical entry signals, market condition detection, and comprehensive audit fixes

---

## 🎯 Major Features Added

### 1. Technical Entry Signals
- **RSI-based entry signals**: Added RSI calculation and distance from 30-day high/low metrics
- **Entry signal classification**: 
  - `strong_buy`: RSI < 35 and >15% from 30d high
  - `momentum`: RSI 35-50 and >10% from 30d high
  - `overbought`: RSI > 70
- **Integration**: Entry signals now used in hygiene gates and displayed in dashboard Entry column

### 2. Blue Chip Scanner
- **Top 50 coins**: Expanded from top 25 to top 50 cryptocurrencies
- **Dip threshold**: Lowered from 15% to 10% for dip detection
- **RSI filter**: Added RSI oversold filter (RSI < 35) for blue chip opportunities
- **Stablecoin filtering**: Automatically excludes stablecoins from blue chip scanning
- **Alert generation**: Creates `blue_chip_dip` alerts for safer investment plays

### 3. Market Condition Detection
- **Fear & Greed Index**: Integrated market sentiment indicator
- **BTC Moving Averages**: Calculates BTC position relative to 20/50/200-day MAs
- **Market phases**: 
  - `accumulation`: Fear & Greed < 30, BTC below MAs
  - `run`: BTC up >5% and above MAs, or sentiment improving
  - `caution`: BTC up >10% or Fear & Greed > 70
- **Phase-aware recommendations**: Investment advice adapts to market phase

### 4. Take-Profit Alerts
- **Portfolio tracking**: Loads portfolio positions from JSON file
- **Target ladder**: Supports multiple take-profit targets (TP1, TP2, Moon)
- **Status calculation**: 
  - `approaching_target`: Within 5% of next target
  - `take_profit_1/2`: Target hit
  - `moon`: All targets hit
- **Alert generation**: High-priority alerts when targets are hit
- **P&L tracking**: Shows profit percentage, USD profit, and days held

### 5. News Sentiment Tracking
- **Dual source support**: CryptoPanic (paid, real-time) and CoinGecko (free, 24h delay)
- **News signals**: 
  - `hot_news`: 5+ news items in 24h
  - `viral_news`: 10+ news items in 24h
- **Sentiment scoring**: Aggregates news sentiment from multiple sources
- **Source labeling**: Dashboard shows which news source is being used

### 6. GitHub Activity Integration
- **Last commit tracking**: Fetches last commit date, message, and days since commit
- **Repository metrics**: Tracks GitHub stars and archived status
- **Activity classification**:
  - `active`: Last commit within 6 months
  - `stale`: Last commit 6+ months ago
  - `archived`: Repository is archived
- **Traction evaluation**: GitHub activity now prioritized over CoinGecko dev data

### 7. DeFi Security Cross-Reference
- **Watchlist integration**: Cross-references watchlist coins with DeFi protocols
- **Security risks**: Flags coins with hack history or missing audits
- **TVL data**: Attaches TVL information to watchlist coins
- **Hygiene gates**: DeFi security risks now block coins from passing gates

### 8. "What to Play" Recommendations
- **Actionable plays**: Generates ranked list of best entry opportunities
- **Market phase awareness**: Recommendations adapt to accumulation/run/caution phases
- **Entry scoring**: Combines RSI, distance from high, dev activity, and hygiene gates
- **Risk highlighting**: Shows risks alongside opportunities

### 9. Discovery Funnel Tracking
- **Funnel stages**: Tracks coins from discovered → staged → promoted → performance
- **Statistics**: Calculates conversion rates and stage counts
- **Dashboard display**: Shows funnel visualization with counts and percentages

### 10. Backtest Confidence Integration
- **Confidence scoring**: Calculates precision and recall for hygiene gates
- **Dashboard display**: Shows backtest confidence in hygiene labels
- **Gate improvements**: Entry signal and DeFi security now part of gate evaluation

### 11. Dashboard Chat Improvements
- **Coin-specific Q&A**: Chat can explain why a coin was picked (watchlist vs discovery) and why it shows up in today’s shortlist
- **Recent headlines**: Chat includes the same recent headlines already collected during the scan (titles + links)
- **Research mode (toggle)**: Optional deep dive that pulls extra linked info from CoinGecko/GitHub for the selected coin
- **Project basics (optional)**: When you ask “what is this project?”, chat may pull a short project description from CoinGecko

---

## 📁 Files Modified

### `src/index.js`
**Major additions:**
- `calculateRSI()`: RSI calculation function
- `calculateEntrySignal()`: Entry signal classification
- `fetchGitHubRepoActivity()`: GitHub API integration
- `fetchNewsSentiment()`: News aggregation from CryptoPanic/CoinGecko
- `loadPortfolio()`: Portfolio position loader
- `calculateTakeProfitStatus()`: Take-profit target calculator
- `fetchFearGreedIndex()`: Market sentiment fetcher
- `calculateBTCMovingAverages()`: BTC MA calculator
- `detectMarketCondition()`: Market phase detector
- `generatePlayRecommendations()`: Investment recommendation engine
- `analyzeBlueChipsForDips()`: Blue chip scanner
- `fetchCoinGeckoCategories()`: Category fetcher for stablecoin filtering
- `attachDefiKnowledgeToCoins()`: DeFi cross-reference function
- `computeDiscoveryFunnelStats()`: Funnel statistics calculator

**Key modifications:**
- `evaluateGates()`: Added `entry_signal_ok` and `defi_security_ok` gates
- `evaluateTraction()`: Prioritizes GitHub activity over CoinGecko dev data
- Main scan loop: Integrated all new data sources in parallel fetching
- `layer1Report`: Added market condition, blue chip opportunities, best entries

### `src/render_dashboard.js`
**Major additions:**
- `buildFunnelHtml()`: Discovery funnel visualization
- `buildPlayRecommendationsHtml()`: "What to play" section
- `buildBestEntriesHtml()`: Best entry opportunities display
- `buildBlueChipOpportunitiesHtml()`: Blue chip dip opportunities
- Entry column: New column showing entry signal, RSI, and distance from high
- Entry legend: Explanation of entry column icons
- Market condition display: Fear & Greed Index, BTC momentum, market phase banner

**Key modifications:**
- `notesForCoin()`: Added GitHub activity notes, entry signal notes, DeFi security risks
- `buildDailySummaryHtml()`: Enhanced with market condition and discovery report
- News display: Only shows "hot news" signal with paid CryptoPanic API

### `src/alerts.js`
**Major additions:**
- Take-profit alerts: High-priority alerts when targets are hit
- Market condition alerts: 
  - `market_accumulation`: Accumulation phase signals
  - `market_run`: Run phase signals
  - `market_warning`: Caution phase signals
- Blue chip dip alerts: `blue_chip_dip` alerts for top opportunities

**Key modifications:**
- News alerts: Only trigger with CryptoPanic (real-time) data source
- Alert prioritization: Take-profit alerts have highest priority

### `src/defi_scan.js`
**Major additions:**
- `fetchDefiLlamaHacks()`: Hack data fetcher
- Hack integration: Hack count and history now part of security scoring
- `audit_links` and `hack_count`: Added to protocol output

---

## 🔧 Configuration Changes

### Blue Chip Scanner
- `BLUE_CHIP_COUNT`: Changed from 25 to 50
- `BLUE_CHIP_RSI_OVERSOLD`: Changed from 40 to 35
- `BLUE_CHIP_DIP_THRESHOLD`: Changed from 15% to 10%

### Entry Signals
- `RSI_OVERSOLD`: 35 (for strong buy signals)
- `RSI_OVERBOUGHT`: 70 (for overbought classification)
- `DIP_FROM_HIGH_STRONG`: 15% (for strong buy)
- `DIP_FROM_HIGH_MOMENTUM`: 10% (for momentum plays)

---

## 📊 Dashboard Enhancements

### New Sections
1. **Market Condition Block**: Fear & Greed Index, BTC momentum, market phase
2. **Best Entries Today**: Ranked list of entry opportunities with entry scores
3. **Blue Chip Opportunities**: Dip opportunities in top 50 cryptocurrencies
4. **Discovery Funnel**: Visual representation of discovery → staged → promoted flow
5. **"What to Play" Section**: Actionable investment recommendations

### Enhanced Columns
- **Entry Column**: Shows entry signal icon, RSI value, and distance from 30d high
- **Notes**: Now includes GitHub activity, entry signals, and DeFi security risks

### Improved Labels
- Hygiene labels now show backtest confidence
- Entry signals clearly labeled with icons and legend
- News source clearly indicated (CryptoPanic vs CoinGecko)

---

## 🐛 Bug Fixes & Improvements

1. **DeFi Scan Integration**: Auto-runs DeFi scan or warns on stale data
2. **Gate Hygiene**: Entry signals and DeFi security now properly block overbought/risky coins
3. **Data Source Tracking**: All data sources properly tracked and displayed
4. **News Freshness**: Only alerts on real-time news (CryptoPanic paid tier)
5. **GitHub Priority**: GitHub activity now prioritized over CoinGecko dev data for traction

---

## 📝 Documentation

### New Files
- `to_do_readme/IMPROVEMENTS.md`: Comprehensive improvement tracking document
- `CHANGELOG_LAST_2_DAYS.md`: This file

### Updated Documentation
- Dashboard now includes legends and explanations for new features
- Entry column has clear icon legend
- Market condition indicators explained

---

## 🎨 UX Improvements

1. **Hidden Notes Made Visible**: All notes now displayed in dashboard
2. **Clear Labeling**: Entry column icons explained with legend
3. **Phase-Aware UI**: Recommendations and alerts adapt to market phase
4. **Visual Hierarchy**: Best entries and blue chip opportunities prominently displayed
5. **Context Blocks**: Market condition always visible at top of dashboard

---

## 🔄 Integration Points

### Data Flow
1. **Market Data** → Entry Signals → Hygiene Gates → Best Entries
2. **GitHub Activity** → Traction Evaluation → Hygiene Gates
3. **DeFi Scan** → Security Risks → Hygiene Gates
4. **Portfolio** → Take-Profit Status → Alerts
5. **Market Condition** → Phase Detection → Recommendations

### Alert Priority
1. Take-profit alerts (highest)
2. Market condition alerts
3. Blue chip dip alerts
4. News alerts (only with real-time source)
5. Watchlist actionable alerts
6. DeFi discovery alerts

---

## ⚠️ Known Limitations

1. **News Real-Time**: Requires paid CryptoPanic API for real-time data
2. **Blue Chip Decay**: Snooze/decay mechanism for blue chip alerts not yet implemented
3. **Discovery Funnel Links**: Stage counts shown but links to individual coins not yet added
4. **Take-Profit Ladder**: Approaching target added, but full ladder visualization pending
5. **Market Phase Tuning**: Run-start vs accumulation alerts need distinct copy/actions

---

## 🚀 Next Steps (From to_do_readme/IMPROVEMENTS.md)

### Current Focus
- [x] Gate hygiene with RSI/entry signal ✅
- [x] Auto-run DeFi scan or stale-data warning ✅
- [x] Surface backtest confidence in dashboard ✅

### High Priority
- [~] Real-time news sentiment (works with fallback; needs paid for real-time)
- [ ] Run-start vs accumulation alerts tuning
- [~] Take-profit UX refinement
- [~] "What to play" section refinement
- [~] Blue chip scanner decay/snooze
- [~] Discovery funnel links

---

## 📈 Impact Summary

### Investment Decision Support
- **Entry Timing**: RSI and distance from high help time entries
- **Market Context**: Phase detection guides strategy (accumulation vs momentum)
- **Risk Management**: DeFi security and hygiene gates filter risky plays
- **Portfolio Management**: Take-profit alerts help manage positions

### Data Quality
- **GitHub Activity**: More accurate dev traction assessment
- **DeFi Security**: Cross-reference with protocols for security risks
- **News Freshness**: Clear labeling of real-time vs delayed data

### User Experience
- **Actionable Insights**: "What to play" and "Best Entries" provide clear recommendations
- **Visual Clarity**: Entry signals, market phase, and opportunities clearly displayed
- **Context Awareness**: All recommendations adapt to current market conditions

---

## 2026-01-19 Fixes (Market Pulse)
- Alt news now pulls from real RSS headlines (CoinDesk / Decrypt / The Block / Bitcoin Magazine) matched to major alts (ETH/BNB/SOL/XRP/LTC/XMR), so it doesn’t go empty for days.
- BTC leverage check now uses a Bybit fallback when Binance futures endpoints are blocked (fixes repeated HTTP 451 errors on some servers).
- Dashboard Market Pulse now shows the leverage data source, and alt headlines include the source name.

## 2026-01-19 Fixes (Chat)
- Chat now answers “what does this project do?” directly from a short CoinGecko description (when available), instead of replying that it doesn’t know.
- Added retries + optional `COINGECKO_API_KEY` support for Vercel chat to reduce rate-limit failures.

**End of Changelog**
