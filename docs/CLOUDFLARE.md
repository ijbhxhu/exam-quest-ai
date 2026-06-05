# Cloudflare Deployment

## Resources

Create one D1 database and one private R2 bucket:

```bash
npx wrangler d1 create exam-quest-ai
npx wrangler r2 bucket create exam-quest-pdfs
```

If wrangler reports that it is not logged in in a non-interactive shell, create or export a Cloudflare API token:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run cf:check
```

The readiness checker verifies authentication, the Pages project, D1, R2, the migration file, and whether production secrets were accidentally put in `.dev.vars`.

Apply schema migrations:

```bash
npm run db:migrate:remote
```

## Pages Bindings

In the Cloudflare Pages project settings, add:

```text
EXAM_DB     D1 database binding
PDF_BUCKET  R2 bucket binding
```

The code is defensive: if D1/R2 are not bound, the app falls back to live scraping Google Drive for demo use. Production should use D1/R2.

## Environment Variables

```text
PDF_DAILY_LIMIT=30
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_OCR_MODEL=gpt-5.4-mini
OPENAI_IMAGE_MODEL=gpt-image-1-mini
```

## Secrets

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name exam-quest-ai
npx wrangler pages secret put DOWNLOAD_LIMIT_SALT --project-name exam-quest-ai
```

Rotate any key that has appeared in chat history, logs, screenshots, or issue comments before publishing the repository.

## Importing PDF Metadata

Build the manifest and import SQL:

```bash
npm run mirror:scan
npm run mirror:audit
npm run manifest:sql
npx wrangler d1 execute exam-quest-ai --remote --file=data/import-pdfs.sql
```

Mirror a small batch first:

```bash
npm run mirror:download -- --limit=20
npm run mirror:upload -- --bucket=exam-quest-pdfs --limit=20
```

Then repeat in larger batches.

## GitHub Actions Mirror Worker

The repository includes a manual workflow:

```text
.github/workflows/mirror-pdfs.yml
```

Use it for long-running mirror batches instead of a single Cloudflare Worker request. It accepts:

```text
grades        Comma-separated grades, such as 1 or 1,2,3,4,5,6
limit         Number of PDFs to download/upload in this run, 0 means all scanned files
offset        Start offset for batching
import_to_d1  Whether to import generated SQL into D1
upload_to_r2  Whether to upload downloaded PDFs to R2
```

Required GitHub repository secret:

```text
CLOUDFLARE_API_TOKEN
```

The workflow does not commit `data/` or `mirror/`. It keeps manifest and import SQL as a short-retention artifact for debugging.

## Download Flow

Production downloads should go through:

```text
/api/pdf?id=<pdf_files.id>
```

The Function will:

1. Look up the PDF in D1.
2. Apply the daily anonymous download limit.
3. Stream from private R2 when `r2_key` exists.
4. Fall back to Google Drive only when the file has not been mirrored yet.

For a public launch, add Cloudflare Turnstile before allowing PDF download.
