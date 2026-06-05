# Project Plan

## Product Positioning

Exam Quest AI is a parent and child exam-prep tool:

- Parents search, download, and print PDFs.
- Children practice online through a playful voice game.
- OCR and question generation happen only when a game starts.
- Generated question packs can be reused publicly.

## Milestones

### v0.1 Hackathon Cleanup

- Remove visible prototype rough edges.
- Add README, license, roadmap, and issue templates.
- Rotate exposed keys before any public release.
- Keep the existing live scraper fallback for demos.

### v0.2 Data Foundation

- Add D1 schema for PDF index, mirror status, OCR status, download events, and practice sessions.
- Add R2 path conventions.
- Add scan, audit, download, upload, and D1 import scripts.
- Keep PDFs out of the repository.

### v0.3 Parent Download Flow

- Search from D1 when available.
- Serve PDFs through a private R2 streaming endpoint.
- Enforce configurable daily downloads, defaulting to 30 per day.
- Add Turnstile before public launch if abuse becomes likely.

### v0.4 Child Game Flow

- Trigger OCR only when the child starts a game.
- Store OCR JSON and question-pack JSON in R2.
- Reuse public question packs for the same PDF.
- Record anonymous practice sessions and answer outcomes.

### v1.0 Open Source Release

- Provide clear Cloudflare deployment docs.
- Provide seed/sample data without third-party PDFs.
- Add contribution guide and good-first-issue list.
- Publish a public roadmap and GitHub Project.

## GitHub Project Columns

- Backlog
- Ready
- In Progress
- Review
- Done

## Initial Issues

- [P0] Create D1 database and apply schema migration
- [P0] Create private R2 bucket for mirrored PDFs
- [P0] Run PDF scan and size audit pipeline
- [P0] Import PDF manifest into D1
- [P0] Stream private R2 PDFs through `/api/pdf`
- [P1] Enforce configurable 30/day PDF download limit
- [P1] Add lazy OCR cache lookup before calling OpenAI
- [P1] Store generated question packs in R2 and D1
- [P1] Improve child game state and parent report
- [P2] Add Cloudflare Turnstile for PDF downloads
- [P2] Add contributor guide and public demo guardrails

## Labels

- `area:frontend`
- `area:backend`
- `area:ai`
- `area:data`
- `area:infra`
- `area:docs`
- `priority:p0`
- `priority:p1`
- `priority:p2`
- `good first issue`
- `help wanted`
- `blocked`
