FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY backend ./backend
RUN npx prisma generate --schema backend/prisma/schema.prisma && npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema backend/prisma/schema.prisma && npm run prisma:seed && node dist/backend/main.js"]
