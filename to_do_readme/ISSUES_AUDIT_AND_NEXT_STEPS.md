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
5) Make sure **Blue Chip Dips** and **Discovery** also get the same headline scan (not just your watchlist).
   - If the tone looks negative, show it as a **warning** (but do not hide the coin).

### How to verify it worked
1) Run scan: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Pick a category/coin you know has little news → you should see “No headlines available at the time of scan.”
4) Pick a coin with exchange news → you should see headlines + links.
5) Check **Blue Chip Dip Opportunities** and **Discovery** → each line should include a **News:** note (or the “No headlines…” message).

**Status update (2026-01-19):** The scan now pulls headlines for Watchlist, Blue Chip Dips, and Discovery. If the tone looks negative, it is shown as a warning (it does not remove the coin).

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
   - Trade style (example: `scalp_2pct` vs `swing_days_weeks`) so stats don't get mixed
   - Exchange/cost model (example: `mexc_fee_0`) so results match your real costs
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
  - For technical entry logic: run `npm run scan:watchlist` and confirm the built-in TA sanity check passes (or run `npm run verify:ta` manually).

---

## Suggested order of work (next)
1) Improve headlines (add the 4 working RSS sources + “no headlines available” message everywhere).
2) Upgrade paper trading into a learning system (tags → scoreboard → suggestions → optional auto-tune flag).
3) Clean up “unused tools” by moving valuable ones into the real pipelines, and only then remove redundant duplicates.

**Status update (2026-01-15):** Items 1–3 above are now implemented in the codebase. The next major gap is the dashboard layout and top-of-page summary clarity (below).

---

## 5) Dashboard: “Quick Start” at the top + clearer words + AI summary up front

### The problem (plain English)
- The dashboard has a lot of great information, but the “what do I look at first?” answers are spread out.
- “Ready Setup” is confusing because it’s just a count, and it’s not obvious where to find those coins.
- The AI summary is not at the top, so the “fast read” experience isn’t strong.

### The goal
- Make the top of the dashboard work like a “30-second briefing”.
- Keep deep-dive sections below for when you want details.
- Make the wording consistent and easy for non-coders (and friends) to understand.

---

### A) Rename confusing words (so labels match what we mean)

**What we change**
- Rename “Ready Setup” (top counter) to **“Ready (KEEP)”** or **“Passed Checks (KEEP)”**.
- Define “setup” clearly wherever it’s used:
  - **KEEP** = passed safety/quality checks (good enough to consider).
  - **Entry setup** = KEEP + timing looks good today.
  - **Strong setup** = the strongest “entry setup” signal.

**Why**
- Right now “setup” sounds like “buy now”, but the counter is really just “passed checks”.

**How to verify**
1) Run a scan: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Confirm the top counter says “Ready (KEEP)” (or “Passed Checks”), and the glossary explains each term in one sentence.

Implementation notes (for dev)
- Update wording in `buildDailySummaryHtml()` in `src/render_dashboard.js`.
- Update wording in the “How to Read This Dashboard” glossary in `src/render_dashboard.js`.

---

### B) Add a “Quick Start” section at the very top (the real “what to do today”)

**What we change**
- Add a new top section (above “Today’s Summary”) called **“Quick Start (30 seconds)”** with:
  1) **Market mood** (phase + fear/greed + BTC trend)
  2) **Today’s plays (2–3 ideas)** with clear action words (Buy / Wait / Avoid)
  3) **Top risks to watch today** (2–3 bullets)
  4) **What changed since last run** (1–3 bullets)
  5) **Paper trading snapshot** (open trades count + quick note)
  6) **Jump links** (buttons/links that scroll to: What to Play, Best Entries, Blue Chip Dips, Watchlist, Paper Trading)

**Why**
- When you’re busy, you should be able to read just the top and get the “state of play”.

**How to verify**
1) Run: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Confirm you can understand market mood + 2–3 plays + top risks without scrolling.

Implementation notes (for dev)
- New renderer in `src/render_dashboard.js` (example name: `buildQuickStartHtml()`).
- Feed it from existing report data:
  - `layer1Report.market_condition`
  - `layer1Report.play_recommendations`
  - `layer1Report.best_entries`
  - `layer1Report.blue_chip_opportunities`
  - `diffReport`
  - `alertsReport`
  - `paperReport`

---

### C) Make the “Today’s plays” list consistent (one source of truth)

**What we change**
- Define exactly how we pick the 2–3 plays shown at the top:
  - Picks can come from BOTH:
    - **Best Entries (watchlist)**, and
    - **Blue Chip Dip Opportunities** (even if not in watchlist).
- Add a simple rule so we don’t contradict ourselves:
  - If a coin is flagged “Avoid/Trap” (unlock risk, downtrend, very low liquidity, etc.), it cannot appear as a “Buy” in the top list.
- Show each play as:
  - **Coin + action** (Buy / Wait / Avoid)
  - **Why** (2 bullets, plain English)
  - **Main risk** (1 bullet)
  - Optional: “time horizon” (e.g. days, weeks)

**Why**
- Users should not have to cross-check multiple sections to understand “what to do today”.

