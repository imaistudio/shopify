FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV SHOPIFY_APP_URL=https://imai.up.railway.app
ENV DATABASE_URL=file:/var/data/prod.sqlite

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN mkdir -p /var/data

RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
