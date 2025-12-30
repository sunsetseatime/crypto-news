# Crypto Watchlist Daily Scanner

Full documentation: `readme/README.md`.

## GitHub Actions + GitHub Pages (runs when your PC is off)

This repo includes a scheduled workflow that runs the scanner daily and publishes the latest dashboard to GitHub Pages:

- Workflow: `.github/workflows/daily-scan-pages.yml`
- Dashboard URL: `https://<your-user>.github.io/<your-repo>/`

If the repo is private on GitHub Free, Pages requires upgrading or making the repo public. In that case the workflow still uploads a downloadable artifact named `crypto-news-site`.
