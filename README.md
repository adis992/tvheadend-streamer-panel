# TVHeadend Streamer - GPU Transcoder

> **🚀 PRODUCTION READY**: Fully tested and optimized for Ubuntu 22.04 with NVIDIA RTX 3090, GTX 1080 Ti, and AMD RX580 (Polaris) GPUs. Complete auto-installation and systemd service integration ready for production deployment.

Advanced platform for streaming and transcoding TV channels from TVHeadend servers using GPU acceleration (NVIDIA and AMD with multi-GPU support).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

## 🚀 Features

- **GPU Accelerated Transcoding**: Support for NVIDIA (NVENC) and AMD (AMF) GPU encoders with multi-GPU support
- **Real-time GPU Monitoring**: Live GPU utilization, memory usage and temperature monitoring
- **Channel Resolution Detection**: Automatic detection and display of each channel's resolution and codec
- **Real-time Streaming**: HLS (HTTP Live Streaming) with adjustable quality
- **Modern Web Interface**: Responsive web application with real-time monitoring
- **VLC Integration**: Direct stream launching from browser
- **Bandwidth Monitoring**: Real-time MB/s consumption per stream
- **Multiple Profiles**: Low (480p), Medium (720p), High (1080p), 4K support
- **Auto-discovery**: Automatic M3U playlist download from TVHeadend server
- **Live Monitoring**: Real-time status and progress monitoring
- **Easy Deployment**: Automatic install script for all Linux distributions
- **Docker Support**: Production-ready containers with GPU passthrough

## ⚡ Quick Installation on New PC

```bash
# 1. Clone repository
git clone https://github.com/adis992/tvheadend-streamer-panel.git
cd tvheadend-streamer-panel

# 2. Run auto-install (installs EVERYTHING!)
./install.sh

# 3. Edit TVHeadend IP address (if not 192.168.100.3)
nano config.js

# 4. Start service
sudo systemctl start tvh-streamer

# 5. Open web panel
# http://localhost:3000
```

## 🔄 Updating Existing Installation

When you need to update to the latest version from GitHub and reinstall all necessary components:

```bash
# In project directory
./update.sh
```

The update script will:
- Pull latest changes from GitHub
- Save your user configurations
- Reinstall necessary dependencies
- Fix all directory permissions
- Restart services

**And that's it! Service automatically starts on boot.**

## ✅ Tested and Verified

**The project has been successfully tested on the following GPU configurations:**

### ✅ **NVIDIA GPUs** (NVENC Hardware Encoding)
- **GeForce RTX 3090** - ✅ Fully functional
- **GeForce GTX 1080 Ti** - ✅ Fully functional
- **Multiple NVIDIA GPUs** - ✅ Supported

### ✅ **AMD GPUs** (AMF/Mesa Fallback)
- **AMD Radeon RX580 (Polaris) x4** - ✅ Functional with Mesa/OpenCL fallback
- **AMD Ryzen 9 + Multiple RX580** - ✅ Multi-GPU support tested
  - *Note: RX580 uses libx264+OpenCL instead of h264_amf (expected behavior)*

### 🏗️ **Test Environment**
- **OS**: Ubuntu 22.04 LTS Desktop
- **CPU**: AMD Ryzen 9 + Intel i5/i7
- **GPU Config**: 4x RX580, 2x RTX 3090, 1x GTX 1080 Ti
- **Node.js**: 18.x LTS
- **FFmpeg**: 4.4.6+ with GPU support
- **Install Script**: Fully automated
- **Service Management**: Systemd integration

## 📋 System Requirements

### Minimum:
- **OS**: Ubuntu 18.04+, Debian 10+, CentOS 7+, Fedora 30+
- **CPU**: Intel i5 / AMD Ryzen 5 (4+ cores)
- **RAM**: 4GB (8GB recommended)
- **Storage**: 10GB free space
- **Network**: 100Mbps+ for HD streaming

### GPU Support:
- **NVIDIA**: GTX 1050+ or RTX series (NVENC support)
- **AMD**: RX 400+ series (VCE/AMF support) - Multiple GPU support
- **Intel**: Intel Quick Sync Video (experimental)

### Software:
- Node.js 18+
- FFmpeg 4.0+ with GPU encoders
- Git

## 🐳 Docker Deployment

```bash
# Production deployment with Docker
docker-compose up -d

# With custom configuration
cp config.js.example config.js
# Edit config.js with your settings
docker-compose up -d
```

The Docker configuration supports:
- Multi-GPU setups (both NVIDIA and AMD)
- Automatic GPU passthrough
- Persistent storage for streams and logs
- Nginx reverse proxy for production

## 🎯 Quick Start Guide

### 1. **Installation**
```bash
git clone https://github.com/adis992/tvheadend-streamer-panel.git
cd tvheadend-streamer-panel
./install.sh
```

### 2. **Configuration**
```bash
nano config.js
# Update TVHeadend server IP and credentials
```

