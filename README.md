# exercises-frontend

The exercise catalog of Cyber ICE Box, served on `exercises.<domain>`. Admins and event managers create and edit exercises here; events attach them as challenges. Sign-in goes through the ID app.

## What you can do

- Browse and search the catalog; managers see their events' exercises and the published catalog.
- Create an exercise for the catalog or for one of your events.
- Edit an exercise: tasks, flags, hints, files, topology, drafts and versions; run a deploy test.
- Import and export exercises (admins).
- Review catalog proposals: approve or reject (admins).
- Open from an event and return to it when done.

## Environment variables

Static builds (`npm run build`, GitHub Pages) read these at build time. The Docker image reads them at container start.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_DOMAIN` | yes | — | Platform apex domain, e.g. `cybericebox.com`. |
| `NEXT_PUBLIC_API_DOMAIN` | no | `api.<domain>` | API host (bare host, no scheme). |
| `NEXT_PUBLIC_ID_DOMAIN` | no | `id.<domain>` | ID app host. |
| `NEXT_PUBLIC_ADMIN_DOMAIN` | no | `admin.<domain>` | Admin app host. |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | no | analytics off | Google Analytics 4 measurement id (`G-…`). |

## Commands

```bash
npm install
npm run dev          # http://localhost:3005
npm run build        # static export → out/
npm run lint
npm run typecheck
npm test             # Vitest

docker build -f deploy/Dockerfile -t cybericebox/exercises-frontend .
docker run --rm -p 3000:3000 -e NEXT_PUBLIC_DOMAIN=cybericebox.local cybericebox/exercises-frontend
```

## Deployment

- **GitHub Pages** — publishing a release runs `.github/workflows/pages.yml`, which builds the static export and deploys it. Set the variables above (and secrets) on the `github-pages` environment (Settings → Environments); the custom domain is set in Settings → Pages.
- **Docker images** — a push to `develop` builds `cybericebox/exercises-frontend:<commit sha>` (`develop-image.yml`); a published release builds `cybericebox/exercises-frontend:latest` and `:<release tag>` (`publish-image.yml`).
- **Kubernetes** — manifests are in `deploy/manifests`. Put the values in `config.yaml`; an empty key uses the default.
