#!/bin/bash

# Quick Deployment Script for TVHeadend Streamer
# Usage: curl -sSL https://raw.githubusercontent.com/yourusername/tvh-streamer-transcoder/main/deploy.sh | bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 TVHeadend Streamer - Quick Deploy${NC}"
echo "======================================"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Installing git...${NC}"
    if [[ -f /etc/debian_version ]]; then
        sudo apt update && sudo apt install -y git
    elif [[ -f /etc/redhat-release ]]; then
        sudo dnf install -y git || sudo yum install -y git
    fi
fi

# Clone repository
echo -e "${YELLOW}Cloning repository...${NC}"
if [[ -d "Tvh_Streamer_transcoderGPU" ]]; then
    cd Tvh_Streamer_transcoderGPU
    git pull
else
    git clone https://github.com/yourusername/tvh-streamer-transcoder.git Tvh_Streamer_transcoderGPU
    cd Tvh_Streamer_transcoderGPU
fi

# Make scripts executable
chmod +x install.sh test.sh

# Run installation
echo -e "${YELLOW}Starting auto-installation...${NC}"
./install.sh

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "Web interface: http://localhost:3000"
echo "Service status: sudo systemctl status tvh-streamer"
