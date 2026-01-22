# Improvements V1 Implementation Outline

## Goal
Improve signal quality and explainability by adding coin history context (BCH and similar cases),
building a structured news pressure model, and then improving dashboard layout for fast scanning.

## Sequencing (must follow)
1) BCH context integration
2) News filtering and weighting
3) Major_Upgrade_1 items we can implement now
4) Critique + update dashboard layout docs
5) Implement dashboard layout changes

## A) BCH Historical Context Integration

### Inputs
- Use the BCH report PDF as source material for a short summary.
- Store only distilled context, not the full report text.

### Data model
- Create or extend `config/coin_context.json` with:
  - `summary` (short plain text)
  - `short_term_only` (boolean)
  - `structural_headwinds` (string list)
  - `source` (title + local path)

### Pipeline wiring
- Load context in the main scan pipeline (`src/index.js`).
- Attach context to each coin report:
  - Use in blue chip and discovery pipelines.
  - Add a sizing penalty when `short_term_only` is true.
  - Include in risk and explainability blocks.

### UI and alerts
- Surface context summary and headwinds in the watchlist expansion.
- Add a short warning tag for short-term-only coins.
- Include context in alert details where relevant.

### Validation
- Confirm BCH shows context across dashboard, alerts, and any chat summaries.
- Verify no context appears for coins without entries.

## B) News Filtering and Pressure Scoring

### Ingestion
- Maintain a tiered list of sources with credibility weights.
- Add exchange announcement feeds if missing.
- Store point-in-time timestamps, headline, excerpt, source, and URL.

### Event detection and clustering
- Map articles to event objects to avoid double counting.
- Event object should include type, affected assets, first-seen time,
  primary source, and supporting references.

### Taxonomy and scoring
- Define event types (positive, negative, neutral).
- Assign default severity and decay half-life per type.
- Compute a per-asset pressure score with time decay.
- Apply market regime modifier (risk-on vs risk-off).

### Integration points
- Add `news_pressure` fields to coin reports in `src/index.js`.
- Use pressure in scoring, gates, and alerts.
- Expose pressure label and confidence on the dashboard.

### Validation
- Confirm negative events reduce rankings and can block setups.
- Confirm positive events decay quickly unless reinforced.

## C) Major_Upgrade_1 Items (Best-Effort Now)

### News input improvements
- Add structured sources (exchange announcements, official RSS, GitHub releases).
- Tag source freshness and label staleness clearly.

### Wording hygiene
- Replace BUY/SELL language with setup-based wording in UI and alerts.

### Secret hygiene
- Add a warning if `.env` exists but is not ignored by `.gitignore`.

## D) Dashboard Layout Work (After A-C)

### Critique and update docs
- Review `to_do_readme/DASHBOARD_LAYOUT_FEEDBACK.md` and
  `to_do_readme/DASHBOARD_SECTION_ANALYSIS.md`.
- Rewrite with clear priorities and direct action items.

### Implementation focus
- Reorder sections to surface actionable items earlier.
- Reduce watchlist density with clearer labels and a tighter default view.
- Add quick actions and "today's focus" block.
- Add tooltips or inline help for technical terms.
- Improve mobile readability.

### Validation
- Confirm critical sections are readable in under 10 seconds.
- Ensure layout changes do not hide key signals.

## Deliverables
- Updated `config/coin_context.json` with BCH context.
- News pressure scoring wired through reports, alerts, and dashboard.
- Major_Upgrade_1 best-effort fixes completed.
- Updated dashboard critique docs and revised layout implementation.

## Acceptance Criteria
- BCH context is visible and influences sizing and risk text.
- News pressure is directional, decays over time, and affects rankings.
- No raw BUY/SELL language in user-facing output.
- Dashboard sections are easier to scan with reduced confusion points.

## Remaining Work (From Chat + Task MDs)
1) Critique and update dashboard layout docs:
   - `to_do_readme/DASHBOARD_LAYOUT_FEEDBACK.md`
   - `to_do_readme/DASHBOARD_SECTION_ANALYSIS.md`
2) Implement dashboard layout changes after the doc updates.
3) App review/labeling: separate short-term trades vs longer-term plays in UI copy.
4) Major_Upgrade_1 remaining:
   - Paid data layer decision + integration.
   - Improve news inputs with more sources (exchange announcements, official feeds).
5) Improvements backlog (high priority):
   - Run-start vs accumulation alerts tuning.
   - Take-profit UX completion (ladder targets + per-position status).
   - “What to play” refinement by market phase.
   - Blue chip scanner snooze/decay.
   - Discovery funnel visuals with links.
6) Dashboard UX backlog:
   - Make hidden notes visible; clarify Action legend.
   - Show GitHub activity on watchlists.
   - Highlight best entries & blue-chip opportunities with filters.
   - Market context block layout cleanup.
7) Data/ops reliability:
   - News data freshness: explicit staleness labeling.
   - Scheduled scans with freshness badges.
   - Cache/API-key handling and clearer errors.
   - Backtest coverage for signals/gates/alerts.
