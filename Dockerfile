FROM node:20-alpine AS builder
WORKDIR /app
COPY site ./site
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/
