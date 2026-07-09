FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY tests ./tests

ENV NODE_ENV=production
ENV PORT=5174
EXPOSE 5174

CMD ["node", "server.js"]
