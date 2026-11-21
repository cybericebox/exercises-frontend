# exercises-frontend — static export, served by nginx.
#
# NEXT_PUBLIC_* are normally inlined at BUILD time. To allow RUNTIME config (no
# rebuild per env change), we build with placeholders equal to the variable
# names wrapped in double underscores (__NEXT_PUBLIC_X__), and an entrypoint substitutes the real values at container start
# (nginx:alpine runs /docker-entrypoint.d/*.sh before launching).
# Run with: -e NEXT_PUBLIC_DOMAIN=… (every host derives from it) -e NEXT_PUBLIC_SUPPORT_EMAIL=… [-e NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=…]
FROM --platform=$BUILDPLATFORM mirror.gcr.io/library/node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV NEXT_PUBLIC_DOMAIN="__NEXT_PUBLIC_DOMAIN__"
ENV NEXT_PUBLIC_SUPPORT_EMAIL="__NEXT_PUBLIC_SUPPORT_EMAIL__"
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="__NEXT_PUBLIC_GOOGLE_ANALYTICS_ID__"
# The optional installation settings (empty or unset = not shown): NEXT_PUBLIC_MAIN_SITE_URL, NEXT_PUBLIC_COOKIES_URL.
ENV NEXT_PUBLIC_MAIN_SITE_URL="__NEXT_PUBLIC_MAIN_SITE_URL__"
ENV NEXT_PUBLIC_COOKIES_URL="__NEXT_PUBLIC_COOKIES_URL__"
# The extra lab base domains (comma list, empty or unset = none): the root layout writes them into <html data-lab-domains>.
ENV NEXT_PUBLIC_LAB_DOMAINS="__NEXT_PUBLIC_LAB_DOMAINS__"
RUN npm run build && node scripts/csp-inline.mjs

FROM mirror.gcr.io/library/nginx:1.31.9-alpine-slim@sha256:5bfced78d24d644270bedb0a9968697042e38d5c03fb6354603df025279c1cbe AS runner
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx/nginx.conf deploy/nginx/server.conf /etc/nginx/
COPY deploy/nginx/listen-http.conf deploy/nginx/listen-https.conf deploy/nginx/client-auth.conf deploy/nginx/health.conf /etc/nginx/snippets/
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-next-public-env.sh
# The base-domain derivation (NEXT_PUBLIC_DOMAIN check, the API host for the CSP), sourced by 40-next-public-env.sh and 50-csp.sh.
COPY deploy/base-domain.sh /usr/local/lib/base-domain.sh
# The rule for the optional installation settings (URLs), sourced by 40-next-public-env.sh.
COPY deploy/cfg-check.sh /usr/local/lib/cfg-check.sh
# 50-csp.sh runs after the env substitution: it hashes the inline scripts and writes the CSP header
# snippet that server.conf includes (see the header comment in deploy/csp.sh).
COPY deploy/csp.sh /docker-entrypoint.d/50-csp.sh
# 60-nginx-config.sh renders the listener snippets and runs nginx -t. The listener values are defaults in that script (TLS files /tls/tls.crt
# and /tls/tls.key, client CA /aop/ca.crt, HTTPS 8443, health 8081); the TLS_* / HTTP_PORT / HEALTH_PORT env only overrides them.
COPY deploy/nginx-entrypoint.sh /docker-entrypoint.d/60-nginx-config.sh
RUN chmod +x /docker-entrypoint.d/40-next-public-env.sh /docker-entrypoint.d/50-csp.sh /docker-entrypoint.d/60-nginx-config.sh
EXPOSE 8080 8443 8081
