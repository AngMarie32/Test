# For any Docker host (Fly.io, a VPS, etc.). Not needed for Render.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV DB_FILE=/data/db.json PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
