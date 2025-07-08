#!/bin/bash

# TVHeadend Streamer Auto-Install Script
# Compatible with Ubuntu/Debian and CentOS/RHEL/Fedora

set -e

echo "=================================================="
echo "  TVHeadend Streamer GPU Transcoder Installer"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    elif [[ -f /etc/redhat-release ]]; then
        OS="CentOS"
        VER=$(cat /etc/redhat-release | sed 's/.*release \([0-9]\+\).*/\1/')
    else
        error "Cannot detect operating system"
        exit 1
    fi
    
    log "Detected OS: $OS $VER"
}

# Update system packages
update_system() {
    log "Updating system packages..."
    
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        sudo apt update && sudo apt upgrade -y
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        if command -v dnf &> /dev/null; then
            sudo dnf update -y
        else
            sudo yum update -y
        fi
    fi
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log "Node.js already installed: $NODE_VERSION"
        return
    fi
    
    # Install Node.js 18.x LTS
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        if command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs npm
        else
            sudo yum install -y nodejs npm
        fi
    fi
    
    log "Node.js installed: $(node --version)"
    log "NPM installed: $(npm --version)"
}

# Install FFmpeg with GPU support
install_ffmpeg() {
    log "Installing FFmpeg with GPU acceleration support..."
    
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        # Add additional repositories for newer FFmpeg
        sudo apt install -y software-properties-common
        sudo add-apt-repository ppa:savoury1/ffmpeg4 -y
        sudo apt update
        
        # Install FFmpeg and development libraries
        sudo apt install -y \
            ffmpeg \
            libavcodec-dev \
            libavformat-dev \
            libavutil-dev \
            libswscale-dev \
            libavfilter-dev \
            vainfo \
            intel-media-va-driver-non-free
            
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        # Enable RPM Fusion repositories
        if [[ "$OS" =~ "Fedora" ]]; then
            sudo dnf install -y \
                https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm \
                https://download1.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm
            sudo dnf install -y ffmpeg ffmpeg-devel
        else
            sudo yum install -y epel-release
            sudo yum localinstall -y --nogpgcheck \
                https://download1.rpmfusion.org/free/el/rpmfusion-free-release-7.noarch.rpm \
                https://download1.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-7.noarch.rpm
            sudo yum install -y ffmpeg ffmpeg-devel
        fi
    fi
    
    # Verify FFmpeg installation
    if command -v ffmpeg &> /dev/null; then
        log "FFmpeg installed successfully: $(ffmpeg -version | head -n1)"
    else
        error "FFmpeg installation failed"
        exit 1
    fi
}

# Install NVIDIA drivers and CUDA (if NVIDIA GPU detected)
install_nvidia_support() {
    log "Checking for NVIDIA GPU..."
    
    if lspci | grep -i nvidia &> /dev/null; then
        log "NVIDIA GPU detected. Installing NVIDIA drivers and CUDA support..."
        
        if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
            # Add NVIDIA repository
            wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb
            sudo dpkg -i cuda-keyring_1.0-1_all.deb
            sudo apt update
            
            # Install NVIDIA drivers and CUDA
            sudo apt install -y \
                nvidia-driver-470 \
                nvidia-cuda-toolkit \
                libnvidia-encode-470 \
                libnvidia-decode-470
                
        elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
            # Install NVIDIA repository
            if [[ "$OS" =~ "Fedora" ]]; then
                sudo dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/fedora35/x86_64/cuda-fedora35.repo
                sudo dnf install -y cuda nvidia-driver
            else
                sudo yum-config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/rhel7/x86_64/cuda-rhel7.repo
                sudo yum install -y cuda nvidia-driver
            fi
        fi
        
        # Verify NVIDIA installation
        if command -v nvidia-smi &> /dev/null; then
            log "NVIDIA drivers installed successfully"
            nvidia-smi
        else
            warn "NVIDIA drivers installation may have failed. Manual installation might be required."
        fi
    else
        log "No NVIDIA GPU detected, skipping NVIDIA support installation"
    fi
}

