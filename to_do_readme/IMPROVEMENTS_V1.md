we just did an intersting prompt to understand BCH overtime and why its has done what is has. im think we used this prompt and the deep research info it gathered as the backbone to bluechip and waking coins and projects.
i think this is important as it gives us important context to a coin beyone technical things. for example, it might never reach its highs again due to specific reasons, therefor it might only be justifieable as short term play (2-10%)
Below is the prompt and the chat findings 

"please give me a good prompt that can explain why or understand why bitcion cash BCH has gone down or up over the years.
Thought for 6s

Here are a couple of ready-to-use prompts you can just copy-paste.

First, a simple one just for BCH, then a more advanced / app-friendly template you can reuse for any coin.

1) Simple BCH-only prompt (copy-paste)

Act as a crypto market historian and analyst.

Explain why Bitcoin Cash (BCH) has gone up and down in price over the years, from its launch in 2017 until today.

Please:

Give a short overview of BCH (what it is, how it differs from BTC).

Walk through the major price phases (for example: 2017 launch and spike, 2018 crash, 2020–2021 bull market, 2022 bear market, any later moves), and for each phase explain the main reasons for big up-moves and big down-moves.

Separate BCH-specific factors (fork drama, dev/community splits, merchant adoption, delistings, competition from other “fast payment” coins, etc.) from general crypto/macro factors (Bitcoin bull/bear market, regulation, interest rates, risk-on/risk-off).

Be clear where you are confident about the cause (e.g. tied to a clear news event) and where it is only a likely explanation or correlation.

Finish with a short section: “Key lessons from BCH’s history” – what its history suggests about how narratives, forks, and community support affect a coin’s long-term price.

Use clear, non-technical language and avoid heavy trading jargon.

2) More advanced / reusable prompt for your app

You can parametrize this, e.g. {COIN} = BCH, {START_YEAR} = 2017.

You are a crypto market historian and fundamentals-plus-macro analyst.

Task: explain the price history and major moves of {COIN} from {START_YEAR} to today. The goal is to understand why it has gone up and down over time – not to make a price prediction.

Please structure your answer like this:

Quick overview (2–3 sentences)

What {COIN} is, its main purpose/use-case, and how it originally positioned itself in the market (e.g. “Bitcoin Cash as big-block payments fork of BTC”).

Timeline of major price phases

Break history into 4–7 clear phases (e.g. launch / first bubble, post-bubble bear, later bull market, long bleed-out, renewed interest, etc.).

For each phase, describe:

Rough date range

Rough price range or key highs/lows

3–5 of the main drivers of the move, grouped as:
a) Coin-specific events – forks, protocol changes, hacks, leadership drama, ecosystem growth, listings/delistings, major partnerships or failures.
b) Broader crypto cycle – Bitcoin bull/bear market, alt-season vs BTC-dominant, stablecoin/liquidity shifts.
c) Macro / regulation – interest-rate regime, big regulatory wins/risks, ETF cycles, risk-on vs risk-off.

Factor analysis

Summarise which types of factors have mattered most for {COIN} historically (for example: internal fork drama vs BTC correlation vs macro).

If possible, note any clear pattern: e.g. “{COIN} tends to outperform in early alt-season then underperform later”, or “internal community splits line up with major down-legs”, etc.

Confidence levels

For each major explanation, say whether it’s high confidence (direct news → price reaction), medium (strong correlation, widely accepted explanation), or low (plausible but speculative).

Key lessons

End with 3–5 bullet points on what {COIN}’s history teaches about:

How forks and community splits affect long-term value

How dependent it is on Bitcoin / overall crypto cycles

How much fundamentals/adoption seem to matter vs pure narrative and speculation.

Requirements:

Use clear, plain English with minimal jargon.

Do not give investment advice or future price targets – focus strictly on explaining the historical moves and their likely causes."

Here is its report:

Bitcoin Cash (BCH) Performance & Price Action (2017–Present) pdf in the to_do_readme


another upgrade i want to do is the news filtering and weight
I had a good discussion on chatgpt about this and it had some very intersting points that may improve the quality. we just need to see how we implement it into our app.
I will paste the idea below:

Below is a **pre-draft outline** you can hand to the dev team. This is not prose yet; it is a **design-first outline** that captures what professionals actually build and what your app needs for short-term price pressure, without overengineering.

Think of this as the skeleton that will later become the MD spec.

---

### 1. Objective and Scope

Purpose:

* Provide a **short-term price pressure signal** derived from credible crypto news.
* Signal is **directional and intensity-based**, not a trade command.
* Used internally by the app to influence asset calls, rankings, and alerts.

Explicit non-goals:

* Not long-term valuation
* Not financial advice
* Not full transparency of logic in UI

---

### 2. Core Conceptual Model (High Level)

The system separates three layers:

* **Event Layer** – What happened?
* **Pressure Layer** – How much short-term price force does this create?
* **Health / Regime Filters** – Should we even trust technical setups here?

This separation is critical to avoid false positives like “oversold RSI on a dying project.”

