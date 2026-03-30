FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy app source
COPY index.js .

# Cloud Run uses PORT env variable (default 8080)
EXPOSE 8080

# Run as non-root user for security
USER node

CMD ["node", "index.js"]
