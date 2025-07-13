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

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
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

# Detect system architecture
ARCH=$(uname -m)
log "Detected system architecture: $ARCH"
if [[ "$ARCH" != "x86_64" && "$ARCH" != "amd64" && "$ARCH" != "arm64" && "$ARCH" != "aarch64" ]]; then
    warn "Non-standard architecture detected: $ARCH. Some features may not work correctly."
fi

# Stop the service if it's running
log "Checking if service is running..."
if systemctl is-active --quiet tvh-streamer; then
    log "Stopping TVHeadend Streamer service..."
    sudo systemctl stop tvh-streamer || warn "Could not stop service. It may not be properly installed or running."
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

# Check for GPU support based on architecture
if [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]]; then
    # Check and reinstall AMD GPU support if needed
    log "Checking for AMD GPU support..."
    if lspci | grep -i amd | grep -i vga &> /dev/null || lspci | grep -i radeon &> /dev/null; then
        log "AMD GPU detected. Making sure drivers are installed..."
        
        # Install basic Mesa drivers and VAAPI support
        if command -v apt &> /dev/null; then
            sudo apt update
            sudo apt install -y mesa-va-drivers mesa-vdpau-drivers radeontop libdrm-amdgpu1 || warn "Some AMD packages could not be installed"
            
            # Check for AMF support
            if ! ffmpeg -encoders 2>/dev/null | grep -q "h264_amf"; then
                log "Adding AMD AMF support for ffmpeg..."
                sudo apt install -y ffmpeg-amf || warn "Could not install ffmpeg-amf package"
            fi
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y mesa-va-drivers mesa-vdpau-drivers radeontop || warn "Some AMD packages could not be installed"
        fi
        
        log "AMD GPU support reinstalled/verified"
    else
        log "No AMD GPU detected, checking for NVIDIA GPU..."
        if lspci | grep -i nvidia &> /dev/null; then
            log "NVIDIA GPU detected. Checking drivers..."
            if ! command -v nvidia-smi &> /dev/null; then
                warn "NVIDIA GPU detected but nvidia-smi not found. GPU acceleration may not work."
                warn "Please install NVIDIA drivers manually if needed."
            else
                log "NVIDIA drivers appear to be installed."
            fi
        else
            log "No dedicated GPU detected, will use software encoding."
        fi
    fi
elif [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
    log "ARM64 architecture detected. Will use software encoding or hardware acceleration if available."
    # Check for ARM-specific hardware acceleration
    if command -v apt &> /dev/null; then
        sudo apt update
        sudo apt install -y ffmpeg || warn "Could not install ffmpeg package"
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y ffmpeg || warn "Could not install ffmpeg package"
    fi
else
    log "Unsupported architecture for hardware acceleration: $ARCH. Will use software encoding."
fi

# Install dependencies
log "Installing npm dependencies..."
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
ProtectHome=false
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
sudo systemctl start tvh-streamer || warn "Failed to start service. Check logs with 'sudo journalctl -u tvh-streamer'"
sleep 2

# Restart the service
log "Restarting service..."
sudo systemctl daemon-reload

# Stop service completely first
sudo systemctl stop tvh-streamer 2>/dev/null || true
sleep 2

# Start the service and check for errors
log "Starting tvh-streamer service..."
if sudo systemctl start tvh-streamer; then
    log "Service started successfully"
    sleep 3
    
    # Double check it's actually running
    if ! systemctl is-active --quiet tvh-streamer; then
        warn "Service appears to have stopped after starting. Checking logs..."
        sudo journalctl -u tvh-streamer --no-pager -n 10
    fi
else
    error "Failed to start service. Checking logs for details..."
    sudo journalctl -u tvh-streamer --no-pager -n 10
ficess "✓ NVIDIA H.264 encoder available"
else
    warn "✗ NVIDIA H.264 encoder not available"
fi

if ffmpeg -encoders 2>/dev/null | grep -q "h264_amf"; then
    success "✓ AMD H.264 encoder available"
else
    warn "✗ AMD H.264 encoder not available (will use libx264+OpenCL)"
fi

if ffmpeg -encoders 2>/dev/null | grep -q "h264_qsv"; then
    success "✓ Intel QuickSync H.264 encoder available"
else
    warn "✗ Intel QuickSync H.264 encoder not available"
fi

if ffmpeg -encoders 2>/dev/null | grep -q "libx264"; then
    success "✓ Software H.264 encoder available"
else
    error "✗ Software H.264 encoder not available - this is required as a fallback!"
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
