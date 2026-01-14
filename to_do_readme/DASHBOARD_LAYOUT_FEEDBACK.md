# Dashboard Layout Feedback (Revised)

## Goal
Make the dashboard scannable in under 10 seconds, with clear action first and reference data second.

## High-Level Issues
1) Actionable sections are buried below context and data-heavy blocks.
2) Watchlist table is too dense for first-pass scanning.
3) Key terms (Entry, Beat BTC, liquidity, risk flags) are unclear without inline help.
4) Mobile layout is table-heavy and hard to parse.

## Recommended Layout Order (Desktop)
1) **Today's Focus** (top 3 actions)
   - Best setups now
   - Highest risk warnings
   - New catalysts
2) **What to Play** (market phase + buckets + short list)
3) **Best Entries** (watchlist setups only)
4) **Watchlist Table** (condensed default + expandable detail)
5) **Market Pulse** (macro context)
6) **Position Sizing** (max size guidance + liquidity notes)
7) **Story Cards** (clustered headlines)
8) **What Changed Today**
9) **Alerts**
10) **AI/DeFi/Ownership** (advanced)
11) **How to Read This Dashboard + Reports**

## Core UX Changes
- Add a **"Today's Focus"** section that summarizes the top 3 actions.
- Make **Best Entries** and **What to Play** visually dominant.
- Default **Watchlist** to a condensed view; expand for details.
- Add inline help or tooltips for: Entry, Beat BTC, Liquidity, News Pressure.
- Add a visible expand indicator on rows (chevron + "Details").
- Add a small **Key** for Entry signals (Great/Good/Wait/Overbought).

## Watchlist Density Fix
Default row should show:
- Coin, Verdict, Price, Week %, Entry, Notes (short)
Hide by default:
- 30d trend, Beat BTC, score breakdown, detailed why/risk

## Mobile Layout
- Convert tables to stacked cards.
- Keep only 3-4 key fields per card.
- Move explanation and score breakdown to a "Details" drawer.

## Visual Grouping
- Use clear section headers and spacing.
- Group actionable sections together (Focus, What to Play, Best Entries).
- Group reference sections together (Market Pulse, Position Sizing, AI/DeFi).

## Implementation Notes
- Reorder rendering in `src/render_dashboard.js`.
- Add short helper text for confusing labels.
- Keep layout changes CSS-light; use existing styles where possible.
