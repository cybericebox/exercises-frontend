# exercises-frontend

The exercise catalog and editor of Cyber ICE Box, including the author test labs where an exercise can be deployed and tried before publishing.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI, react-hook-form with Zod, Lexical editor. Tests: Vitest with Testing Library. Lint: ESLint 10.

## Prerequisites

Node.js 26 or newer (see `.nvmrc`).

## Commands

```bash
npm install
npm run dev          # dev server on http://localhost:3005
npm run build        # production build (static export to out/)
npm run lint
npm run typecheck
npm test             # Vitest
```

## Static export

Production builds are a **static export** (`output: "export"`, written to `out/`) and need no Node server at runtime; `npm run dev` runs the regular Next.js dev server. `npm start` is `next start` and is only meaningful outside the static build.

## Configuration

`NEXT_PUBLIC_*` values are inlined at build time; the container image substitutes them at start-up, so one image serves any environment. A missing required host fails the build and the container start; there are no fallbacks. `DEV_ALLOWED_ORIGINS` (comma list, optional) adds hosts to Next's dev-only allowed origins.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_MAIN_HOST` | yes | Landing host (bare host, no scheme); also the parent domain of the theme and consent cookies. |
| `NEXT_PUBLIC_API_HOST` | yes | API host. |
| `NEXT_PUBLIC_ID_HOST` | yes | ID app host. |
| `NEXT_PUBLIC_ADMIN_HOST` | yes | Admin app host. |
| `NEXT_PUBLIC_EXERCISES_HOST` | yes | Exercises app host. |
| `NEXT_PUBLIC_EVENT_DOMAIN` | yes | Event sites are `<tag>.<domain>`. |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | Google Analytics 4 measurement id. Analytics is off when unset. |

## i18n

All user-facing text lives in `messages/uk.json` and `messages/en.json` and is rendered through the translate function `t("key", { vars })`. Ukrainian is the default language. Every key must exist in both files.

## Deployment

Deployment and cluster configuration: see the infrastructure repository.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Copyright 2026 CyberICEBox
