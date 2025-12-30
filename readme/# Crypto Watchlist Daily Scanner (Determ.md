# Crypto Watchlist Daily Scanner (Deterministic + AI Supervisor)

## 0) Goal
Send a daily email (and optional web view) that scans a fixed watchlist using strict, repeatable rules:
- Market data (price/returns/volume)
- Catalysts (only "clean" if within last 14 days and sourced)
- Unlock / dilution risk
- Liquidity / execution risk
- Hygiene gate: KEEP / WATCH-ONLY / DROP
- Ranking + top 3 watch / top 3 avoid

Design principle:
- **Layer 1 is the truth** (deterministic, rules-based).
- **Layer 2 is the narrator** (optional AI summary). It must never invent facts.

---

## 1) Watchlist (15)
Core (prefer ~12-18 months since TGE/listing; allow newer if they meet criteria):
- UDS
- ZK (zkSync)
- ZRO
- TAIKO
- ATH
- IO
- NOT
- EIGEN
- MORPHO
- SWELL
- USUAL

Legacy rebound tracking:
- GALA
- LPT
- GLM
- ICP

Config file:
- `config/watchlist.json` includes:
  - symbol
  - coinGeckoId (preferred)
  - project URLs (official site, X, blog, GitHub)
  - optional notes (category: L2, DeFi, gaming, AI, etc.)

---

## 2) Data Sources (minimum)
We should use:
- **At least 1 primary market-data source** (CoinGecko preferred)
- **At least 1 unlock source** (Tokenomist preferred, but budget-friendly alternatives allowed)
- **Catalyst sources**: official blog/X/GitHub + reputable crypto news

### 2.1 Market data (preferred)
- CoinGecko:
  - `/coins/markets` for price + 24h vol + 24h/7d/30d % (when available)
  - `/coins/{id}/market_chart?days=30` to compute:
    - 7d average daily volume
    - 30d average daily volume
    - basic volatility proxy (optional)

Fallbacks (if CoinGecko fails):
- CoinMarketCap (if key exists)
- Major exchange page (last resort)

### 2.2 Unlock / vesting sources (budget reality)
Best effort (in this order):
1) Tokenomist (if we have affordable access; otherwise skip)
2) DefiLlama unlocks (if available for the token)
3) CryptoRank (if available)
4) DropsTab (if available)

Rule:
- If unlock data cannot be verified from a recognized source, set:
  - `unlock_confidence = "UNKNOWN"`
  - and block "ACTIONABLE" classification for that coin.

### 2.3 Catalyst sources
Sources we trust:
- Official project blog / announcements page
- Official X/Twitter (project account)
- GitHub releases/tags (real versioned releases)
- Reputable crypto news sites (only for secondary confirmation)

Rule:
- Catalyst must be:
  - within last 14 days
  - and linkable (URL + date)
  - and explainable as a real event: launch/mainnet/release/listing/integration/users/revenue/regulatory

---

## 3) Time window rules
- Only label **Clean catalyst** if the key event date is within last **14 days**.
- Otherwise: `clean_catalyst = "No clean catalyst in last 14 days"`

---

## 4) Trend confirmation (avoid chasing)
"Waking up" requires BOTH:
1) `price_change_7d > 0`
2) `volume_24h > volume_baseline`

Baseline definition (state which used):
- Prefer: 24h volume compared to **7d avg daily volume** computed from 7d market_chart slice
- Also compute 30d avg daily volume for context

Flags:
- If price up but volume down: `thin_fragile = true`
- If price up massively in a short window without clean catalyst: `chasing = true`
  - "massively" heuristic: e.g. 7d > +40% OR 24h > +20% (tunable)

---

## 5) Supply / dilution rules
For each coin, report:
- circulating supply (if available)
- total/max supply (if available)
- market cap and FDV (if available)
- marketcap_to_fdv ratio (if available)

Flags:
- `high_dilution_risk = true` if:
  - float% < 20% OR MarketCap/FDV < 0.20 OR FDV >> MarketCap (very large gap)
- `low_float_risk = true` if circulating supply is small relative to total/max

