# TVHeadend Streamer - GPU Transcoder

Napredna platforma za streaming i transkodovanje TV kanala sa TVHeadend servera koristeći GPU akceleraciju (NVIDIA i AMD).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

# TVHeadend Streamer - GPU Transcoder

Napredna platforma za streaming i transkodovanje TV kanala sa TVHeadend servera koristeći GPU akceleraciju (NVIDIA i AMD).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18+-green.svg)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)

## 🚀 Karakteristike

### 🎯 **Napredni Transcoding**
- **GPU Accelerated**: NVIDIA (NVENC) i AMD (AMF) sa **AMD prioritetom**
- **25+ FFmpeg Profila**: Od 360p do 4K, optimizovani za različite potrebe
- **Individual Control**: Svaki kanal se pokreće posebno, **nema auto-transkodovanja**
- **Real-time Progress**: Live monitoring sa bandwidth statistikama

### 🎮 **Dual Web Interface**
- **Basic Panel** (`/`): Jednostavan interface za početne korisnike
- **Advanced Panel** (`/advanced.html`): Profesionalni panel sa profilima
- **VLC Integration**: Direktno pokretanje streamova
- **Profile Categories**: Quality, GPU-specific, Specialized, HEVC

### 🔧 **Profile System**
- **Quality Profiles**: 360p, 480p, 720p, 1080p, 4K
- **GPU Profiles**: NVIDIA NVENC, AMD AMF optimized
- **Specialized**: Mobile, Streaming, Archive, Bandwidth Saver
- **HEVC Support**: H.265 profili za bolju efikasnost

### ⚡ **Performance**
- **AMD GPU Priority**: Automatski preferira AMD nad NVIDIA
- **No Auto-Start**: Kanali se pokreću samo na zahtev
- **Optimized Monitoring**: Bandwidth tracking samo za aktivne streamove
- **Non-blocking Startup**: Server se pokreće bez čekanja playlist-e

## ⚡ Brza Instalacija na Novom PC-u

```bash
# 1. Clone repository
git clone https://github.com/yourusername/tvh-streamer-transcoder.git
cd tvh-streamer-transcoder

# 2. Pokretanje auto-install (instalira SVE!)
./install.sh

# 3. Edituj TVHeadend IP adresu (ako nije 192.168.100.3)
nano config.js

# 4. Pokreni service
sudo systemctl start tvh-streamer

# 5. Otvori web panel
# http://localhost:3000
```

**I to je sve! Service se automatski pokreće na boot-u.**

## 🎮 Web Paneli

### 🟢 **Basic Panel** - `http://localhost:3000`
- Jednostavan interface za početne korisnike  
- Brz setup sa osnovnim profilima (Low/Medium/High)
- Idealan za brzo testiranje i osnovnu upotrebu

### 🔥 **Advanced Panel** - `http://localhost:3000/advanced.html`
- **PREPORUČENO za profesionalnu upotrebu**
- 25+ detaljnih FFmpeg profila
- Individual channel control (svaki kanal posebno)
- Real-time transcoding progress sa logovima
- Bandwidth monitoring i GPU status
- Profile kategorije:
  - **Quality**: 360p → 4K optimizovani profili
  - **GPU**: NVIDIA NVENC i AMD AMF specifični profili  
  - **Specialized**: Mobile, Streaming, Archive, Bandwidth Saver
  - **HEVC**: H.265 profili za bolju kompresiju

### ⚡ **Način Rada**
1. **Load channels**: Refresh Playlist dugme
2. **Select profile**: Odaberi iz kategorija (AMD GPU prioritet)
3. **Start individually**: Svaki kanal se pokreće posebno
4. **Monitor progress**: Real-time logs i bandwidth
5. **VLC launch**: Direct play dugme za testiranje

**💡 Tip**: Koristite Advanced panel za produkciju - ima sve opcije!

## 📋 Sistemski Zahtjevi

