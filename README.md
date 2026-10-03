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
| `NEXT_PUBLIC_MAIN_HOST` | yes | Landing host (bare host, no scheme). |
| `NEXT_PUBLIC_API_HOST` | yes | API host. |
| `NEXT_PUBLIC_ID_HOST` | yes | ID app host. |
| `NEXT_PUBLIC_ADMIN_HOST` | yes | Admin app host. |
| `NEXT_PUBLIC_EXERCISES_HOST` | yes | Exercises app host. |
| `NEXT_PUBLIC_EVENT_DOMAIN` | yes | Event sites are `<tag>.<domain>`. |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | yes | `Domain` attribute of the shared theme/consent cookies (e.g. `cybericebox.com`); no implicit parent. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | yes | Support mailbox of the «Send feedback» `mailto:` link shown on every page (the subject carries the app and page path only). |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | Google Analytics 4 measurement id. Analytics is off when unset. |

## i18n

All user-facing text lives in `messages/uk.json` and `messages/en.json` and is rendered through the translate function `t("key", { vars })`. Ukrainian is the default language. Every key must exist in both files.

## Content Security Policy

The site sends a strict CSP: scripts only from the site itself (no inline script without a hash), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. `connect-src` allows the API host (`NEXT_PUBLIC_API_HOST`) plus the vendors the app is configured for: Google Analytics when `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` is set. `style-src` keeps `'unsafe-inline'` (React style attributes cannot be hashed).

The export is static, so a per-request nonce is not possible. Instead, at container start `deploy/csp.sh` (runs after the env substitution) hashes every inline `<script>` in the exported pages, plus the scripts the client creates at runtime (the Google Analytics boot; `scripts/csp-inline.mjs` writes its text at build time), and writes the header to `/etc/nginx/snippets/csp.conf`. `deploy/nginx.conf` includes that file in the server block and in every location that sets its own `add_header` (nginx does not inherit `add_header` into a location that defines one). A new inline script needs no manual step; a new runtime-created inline script must be added to `scripts/csp-inline.mjs`.

`next dev` sends the same policy from `headers()` in `next.config.ts`, only when `NODE_ENV=development`, with `'unsafe-inline'` and `'unsafe-eval'` for scripts and websockets for HMR. Check the browser console for `Content Security Policy` violations after adding a script, an iframe or a new external host.

## Deployment

Deployment and cluster configuration: see the infrastructure repository.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Copyright 2026 CyberICEBox
