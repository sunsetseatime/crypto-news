# Plain-English defaults (project)

- Always explain in plain English first. Assume I am not a programmer.
- Avoid jargon. If you must use a technical term, define it in one short line.
- When proposing a code change, include:
  1) What you are changing (one sentence)
  2) Why (one sentence)
  3) How to verify it worked (exact steps I can follow)
- Keep answers structured with short bullet points, not long paragraphs.
- If you need info from me, ask one clear question at a time.

---

## Documentation checklist (keep docs in sync)

Changelog = a dated list of what changed.

- If you add/change a user-facing feature, a report format, or the dashboard UI, update the relevant docs before finishing:
  - `README.md` (short overview + links)
  - `readme/README.md` (full guide)
  - `readme/DEMO_GUIDE.md` (demo steps), if affected
  - If `CHANGELOG.md` exists: update it. If not: update `CHANGELOG_LAST_2_DAYS.md` and suggest creating `CHANGELOG.md`.
  - `to_do_readme/ISSUES_AUDIT_AND_NEXT_STEPS.md` (mark done / add next steps) when the change relates to the audit list
- If you add a new “how to” doc, add a link to it from `README.md`.
