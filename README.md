# Crypto Watchlist Daily Scanner

Full documentation: `readme/README.md`.

## Highlights

- Better TA (volume + price structure): RVOL (today's volume vs 20-day average), trend regime (uptrend/downtrend/range), key range levels, event tags (breakout / reclaim / capitulation / distribution), and an Interest Score (0-100).
- Paper Trading: recent 14-day activity, outlier/median stats, a simple pretend balance curve, and Ruleset A vs B learning (A/B test).
- Signal Engine: missing fundamentals now show as "not tracked" (instead of confusing n/a) when a data source is not available.

## Docs map (so you don't have to search)

- `readme/README.md` - Full setup + usage guide
- `readme/DEMO_GUIDE.md` - Quick demo script
- `readme/CRYPTO_SIGNAL_ENGINE_IMPLEMENTATION_OUTLINE.md` - Signal Engine + candidate suggestion layer (implementation outline)
- `CHANGELOG_LAST_2_DAYS.md` - Recent changes (update record)
- `to_do_readme/ISSUES_AUDIT_AND_NEXT_STEPS.md` - Known issues + next steps
- `readme/FEATURES_ROADMAP.md` - Roadmap / future ideas

## GitHub Actions + GitHub Pages (runs when your PC is off)

This repo includes a scheduled workflow that runs the scanner daily and publishes the latest dashboard to GitHub Pages:

- Workflow: `.github/workflows/daily-scan-pages.yml`
- Dashboard URL: `https://<your-user>.github.io/<your-repo>/`

If the repo is private on GitHub Free, Pages requires upgrading or making the repo public. In that case the workflow still uploads a downloadable artifact named `crypto-news-site`.

Optional: host the dashboard on Vercel (with an embedded chat panel) - see `readme/README.md`.
