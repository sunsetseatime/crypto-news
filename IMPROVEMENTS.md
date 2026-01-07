# Improvement Plan

Status legend: `[ ]` pending, `[~]` in-progress, `[x]` complete.

## App Review & Labeling
- [ ] Do a holistic review of the scanner UI/labels. Clearly differentiate the “smaller % trades” toolset (blue-chip dips + watchlist momentum) from longer-horizon plays so others understand what each module does and when to use it.

## Current Focus (tackle 2-3 at a time)
- [ ] Gate hygiene with RSI/entry signal and reflect it in backtest scoring.
- [ ] Auto-run DeFi scan or warn when using stale cached data.
- [ ] Surface backtest confidence/precision in the dashboard (cards + alerts).

## High-Priority Backlog
- [ ] Real-time news sentiment (CryptoPanic paid or alternative) with hot/viral signals.
- [ ] Run-start vs accumulation alerts tuning; distinct copy and actions.
- [ ] Take-profit alert UX: show ladder targets, per-position status on dashboard.
- [ ] “What to play” section: rank plays by market phase (run/accumulation/caution).
- [ ] Blue Chip scanner tweaks: dip ≥10%, top 50 coins, RSI oversold filter, snooze/decay.
- [ ] Discovery funnel visuals: discovered → staged → promoted → performance with counts/links.

## Dashboard & UX
- [ ] Make hidden notes visible; ensure Entry column legend is clear.
- [ ] Show GitHub activity (last commit, stars, archived/stale) prominently on watchlists.
- [ ] Highlight best entries today and blue-chip opportunities with filters (phase-aware).
- [ ] Market context block: Fear & Greed, BTC MAs, and phase banner.

## Data & Analysis
- [ ] DeFi cross-ref for watchlist coins; surface security risks and TVL in notes/gates.
- [ ] Portfolio loader: show P&L, days held, take-profit status; include in alerts.
- [ ] News data freshness: label source (CryptoPanic vs CoinGecko) and staleness.

## Operations & Reliability
- [ ] Scheduled scans with freshness badges per data source.
- [ ] Cache/API-key handling and clearer error surfacing for CoinGecko/GitHub/news.
- [ ] Backtest coverage: add tests around entry signals, gates, and alert generation.

## Nine Key Improvements (tracked explicitly)
1. Gate hygiene with RSI/entry signal.
2. Auto-run DeFi scan or stale-data warning.
3. Show backtest confidence/precision in dashboard.
4. Real-time news sentiment with hot/viral signals.
5. Run-start vs accumulation alerts with distinct actions.
6. Take-profit alert UX with ladder targets and status.
7. “What to play” section by market phase.
8. Blue Chip scanner tweaks (10% dip, top 50, RSI filter, decay).
9. Discovery funnel visuals with stage counts/links.
