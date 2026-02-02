# Big Repo Changes (Plain English)

## Big picture

- This repo is a "daily crypto research scanner" that pulls data, applies rules, and generates a dashboard (`Dashboard.html`) that tries to answer: "What should I look at today, what's risky, and what looks real vs noisy?"
- It's strongest as a time-saver and mistake-reducer (avoid obvious traps), not as an "automatic money printer".

## What the app actually does (feature inventory)

### Watchlist scan (your chosen coins)

- Pulls market data, flags common retail traps (low liquidity, dilution risk, unlock risk, chasing), and produces a simple decision + explanation per coin.
- Separates two ideas so they don't get mixed up:
  - **Quality**: `KEEP` / `WATCH-ONLY` / `DROP` (should this be in your 15-20 "core list"?)
  - **Timing**: `Buy now` / `Wait for dip` (is this a good moment to enter?)

### TA (technical analysis)

- Technical analysis (TA) = chart-based signals.
- Adds "volume + price structure" signals: RVOL (relative volume), regime (uptrend/downtrend/range), key levels, and event tags (breakout, reclaim, hold, failed breakout, distribution, capitulation, relief rally).
- Produces an "Interest Score" (0-100) + confidence.

### News/catalysts layer

- Tries to distinguish real catalysts (exchange listings, GitHub releases, RSS) from hype.
- Explicitly shows when news is missing so you don't assume it's "broken".

### Alerts

- Creates a "what needs attention" list (market condition alerts, discovery alerts, etc.).

### Macro Pulse

- A quick "market weather report" (fear/greed, BTC context, etc.) so you don't trade blind.

### Discovery funnel (new coins)

- Finds "new-ish / trending" coins, puts them into a queue, lets you stage them, then promote them.
- Important: discovery is "ideas to research", not "buys".

### Signal Engine (fundamentals monitor by niche)

- Tracks a small fixed list (by niche) and tries to show "hard-to-fake" fundamentals movement.
- Suggests new candidates per niche (needs manual approval).

### Paper trading (learning tool)

