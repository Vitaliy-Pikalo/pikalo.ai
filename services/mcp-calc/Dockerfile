FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY services ./services
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "services/mcp-calc/server.mts"]
