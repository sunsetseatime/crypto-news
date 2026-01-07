Nice, I like this a lot – this is actually a super “sticky” feature for an app.

I’ll treat this as: **“spec out the feature we’ve been doing manually so a dev team can build it.”**

---

## 1. What this feature *is* (high-level)

Call it something like:
**“BTC Macro Pulse”** or **“ETF & Market Snapshot”**

Every time it runs, it produces one compact view with:

1. **US spot BTC ETF flows** (today + last few days)
2. A **short sanity check / devil’s-advocate** note
3. **BTC leverage snapshot** (funding + open interest trend)
4. **BTC dominance + alt strength** vs BTC
5. **Alts news** (only if real, price-relevant news exists)
6. A one-line **market regime label** (e.g. “Choppy / no clear edge”)
7. **Current BTC price**

So it’s a daily “state of the market” panel that stops users overreacting to a single headline.

---

## 2. Data you need (backend)

Your backend cron job (or serverless function) needs to call:

1. **ETF flow source**

   * Any site/API that aggregates **US spot BTC ETF flows per ETF per day**.
   * Needed fields:

     * Date
     * ETF ticker (IBIT, FBTC, ARKB, GBTC, etc.)
     * Flow in USD (or BTC)
   * Output: today’s total net flow + last 4 days.

2. **Derivatives / leverage source**

   * A derivatives data API (e.g. Coinglass / Laevitas / exchange APIs).
   * Needed fields for BTC:

     * Perp **funding rate** (average across top exchanges)
     * **Futures open interest** and change vs previous day.

3. **Market-cap / dominance source**

   * A crypto market API (e.g. CoinGecko / CMC).
   * Needed fields:

     * Total BTC market cap
     * Total crypto market cap
     * Prices (24h % change) for: BTC, ETH, BNB, SOL, XRP, LTC, XMR.

4. **News source**

   * Crypto news API or RSS (CoinDesk, The Block, etc.).
   * Needed:

     * Headlines + summary
     * Tagged by asset if possible (ETH, BNB, SOL, XRP, LTC, XMR)
     * Published time (so you can filter last 24h).

5. **Price source**

   * Any reliable BTC/USD quote (or BTC/USDT if that’s your base).

---

## 3. Logic / what the feature actually *does* step-by-step

### 3.1 ETF flows module

**Input:** last 5 days of ETF flows per fund.

**Compute:**

* **Today’s net flow (all ETFs):**
  `today_total = sum(flows_today_all_etfs)`
* **Label:** “Inflow” if > 0, “Outflow” if < 0.
* **5-day running total:**
  `five_day_total = sum(flows_last_5_days)`
* **Top drivers:** sort ETFs by absolute daily flow and pick top 2–3 (e.g. IBIT/FBTC/ARKB).

**Output (plain English):**

* Sentence 1: “Today: **+$X** net inflow (or –$X outflow) across all US spot BTC ETFs.”
* Sentence 2: “Last 5 days: **net +$Y** (or –$Y).”
* Sentence 3: “Biggest movers: **IBIT +$A, FBTC –$B** …”
* Short comment: “This suggests momentum is **turning positive / still net selling / choppy**.”

You can decide the momentum tag using simple rules, e.g.:

* If `today_total > 0` and `five_day_total > 0` → “turning positive”.
* If `five_day_total < 0` and `today_total < 0` → “still net selling”.
* Else → “mixed / choppy”.

---

### 3.2 Devil’s-advocate note

This is a **small text block** that keeps users from over-trusting a single number.

Simple rule-based text:

* If **big inflow** today:

  > “Flows look strong today, but keep in mind it’s just one session, mostly driven by [top ETF]. Year-end / start-of-year rebalancing and macro news can flip this quickly.”

* If **big outflow** today:

  > “Flows look weak today, but this might include profit-taking or rotation, not just ‘everyone selling’. One red day doesn’t confirm a long-term trend.”

* If numbers are small:

  > “Flows are small relative to ETF size – today’s move is more noise than signal.”

No heavy jargon. This can be fully templated.

---

### 3.3 Leverage snapshot (BTC)

**Inputs:**

* Funding rate (number)
* Funding rate yesterday (optional)
* Open interest today vs yesterday

**Rules:**

* Funding:

  * If close to 0 → “Funding is neutral (no strong long/short crowd).”
  * If clearly positive → “More longs than shorts, mild bullish bias.”
  * If clearly negative → “More shorts than longs, mild bearish bias.”

* Open interest change:

  * Up > X% → “Open interest is rising” (more positions, more potential for squeeze).
  * Down > X% → “Open interest is falling” (de-leveraging).
  * Flat → “No big change in positioning.”

**Output example:**

