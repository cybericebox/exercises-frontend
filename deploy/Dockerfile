# exercises-frontend — static export, served by nginx.
#
# NEXT_PUBLIC_* are normally inlined at BUILD time. To allow RUNTIME config (no
# rebuild per env change), we build with placeholders equal to the variable
# names, and an entrypoint substitutes the real values at container start
# (nginx:alpine runs /docker-entrypoint.d/*.sh before launching).
# Run with: -e NEXT_PUBLIC_DOMAIN=… [-e NEXT_PUBLIC_{API,ID}_DOMAIN=…] [-e NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=…]
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV NEXT_PUBLIC_DOMAIN="NEXT_PUBLIC_DOMAIN"
ENV NEXT_PUBLIC_API_DOMAIN="NEXT_PUBLIC_API_DOMAIN"
ENV NEXT_PUBLIC_ID_DOMAIN="NEXT_PUBLIC_ID_DOMAIN"
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="NEXT_PUBLIC_GOOGLE_ANALYTICS_ID"
RUN npm run build

FROM nginx:1.30.5-alpine AS runner
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-next-public-env.sh
RUN chmod +x /docker-entrypoint.d/40-next-public-env.sh
EXPOSE 3000