# Install AMD GPU support
install_amd_support() {
    log "Checking for AMD GPU..."
    
    if lspci | grep -i amd | grep -i vga &> /dev/null || lspci | grep -i radeon &> /dev/null; then
        log "AMD GPU detected. Installing AMD GPU support..."
        
        # Detect GPU generation for proper driver selection
        local gpu_info=$(lspci | grep -i -E "(amd|radeon)" | grep -i vga)
        log "Detected GPU: $gpu_info"
        
        if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
            # Install basic Mesa drivers and VAAPI support (works for all AMD GPUs)
            sudo apt install -y \
                mesa-va-drivers \
                mesa-vdpau-drivers \
                libva-dev \
                vainfo \
                radeontop \
                mesa-opencl-icd \
                clinfo
                
            # Check if this is a newer GPU that supports ROCm
            if echo "$gpu_info" | grep -i -E "(vega|navi|rdna|rx 6|rx 7)" &> /dev/null; then
                log "Modern AMD GPU detected, installing ROCm support..."
                if [[ "$VER" == "20.04" ]] || [[ "$VER" == "22.04" ]]; then
                    # Use new ROCm repository
                    curl -fsSL https://repo.radeon.com/rocm/rocm.gpg.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/rocm.gpg
                    echo "deb [arch=amd64] https://repo.radeon.com/rocm/apt/$VER jammy main" | sudo tee /etc/apt/sources.list.d/rocm.list
                    sudo apt update
                    sudo apt install -y rocm-dev rocm-libs hip-runtime-amd || {
                        warn "ROCm installation failed, continuing with Mesa drivers only"
                    }
                fi
            else
                log "Older AMD GPU (GCN/Polaris like RX580) detected - ROCm not supported"
                log "Using Mesa drivers with OpenCL support for basic acceleration"
                
                # For older GPUs like RX580, install additional OpenCL support
                sudo apt install -y \
                    mesa-opencl-icd \
                    opencl-headers \
                    clinfo \
                    mesa-vulkan-drivers
                    
                log "Testing OpenCL support..."
                if command -v clinfo &> /dev/null; then
                    clinfo | head -10 || warn "OpenCL may not be working properly"
                fi
            fi
            
        elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
            if [[ "$OS" =~ "Fedora" ]]; then
                sudo dnf install -y \
                    mesa-va-drivers \
                    mesa-vdpau-drivers \
                    libva-devel \
                    radeontop \
                    mesa-opencl \
                    clinfo
            else
                sudo yum install -y \
                    mesa-libGL \
                    mesa-dri-drivers \
                    radeontop
            fi
        fi
        
        log "AMD GPU support installed"
        log "Note: RX580 and similar older AMD GPUs use Mesa drivers (no ROCm)"
        log "FFmpeg will use software encoding or basic OpenCL acceleration"
    else
        log "No AMD GPU detected, skipping AMD support installation"
    fi
}

# Install VLC media player
install_vlc() {
    log "Installing VLC media player..."
    
    if command -v vlc &> /dev/null; then
        log "VLC already installed: $(vlc --version | head -n1)"
        return
    fi
    
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        sudo apt install -y vlc
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        if command -v dnf &> /dev/null; then
            sudo dnf install -y vlc
        else
            sudo yum install -y vlc
        fi
    fi
    
    if command -v vlc &> /dev/null; then
        log "VLC installed successfully"
    else
        warn "VLC installation may have failed. You can install it manually later."
    fi
}

# Install additional system dependencies
install_system_deps() {
    log "Installing additional system dependencies..."
    
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        sudo apt install -y \
            curl \
            wget \
            git \
            build-essential \
            pkg-config \
            cmake \
            python3 \
            python3-pip \
            htop \
            net-tools \
            ufw \
            iftop \
            bwm-ng \
            nethogs
            
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        if command -v dnf &> /dev/null; then
            sudo dnf groupinstall -y "Development Tools"
            sudo dnf install -y \
                curl \
                wget \
                git \
                cmake \
                python3 \
                python3-pip \
                htop \
                net-tools \
                firewalld \
                iftop \
                nethogs
        else
            sudo yum groupinstall -y "Development Tools"
            sudo yum install -y \
                curl \
                wget \
                git \
                cmake \
                python3 \
                python3-pip \
                htop \
                net-tools \
                iftop \
                nethogs
        fi
    fi
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall..."
    
    if [[ "$OS" =~ "Ubuntu" ]] || [[ "$OS" =~ "Debian" ]]; then
        sudo ufw --force enable
        sudo ufw allow 3000/tcp
        sudo ufw allow 8080/tcp
        sudo ufw reload
    elif [[ "$OS" =~ "CentOS" ]] || [[ "$OS" =~ "Red Hat" ]] || [[ "$OS" =~ "Fedora" ]]; then
        sudo systemctl start firewalld
        sudo systemctl enable firewalld
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --permanent --add-port=8080/tcp
        sudo firewall-cmd --reload
    fi
    
    log "Firewall configured to allow ports 3000 and 8080"
}

