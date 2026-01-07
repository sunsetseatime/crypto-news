# Paper Trading & Signal Learning System - Design Document

This is a rough design idea (not implemented yet).

## 1. Purpose

Build a **paper trading system** that tests whether trading signals add real value, separates signal quality from execution quality, and generates evidence-based improvements without risking capital.

Goals:

- Measure signal effectiveness honestly (with friction).
- Avoid hindsight bias and overfitting.
- Learn which signals, thresholds, and exits actually work.
- Produce clear recommendations, not automatic tuning.

---

## 2. Core Principles

1. **Signals are not trades**
   - Every signal is recorded.
   - Only some signals become paper trades.

2. **Experiments > opinions**
   - Fixed rules.
   - Consistent sizing.
   - Comparable exits.

3. **Friction included**
   - Fees, slippage, and imperfect fills are modeled.

4. **Learning is advisory**
   - The system suggests changes.
   - A human decides.

---

## 3. System Architecture (High Level)

Scanner
- SignalEvent logging (all signals)
- Execution filter (thresholds and rules)
- PaperTrade creation
- Daily updater
- Exit evaluation
- Metrics engine
- Learning and recommendations
- Dashboard

---

## 4. Data Models

### 4.1 SignalEvent (log everything)

```json
{
  "signal_event_id": "uuid",
  "timestamp": "2026-01-07T10:00:00Z",
  "symbol": "ETH",
  "coin_gecko_id": "ethereum",
  "signal_type": "strong_buy | buy | weak_buy",
  "signal_score": 78,
  "signal_reason": "RSI oversold (32), 18% from 30d high",
  "signal_source": "watchlist_entry | blue_chip_dip | best_entries | manual",
  "market_phase": "accumulation | run | caution",
  "market_context": {
    "btc_trend": "up | down | flat",
    "fear_greed": 28
  },
  "signal_version": "v1.3.0"
}
```

Why:

- Allows retroactive testing of different thresholds.
- Separates signal quality from execution rules.

---

### 4.2 PaperTrade (only when executed)

```json
{
  "trade_id": "uuid",
  "signal_event_id": "uuid",
  "symbol": "ETH",
  "pair": "ETH/USDT",
  "exchange": "binance",
  "entry_date": "2026-01-07T10:00:00Z",
  "entry_price": 2450.5,
  "position_size_usd": 1000,
  "qty": 0.408,
  "fees_estimate": 1.0,
  "slippage_estimate": 0.15,
  "entry_score": 78,
  "market_phase": "accumulation",
  "strategy_id": "base_long_v1",
  "exit_strategy_id": "tp_trailing_v1",
  "status": "open",
  "days_held": 0,
  "current_price": 2450.5,
  "current_pnl_pct": 0,
  "mae_pct": 0,
  "mfe_pct": 0,
  "exit_date": null,
  "exit_price": null,
  "exit_reason": null,
  "baseline_return_pct": null,
  "btc_return_pct": null
}
```

---

## 5. Execution Rules (Signal -> Trade)

Default rules:

- Only signals with `signal_score >= STRONG_BUY_THRESHOLD` become trades.
- One open position per symbol per strategy.
- Fixed position size (for example, $1000).

Optional future rules:

- Allow pyramiding only if score increases and market phase is `run`.

---

## 6. Exit Strategy Abstraction

Exit logic must be modular.

Example ExitStrategy:

```json
{
  "exit_strategy_id": "tp_trailing_v1",
  "take_profit_targets": [
    { "pct": 10, "sell_pct": 30 },
    { "pct": 20, "sell_pct": 30 }
  ],
  "trailing_stop_pct": 8,
  "time_stop_days": 45,
  "score_decay_exit": true
}
```

Benefits:

- Compare exits independently of entries.
- Identify where profits are lost.

---

## 7. Daily Update Engine

Runs once per day:

- Update current price.
- Update PnL.
- Update MAE/MFE.
- Check exit conditions.
- Record exit when triggered.
- Calculate baseline comparisons:
  - Coin buy-and-hold
  - BTC/ETH buy-and-hold

---

## 8. Metrics Engine

### Core Metrics

- Win rate
- Average return
- Expectancy
- Average days held
- MAE / MFE
- Max drawdown

### Breakdown Dimensions

- Signal type
- Signal score ranges
- Signal source
- Market phase
- Liquidity bucket (large / mid / small)

Win rate alone is not trusted. Expectancy is the primary score.

---

## 9. Learning & Recommendations Engine

TBD.
