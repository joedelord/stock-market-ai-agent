# One image runs the web server (default command), the market scheduler
# (npm run market:watch) and one-off scripts (npm run migrate).

FROM node:25-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Optional contact address shown on the privacy page.
ARG VITE_CONTACT_EMAIL
ENV VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
RUN npm run build

FROM node:25-alpine
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

USER node
EXPOSE 5000
CMD ["node", "server.js"]
