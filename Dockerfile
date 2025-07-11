FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    gnupg2 \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Try to install NVIDIA dependencies (will fail gracefully if no NVIDIA GPU)
RUN wget https://developer.download.nvidia.com/compute/cuda/repos/debian11/x86_64/cuda-keyring_1.0-1_all.deb || true && \
    dpkg -i cuda-keyring_1.0-1_all.deb || true && \
    apt-get update || true && \
    apt-get install -y nvidia-cuda-toolkit libnvidia-encode1 || true && \
    rm -f cuda-keyring_1.0-1_all.deb

# Install AMD dependencies
RUN apt-get update && apt-get install -y \
    mesa-va-drivers \
    mesa-vdpau-drivers \
    radeontop \
    || true

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Copy application files
COPY . .

# Create necessary directories (important: 'streams' directory must have the 's' at the end)
RUN mkdir -p streams logs && \
    chown -R node:node streams logs

# Switch to non-root user
USER node

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/channels || exit 1

# Start the application
CMD ["node", "server.js"]
