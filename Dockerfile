FROM node:20-alpine

WORKDIR /app

# Install system dependencies
# - git: required by securityScanner.js to clone repos before scanning
# - curl, tar: required to download and extract Trivy binary
RUN apk add --no-cache git curl tar

# Install Trivy CLI — pinned to last known clean release (v0.69.3)
# Note: v0.69.3 is the last safe release before the 2026-03-19 supply chain incident.
# GitHub release binaries are safe (only Docker Hub images were affected).
# Direct binary download avoids relying on install.sh from the main branch.
ENV TRIVY_VERSION=0.69.3
RUN curl -sfL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
    -o /tmp/trivy.tar.gz \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz \
    && chmod +x /usr/local/bin/trivy \
    && trivy --version

# Install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

EXPOSE 3001

CMD ["node", "server/index.js"]
