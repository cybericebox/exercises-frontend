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
| `NEXT_PUBLIC_DOMAIN` | yes, unless every host below is set | Base domain: a bare lower case host name (no scheme, port or path). Every host below that is not set is derived from it (`deploy/base-domain.sh` at container start, `next.config` in dev and local builds, the Pages workflow). |
| `NEXT_PUBLIC_MAIN_HOST` | no | Landing host (bare host, no scheme). Default: `<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_API_HOST` | no | API host. Default: `api.<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_ID_HOST` | no | ID app host. Default: `id.<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_ADMIN_HOST` | no | Admin app host. Default: `admin.<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_EXERCISES_HOST` | no | Exercises app host. Default: `exercises.<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_EVENT_DOMAIN` | no | Event sites are `<tag>.<domain>`. Default: `<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | no | `Domain` attribute of the shared theme/consent cookies (e.g. `cybericebox.com`). Default: `<DOMAIN>`; a value that is set wins. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | yes | Support mailbox of the «Send feedback» `mailto:` link shown on every page (the subject carries the app and page path only). |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | Google Analytics 4 measurement id. Analytics is off when unset. |

## i18n

All user-facing text lives in `messages/uk.json` and `messages/en.json` and is rendered through the translate function `t("key", { vars })`. Ukrainian is the default language. Every key must exist in both files.

## Listeners and TLS (container)

The nginx image serves plain HTTP by default, exactly as before (`HTTP_PORT` 3000, `/healthz`). TLS and client certificate validation are optional and switched on by env, read at container start by `deploy/nginx-entrypoint.sh`. The nginx config is in files under `deploy/nginx/` (`nginx.conf`, `server.conf`, and the snippets `listen-http.conf`, `listen-https.conf`, `client-auth.conf`, `health.conf`); the entrypoint only validates the env, renders the active snippets with `envsubst` into `/tmp/nginx-gen` (an empty file for each inactive one), and runs `nginx -t`, so a bad combination stops the container at start.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HTTP_PORT` | `3000` | Plain HTTP listener. Set but empty turns it off. |
| `HTTPS_PORT` | `8443` | TLS listener (HTTP/2); on only when the certificate and key are set. |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` | empty | PEM server certificate chain and key. Both set = TLS on; exactly one set = start error. |
| `TLS_MIN_VERSION` | `1.2` | `1.2` or `1.3`. |
| `TLS_CLIENT_CA_FILE` | empty | PEM bundle of the root (and intermediate) CAs that signed the client certificates. |
| `TLS_CLIENT_AUTH` | `off` | `off`, `optional` (verify when presented, the result is `$ssl_client_verify`) or `require`. `optional` and `require` need the CA file and TLS, else start error. A missing or invalid certificate gets the connection dropped (nginx 444). |
| `HEALTH_PORT` | empty | When set: an extra plain-HTTP listener on `HEALTH_BIND` (default `0.0.0.0`) that serves only `/healthz` (everything else 404), for kubelet probes that cannot present a client certificate. When empty, probes use `HTTP_PORT`. |
| `TLS_RELOAD_INTERVAL` | `60` | Seconds between checksum checks of the certificate, key and CA files. A change runs `nginx -t` and `nginx -s reload`, no restart; a config that fails the test keeps the running one and logs it. It polls (no inotify) because Kubernetes swaps a Secret mount through the `..data` symlink. |

`HTTP_PORT` empty with no TLS is a start error. With TLS on, the plain listener stays on unless `HTTP_PORT` is set empty; with `TLS_CLIENT_AUTH=require` the entrypoint warns about it, because the plain port is not protected by client certificates: set `HTTP_PORT=` and use `HEALTH_PORT` for probes. Removed (no aliases): `ORIGIN_TLS`, `ORIGIN_MTLS`, `ORIGIN_RELOAD_INTERVAL`, the fixed `/tls` and `/aop` paths and the fixed port 8081. `scripts/test-nginx-tls.sh` (Docker) tests the whole matrix, including a live certificate replacement.

## Content Security Policy

The site sends a strict CSP: scripts only from the site itself (no inline script without a hash), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. `connect-src` allows the API host (`NEXT_PUBLIC_API_HOST`) plus the vendors the app is configured for: Google Analytics when `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` is set. `style-src` keeps `'unsafe-inline'` (React style attributes cannot be hashed).

The export is static, so a per-request nonce is not possible. Instead, at container start `deploy/csp.sh` (runs after the env substitution) hashes every inline `<script>` in the exported pages, plus the scripts the client creates at runtime (the Google Analytics boot; `scripts/csp-inline.mjs` writes its text at build time), and writes the header to `/tmp/nginx-gen/csp.conf`. `deploy/nginx/server.conf` includes that file in the server block and in every location that sets its own `add_header` (nginx does not inherit `add_header` into a location that defines one). A new inline script needs no manual step; a new runtime-created inline script must be added to `scripts/csp-inline.mjs`.

`next dev` sends the same policy from `headers()` in `next.config.ts`, only when `NODE_ENV=development`, with `'unsafe-inline'` and `'unsafe-eval'` for scripts and websockets for HMR. Check the browser console for `Content Security Policy` violations after adding a script, an iframe or a new external host.

## Deployment

Deployment and cluster configuration: see the infrastructure repository.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Copyright 2026 CyberICEBox

### One base domain

`deploy/base-domain.sh` (sourced by the container entrypoint and by the Pages workflow) and the host block of `next.config` implement one rule: `NEXT_PUBLIC_DOMAIN` is a bare lower case host name and every host that is empty or unset becomes `MAIN_HOST=DOMAIN`, `API_HOST=api.DOMAIN`, `ID_HOST=id.DOMAIN`, `ADMIN_HOST=admin.DOMAIN`, `EXERCISES_HOST=exercises.DOMAIN`, `EVENT_DOMAIN=DOMAIN`, `COOKIE_DOMAIN=DOMAIN`; a value that is set always wins; neither `DOMAIN` nor an explicit host is a start error. `tests/base-domain-vectors.json` holds the shared test vectors that `tests/base-domain.test.ts` runs against both; `deploy/base-domain.sh` and the vector file are copies kept identical in every frontend repository (the daemon and infrastructure have the same rule and the same vector file).
