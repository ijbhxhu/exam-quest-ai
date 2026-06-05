# Security

## Secrets

Do not commit API keys, Cloudflare tokens, OpenAI keys, `.dev.vars`, `.env`, downloaded PDFs, OCR outputs, or generated manifests with real third-party data.

If a key is pasted into a chat, terminal transcript, issue, or pull request, rotate it before public release.

## PDF Downloads

R2 buckets should remain private. The app should serve files through `/api/pdf`, not through public bucket URLs.

The default anonymous download limit is 30 PDFs per day. For public deployments, consider adding Cloudflare Turnstile before download.

## Reporting

For security issues, open a private report with the repository owner rather than posting exploit details in a public issue.
