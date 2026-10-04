# exercises-frontend — static export, served by nginx.
#
# NEXT_PUBLIC_* are normally inlined at BUILD time. To allow RUNTIME config (no
# rebuild per env change), we build with placeholders equal to the variable
# names wrapped in double underscores (__NEXT_PUBLIC_X__), and an entrypoint substitutes the real values at container start
# (nginx:alpine runs /docker-entrypoint.d/*.sh before launching).
# Run with: -e NEXT_PUBLIC_DOMAIN=… (every host that is not set is derived from it: MAIN_HOST=DOMAIN, API_HOST=api.DOMAIN, ID_HOST=id.DOMAIN,
#   ADMIN_HOST=admin.DOMAIN, EXERCISES_HOST=exercises.DOMAIN, EVENT_DOMAIN=DOMAIN, COOKIE_DOMAIN=DOMAIN; a value that is set wins) -e NEXT_PUBLIC_SUPPORT_EMAIL=… [-e NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=…]
FROM --platform=$BUILDPLATFORM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV NEXT_PUBLIC_MAIN_HOST="__NEXT_PUBLIC_MAIN_HOST__"
ENV NEXT_PUBLIC_API_HOST="__NEXT_PUBLIC_API_HOST__"
ENV NEXT_PUBLIC_ID_HOST="__NEXT_PUBLIC_ID_HOST__"
ENV NEXT_PUBLIC_ADMIN_HOST="__NEXT_PUBLIC_ADMIN_HOST__"
ENV NEXT_PUBLIC_EXERCISES_HOST="__NEXT_PUBLIC_EXERCISES_HOST__"
ENV NEXT_PUBLIC_EVENT_DOMAIN="__NEXT_PUBLIC_EVENT_DOMAIN__"
ENV NEXT_PUBLIC_COOKIE_DOMAIN="__NEXT_PUBLIC_COOKIE_DOMAIN__"
ENV NEXT_PUBLIC_SUPPORT_EMAIL="__NEXT_PUBLIC_SUPPORT_EMAIL__"
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="__NEXT_PUBLIC_GOOGLE_ANALYTICS_ID__"
RUN npm run build && node scripts/csp-inline.mjs

FROM nginx:1.30.5-alpine-slim@sha256:32463212baf0e7d91aded2e9b843a4f2b9e017804b8c9d5bae7b51dcef64389c AS runner
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx/nginx.conf deploy/nginx/server.conf /etc/nginx/
COPY deploy/nginx/listen-http.conf deploy/nginx/listen-https.conf deploy/nginx/client-auth.conf deploy/nginx/health.conf /etc/nginx/snippets/
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-next-public-env.sh
# The base-domain derivation (NEXT_PUBLIC_DOMAIN -> the hosts that are not set), sourced by 40-next-public-env.sh and 50-csp.sh.
COPY deploy/base-domain.sh /usr/local/lib/base-domain.sh
# 50-csp.sh runs after the env substitution: it hashes the inline scripts and writes the CSP header
# snippet that server.conf includes (see the header comment in deploy/csp.sh).
COPY deploy/csp.sh /docker-entrypoint.d/50-csp.sh
# 60-nginx-config.sh renders the listener snippets from the TLS_* / HTTP_PORT / HEALTH_PORT env and runs nginx -t.
COPY deploy/nginx-entrypoint.sh /docker-entrypoint.d/60-nginx-config.sh
RUN chmod +x /docker-entrypoint.d/40-next-public-env.sh /docker-entrypoint.d/50-csp.sh /docker-entrypoint.d/60-nginx-config.sh
EXPOSE 3000 8443