Unlock alerts (next 30 days):
Flag if unlock in next 30 days is either:
- > 1% of circulating supply OR
- > $10m estimated value
If unlock data is missing: mark UNKNOWN and block actionability.

---

## 6) Liquidity / execution checks
Flag low liquidity if:
- 24h spot volume is low relative to market cap (heuristic),
- OR volume is mostly perps-driven (if detectable; otherwise note "unknown").

Heuristic examples (tunable):
- `low_liquidity = true` if 24h spot volume < $5M
- `high_slippage_risk = true` if $1M-$5M
- Usually DROP if < $1M unless exceptional AND trackable
If spot-only volume is not available, use reported total volume as a proxy and note that the spot/perps split is unknown.

---

## 7) Watchlist hygiene gates (KEEP / WATCH-ONLY / DROP)
For each coin, decide one:

Gates (score 3/4 to KEEP; otherwise WATCH-ONLY or DROP):
1) Trackable data:
   - price + 24h/7d/30d + volume + circulating + (FDV or total/max)
2) Liquidity:
   - prefer 24h spot vol > $5M
3) Unlock transparency:
   - unlock/vesting source exists from our allowed list
4) Traction evidence:
   - at least one credible signal (TVL/users/fees, shipped product, real dev releases, live integration)

Labels:
- KEEP: 3/4 or 4/4, and no severe warnings
- WATCH-ONLY: interesting but blocked due to near-term unlock risk, dilution, or weak gate score
- DROP: fails trackability/liquidity/credibility (or unlock transparency totally missing + poor liquidity)
If unlock data is UNKNOWN but other gates are strong, default to WATCH-ONLY (not KEEP).

Rule:
- DROP coins are not ranked. They go at bottom unranked.

---

## 8) Output requirements (per coin)
For EACH coin include:
- Price (USD), 24h %, 7d %, 30d %
- 24h volume + volume trend vs baseline (7d avg and/or 30d avg - state which)
- Clean catalyst (within 14 days) + why it matters + source link
- Risk flags:
  - unlocks (next 30d) + confidence
  - dilution / low float
  - low liquidity / perps-driven risk
  - missing traction
- Hygiene label: KEEP / WATCH-ONLY / DROP + which gates failed

---

## 9) Ranking
Rank KEEP and WATCH-ONLY coins by:
1) Cleanest catalyst within 14 days (real event + strong evidence)
2) Lowest chase risk (not blow-off, volume confirms)
3) Lower dilution and higher liquidity (tie-breaker)

Finish with:
- Top 3 watch closely
- Top 3 avoid/chasing
- Suggested removals/additions for tomorrow:
  - removals: any DROP coins
  - additions: 3 candidates that fit:
    - usually 12-18 month-ish TGEs
    - OR newer only if: real product shipping + decent liquidity + manageable unlock risk

---

## 10) Execution + hosting (recommended)
### Option A: GitHub Actions (recommended MVP)
- Runs daily even when PC is off.
- Scheduled workflow triggers `node src/index.js`.
- Secrets stored in repo settings:
  - COINGECKO_API_KEY (optional)
  - OPENAI_API_KEY (optional)
  - EMAIL_PROVIDER_KEY
  - EMAIL_TO, EMAIL_FROM

### Option B: Vercel cron + Next.js API route
- Good if we want a dashboard.
- Cron hits `/api/daily-scan` which runs scan + emails report.

---

# 20) Optional AI Supervisor Summary (keeps the summary YES/NO + why)
Purpose:
- Turn Layer 1 JSON into a short, readable summary + top picks.
- AI MUST NOT invent catalysts or override rules.

Two-layer design (non-negotiable):
- Layer 1: deterministic scan produces `Layer1Report.json`
- Layer 2: AI reads Layer 1 JSON only, outputs `SupervisorSummary.json`

If AI fails:
- Send deterministic report anyway with banner "AI summary unavailable".

## 20.1 Model choice
- Keep model configurable via env var:
  - `OPENAI_MODEL_SUPERVISOR` (example default: "gpt-5.2" or other flagship available to your account)
- Don't cheap out on the supervisor model, because the input is small and the value is judgement.

