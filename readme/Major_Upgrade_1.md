# Crypto News App – Implementation To‑Do (from our chat)

Goal: improve coin selection quality, reduce “bad picks,” and make every signal explainable for personal trading use.

---

## 0) Non‑negotiables

1) **Explainability (“Why”) for every pick**
- Every recommended coin must show:
  - **Top reasons (3–5)** (data-backed)
  - **Top risks (1–3)** (data-backed)
  - **Time horizon** (hours / days / weeks)
  - **Invalidation rule** (what must happen for the idea to be wrong)
  - **Confidence** (low/medium/high) and why

2) **Stop “falling knife” recommendations**
- Add a **Trend/Regime gate** so oversold coins in a strong downtrend don’t get “buy” labels.

3) **Paper trading = learning engine**
- Every signal should be testable via paper trade and logged for outcome analysis.

---

## 1) Fix the selection criteria (highest impact)

### 1.1 Add a Trend/Regime Score (must-have)
Purpose: prevent recommendations like BCH/TON when the broader trend is still down.

Implement:
- Multi-timeframe trend (e.g., daily + weekly)
- Output label: **Uptrend / Sideways / Downtrend**
- Apply a **penalty** or **block** rule:
  - If Downtrend → never output “buy”; output “watch / high risk” unless a strong catalyst + confirmation exists.

### 1.2 Improve the entry logic beyond “dip detection”
Current issue: “oversold” alone is not enough.

Add confirmations:
- Volume confirmation (relative volume vs recent average)
- Break/hold of a key level (simple support/resistance proxy)
- Momentum flip check (avoid recommending while momentum still accelerating down)

### 1.3 Strengthen Liquidity Gate (must-have)
Volume alone is a weak proxy.

Add:
- Minimum market cap threshold
- Minimum real volume threshold
- (Optional but strong) exchange-based proxy for spread/slippage if feasible

### 1.4 Upgrade “Catalyst Quality” scoring
Separate real catalysts from noise.

Add:
- Source credibility weighting
- Catalyst type classification (listing, upgrade, regulatory, partnership, exploit, etc.)
- Penalize recycled or low-value posts

### 1.5 Dilution / Unlock gate (must-have)
If major unlock is near:
- Reduce score heavily or block “buy” unless exceptional setup.

### 1.6 Portfolio/Correlation guardrail (recommended)
If your portfolio is already high beta to BTC/ETH:
- Avoid suggesting “same trade again” unless it’s materially different.

---

## 2) Make the scoring system transparent (so you can iterate)

### 2.1 Add a “Score Breakdown” panel
For each coin, show components like:
- Trend/Regime
- Entry setup
- Volume/liquidity
- News intensity
- Sentiment
- Catalyst quality
- Risk penalties (unlock, concentration, etc.)

### 2.2 Add “Data Confidence” labels
Example:
- Price-only
- Price + news
- Price + on-chain
- Price + derivatives

This prevents trusting weak-data signals.

---

## 3) Improve the dashboard UX (make it usable in 10 seconds)

### 3.1 Default navigation = Opportunity Buckets
Buckets to implement:
- Momentum (confirmed)
- Catalyst soon
- Narrative accelerating
- Rebound candidates
- Contrarian panic
- Avoid / traps (unlock, illiquid, downtrend)

### 3.2 Story clustering (news into “story cards”)
Stop listing raw headlines.

Implement:
- Cluster related headlines into one evolving story per coin/narrative
- Show “updates” inside the story card

### 3.3 “What changed since yesterday” view
Daily delta list:
- Biggest score changes per coin
- New catalysts
- Trend/regime flips
- Risk flags appearing/disappearing

---

## 4) Paper trading upgrades (so it actually teaches you)

### 4.1 One-click paper trade from a signal card
Store:
- Entry time/price
- Signal tags (trend state, catalyst type, sentiment label)
- Planned horizon
- Invalidation rule

### 4.2 Outcome tracking + post-mortem prompts
After horizon:
- Did it hit target?
- Max drawdown after entry
- Did invalidation trigger?
- Was it a “downtrend trap”, “news faded”, “unlock hit”, etc.?

### 4.3 Performance dashboard
Track:
- Win rate by signal type
- Average return per trade
- Max drawdown
- Time-to-outcome
- Best/ worst buckets

---

## 5) Data upgrades (because your app is only as good as its inputs)

### 5.1 Decide “one paid data layer” (optional, high ROI)
Pick based on your biggest gap:
- Social/attention layer (trend detection)
- On-chain/flows layer (who’s buying/selling)
- Smart-money wallet labeling
- Derivatives positioning (funding/open interest)

Rule: add **one** paid feed first, measure improvement, then decide.

### 5.2 Improve news inputs
- If CryptoPanic isn’t active, the fallback (CoinGecko status updates) is weaker.
- Add more structured sources:
  - GitHub releases
  - Official project RSS/blogs
  - Exchange announcements

---

## 6) Safety and reliability (personal use, but avoid self-sabotage)

1) **No “BUY/SELL” without context**
Even for personal use: output should be “setup + plan,” not hype.

2) **Key/secret hygiene**
- Ensure `.env` and keys are never shipped or shared.

3) **Spam control**
- Alerts should trigger on score changes / signals, not on every news item.

---

## 7) Open decisions (you must choose)

1) **Primary holding time**
- hours vs days vs weeks (pick one as default)

2) **Scope**
- fixed watchlist only vs market-wide discovery

3) **App shape**
- keep it as report generator + dashboard, or evolve into fully interactive app (accounts, DB, saved states)

---

## 8) Build order (recommended)

Phase 1 (biggest quality jump)
1) Trend/Regime gate
2) “Why” card + score breakdown
3) Liquidity gate
4) Daily “what changed” view

Phase 2 (make it hard to fool you)
5) Catalyst quality scoring
6) Paper trade one-click + outcomes + tags
7) Performance dashboard

Phase 3 (data edge)
8) Add one paid data layer (choose based on gap)
9) Story clustering + narrative timeline
10) Alerts based on signals

---

## Progress tracker (updated 2025-09-27)

### Done
- Trend/regime gate that blocks buys in downtrends unless confirmed.
- Explainability details (why, risks, time horizon, invalidation, confidence).
- Liquidity gate with market cap + volume thresholds.
- Entry confirmations beyond “dip” (volume/levels/momentum checks).
- Score breakdown panel.
- Catalyst quality scoring (type + source weighting).
- Paper trade one-click (clipboard intent) + outcomes + tags.
- Performance dashboard for paper trades.
- Story cards that group recent headlines by coin.
- Story timeline view inside each story card.
- Alerts based on signal scores.
- Portfolio/correlation guardrail (avoid repeating the same BTC/ETH beta).
- Data confidence labels (price-only vs price+news/on-chain/derivatives).
- Opportunity bucket navigation (momentum, catalysts soon, narrative, rebound, contrarian, traps).
- Spam control for alerts (only on score/signal changes).
- Unlock/dilution gate that blocks buys if a major unlock is near.

### Still to do
- Paid data layer decision + integration.
- Improve news inputs with more sources (e.g., exchange announcements).
- Safety rules: enforce “setup + plan” wording (no raw BUY/SELL).
- Key/secret hygiene checks.