# Install project dependencies
install_project_deps() {
    log "Installing project dependencies..."
    
    if [[ ! -f "package.json" ]]; then
        error "package.json not found. Make sure you're in the project directory."
        exit 1
    fi
    
    npm install
    
    log "Project dependencies installed successfully"
}

# Create systemd service
create_service() {
    log "Creating systemd service..."
    
    PROJECT_DIR=$(pwd)
    PROJECT_USER=$(whoami)
    
    sudo tee /etc/systemd/system/tvh-streamer.service > /dev/null <<EOF
[Unit]
Description=TVHeadend Streamer GPU Transcoder
Documentation=https://github.com/yourusername/tvh-streamer-transcoder
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

    sudo systemctl daemon-reload
    sudo systemctl enable tvh-streamer
    
    log "Systemd service created and enabled"
    log "Service will start automatically on boot"
}

# Create directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p streams
    mkdir -p logs
    
    # Set proper permissions
    chmod 755 streams
    chmod 755 logs
    
    log "Directories created successfully"
}

# Test installation
test_installation() {
    log "Testing installation..."
    
    # Test Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js installation test failed"
        exit 1
    fi
    
    # Test FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        error "FFmpeg installation test failed"
        exit 1
    fi
    
    # Test FFmpeg encoders
    log "Available FFmpeg encoders:"
    
    if ffmpeg -encoders 2>/dev/null | grep -q "h264_nvenc"; then
        log "✓ NVIDIA H.264 encoder available"
    else
        warn "✗ NVIDIA H.264 encoder not available"
    fi
    
    if ffmpeg -encoders 2>/dev/null | grep -q "h264_amf"; then
        log "✓ AMD H.264 encoder available"
    else
        warn "✗ AMD H.264 encoder not available"
    fi
    
    if ffmpeg -encoders 2>/dev/null | grep -q "libx264"; then
        log "✓ Software H.264 encoder available"
    else
        error "✗ Software H.264 encoder not available"
    fi
    
    log "Installation test completed"
}

# Show post-install instructions
show_instructions() {
    echo ""
    echo "=================================================="
    echo "       Installation completed successfully!"
    echo "=================================================="
    echo ""
    echo -e "${GREEN}To start the service:${NC}"
    echo "  sudo systemctl start tvh-streamer"
    echo ""
    echo -e "${GREEN}To stop the service:${NC}"
    echo "  sudo systemctl stop tvh-streamer"
    echo ""
    echo -e "${GREEN}To check service status:${NC}"
    echo "  sudo systemctl status tvh-streamer"
    echo ""
    echo -e "${GREEN}To view logs:${NC}"
    echo "  sudo journalctl -u tvh-streamer -f"
    echo ""
    echo -e "${GREEN}To start manually for development:${NC}"
    echo "  npm start"
    echo ""
    echo -e "${GREEN}Web interface will be available at:${NC}"
    echo "  http://localhost:3000"
    echo "  http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo -e "${YELLOW}Important Notes:${NC}"
    echo "  - Make sure TVHeadend is running on 192.168.100.3:9981"
    echo "  - GPU drivers may require a system reboot to work properly"
    echo "  - Check firewall settings if accessing from remote machines"
    echo ""
    echo -e "${BLUE}For support, check the project README or GitHub issues${NC}"
    echo "=================================================="
}

# Main installation flow
main() {
    echo "Starting TVHeadend Streamer installation..."
    echo "This script will install Node.js, FFmpeg, GPU drivers, and configure the system."
    echo ""
    
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Installation cancelled"
        exit 0
    fi
    
    detect_os
    update_system
    install_system_deps
    install_nodejs
    install_ffmpeg
    install_nvidia_support
    install_amd_support
    install_vlc
    configure_firewall
    create_directories
    install_project_deps
    create_service
    test_installation
    show_instructions
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    error "This script should not be run as root. Please run as a regular user with sudo privileges."
    exit 1
fi

# Check if sudo is available
if ! command -v sudo &> /dev/null; then
    error "sudo is required but not installed. Please install sudo first."
    exit 1
fi

# Run main installation
main "$@"
