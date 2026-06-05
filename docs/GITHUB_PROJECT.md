# GitHub Project Setup

Use GitHub Issues and GitHub Projects as the public project system. Avoid putting the roadmap only in private notes because outside contributors need to see what is planned.

## Project Board

Create one GitHub Project named:

```text
Exam Quest AI Roadmap
```

Current project:

```text
https://github.com/users/ijbhxhu/projects/1
```

Suggested columns:

```text
Backlog
Ready
In Progress
Review
Done
```

Suggested custom fields:

```text
Priority: P0, P1, P2
Area: frontend, backend, ai, data, infra, docs
Milestone: v0.1, v0.2, v0.3, v0.4, v1.0
```

## Milestones

```text
v0.1 Hackathon Cleanup
v0.2 Data Foundation
v0.3 Parent Download Flow
v0.4 Child Game Flow
v1.0 Open Source Release
```

## Labels

```text
area:frontend
area:backend
area:ai
area:data
area:infra
area:docs
priority:p0
priority:p1
priority:p2
good first issue
help wanted
blocked
```

## Seed Issues

Copy these into GitHub Issues after the repository is created.

### [P0] Create D1 database and apply schema migration

Apply `migrations/0001_initial.sql` to the Cloudflare D1 database and confirm the app can query it through the `EXAM_DB` binding.

### [P0] Create private R2 bucket for mirrored PDFs

Create the R2 bucket, bind it as `PDF_BUCKET`, and keep it private.

### [P0] Run PDF scan and size audit pipeline

Run `npm run mirror:scan` and `npm run mirror:audit`, then review total storage before downloading.

### [P0] Import PDF manifest into D1

Run `npm run manifest:sql` and import `data/import-pdfs.sql` into D1.

### [P0] Stream private R2 PDFs through `/api/pdf`

Confirm browser downloads go through `/api/pdf?id=...` and do not expose R2 object URLs.

### [P1] Enforce configurable 30/day PDF download limit

Confirm `PDF_DAILY_LIMIT` controls anonymous daily download limits.

### [P1] Add lazy OCR cache lookup before calling OpenAI

Confirm an existing public question pack is returned before re-OCRing the same PDF.

### [P1] Store generated question packs in R2 and D1

Confirm generated question packs are written to `question-packs/...` in R2 and inserted into D1.

### [P1] Improve child game state and parent report

Track attempts, wrong skills, and completion state in a parent-friendly report.

### [P2] Add Cloudflare Turnstile for PDF downloads

Add Turnstile only to the parent PDF download flow, not the child game flow.
