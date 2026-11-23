# Korrect Cars in a container: `docker compose up` runs it with MySQL and the real stock as sample data.
# Stage 1 builds the front end (React + esbuild); stage 2 is the small runtime image.
FROM node:22-slim AS build
WORKDIR /app
COPY client/package.json client/
RUN npm install --prefix client --no-audit --no-fund
COPY client client
COPY server/lib server/lib
RUN node client/build.js

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY app.js ./
COPY server server
COPY seed seed
COPY --from=build /app/dist dist
RUN mkdir -p uploads /data/private && chown -R node:node uploads /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app.js"]
