#!/bin/bash

# Test script for TVHeadend Streamer
echo "Testing TVHeadend Streamer Installation..."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test functions
test_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
        return 0
    else
        echo -e "${RED}✗${NC} $1 is not installed"
        return 1
    fi
}

test_gpu() {
    echo -e "\n${YELLOW}Testing GPU Support:${NC}"
    
    # Test NVIDIA
    if command -v nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✓${NC} NVIDIA GPU detected"
        nvidia-smi --query-gpu=name --format=csv,noheader
    else
        echo -e "${YELLOW}-${NC} NVIDIA GPU not detected"
    fi
    
    # Test AMD
    if command -v radeontop &> /dev/null || command -v rocm-smi &> /dev/null; then
        echo -e "${GREEN}✓${NC} AMD GPU support available"
    else
        echo -e "${YELLOW}-${NC} AMD GPU support not detected"
    fi
}

test_ffmpeg_encoders() {
    echo -e "\n${YELLOW}Testing FFmpeg Encoders:${NC}"
    
    # Test h264_nvenc
    if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "h264_nvenc"; then
        echo -e "${GREEN}✓${NC} NVIDIA H.264 encoder available"
    else
        echo -e "${YELLOW}-${NC} NVIDIA H.264 encoder not available"
    fi
    
    # Test h264_amf
    if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "h264_amf"; then
        echo -e "${GREEN}✓${NC} AMD H.264 encoder available"
    else
        echo -e "${YELLOW}-${NC} AMD H.264 encoder not available"
    fi
    
    # Test libx264
    if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "libx264"; then
        echo -e "${GREEN}✓${NC} Software H.264 encoder available"
    else
        echo -e "${RED}✗${NC} Software H.264 encoder not available"
    fi
}

test_network() {
    echo -e "\n${YELLOW}Testing Network Connectivity:${NC}"
    
    # Test TVHeadend connection
    if curl -s --connect-timeout 5 http://192.168.100.3:9981 > /dev/null; then
        echo -e "${GREEN}✓${NC} TVHeadend server is reachable"
    else
        echo -e "${RED}✗${NC} TVHeadend server is not reachable"
    fi
    
    # Test playlist URL
    if curl -s --connect-timeout 5 http://192.168.100.3:9981/playlist > /dev/null; then
        echo -e "${GREEN}✓${NC} TVHeadend playlist is accessible"
    else
        echo -e "${RED}✗${NC} TVHeadend playlist is not accessible"
    fi
}

test_ports() {
    echo -e "\n${YELLOW}Testing Port Availability:${NC}"
    
    # Test port 3000
    if ! netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${GREEN}✓${NC} Port 3000 is available"
    else
        echo -e "${YELLOW}-${NC} Port 3000 is in use"
    fi
    
    # Test port 8080
    if ! netstat -tlnp 2>/dev/null | grep -q ":8080 "; then
        echo -e "${GREEN}✓${NC} Port 8080 is available"
    else
        echo -e "${YELLOW}-${NC} Port 8080 is in use"
    fi
}

test_permissions() {
    echo -e "\n${YELLOW}Testing File Permissions:${NC}"
    
    # Test write permission to streams directory
    if [ -w "streams" ]; then
        echo -e "${GREEN}✓${NC} Streams directory is writable"
    else
        echo -e "${RED}✗${NC} Streams directory is not writable"
    fi
    
    # Test write permission to logs directory
    if [ -w "logs" ]; then
        echo -e "${GREEN}✓${NC} Logs directory is writable"
    else
        echo -e "${RED}✗${NC} Logs directory is not writable"
    fi
}

# Main tests
echo -e "${YELLOW}System Requirements:${NC}"
test_command "node"
test_command "npm"
test_command "ffmpeg"
test_command "curl"

# GPU tests
test_gpu

# FFmpeg encoder tests
test_ffmpeg_encoders

# Network tests
test_network

# Port tests
test_ports

# Permission tests
test_permissions

# Node.js dependencies test
echo -e "\n${YELLOW}Testing Node.js Dependencies:${NC}"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Node modules are installed"
else
    echo -e "${RED}✗${NC} Node modules are not installed - run 'npm install'"
fi

# Final summary
echo -e "\n${YELLOW}Test Summary:${NC}"
echo "Run 'npm start' to start the application"
echo "Access web interface at: http://localhost:3000"
echo ""
echo "For more details, check the README.md file"
