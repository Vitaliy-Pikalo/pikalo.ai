FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY lib ./lib
COPY services ./services
COPY load ./load
USER node
CMD ["node", "--import", "tsx", "load/answer.mts"]
