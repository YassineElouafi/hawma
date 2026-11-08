FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY migrations ./migrations
ENV NODE_ENV=production HAWMA_STORE=postgres PORT=3001
EXPOSE 3001
# apply migrations, then start (tsx keeps the toolchain simple; swap for compiled JS when we add a build step)
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/main.ts"]
