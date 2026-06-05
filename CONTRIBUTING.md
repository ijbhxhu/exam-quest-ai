# Contributing

Thanks for helping make Exam Quest AI useful for families.

## Good First Areas

- Improve Traditional Chinese copy for parents and children.
- Add tests around natural-language query parsing.
- Improve subject and publisher normalization.
- Add small UI polish without changing the core flow.
- Write docs for Cloudflare setup and local development.

## Development

```bash
npm install
npm run dev
npm run build
```

Do not commit:

- API keys
- `.dev.vars` or `.env`
- downloaded PDFs
- generated OCR outputs
- real third-party PDF manifests

## Data Policy

This project intentionally does not ship third-party PDFs. Mirror tooling is provided so deployers can build their own private or permitted mirror.

## Pull Requests

Keep PRs focused. Include:

- What changed
- Why it changed
- How it was tested
- Any data, privacy, or deployment impact
