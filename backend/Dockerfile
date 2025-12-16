FROM node:22-alpine

# Install Python and build dependencies required for bcrypt
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start"]
