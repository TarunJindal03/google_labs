# Official lightweight Node.js LTS image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY server.js ./
COPY public ./public

# Configure Cloud Run environment
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run Saathi server
CMD ["node", "server.js"]
