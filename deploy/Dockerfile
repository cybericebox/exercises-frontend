# exercises-frontend — static export, served by nginx.
#
# NEXT_PUBLIC_* are normally inlined at BUILD time. To allow RUNTIME config (no
# rebuild per env change), we build with placeholders equal to the variable
# names, and an entrypoint substitutes the real values at container start
# (nginx:alpine runs /docker-entrypoint.d/*.sh before launching).
# Run with: -e NEXT_PUBLIC_{MAIN,API,ID,ADMIN,EXERCISES}_HOST=… -e NEXT_PUBLIC_EVENT_DOMAIN=… -e NEXT_PUBLIC_COOKIE_DOMAIN=… -e NEXT_PUBLIC_SUPPORT_EMAIL=… [-e NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=…] [-e NEXT_PUBLIC_CAPTCHA_PROVIDER=turnstile|recaptcha|none -e NEXT_PUBLIC_CAPTCHA_SITE_KEY=… -e NEXT_PUBLIC_RECAPTCHA_ENTERPRISE=true|false -e NEXT_PUBLIC_DOS_PROTECTION=on|off]
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
ENV NEXT_PUBLIC_CAPTCHA_PROVIDER="NEXT_PUBLIC_CAPTCHA_PROVIDER"
ENV NEXT_PUBLIC_CAPTCHA_SITE_KEY="NEXT_PUBLIC_CAPTCHA_SITE_KEY"
ENV NEXT_PUBLIC_RECAPTCHA_ENTERPRISE="NEXT_PUBLIC_RECAPTCHA_ENTERPRISE"
ENV NEXT_PUBLIC_DOS_PROTECTION="NEXT_PUBLIC_DOS_PROTECTION"
RUN npm run build && node scripts/csp-inline.mjs

FROM nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 AS runner
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-next-public-env.sh
# 50-csp.sh runs after the env substitution: it hashes the inline scripts and writes the CSP header
# snippet that nginx.conf includes (see the header comment in deploy/csp.sh).
COPY deploy/csp.sh /docker-entrypoint.d/50-csp.sh
RUN chmod +x /docker-entrypoint.d/40-next-public-env.sh /docker-entrypoint.d/50-csp.sh
EXPOSE 3000
