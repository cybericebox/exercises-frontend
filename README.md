# exercises-frontend

The task catalog of Cyber&nbsp;ICE&nbsp;Box. People browse tasks, authors write and edit them, and staff review
proposals. Authors can also deploy a task in a test lab and try it before it is published.

## Where it sits

| Question | Answer |
|---|---|
| Who uses it | Task authors, reviewers and platform staff |
| Backend | The platform API at `api.<DOMAIN>`. Sign-in goes through the ID site (`id.<DOMAIN>`) |
| Build output | Static export in `out/`, served by nginx. No Node server at runtime |
| Dev port | 3005 |

## What it does

| Route | Page |
|---|---|
| `/` | Catalog of tasks |
| `/detail` | One task, its versions and variants |
| `/new` | Editor for a new task, with a local draft that survives a reload |
| `/proposals` | Review proposals: approve or reject |
| `/test` | Deploy a task in a test lab and try it |
| `/guide`, `/guide/<slug>` | Guide to writing tasks |

Text is Ukrainian by default, with English available. The guide pages keep their long-form text in Ukrainian content
modules.

## Run it locally

Tools are pinned in `mise.toml`: `mise install` puts Node.js in place, `mise tasks` lists the commands. You need a running platform backend; the site derives its API host from the base
domain.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3005
```

`npm run dev:fixtures` starts the dev server with editor fixtures switched on, for working on the editor without a
backend.

## Configure

`NEXT_PUBLIC_*` values are inlined at build time. The container image substitutes them at start, so one image serves
any environment. A missing required value fails the build or the container start; there are no fallbacks.

- `.env.example` is the template. Required: the base domain and the support mailbox.
- `NEXT_PUBLIC_DOMAIN` is the only host input. The API, the other sites and the shared cookies derive from it.
- `npm run check:cfg` builds the way the Dockerfile does and checks that every placeholder survives in the bundle.
- Optional installation values mean "no value, not shown":

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAIN_SITE_URL` | no | `https://` URL of the main site. Set: the logo leads there. Empty: the logo leads to `/` of this site. |
| `NEXT_PUBLIC_COOKIES_URL` | no | `https://` URL of the Cookie Policy. Empty: no link in the cookie banner. |
| `NEXT_PUBLIC_LAB_DOMAINS` | no | Comma list of extra lab base domains (agents with another lab domain), for example `labs.other.example`. The test lab is opened by posting a grant form to `<device>-<code>.<lab domain>`, so the CSP `form-action` allows `https://*.labs.<DOMAIN>` and `https://*.<each entry>`. Entries that are not plain domain names are ignored. Read by `deploy/csp.sh` at container start. |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | Google Analytics 4 id. Analytics is off when unset. |
| `DEV_ALLOWED_ORIGINS` | no | Dev only: comma list of extra hosts allowed by `next dev`. |

## Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:fixtures` | Dev server with editor fixtures |
| `npm run build` | Production build, static export to `out/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest with Testing Library) |
| `npm run check:cfg` | Checks that config placeholders survive the build |
| `npm run check:ds` | Fails if a copied design-system file was edited by hand |
| `npm run sync:errors` | Adds new backend error codes to `messages/errors.*.json` (needs a `daemon` checkout at `../daemon`) |

`scripts/test-nginx-tls.sh` checks the container's TLS and client-certificate modes (needs Docker).

## Rules for changes

- Every user-visible string goes through `messages/uk.json` and `messages/en.json` and `t("key", { vars })`. Add each
  key to both files.
- Confirmations use the shared `ConfirmDialog`; destructive ones use the danger tone.
- Saves never disable other controls and show the user's choice before the server answers.

## Container

The image serves the export with nginx: plain HTTP on 8080, a health listener on 8081 (`/healthz` only), and TLS on
8443 when `/tls/tls.crt` and `/tls/tls.key` are mounted. Client certificates are required when `/aop/ca.crt` is
mounted. The config is in `deploy/nginx/`; `deploy/nginx-entrypoint.sh` validates the environment and fails the start
on a bad combination. At start, `deploy/csp.sh` hashes the inline scripts and writes the Content Security Policy
header.

## Releases and contributing

Branches, pull requests and releases: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