---

### 3. News Ingestion Layer

Sources:

* Tiered credibility sources (e.g. CoinDesk, Cointelegraph, project blogs, regulator releases).
* Social sources optional and treated as low-credibility unless corroborated.

Requirements:

* Store **original publish timestamp** (point-in-time).
* Capture headline, excerpt, source, URL.
* Do not assume all articles are independent signals.

Constraints:

* Respect licensing (headline + short excerpt + link only).

---

### 4. Event Detection and Clustering

Core idea:

* Multiple articles may describe the **same underlying event**.
* The system must identify and cluster them into **one event object**.

Event object contains:

* Event type
* Affected assets (coins/projects)
* Primary source vs secondary reporting
* First-seen timestamp
* Supporting articles (references only)

Why this matters:

* Prevents double-counting pressure.
* Matches how professionals reason about “events,” not articles.

---

### 5. Event Taxonomy (Initial Set)

Event types that matter for short-term price pressure:

Negative (typically stronger impact):

* Core dev team departure / governance breakdown
* Exploit, hack, critical vulnerability
* Exchange delisting / trading halt
* Regulatory enforcement or ban
* Chain halt or consensus failure

Positive (context-dependent):

* Exchange listing (credible venues only)
* Protocol upgrade / mainnet launch (if imminent)
* Regulatory approval / clarity
* Confirmed supply reduction / emission change

Neutral / low signal (usually decay fast):

* Partnerships
* Marketing announcements
* Non-binding “plans” or roadmaps

Each event type has:

* Default severity range
* Default decay half-life
* Typical asset sensitivity profile

---

### 6. Pressure Scoring Model (Short-Term)

PressureScore is calculated at the **event level**, then decays over time.

Inputs:

* Source credibility (primary > secondary)
* Event severity (by type)
* Asset relevance (how dependent the asset is on this factor)
* Surprise factor (unexpected vs already discussed)

Output:

* Scalar score (e.g. −100 to +100)
* Directional (positive / negative)
* Time-decayed continuously

Key property:

* Score represents **price pressure**, not “good vs bad project.”

---

### 7. Time Decay and Persistence

Different events decay differently:

* Exploits, delistings, dev exits → slow decay
* Listings, partnerships → fast decay

Implementation:

* Exponential decay with event-specific half-life.
* PressureScore trends toward zero unless reinforced by new events.

---

### 8. Project Health Filter (Slow-Moving Gate)

Purpose:

* Prevent structurally weak or abandoned projects from being promoted due to technical signals alone.

HealthScore inputs:

* Development activity (commits, contributors, time since last release)
* Usage / adoption proxy (on-chain activity where relevant)
* Market quality (liquidity, venue count)
* Long-term price regime (persistent drawdown vs recovery)
* Narrative activity (low weight)

Usage:

* HealthScore does **not** predict price.
* It gates recommendations:

  * Low health → “speculative” or “avoid,” even if RSI oversold.
  * Healthy → technical and pressure signals allowed to matter.

---

### 9. Market Regime Filter (Global Context)

Purpose:

* Adjust interpretation of news based on broader conditions.

Inputs:

* BTC trend and volatility
* Overall market risk-on / risk-off state

Effect:

* In risk-off regimes, negative news amplified, positive news muted.
* In risk-on regimes, decay faster and allow upside follow-through.

---

### 10. Liquidity and Tradability Constraints

Requirements:

* Minimum liquidity / volume thresholds.
* Flag assets where pressure signals are informational only, not tradable.

Why:

* Prevents manipulation and misleading outputs on illiquid assets.

---

### 11. Outputs to the App Layer

Internal outputs per asset:

* Current PressureScore
* HealthScore
* TechnicalScore (existing indicators like RSI)
* Confidence / validity flag

User-facing abstraction:

* Avoid / Watch / Speculative / Favorable
* Optional short explanation text (not raw scores)

---

### 12. Data Integrity and Auditability

Critical requirements:

* Point-in-time storage (no rewriting history).
* Preserve original timestamps and sources.
* Allow internal review of why a score existed at a given time.

This protects you from:

* Lookahead bias
* Silent model drift
* Misleading historical analysis

---

### 13. Known Failure Modes (Explicitly Acknowledged)

* News latency vs competitors
* Recycled headlines inflating pressure
* Social manipulation
* Dead projects looking “cheap”
* Strong news ignored in hostile regimes

Design explicitly addresses each of these.

---

### 14. Future Extensions (Optional)

* Volatility / jump-risk alerts (non-directional)
* Vendor integration for sentiment/news feeds
* Exchange-specific alerts (halts, delists)
* Post-event performance analytics (internal only)

---




We still need to tackle imrpoveing the layout of the dashboard and its sections for readability and easy understanding. please refer to both dashboard_layout and dashboard_section md files. critique them, then update the md files, then implement, only implement once the 2 above elements (bch idea & new element) are implemented as well as what we can implement to our best ability of the major-upgrade_1 md file. 