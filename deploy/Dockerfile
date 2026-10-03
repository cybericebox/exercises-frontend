# exercises-frontend — static export, served by nginx.
#
# NEXT_PUBLIC_* are normally inlined at BUILD time. To allow RUNTIME config (no
# rebuild per env change), we build with placeholders equal to the variable
# names, and an entrypoint substitutes the real values at container start
# (nginx:alpine runs /docker-entrypoint.d/*.sh before launching).
# Run with: -e NEXT_PUBLIC_{MAIN,API,ID,ADMIN,EXERCISES}_HOST=… -e NEXT_PUBLIC_EVENT_DOMAIN=… -e NEXT_PUBLIC_COOKIE_DOMAIN=… -e NEXT_PUBLIC_SUPPORT_EMAIL=… [-e NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=…]
FROM --platform=$BUILDPLATFORM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV NEXT_PUBLIC_MAIN_HOST="NEXT_PUBLIC_MAIN_HOST"
ENV NEXT_PUBLIC_API_HOST="NEXT_PUBLIC_API_HOST"
ENV NEXT_PUBLIC_ID_HOST="NEXT_PUBLIC_ID_HOST"
ENV NEXT_PUBLIC_ADMIN_HOST="NEXT_PUBLIC_ADMIN_HOST"
ENV NEXT_PUBLIC_EXERCISES_HOST="NEXT_PUBLIC_EXERCISES_HOST"
ENV NEXT_PUBLIC_EVENT_DOMAIN="NEXT_PUBLIC_EVENT_DOMAIN"
ENV NEXT_PUBLIC_COOKIE_DOMAIN="NEXT_PUBLIC_COOKIE_DOMAIN"
ENV NEXT_PUBLIC_SUPPORT_EMAIL="NEXT_PUBLIC_SUPPORT_EMAIL"
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="NEXT_PUBLIC_GOOGLE_ANALYTICS_ID"
RUN npm run build && node scripts/csp-inline.mjs

FROM nginx:1.30.5-alpine-slim@sha256:32463212baf0e7d91aded2e9b843a4f2b9e017804b8c9d5bae7b51dcef64389c AS runner
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-next-public-env.sh
# 50-csp.sh runs after the env substitution: it hashes the inline scripts and writes the CSP header
# snippet that nginx.conf includes (see the header comment in deploy/csp.sh).
COPY deploy/csp.sh /docker-entrypoint.d/50-csp.sh
RUN chmod +x /docker-entrypoint.d/40-next-public-env.sh /docker-entrypoint.d/50-csp.sh
EXPOSE 3000
