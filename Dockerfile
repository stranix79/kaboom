# Image de production Kaboom : petite, un seul process Node.
FROM node:22-alpine
WORKDIR /app

# Dependances d'abord (cache Docker : ne reinstalle que si package.json change)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Code
COPY server ./server
COPY public ./public

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
