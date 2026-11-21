FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY services ./services
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "services/answer-api/server.mts"]
