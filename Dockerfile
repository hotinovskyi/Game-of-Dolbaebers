FROM node:24-bookworm-slim
WORKDIR /app
COPY index.html pvp.js pvp.css package.json ./
COPY assets ./assets
COPY server ./server
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000 GAME_DIR=/app
EXPOSE 3000
CMD ["node", "server/main.cjs"]
