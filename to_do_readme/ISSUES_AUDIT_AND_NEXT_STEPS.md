# Issues Audit & Next Steps (Plain English)

Date: 2026-01-15

This document captures the 3 main gaps we discussed, plus a quick check of the current task docs so we don’t miss anything important.

---

## 1) “Unused tools” / code that exists but isn’t used

### What we found
- Some “helper” functions exist in the codebase but never run as part of the scan.
- Example: `src/index.js` contains discovery helpers (`fetchTrendingCoins`, `discoverCoinsByCriteria`), but the actual discovery run is done by `src/discover.js`.

### Why it matters
- It can confuse future work (“which discovery logic is real?”).
- It increases the chance we update one copy of logic and forget the other.

### What we should do (without deleting valuable functionality)
- Keep anything that’s genuinely useful, but remove *only* code that is duplicated/redundant.
- Best path:
  1) Decide which discovery functions are the “source of truth” (recommended: `src/discover.js`).
  2) If the “unused tools” are valuable, **move them** into the discovery pipeline (or into a shared helper file used by both places).
  3) Only after that, remove the redundant duplicate copies (so we keep the capability, but lose the clutter).

### How to verify it worked
1) Run discovery: `node src/discover.js`
2) Run full scan: `node src/index.js`
3) Confirm: discovery candidates still appear in `reports/DiscoveryReport.json` and the dashboard still updates.

---

## 2) News is often missing (and the app should say that clearly)

### What we found
- Right now, the app can end up with “not enough headlines” for some coins/categories.
- When that happens, the “why” section can look empty even though price moved.

### Why it matters
- Friends will assume the app is broken when it’s really just “no headlines were available at scan time”.
- It also makes category/narrative explanations weaker than they should be.

### What we should do next
1) **Add a small set of high-quality free headline sources** (not dozens).
   - We tested these and they work (they return real RSS):
     - CoinDesk RSS: `https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml`
     - Decrypt RSS: `https://decrypt.co/feed`
     - The Block RSS: `https://www.theblock.co/rss.xml`
     - Bitcoin Magazine RSS: `https://bitcoinmagazine.com/feed`
   - Sources we should avoid because they block requests:
     - CryptoSlate (returns a “Just a moment…” / blocked page)
2) Keep the current exchange announcement feeds (Binance/Coinbase/Kraken/OKX). These are usually the most “real” catalysts.
3) **Whenever headlines are missing, always show this message**:
   - “No headlines available at the time of scan.”
4) Make sure the message appears anywhere we “look for news” (Category Pulse, Story Cards, per-coin “Why”, etc.).

### How to verify it worked
1) Run scan: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Pick a category/coin you know has little news → you should see “No headlines available at the time of scan.”
4) Pick a coin with exchange news → you should see headlines + links.

---

## 3) Paper trading needs to “learn and improve” (not just track trades)

### What we found
- Paper trading currently records simulated trades and shows results.
- But it does not yet “learn” in the sense of improving the scanner rules automatically.

### Why it matters
- The whole point of paper trading is: *figure out what works, what doesn’t, and adjust the system over time*.

### What “learning” should mean (safe and useful)
Step-by-step (recommended):
1) **Tag every paper trade** with the reasons that created it (example tags):
   - Market phase (run/caution/neutral)
   - Trend state (uptrend/downtrend)
   - News pressure label (positive/negative/mixed)
   - Unlock risk (yes/no)
   - Liquidity bucket (good/ok/low)
2) Build a “what worked” scoreboard:
   - Win rate and average return by tag (example: “uptrend + clean catalyst” vs “downtrend + oversold”).
3) Add an “Auto-improve suggestions” section:
   - Example: “Downtrend + oversold trades underperform → reduce/disable those signals.”
4) Optional (only if you want it): allow the app to auto-adjust a few thresholds, but **only when a switch is turned on** (so it doesn’t change behaviour silently).

### How to verify it worked
1) Run daily scans for a week.
2) Open: `reports/paper/PaperReport.md`
3) Confirm it includes:
   - Results by “signal type” (tags)
   - Clear suggestions for rule changes
   - No silent auto-changes unless you explicitly enable it

---

## 4) Quick check of our existing task docs (so nothing important is missed)

### Docs reviewed
- `to_do_readme/IMPROVEMENTS_V1.md`
- `to_do_readme/IMPROVEMENTS_V1_IMPLEMENTATION.md`
- `to_do_readme/IMPROVEMENTS_V2.md`
- `to_do_readme/IMPROVEMENTS.md`
- `to_do_readme/Major_Upgrade_1.md`

### Confirmed as already addressed (at least in basic form)
- BCH-style “coin context” exists (so the app can warn when a coin is a short-term-only play).
- News has a basic “event type” system (so we can weight hacks/delistings higher than random marketing).
- Dashboard has “How this works” sections and better watchlist sorting/expanding defaults.
- Category Pulse exists and runs each scan.

### Still missing or not strong enough yet
- Paper trading “learning engine” (this doc’s item #3).
- More high-quality free news sources + clear “no headlines at scan time” messaging everywhere (this doc’s item #2).
- Dashboard layout work is still called out in `IMPROVEMENTS_V1.md` (needs a dedicated pass after the above is solid).

### Note on “code deleted by mistake”
- In the current work we’ve done, we did **not** remove core features; changes have been additive (new features + wiring).
- We should still do a short “feature checklist run” after each change (discovery, scan, dashboard, Pages deploy, Vercel proxy) to catch regressions early.

---

## Suggested order of work (next)
1) Improve headlines (add the 4 working RSS sources + “no headlines available” message everywhere).
2) Upgrade paper trading into a learning system (tags → scoreboard → suggestions → optional auto-tune flag).
3) Clean up “unused tools” by moving valuable ones into the real pipelines, and only then remove redundant duplicates.
