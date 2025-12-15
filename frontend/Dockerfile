# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Add build arg to bust cache
ARG CACHEBUST=1

COPY package.json .

RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
