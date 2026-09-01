FROM node:20-alpine

# Install OpenSSL for Prisma engine binary on Alpine Linux
RUN apk add --no-cache openssl

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
