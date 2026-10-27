# The Express + Socket.IO server (sst.config.ts deploys it to ECS Fargate). The web client and the
# iOS app are not in this image.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY types ./types

USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