## 20.2 Structured Outputs (JSON Schema)
We enforce schema so the AI can't drift.

### Supervisor output JSON Schema
(Used in the OpenAI request as json_schema.)

{
  "name": "daily_watchlist_supervisor_output",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "actionable_today": { "type": "boolean" },
      "executive_summary": { "type": "string" },
      "watch_closely": {
        "type": "array",
        "maxItems": 3,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "symbol": { "type": "string" },
            "verdict": { "type": "string", "enum": ["WATCH CLOSELY"] },
            "why": { "type": "string" },
            "key_data_points": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["symbol", "verdict", "why", "key_data_points"]
        }
      },
      "avoid_chasing": {
        "type": "array",
        "maxItems": 3,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "symbol": { "type": "string" },
            "verdict": { "type": "string", "enum": ["AVOID/CHASING"] },
            "why": { "type": "string" },
            "key_data_points": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["symbol", "verdict", "why", "key_data_points"]
        }
      },
      "manual_checks_required": { "type": "array", "items": { "type": "string" } },
      "source_links_used": { "type": "array", "items": { "type": "string" } }
    },
    "required": [
      "actionable_today",
      "executive_summary",
      "watch_closely",
      "avoid_chasing",
      "manual_checks_required",
      "source_links_used"
    ]
  }
}

## 20.3 Hard constraints the AI must follow
1) It must NOT change any numeric values.
2) It must NOT claim a "clean catalyst" unless Layer 1 provides:
   - a qualifying catalyst source link AND
   - the event date within 14 days.
3) If unlock_confidence is UNKNOWN/LOW, it must say:
   - "Not actionable until verified."
4) If Layer 1 flags `chasing=true`, it must place coin in avoid/chasing unless clean catalyst exists and chasing flag is false.
5) It must only list `source_links_used` that appear in Layer 1 JSON.

## 20.4 Keep tokens low (important)
Send only:
- Layer 1 JSON results
- the small set of catalyst titles/links already collected
Do NOT send full articles.

---

## 21) Sample OpenAI Responses API call (Node.js, Structured Outputs)
NOTE: this is implemented in `src/index.js` with proper error handling + retries.

```javascript
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL_SUPERVISOR || "gpt-4o";

const supervisorSchema = {
  name: "daily_watchlist_supervisor_output",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      actionable_today: { type: "boolean" },
      executive_summary: { type: "string" },
      watch_closely: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: { type: "string" },
            verdict: { type: "string", enum: ["WATCH CLOSELY"] },
            why: { type: "string" },
            key_data_points: { type: "array", items: { type: "string" } }
          },
          required: ["symbol", "verdict", "why", "key_data_points"]
        }
      },
      avoid_chasing: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: { type: "string" },
            verdict: { type: "string", enum: ["AVOID/CHASING"] },
            why: { type: "string" },
            key_data_points: { type: "array", items: { type: "string" } }
          },
          required: ["symbol", "verdict", "why", "key_data_points"]
        }
      },
      manual_checks_required: { type: "array", items: { type: "string" } },
      source_links_used: { type: "array", items: { type: "string" } }
    },
    required: [
      "actionable_today",
      "executive_summary",
      "watch_closely",
      "avoid_chasing",
      "manual_checks_required",
      "source_links_used"
    ]
  }
};

async function runSupervisor(layer1Report) {
  const systemMsg =
    "You are a strict crypto research supervisor. " +
    "Do not hype. Do not invent facts. " +
    "Only use the provided JSON. " +
    "Do not claim a clean catalyst unless it is dated within 14 days and linked. " +
    "If unlock data is UNKNOWN/LOW, mark not actionable and say it needs verification.";

  const userMsg =
    "Summarize today's scan strictly using the provided JSON only. " +
    "Return JSON matching the schema.\n\n" +
    JSON.stringify(layer1Report);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg }
      ],
      text: {
        format: {
          type: "json_schema",
          json_schema: supervisorSchema
        }
      }
    })
  });

  const data = await response.json();
  // Parse output_text (valid JSON because schema is enforced)
  return JSON.parse(data.output_text);
}