**How to verify**
1) Run: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Confirm each top play also appears in the relevant detail section (Best Entries or Blue Chips).
4) Confirm no coin appears as both “Buy” and “Avoid”.

Implementation notes (for dev)
- Prefer rule-based selection for the shortlist, then let AI rewrite the explanation (optional).
- Candidate pools:
  - Best Entries: `layer1Report.best_entries.best_entries`
  - Blue Chips: `layer1Report.blue_chip_opportunities.opportunities`

---

### D) Move the AI summary to the top and make it “smarter” (use more of our features)

**What we change**
- Move the AI supervisor summary section so it appears near the top (right under Quick Start).
- Expand what the AI is allowed to summarize using ONLY our reports:
  - market mood
  - best entries + wait list
  - blue chip dips + wait list
  - alerts (including take-profit alerts)
  - paper trading snapshot
  - top risks (unlock, dilution, holder concentration, low liquidity)
- Ask the AI to output:
  - 2–3 sentence “Today in plain English”
  - “Top 2 plays” (based on our pre-selected candidates)
  - “Top 2 risks”
  - “If you only do one thing: ____”

**Why**
- The AI becomes the fast briefing you can trust, without guessing or inventing facts.

**How to verify**
1) Run a scan with `OPENAI_API_KEY` set.
2) Open: `reports/Dashboard.html`
3) Confirm AI summary appears near the top and matches the real sections below.
4) Confirm it never invents coins or news that aren’t shown elsewhere on the page.

Implementation notes (for dev)
- Update `buildSupervisorInput()` and `buildSupervisorSchema()` in `src/index.js`.
- Add “play candidates” to the AI input (so the AI can only choose from what we already picked).
- Add a “conflict check” rule: if a coin is both risky and suggested as buy, AI must downgrade it to Wait/Avoid and explain.

---

### E) Chat: “Recommend plays today” (visible + consistent)

**What we change**
- Add a visible hint/button in the chat panel like:
  - “Try: ‘What are today’s top plays?’”
- Chat should answer using the same shortlist as Quick Start (so the answer is consistent).
- Optional: allow direct action words (Buy/Wait/Avoid), but keep it clear it’s based on this dashboard’s rules and data.

**Why**
- People expect to ask the chat “what should I do today?” and get a clear, consistent answer.

**How to verify**
1) Open the Vercel dashboard (chat is only on Vercel).
2) Ask: “What are today’s top plays and why?”
3) Confirm it matches the top Quick Start list and the detailed sections.

Implementation notes (for dev)
- Chat API: `app/api/chat/route.js`
- Chat UI injection: `app/route.js`
- GitHub Pages dashboard will not have chat (static hosting). Vercel wraps the GitHub dashboard and adds chat.

---

### F) Chat: Ask about any coin in the dashboard (why it was picked + what it is + recent news)

**What we change**
- Make sure chat can answer common coin questions like:
  - “Why did it recommend PAAL?”
  - “What is PAAL and what does it do?”
  - “What news did we see recently for PAAL?”
- Ensure the chat always has these **per-coin** inputs available:
  - The coin’s “today’s plays” reasoning (if it’s on the shortlist)
  - The top headlines we already collected during the scan (title + link)
  - A short “project basics” blurb (either from your manual context file, or pulled from CoinGecko)
- Optional: add a **Research mode** toggle in chat to pull extra info + links for the selected coin (CoinGecko + GitHub releases + free RSS news + the project’s blog feed when available).  
  - All external headlines must show **publisher name + link** (so you can verify).
- If something isn’t available, the chat should say that clearly (no guessing).

**Why**
- This turns chat into a simple “click a coin → ask questions” helper, without you hunting around the dashboard.

**How to verify**
1) Open the Vercel dashboard and click **Chat** (bottom-right).
2) Click a coin row in the dashboard (it should auto-select that coin in chat).
3) Ask: “Why did it recommend <coin>?”
4) Ask: “What is <coin> and what does it do?”
5) Ask: “What news did we see recently for <coin>?”
6) Turn on **Research mode** and ask: “What’s new this week for <coin>?” (or “Any official blog posts?”)
7) Confirm the chat:
   - Uses the same shortlist as the dashboard (when it says “recommended today”).
   - Shows 1–3 headline titles with links (or says no headlines were available).
   - Gives a short project basics answer (or clearly says it’s missing).
   - In Research mode: shows the publisher name + link for any RSS/blog headline it mentions.

Implementation notes (for dev)
- Chat API context: `app/api/chat/route.js` (selected coin + mentioned coins)
- Chat UI coin selection: `app/route.js` (click-to-select + dropdown)
- Manual coin context (optional): `config/coin_context.json`
- Research mode: `app/route.js` sends `research: true/false` and the server builds `research.coin` in `app/api/chat/route.js`.
- Research model: `OPENAI_MODEL_CHAT_RESEARCH` (defaults to `gpt-5.2`).

