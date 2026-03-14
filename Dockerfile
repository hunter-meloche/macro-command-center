FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5174

# --host exposes Vite dev server outside the container
# Vite proxies (/api/fred, /api/yahoo, /api/anthropic) work from inside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