- Simulates trades so you can learn patterns (what worked, what didn't) using tags and breakdowns.
- Goal: become a feedback loop (not just a trade log).

### Backtesting (does the system help?)

- Tracks past "predictions" and later measures outcomes (7/14/30 days), grouped by labels/tags.

### Chat (the "explain it to me" interface)

- Adds an "Ask the dashboard" chat panel over the dashboard.
- Answers from the reports (and optionally does "research mode" for extra context/links).

## What's strong (why this app is good)

- You built the right philosophy: "rules first, narration second".
  - Deterministic rules ("Layer 1") keep the system honest and reduce "AI making stuff up".
- It's designed for a real workflow.
  - The output is one dashboard you can check daily instead of juggling tabs.
  - The "staging -> promote" funnel helps avoid impulsively adding junk.
- It tries to prevent the most common retail losses.
  - "Don't chase", "don't buy low liquidity", "watch dilution/unlocks", and "don't trust volume-less moves" are all practical.
- It's learning-oriented.
  - Paper trading + breakdowns are exactly what you want if the goal is "spot patterns and get better".

## What's confusing / risky (where it can mislead you)

- Some numbers are "proxies" (stand-ins), and proxies can lie.
  - Example: CoinGecko trading volume is not real usage. It can be exchange churn or bots.
  - Example: DefiLlama fees are closer to real activity, but still may not map cleanly to the token's value.
  - Best practice: whenever a proxy is used, the UI should say "this is a proxy" and show confidence.
- The app does two jobs that fight each other:
  - Job A: "Is this a good project?" (fundamentals / tokenomics / survivability)
  - Job B: "Is now a good time to buy?" (timing / chart structure / market phase)
  - Even with Quality vs Timing split, humans naturally merge them. That's where bad decisions happen.
- Scores can create false confidence.
  - A 78/100 looks precise, but it's still built from incomplete data + chosen thresholds.
  - Best practice: show "why this score is uncertain" as prominently as the score itself.
- Data coverage is uneven across niches.
  - DeFi has better public metrics (TVL, fees, revenue).
  - AI compute, infra, RWAs often have weaker public metrics, so you'll see "not tracked" or proxies.
  - Best practice: be honest about what can't be tracked automatically (and use a curated layer where needed).
- Paper trading realism limits what you can conclude.
  - If fills/slippage/partial fills/timeframes don't match how you really trade, you should treat the results as "learning signals", not proof.

## Concrete improvements (practical, high-impact)

### Make the "two-layer decision" impossible to confuse

- What: Visually separate "Project Quality" (`KEEP/WATCH-ONLY/DROP`) from "Entry Timing" (`Buy now/Wait for dip`) with an explicit decision rule ("Only consider Timing if Quality is KEEP").
- Why: Prevents the #1 failure mode: great chart on a bad coin, or great project bought at awful timing.
- How to verify: In the dashboard, a user can explain the difference in 10 seconds and stops treating `KEEP` as "buy".

### Add a "Data Confidence" indicator per coin (and per Signal Engine metric)

- What: One simple indicator that says: "We have strong data / partial data / mostly proxies."
- Why: Stops you from trusting the same score equally across coins with wildly different data coverage.
- How to verify: Coins with missing unlock/TVL/on-chain info clearly show lower confidence without needing to click.

### Tokenomics / unlock schedule becomes first-class (not a footnote)

- What: A dedicated "Supply & Unlocks" block with: locked %, unlock risk window, next unlock estimate, and a "source + confidence".
- Why: Tokenomics is one of the biggest real drivers of dumps.
- How to verify: For each coin, you can answer: "Could supply expand and crush me in the next month?"

### Exchange reality + tradeability becomes explicit

- What: Show "Where can I actually buy this?" (top exchanges) + "Is liquidity real?" (spread/volume sanity) + chain/bridge risk notes.
- Why: A good project is still a bad trade if you can't enter/exit safely, or it's stuck on sketchy venues.
- How to verify: Discovery coins stop "looking exciting" if they're only on thin venues.

### Close the learning loop (carefully): paper trading should change your defaults

- What: Use paper results to recommend parameter tweaks (not auto-trading), like: "failed breakouts underperform -> tighten ruleset B" or "this market phase needs smaller targets".
- Why: Learning is only valuable if it changes behavior.
- How to verify: Each week, the dashboard suggests 1-3 specific rule adjustments backed by your own results.

### Add "Why it changed" explanations in the Diff section

- What: When a coin flips `KEEP -> WATCH-ONLY`, show the top 1-2 drivers (example: "unlock risk flagged" or "distribution tag appeared").
- Why: Humans don't learn from raw diffs; they learn from causes.
- How to verify: You can skim the diff and immediately know what to investigate.

### Build a small "Fundamentals registry" you can curate (best practice for weak-data niches)

- What: A simple per-coin profile file for tokenomics links, status pages, dashboards, key metric sources (Token Terminal / DefiLlama / Dune / official docs), and "what matters" notes.
- Why: AI compute + infra + RWAs often require curated sources; automation alone won't cover them well.
- How to verify: "Not tracked" shrinks over time because you can fill in sources once and benefit forever.

### Make Signal Engine's niche suggestions smarter than "what data exists"

- What: Add filters like minimum liquidity, minimum listings quality, "avoid obvious hype pumps", plus a penalty for extreme dilution/ownership.
- Why: Otherwise you'll get suggestions that are data-available but not tradable or not sane to track.
- How to verify: Suggested candidates feel like real research leads rather than random coverage artifacts.

### Chat: add "show your work" by default

- What: Every chat answer includes a compact "Sources used" line (report file + section) and "Missing data" line.
- Why: Prevents accidental hallucination/confidence.
- How to verify: When chat is wrong, you can see why instantly (bad input vs bad reasoning).

### Refactor for safety: the main scan logic is too large to change confidently

- What: Split the big scan pipeline into smaller modules (data fetchers, scoring, rendering, paper trading) and add a few sanity checks per module (like you already do for TA).
- Why: It reduces breakage and makes future features cheaper to add.
- How to verify: New features stop causing weird side effects in unrelated parts of the scan.

## If you want the highest ROI next (shortlist)

- Make Quality vs Timing separation even more obvious (prevents expensive mistakes).
- Make tokenomics/unlocks + listings/tradeability front-and-center (best non-chart data).
- Add "show your work" to chat + diff explanations (turns the app into a true teacher, not just a dashboard).

