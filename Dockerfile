# Single image, three commands: web (default), worker, and migrate.
# Keeping one image avoids duplicating dependency layers for a demo-scale app.
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Uploaded study files live on a mounted volume.
RUN mkdir -p /data/uploads

EXPOSE 3000
CMD ["npm", "start"]
