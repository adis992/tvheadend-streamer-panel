#!/bin/bash

# TVHeadend Streamer Update Script
# For pulling latest changes from GitHub and reinstalling

set -e

echo "=================================================="
echo "  TVHeadend Streamer Update & Reinstall Script"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "server.js" ]] || [[ ! -f "package.json" ]]; then
    error "This script must be run from the TVHeadend Streamer project directory"
    exit 1
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
    error "Git is not installed. Please install git first."
    exit 1
fi

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    error "This script should not be run as root. Please run as a regular user with sudo privileges."
    exit 1
fi

# Stop the service if it's running
log "Checking if service is running..."
if systemctl is-active --quiet tvh-streamer; then
    log "Stopping TVHeadend Streamer service..."
    sudo systemctl stop tvh-streamer
fi

# Save user configurations if needed
log "Backing up any user configurations..."
if [[ -f "config.js" ]]; then
    cp config.js config.js.backup
    log "Backed up config.js to config.js.backup"
fi

# Pull latest changes from GitHub
log "Pulling latest changes from GitHub..."
if [[ -d ".git" ]]; then
    git fetch --all
    git reset --hard origin/main
    git pull origin main
    log "Successfully updated from GitHub"
else
    warn "This doesn't appear to be a git repository."
    read -p "Do you want to re-clone the repository? This will overwrite local changes. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ..
        DIRNAME=$(basename "$(pwd)")
        log "Re-cloning repository into $DIRNAME..."
        rm -rf $DIRNAME
        git clone https://github.com/adis992/tvheadend-streamer-panel.git $DIRNAME
        cd $DIRNAME
        log "Successfully re-cloned repository"
    else
        error "Cannot update without git repository. Aborting."
        exit 1
    fi
fi

# Update permissions and directories
log "Updating permissions and directories..."
PROJECT_USER=$(whoami)
sudo chown -R $PROJECT_USER:$PROJECT_USER . || warn "Could not update ownership"

# Create directories only if they don't exist
if [ ! -d "streams" ]; then
    mkdir -p streams 2>/dev/null || {
        warn "Could not create streams directory with mkdir, trying with sudo..."
        sudo mkdir -p streams 2>/dev/null || warn "Failed to create streams directory"
    }
    [ -d "streams" ] && log "Created streams directory"
else
    log "Streams directory already exists"
fi

if [ ! -d "logs" ]; then
    mkdir -p logs 2>/dev/null || {
        warn "Could not create logs directory with mkdir, trying with sudo..."
        sudo mkdir -p logs 2>/dev/null || warn "Failed to create logs directory"
    }
    [ -d "logs" ] && log "Created logs directory"
else
    log "Logs directory already exists"
fi

# Set proper permissions and ownership
if [ -d "streams" ]; then
    sudo chown $USER:$USER streams 2>/dev/null || warn "Could not set ownership for streams directory"
    chmod 755 streams 2>/dev/null || warn "Could not set permissions for streams directory"
    log "Fixed permissions for streams directory"
fi

if [ -d "logs" ]; then
    sudo chown $USER:$USER logs 2>/dev/null || warn "Could not set ownership for logs directory"
    chmod 755 logs 2>/dev/null || warn "Could not set permissions for logs directory"
    log "Fixed permissions for logs directory"
fi

# Reinstall dependencies
log "Reinstalling dependencies..."

# Remove any existing node_modules created with wrong permissions
if [[ -d "node_modules" ]]; then
    log "Removing existing node_modules directory..."
    rm -rf node_modules 2>/dev/null || sudo rm -rf node_modules
fi

npm install || error "Failed to install dependencies"

# Update service file
log "Updating system service file..."
PROJECT_DIR=$(pwd)
PROJECT_USER=$(whoami)

sudo tee /etc/systemd/system/tvh-streamer.service > /dev/null <<EOF
[Unit]
Description=TVHeadend Streamer GPU Transcoder
Documentation=https://github.com/adis992/tvheadend-streamer-panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$PROJECT_USER
Group=$PROJECT_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node $PROJECT_DIR/server.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
KillMode=process
TimeoutSec=30

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$PROJECT_DIR/streams
ReadWritePaths=$PROJECT_DIR/logs

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tvh-streamer

[Install]
WantedBy=multi-user.target
EOF

# Restart the service
log "Restarting service..."
sudo systemctl daemon-reload
sudo systemctl start tvh-streamer
sleep 2

# Test FFmpeg encoders
log "Testing FFmpeg encoders after update:"
    
if ffmpeg -encoders 2>/dev/null | grep -q "h264_nvenc"; then
    log "✓ NVIDIA H.264 encoder available"
else
    warn "✗ NVIDIA H.264 encoder not available"
fi

if ffmpeg -encoders 2>/dev/null | grep -q "h264_amf"; then
    log "✓ AMD H.264 encoder available"
else
    warn "✗ AMD H.264 encoder not available (will use libx264+OpenCL)"
fi

if ffmpeg -encoders 2>/dev/null | grep -q "libx264"; then
    log "✓ Software H.264 encoder available"
else
    warn "✗ Software H.264 encoder not available"
fi

# Check service status
if systemctl is-active --quiet tvh-streamer; then
    echo ""
    echo "=================================================="
    echo "       Update completed successfully!"
    echo "=================================================="
    echo ""
    echo -e "${GREEN}TVHeadend Streamer has been updated and is now running.${NC}"
    echo -e "${GREEN}Web interface is available at:${NC}"
    echo "  http://localhost:3000"
    echo "  http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo -e "${BLUE}To view service logs:${NC}"
    echo "  sudo journalctl -u tvh-streamer -f"
else 
    echo ""
    echo "=================================================="
    echo "       Update completed with warnings!"
    echo "=================================================="
    echo ""
    echo -e "${YELLOW}TVHeadend Streamer has been updated but the service failed to start.${NC}"
    echo -e "${YELLOW}Try starting it manually:${NC}"
    echo "  sudo systemctl start tvh-streamer"
    echo "  sudo systemctl status tvh-streamer"
    echo "  sudo journalctl -u tvh-streamer -f"
fi
