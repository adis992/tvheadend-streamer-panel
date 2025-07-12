FROM node:18-bullseye

# Install system dependencies including GPU monitoring tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    gnupg2 \
    software-properties-common \
    lshw \
    pciutils \
    mesa-utils \
    vainfo \
    glxinfo \
    && rm -rf /var/lib/apt/lists/*

# Try to install NVIDIA dependencies (will fail gracefully if no NVIDIA GPU)
RUN wget https://developer.download.nvidia.com/compute/cuda/repos/debian11/x86_64/cuda-keyring_1.0-1_all.deb || true && \
    dpkg -i cuda-keyring_1.0-1_all.deb || true && \
    apt-get update || true && \
    apt-get install -y nvidia-cuda-toolkit nvidia-utils-470 libnvidia-encode-470 || true && \
    rm -f cuda-keyring_1.0-1_all.deb || true

# Install AMD dependencies with better support for multiple GPUs
RUN apt-get update && apt-get install -y \
    mesa-va-drivers \
    mesa-vdpau-drivers \
    mesa-opencl-icd \
    opencl-headers \
    radeontop \
    clinfo \
    mesa-vulkan-drivers \
    rocm-utils \
    || true

# Create app directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p streams logs config ssl && \
    chown -R node:node streams logs config ssl

# Switch to non-root user
USER node

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/system-info || exit 1

# Start the application
CMD ["node", "server.js"]