> “Funding: slightly positive (modest long bias).
> Open interest: up a bit vs yesterday, but not spiking – traders are active but not heavily levered.”

---

### 3.4 BTC dominance & alt strength

**Inputs:**

* BTC dominance today vs 24h ago.
* 24h % change for BTC, ETH, BNB, SOL, XRP, LTC, XMR.

**Logic:**

* Dominance:

  * Up → “BTC gaining share vs alts.”
  * Down → “Alts gaining share vs BTC.”

* For each alt:

  * Compare its 24h % to BTC’s 24h %.
  * Stronger than BTC: mark “stronger”.
  * Weaker than BTC: mark “weaker”.
  * Roughly same: “in line with BTC”.

**Output example:**

> “BTC dominance: down slightly in the last 24h (alts gaining a bit of share).
> Stronger than BTC: ETH, SOL.
> Weaker: XRP.
> Roughly in line: BNB, LTC, XMR.”

You could display this as a tiny **heatbar** or “↑ / ↓” arrows in the UI next to each asset.

---

### 3.5 Alts news (24h)

**Inputs:**

* News feed filtered by symbol and time.

**Logic:**

* For each asset (ETH, BNB, SOL, XRP, LTC, XMR):

  * Pull headlines in last 24h.
  * Apply simple filters:

    * If words like “partnership, upgrade, mainnet, ETF approval, win, grant” → **positive**.
    * If “hack, exploit, lawsuit, ban, delist, outage, bug” → **negative**.
    * Else → **neutral** or ignore.

* Only show 0–3 biggest pieces to keep it readable.

**Output example block:**

* **XRP – positive:** “XRP gained after [short headline summary].”
* **SOL – negative:** “Solana saw pressure after [short summary].”
* If nothing meaningful:

  > “No major altcoin headlines in the last 24h – prices mostly followed BTC and general sentiment.”

---

### 3.6 Regime label

This is your **one-line mood tag** based on the above.

You can simple-rule it:

* If **ETF flows positive**, **funding not extreme**, **dominance stable** and **alts doing ok**
  → **“Risk-on / mildly bullish.”**

* If flows mixed, leverage neutral, dominance and alts send mixed signals
  → **“Choppy / no clear edge.”**

* If strong outflows, negative funding, dominance spiking sharply, or alts dumping
  → **“Risk-off / elevated flush risk.”**

This is NOT a trading signal – just a guide to conditions.

---

### 3.7 BTC price line

Simple:

> “BTC price: $XX,XXX (24h change: +Y.Y%).”

Show it at the top of the screen like a header, and again at the bottom if you want context.

---

## 4. How this fits into your app UX

### Suggested layout (one screen/card):

1. **Header bar**

   * “BTC Macro Pulse”
   * BTC price + 24h %.

2. **Card 1 – ETF flows**

   * Today’s net: big green/red number.
   * Tiny 5-day bar/line chart.
   * Text: “Inflow/outflow, 5-day total, top 2 ETFs.”

3. **Card 2 – “Context check”**

   * Devil’s-advocate paragraph (2–3 lines).
   * Goal: stop users from panic.

4. **Card 3 – Leverage**

   * Funding: “Neutral / Long-tilted / Short-tilted”.
   * Open interest: “Up / Down / Flat vs yesterday”.

5. **Card 4 – Dominance & alts**

   * BTC dominance change arrow.
   * List: ETH, BNB, SOL, XRP, LTC, XMR with small “↑ stronger / ↓ weaker / ≈ in line”.

6. **Card 5 – Altcoin news**

   * 0–3 bullet points with “Positive / Negative / Neutral” tags.

7. **Footer – Regime + timestamp**

   * “Regime: Choppy / mildly bullish.”
   * “Last updated: 07 Jan 2026, 09:05 SAST.”

---

## 5. Options you can add later

* **User-chosen base asset:** Let them switch from BTC to ETH for a similar view (ETF part stays BTC, but rest can be ETH-centric).
* **Notifications:** “Send me a push when net ETF flows > +$500M or < –$500M.”
* **Saved watchlist of alts:** Swap the default ETH/BNB/SOL/XRP/LTC/XMR list for the user’s own.

---

## 6. Questions to decide *before* you build

Just to push your thinking a bit:

1. **Update frequency:** Once per day (New York close), or rolling intraday snapshot?
2. **Which ETF flow source** will you standardise on, and do they have rate limits?
3. **Do you want this to be purely informational**, or will you link it to suggested actions (e.g. “conditions are choppy – consider smaller position sizes”)?
4. **Audience level:** Are you targeting complete beginners, or comfortable crypto users? That affects how much you explain terms like “funding” and “open interest.”

If you want, next step I can help you turn this into a more formal **product spec** (with fields, API contracts, and UI wireframe text for your dev/designer).
