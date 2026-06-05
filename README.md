# Exam Quest AI

Exam Quest AI is a parent-first exam practice app for Taiwan elementary school families. Parents can search for exam PDFs with natural language, download printable papers, and turn a PDF into a voice-friendly practice game for children.

This repository contains the application code, Cloudflare architecture, database migrations, and mirror tooling. It does not contain third-party PDFs.

## What It Does

- Natural-language exam paper search, for example: `小三數學康軒上學期期中考`
- Parent PDF download flow with a configurable daily limit
- Private R2-backed PDF delivery through a Pages Function
- Lazy OCR: only OCR a PDF when a child starts a game
- Reusable public question packs generated from OCR results
- Voice Q&A practice with OpenAI Realtime and browser speech recognition fallback

## Architecture

```text
React / Vite
  -> Cloudflare Pages Functions
  -> D1: index, mirror status, OCR status, download events
  -> R2: mirrored PDFs, OCR JSON, question-pack JSON
  -> OpenAI: Realtime, answer judgement, OCR/question generation, images
```

PDF files are mirrored from public Google Drive links into a private R2 bucket. The browser never receives the R2 key. Downloads go through `/api/pdf?id=...`, where the Function checks the D1 record and applies the daily download limit before streaming the object.

## Local Setup

```bash
npm install
npm run dev
```

For local Vite development, API calls can be proxied to a deployed Pages site:

```bash
VITE_API_PROXY_TARGET=https://your-pages-site.pages.dev npm run dev
```

## Cloudflare Setup

Create a D1 database and apply migrations:

```bash
npx wrangler d1 create exam-quest-ai
npm run db:migrate:remote
```

Create an R2 bucket:

```bash
npx wrangler r2 bucket create exam-quest-pdfs
```

Bind these to the Pages project:

```text
EXAM_DB     -> D1 database binding
PDF_BUCKET  -> R2 bucket binding
```

Required secrets:

```text
OPENAI_API_KEY
DOWNLOAD_LIMIT_SALT
```

Configurable variables:

```text
PDF_DAILY_LIMIT=30
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_OCR_MODEL=gpt-5.4-mini
OPENAI_IMAGE_MODEL=gpt-image-1-mini
```

## PDF Mirror Pipeline

The open-source repository does not include PDFs. Generated `data/` and downloaded `mirror/` files are gitignored. To build your own mirror, run:

```bash
npm run mirror:scan
npm run mirror:audit
npm run mirror:download -- --limit=20
npm run mirror:upload -- --bucket=exam-quest-pdfs --limit=20
npm run manifest:sql
```

Then import the generated SQL into D1:

```bash
npx wrangler d1 execute exam-quest-ai --remote --file=data/import-pdfs.sql
```

The pipeline is intentionally split into small resumable phases:

- `scan`: reads source pages and Drive folders into `data/pdf-manifest.json`
- `audit`: uses `HEAD` to estimate file sizes
- `download`: downloads selected PDFs into `mirror/`
- `upload`: uploads local PDFs to R2
- `manifest:sql`: generates a D1 import script

`mirror:upload` writes to remote R2 by default. Pass `--local` only when you intentionally want Wrangler's local R2 instance.

For long-running mirror work, prefer the GitHub Actions workflow `Mirror PDFs`. It runs the same scan/audit/download/upload/import steps on a Linux runner and supports `grades`, `limit`, and `offset` inputs for batching.

## Legal And Safety Notes

Third-party PDF rights vary by source. This project provides code and data formats, not a grant of rights to redistribute exam papers. If you mirror PDFs, confirm that your use case is allowed.

Before publishing or deploying publicly, rotate any API keys that were pasted into chats, terminals, or logs.

See [docs/GITHUB_PROJECT.md](docs/GITHUB_PROJECT.md) for the recommended GitHub Issues and Projects setup.

## License

MIT
