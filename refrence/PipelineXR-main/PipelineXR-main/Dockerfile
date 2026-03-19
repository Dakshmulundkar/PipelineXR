FROM node:18-alpine

WORKDIR /app

# git is required by securityScanner.js to clone repos before Trivy scanning.
# docker CLI is NOT needed — the host Docker socket is mounted at runtime.
RUN apk add --no-cache git

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