### 3. **Start Service**
```bash
sudo systemctl start tvh-streamer
sudo systemctl enable tvh-streamer
```

### 4. **Access Web Interface**
Open your browser and go to: `http://your-server-ip:3000`

### 5. **Monitor GPUs**
The web interface displays real-time GPU load, memory usage, and temperature for all detected GPUs.

## 🖥️ Web Interface Features

### Real-time GPU Monitoring
- **Header GPU Cards**: Live GPU utilization display in header
- **Multiple GPU Support**: Shows all detected NVIDIA and AMD GPUs
- **Real-time Metrics**: Usage %, memory %, temperature monitoring
- **GPU Load Distribution**: Visual indication of GPU workload

### Channel Management
- **Resolution Detection**: Automatic detection of channel resolution and codec
- **Bandwidth Monitoring**: Real-time MB/s consumption tracking
- **Profile Selection**: Multiple transcoding profiles per channel
- **GPU Assignment**: Manual GPU selection for load balancing

### Stream Management
- **HLS Streaming**: HTTP Live Streaming with multiple quality options
- **Direct Passthrough**: Zero-latency direct streaming
- **VLC Integration**: One-click stream opening in VLC
- **Bulk Operations**: Start/stop multiple streams

## 🔧 Manual Installation

### 1. Node.js 18+
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# CentOS/RHEL
sudo dnf module install nodejs:18
```

### 2. FFmpeg with GPU Support
```bash
# Ubuntu/Debian
sudo apt install -y ffmpeg

# Verify GPU encoders
ffmpeg -encoders | grep -E "(nvenc|amf|qsv)"
```

### 3. NVIDIA GPU Support
```bash
# Ubuntu/Debian
sudo apt install -y nvidia-driver-470 nvidia-cuda-toolkit
nvidia-smi
```

### 4. AMD GPU Support
```bash
# Ubuntu/Debian
sudo apt install -y mesa-va-drivers mesa-vdpau-drivers radeontop clinfo

# For multiple AMD GPUs
sudo apt install -y mesa-opencl-icd opencl-headers
```

### 5. Project Dependencies
```bash
npm install
```

## 📊 Performance Tuning

### GPU Memory
```bash
# NVIDIA - set GPU memory clock
nvidia-smi -pl 300  # Set power limit
nvidia-smi -lgc 1500  # Set GPU clock
```

### System Optimizations
```bash
# Increase file descriptor limits
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Network optimizations
sysctl -w net.core.rmem_max=26214400
sysctl -w net.core.rmem_default=26214400
```

## 🔍 Monitoring and Debugging

### Logs
```bash
# Systemd service logs
sudo journalctl -u tvh-streamer -f

# Manual run logs
tail -f logs/app.log
```

### GPU Status
```bash
# NVIDIA
nvidia-smi

# AMD
radeontop
# Multiple AMD GPUs
for i in /sys/class/drm/card*/device/gpu_busy_percent; do echo "$i: $(cat $i 2>/dev/null || echo 'N/A')"; done
```

### Network Monitoring
```bash
# Port usage
netstat -tlnp | grep :3000

# Stream connections
ss -an | grep :8080
```

## 🔧 Configuration

### Basic Configuration (config.js)
```javascript
module.exports = {
    tvheadend: {
        host: '192.168.100.3',
        port: 9981,
        url: 'http://192.168.100.3:9981/playlist'
    },
    server: {
        port: 3000
    },
    streaming: {
        port: 8080
    }
};
```

### GPU Preferences
The system automatically detects and utilizes all available GPUs. For multi-GPU setups:
- Load balancing is automatic
- Manual GPU assignment available per channel
- Real-time monitoring shows utilization across all GPUs

## 🚨 Troubleshooting

### Common Issues

**GPU not detected:**
```bash
# Check GPU detection
lspci | grep -i vga
nvidia-smi  # For NVIDIA
lspci | grep -i amd  # For AMD
```

**FFmpeg GPU errors:**
```bash
# Test GPU encoders
ffmpeg -encoders | grep -E "(nvenc|amf)"
ffmpeg -f lavfi -i testsrc -t 5 -c:v h264_nvenc test.mp4  # NVIDIA test
```

**Resolution detection not working:**
```bash
# Test ffprobe
ffprobe -v quiet -print_format json -show_streams "http://your-stream-url"
```

**Multiple AMD GPUs not showing:**
```bash
# Check DRI devices
ls -la /dev/dri/
# Check OpenCL devices
clinfo
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Repository**: https://github.com/adis992/tvheadend-streamer-panel
- **Issues**: https://github.com/adis992/tvheadend-streamer-panel/issues
- **Documentation**: Available in the web interface

## 📞 Support

For support and questions:
- Open an issue on GitHub
- Check the built-in documentation in the web interface
- Review the logs for troubleshooting information

---

**Production Ready** | **Multi-GPU Support** | **Real-time Monitoring** | **Docker Ready**
