FROM node:22-bookworm-slim

WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . .
RUN chown node:node /app /app/node_modules

USER node

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
