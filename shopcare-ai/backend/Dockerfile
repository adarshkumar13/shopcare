FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY knowledge_base ./knowledge_base
COPY src ./src

EXPOSE 5000

CMD ["sh", "-c", "node src/db/seedIfEmpty.js && node src/server.js"]