### Minimum:
- **OS**: Ubuntu 18.04+, Debian 10+, CentOS 7+, Fedora 30+
- **CPU**: Intel i5 / AMD Ryzen 5 (4+ cores)
- **RAM**: 4GB (8GB preporučeno)
- **Storage**: 10GB slobodnog prostora
- **Network**: 100Mbps+ za HD streaming

### GPU Podrška:
- **NVIDIA**: GTX 1050+ ili RTX serija (NVENC podrška)
- **AMD**: RX 400+ serija (VCE/AMF podrška)
- **Intel**: Intel Quick Sync Video (experimental)

### Software:
- Node.js 18+
- FFmpeg 4.0+ sa GPU encoderima
- Git

## 🛠️ Automatska Instalacija

### Korak 1: Clone Repository
```bash
git clone https://github.com/yourusername/tvh-streamer-transcoder.git
cd tvh-streamer-transcoder
```

### Korak 2: Pokretanje Auto-Install Script-a
```bash
./install.sh
```

Install script će automatski:
- Detektovati operativni sistem
- Instalirati Node.js i npm
- Instalirati FFmpeg sa GPU podrškom
- Instalirati NVIDIA/AMD drivere (ako su GPU-jevi prisutni)
- Konfigurisati firewall
- Instalirati project dependencies
- Kreirati systemd service
- Pokrenuti testove

## 🔧 Manuelna Instalacija

Ako preferirate manuelnu instalaciju:

### 1. Instaliranje Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL/Fedora
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs npm
```

### 2. Instaliranje FFmpeg
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y ffmpeg

# CentOS/RHEL/Fedora
sudo dnf install -y ffmpeg
```

### 3. NVIDIA GPU Podrška
```bash
# Ubuntu/Debian
sudo apt install -y nvidia-driver-470 nvidia-cuda-toolkit

# Fedora
sudo dnf install -y akmod-nvidia xorg-x11-drv-nvidia-cuda
```

### 4. AMD GPU Podrška
```bash
# Ubuntu/Debian
sudo apt install -y mesa-va-drivers mesa-vdpau-drivers

# Fedora
sudo dnf install -y mesa-va-drivers mesa-vdpau-drivers
```

### 5. Project Dependencies
```bash
npm install
```

## 🚀 Pokretanje

### Kao Systemd Service (Production)
```bash
# Start service
sudo systemctl start tvh-streamer

# Stop service
sudo systemctl stop tvh-streamer

# Check status
sudo systemctl status tvh-streamer

# View logs
sudo journalctl -u tvh-streamer -f
```

### Development Mode
```bash
npm start
# ili
node server.js
```

## 🌐 Konfiguracija

### TVHeadend Server
Updateuj server.js fajl sa adresom vašeg TVHeadend servera:

```javascript
const config = {
    tvheadend: {
        url: 'http://192.168.100.3:9981/playlist',  // Vaša adresa
        host: '192.168.100.3',
        port: 9981
    },
    // ...
};
```

### Transcoding Profiles
Možete podešavati kvaliteta u server.js:

```javascript
transcoding: {
    profiles: {
        'low': { width: 640, height: 480, bitrate: '500k' },
        'medium': { width: 1280, height: 720, bitrate: '1500k' },
        'high': { width: 1920, height: 1080, bitrate: '3000k' }
    }
}
```

## 📱 Korištenje

**Web Interface**: 
- **Osnovni panel**: http://localhost:3000 (jednostavan interface)  
- **Napredni panel**: http://localhost:3000/advanced.html (kompletan sistem profila)

### Napredni Panel Features:
- ✅ **20+ FFmpeg profila** - Quality, GPU, Specialized, HEVC kategorije
- ✅ **Real-time kontrola** - Individualno upravljanje streamovima  
- ✅ **GPU optimizacija** - Automatski odabir NVIDIA/AMD/CPU encodera
- ✅ **Live monitoring** - Bandwidth tracking, system logs, transcoding progress
- ✅ **Batch operacije** - Start/stop svih streamova odjednom
- ✅ **Profile preview** - Detaljni prikaz encoding parametara

