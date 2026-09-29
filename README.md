# exercises-frontend

Cyber ICE Box exercise catalog («Каталог завдань»), served on `exercises.<domain>`.
Static Next.js export. Moved out of admin-frontend: the catalog, the full
exercise editor (tasks, flags, files, topology, drafts/versions, deploy test)
and import/export.

## Routes

| Path | Page |
| --- | --- |
| `/` | Catalog |
| `/detail?id=<exerciseID>[&version=<versionID>]` | Editor |
| `/new[?event=<eventID>]` | Create |

Any page accepts `?return=<https URL>[&event=<eventID>]`. The URL must be on
`NEXT_PUBLIC_DOMAIN` or a subdomain; the app then shows «← Повернутися до події».
The return URL and event are kept in `sessionStorage` for the tab.

## Auth

Federated through the ID app, same as admin-frontend: every request goes to
`https://api.<domain>/api/...` with credentials (session cookie on the API
host). A 401 writes `return_to` and redirects to `id.<domain>` sign-in. The
catalog needs the `exercises.read` permission; writes need `exercises.write`.
`ServiceStatusGate` covers API outages.

## Environment

| Variable | Required | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_DOMAIN` | yes | — |
| `NEXT_PUBLIC_API_DOMAIN` | no | `api.<domain>` |
| `NEXT_PUBLIC_ID_DOMAIN` | no | `id.<domain>` |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | analytics off |

The Docker image builds with placeholders; `deploy/docker-entrypoint.sh`
substitutes the real values at container start and fails without
`NEXT_PUBLIC_DOMAIN`.

## Scripts

```bash
npm install
npm run dev        # http://localhost:3005
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest run
NEXT_PUBLIC_DOMAIN=cybericebox.local npm run build   # → out/
```

## Layout

- `src/app` — routes (`page.tsx`, `detail/`, `new/`)
- `src/api/exercises` — API client for `/api/exercises/...`; `src/api/client.ts` — base fetch client
- `src/lib/exerciseSchemas.ts` — exercise types and zod schemas
- `src/components/exercises` — catalog dialogs and the editor
- `src/components/editor` — rich text editor (Lexical)
- `src/components/shell` — header, return bar, banners
- `src/components/ui`, `src/styles/ds-tokens.css` — local copy of the ds-v2 design system
- `messages/` — i18n (Ukrainian active, English reference)
- `deploy/` — Dockerfile, nginx, entrypoint, Kubernetes manifests
