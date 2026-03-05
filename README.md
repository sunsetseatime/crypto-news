# Crypto Watchlist Daily Scanner

Full documentation: `readme/README.md`.

## Highlights

- Better TA (volume + price structure): RVOL (today's volume vs 20-day average), trend regime (uptrend/downtrend/range), key range levels, event tags (breakout / reclaim / capitulation / distribution), and an Interest Score (0-100).
- Watchlist clarity: Quality (KEEP/WATCH-ONLY/DROP) is shown separately from Timing (Buy now / Wait for dip), plus KEEP target guidance for a 15–20 coin core list.
- Paper Trading: configurable recent activity window (default 60d), outlier/median stats, a simple pretend balance curve, and weeks/months trade styles for learning.
- Signal Engine: shows a clear Usage proxy (fees when available, otherwise volume) + better niche suggestions; missing items show as "not tracked" when a data source is not available.
- Crypto Revival Framework: scores each coin across 7 comeback categories (total 35), tracks 5 early comeback signals, and surfaces top revival candidates in reports + dashboard.

## Docs map (so you don't have to search)

- `readme/README.md` - Full setup + usage guide
- `readme/DEMO_GUIDE.md` - Quick demo script
- `readme/CRYPTO_SIGNAL_ENGINE_IMPLEMENTATION_OUTLINE.md` - Signal Engine + candidate suggestion layer (implementation outline)
- `readme/APP_CRITIQUE_AND_NEXT_STEPS.md` - Deep critique + concrete improvement ideas
- `docs/# Crypto Revival Analysis Framework.md` - Long-term revival methodology reference
- `CHANGELOG_LAST_2_DAYS.md` - Recent changes (update record)
- `to_do_readme/ISSUES_AUDIT_AND_NEXT_STEPS.md` - Known issues + next steps
- `readme/FEATURES_ROADMAP.md` - Roadmap / future ideas

## GitHub Actions + GitHub Pages (runs when your PC is off)

This repo includes a scheduled workflow that runs the scanner daily and publishes the latest dashboard to GitHub Pages:

- Workflow: `.github/workflows/daily-scan-pages.yml`
- Dashboard URL: `https://<your-user>.github.io/<your-repo>/`

If the repo is private on GitHub Free, Pages requires upgrading or making the repo public. In that case the workflow still uploads a downloadable artifact named `crypto-news-site`.

Optional: host the dashboard on Vercel (with an embedded chat panel) - see `readme/README.md`.
