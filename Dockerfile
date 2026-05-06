FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql
EXPOSE 3000
CMD ["node", "dist/server.js"]