### Osnovni Workflow:
1. **Otvorite napredni panel**: http://localhost:3000/advanced.html
2. **Osvježite playlistu**: Kliknite "Refresh Playlist" za učitavanje kanala
3. **Odaberite profil**: Izaberite iz kategorija (Quality/GPU/Specialized/HEVC)
4. **Pokrenite stream**: Kliknite "Start" na željenom kanalu
5. **VLC Play**: Kliknite "VLC" dugme za direktno puštanje u VLC playeru
6. **Monitoring**: Pratite bandwidth, logs i transcoding progress u real-time

### HLS Stream URL Format

**Portovi:**
- **Web Interface**: http://localhost:3000 (osnovni i napredni panel)
- **HLS Streams**: http://localhost:8080/stream/{channelId}/playlist.m3u8

```
http://localhost:8080/stream/{channelId}/playlist.m3u8
```

## 🔍 Monitoring i Debugging

### Logovi
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
rocm-smi

# Intel
intel_gpu_top
```

### Network Monitoring
```bash
# Port usage
netstat -tlnp | grep :3000

# Stream connections
ss -an | grep :8080
```

## 🛡️ Sigurnost

### Firewall Konfiguracija
```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 3000/tcp
sudo ufw allow 8080/tcp

# CentOS/RHEL/Fedora (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

### SSL/TLS (Opcionalno)
Za produkciju, preporučujemo korištenje reverse proxy-ja (nginx/apache) sa SSL certifikatima.

## 📊 Performance Tuning

### GPU Memory
```bash
# NVIDIA - postaviti GPU memory clock
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

## 🐛 Troubleshooting

### Common Issues

#### FFmpeg GPU Error
```bash
# Check available encoders
ffmpeg -encoders | grep h264

# Test NVIDIA encoder
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v h264_nvenc test.mp4

# Test AMD encoder
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v h264_amf test.mp4
```

#### TVHeadend Connection
```bash
# Test playlist URL
curl -I http://192.168.100.3:9981/playlist

# Check network connectivity
ping 192.168.100.3
telnet 192.168.100.3 9981
```

#### Permission Issues
```bash
# Fix directory permissions
sudo chown -R $USER:$USER /path/to/project
chmod -R 755 streams/
```

### Log Analysis
```bash
# Find errors in logs
grep -i error logs/app.log
grep -i "failed" logs/app.log

# FFmpeg debugging
export FFREPORT=file=ffmpeg_debug.log:level=verbose
```

## 🔄 Updates

### Update Project
```bash
git pull origin main
npm install
sudo systemctl restart tvh-streamer
```

### Update Dependencies
```bash
npm update
npm audit fix
```

## 📁 Project Structure

```
tvh-streamer-transcoder/
├── server.js              # Main server application
├── package.json           # Node.js dependencies
├── install.sh             # Auto-install script
├── README.md              # Documentation
├── public/                # Web interface
│   └── index.html         # Frontend application
├── streams/               # HLS output directory
├── logs/                  # Application logs
└── node_modules/          # Installed packages
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/nova-funkcija`)
3. Commit changes (`git commit -am 'Dodana nova funkcija'`)
4. Push to branch (`git push origin feature/nova-funkcija`)
5. Create Pull Request

## 📄 License

MIT License - pogledajte [LICENSE](LICENSE) fajl za detalje.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/tvh-streamer-transcoder/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/tvh-streamer-transcoder/discussions)
- **Email**: support@example.com

## 📈 Roadmap

- [ ] Docker containerization
- [ ] Web-based configuration interface
- [ ] Multi-server support
- [ ] Stream recording functionality
- [ ] Advanced analytics dashboard
- [ ] Mobile app companion
- [ ] RTMP output support
- [ ] Cloud deployment guides

## 🙏 Acknowledgments

- FFmpeg team for excellent multimedia framework
- TVHeadend project for TV streaming platform
- Node.js and Express.js communities
- Bootstrap for responsive UI components

---

**Made with ❤️ for the streaming community**