**Status update (2026-01-21):**
- Chat supports click-to-select coins and answers “why picked / what is it / recent news” from report context.
- Research mode toggle is implemented (CoinGecko + GitHub releases + free RSS + project blog feed) and should label headline sources with links.
- If you set `COINGECKO_API_KEY` on Vercel, CoinGecko project basics are more reliable under heavy usage.

---

## Updated suggested order (next)
1) Dashboard Quick Start section (top-of-page briefing + jump links).
2) Rename/clarify “setup” wording so the counters and sections match.
3) Move AI summary near the top and expand it to summarize more features (without making up facts).
4) Make chat visibly support “today’s plays” and match the same shortlist.

---

## 6) Paper trading is confusing (make it obvious + surface daily changes)

### The problem (plain English)
- The dashboard has paper trading results, but it is not obvious that it runs automatically on each scan.
- The "Paper trade" button sounded like it would do the trade, when really it just copies a manual idea to your clipboard.
- The paper trading section did not clearly show what changed today (what opened and what closed).

### What we changed (now implemented)
- Renamed the button from **Paper trade** to **Manual paper trade** so it is clear it is optional and manual.
- Added **Paper trading in 30 seconds** at the top of the Paper Trading section.
- Added **This run: opened X | closed Y** plus a short list of trades that closed this run (with reason).

### Why
- Friends should understand paper trading without guessing or reading code.

### How to verify it worked
1) Run: `node src/index.js`
2) Open: `reports/Dashboard.html`
3) Scroll to **Paper Trading** and confirm:
   - It explains "auto paper trades run every scan"
   - The button says **Manual paper trade**
   - It shows **opened/closed this run** and closed reasons

---

## 7) Paper trading parameters (critique + how to improve)

### Current defaults (what they mean)
- Pretend size per trade: **$5,000** (`PAPER_TRADE_POSITION_USD`)
- Fees: **0.1% per side** (`PAPER_TRADE_FEE_PCT`) + the model also estimates slippage
- Take profit targets: **+15%**, **+30%**, **+50%** (`TAKE_PROFIT_TARGET_1/2/3`)
- Trailing stop: **8%** (`PAPER_TRADE_TRAILING_STOP_PCT`) + it only turns on after the first target is hit
- Time limit: **45 days** (`PAPER_TRADE_TIME_STOP_DAYS`)
- Exit if the signal weakens: yes (after a few days, if the signal flips to "wait/overbought" or score < 40)

### What's good about these defaults
- It is simple and consistent - good for learning which signals work.
- It includes fees and a slippage estimate (so results are not fantasy).
- It has multiple ways to exit, so trades do not stay open forever.

### What could be misleading / confusing
- The pretend trade size is fixed, but the slippage model does not fully depend on size.
  - In real life, bigger trades usually cause more slippage.
- The trailing stop only activates after +15%.
  - That means a trade can drop a lot before the trailing stop ever becomes active.
- Take profit targets (15/30/50) may be too big for some market phases, so many trades might only close by time limit.
- One set of settings for every coin can be unfair:
  - A small coin and a large coin should not have the same trade rules.

### Improvements (next)
1) Add a "Your trading style" settings area (so paper trades match how you actually trade):
    - Typical trade size (example: $1,000)
    - Style preset: Short trade vs Swing trade (days/weeks)
    - Profit target and stop rules used by paper trades
    - Saved so it stays the same each day
    - Spot-only (no leverage), since you only trade spot on MEXC
    - Settings file: `config/paper_trading.json` (so the scanner uses them every run)
2) Add a "Short trade" preset that fits your idea of small targets:
   - Profit target around 2% (configurable)
   - Tighter trailing stop / faster exits
   - Shorter time limit (example: 1-7 days)
   - Note: a 2% target can be eaten by fees + slippage, so we should always show NET profit after costs.
   - Note for you: you trade on MEXC with no fees, so a small target like 2% is more realistic (but slippage/spread still exist)
3) Make slippage depend on trade size vs daily volume (more realistic).
4) Show the cost breakdown per trade (so the user can trust the result):
   - Fees estimate
   - Slippage estimate
   - Net P/L vs raw price move
5) Add a simple "bail out" stop for losers (example: exit if down -X% or breaks invalidation support).
6) Make time limit, targets, and trailing stop adapt by market phase (accumulation vs run vs caution).
7) Record and show: "What % of trades closed by time limit vs rules" so we know if the exits are meaningful.
8) Make the learning match your bracket:
   - Track performance by trade style preset (short vs swing)
   - Track performance by trade size bucket (so results stay relevant to your $1,000 habit)
9) Keep learning clean by splitting it into 2 scoreboards (so one style doesn't "ruin" the other):
   - `scalp_2pct`: small target, fast exits, short time limit
   - `swing_days_weeks`: bigger targets, wider stops, longer time limit
10) Let Manual paper trades pick a style:
   - Default to your chosen style, but allow switching per trade intent
11) Make fees configurable per exchange (so your real setup is reflected):
    - For MEXC: set fee to 0
    - Still show slippage/spread as a cost (because it is real)

**Status update (2026-01-17):** Implemented 2 trade styles + MEXC fee=0 via `config/paper_trading.json`, and the paper trading report/dashboard now break down results by trade style and cost model.
