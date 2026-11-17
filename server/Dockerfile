FROM node:22-bookworm-slim

WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node src ./src

USER node

EXPOSE 5000
CMD ["npm", "start"]
