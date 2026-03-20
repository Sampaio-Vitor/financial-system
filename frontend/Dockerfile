FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN adduser -D appuser

COPY . .

USER appuser

CMD ["npm", "run", "dev"]
