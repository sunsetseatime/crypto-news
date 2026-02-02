# Improvement Plan

Status legend: [ ] pending, [~] in progress, [x] complete.

## App Review & Labeling
- [ ] Do a full review of UI/labels. Clearly separate short-term trades (blue-chip dips + momentum) from longer-term plays.

## Current Focus (tackle 2-3 at a time)
- [x] Gate hygiene with RSI/entry signal and reflect it in decisions/backtest confidence.
- [x] Auto-run DeFi scan or warn on stale cached data.
- [x] Surface backtest confidence in the dashboard and use it in labels.
- [x] Expand macro pulse with BTC share, alt strength, and alt news + mood.
- [x] Add macro alerts for BTC share shifts and alt strength flips.

## High-Priority Backlog
- [~] Real-time news sentiment with hot/viral signals (works with CoinGecko fallback; real-time needs paid source).
- [ ] Run-start vs accumulation alerts tuning; distinct copy and actions.
- [~] Take-profit UX: show ladder targets and per-position status (approaching target added).
- [~] "What to play" section: rank plays by market phase (basic version exists; needs refinement).
- [~] Blue chip scanner tweaks: dip >=10%, top 50, RSI oversold (done) + snooze/decay (missing).
- [~] Discovery funnel visuals: discovered -> staged -> promoted counts (partially shown; needs links).

## Dashboard & UX
- [ ] Make hidden notes visible; ensure Quality vs Timing legend is clear.
- [ ] Show GitHub activity (last commit, stars, archived/stale) prominently on watchlists.
- [ ] Highlight best entries today and blue-chip opportunities with filters (phase-aware).
- [ ] Market context block: Fear & Greed, BTC MAs, phase banner (some present; needs clearer layout).
- [x] ETF money flow sparkline in the Market Pulse card.

## Data & Analysis
- [~] DeFi cross-ref for watchlist coins; surface security risks and TVL in notes/gates (now used; needs clearer UX).
- [~] Portfolio loader: show P&L, days held, take-profit status; include in alerts (partially done).
- [~] News data freshness: label source and staleness (source labeled, staleness not explicit).
- [x] Track BTC market share history to compute 24h change.

## Operations & Reliability
- [ ] Scheduled scans with freshness badges per data source.
- [ ] Cache/API-key handling and clearer error surfacing for CoinGecko/GitHub/news.
- [ ] Backtest coverage: add tests around entry signals, gates, and alert generation.

## Nine Key Improvements (tracked explicitly)
1. [x] Gate hygiene with RSI/entry signal.
2. [x] Auto-run DeFi scan or stale-data warning.
3. [x] Show backtest confidence/precision in dashboard.
4. [~] Real-time news sentiment with hot/viral signals.
5. [ ] Run-start vs accumulation alerts with distinct actions.
6. [~] Take-profit UX with ladder targets and status (approaching target added).
7. [~] "What to play" section by market phase (basic version exists).
8. [~] Blue chip scanner tweaks (10% dip, top 50, RSI filter done; decay missing).
9. [~] Discovery funnel visuals with stage counts/links (partial).
