# TVHeadend Streamer - Quick Start Guide

## 🚀 Brza Instalacija na Novom PC-u

### 1. Clone Repository
```bash
git clone <your-repository-url>
cd Tvh_Streamer_transcoderGPU
```

### 2. Auto-Install (sve što treba)
```bash
chmod +x install.sh
./install.sh
```

**Install script automatski instalira:**
- ✅ Node.js 18+
- ✅ FFmpeg sa GPU podrškom  
- ✅ NVIDIA drivere (ako ima NVIDIA GPU)
- ✅ AMD drivere (ako ima AMD GPU)
- ✅ VLC media player
- ✅ Systemd service (auto-start na boot)
- ✅ Firewall konfiguraciju
- ✅ Sve dependencies

### 3. Konfiguracija TVHeadend IP-a
Edituj `config.js` fajl i promeni IP adresu:
```javascript
tvheadend: {
    url: 'http://TVOJA_IP:9981/playlist',
    host: 'TVOJA_IP',
    port: 9981
}
```

### 4. Pokretanje
```bash
# Auto start kao service (radi i nakon restarta)
sudo systemctl start tvh-streamer
sudo systemctl status tvh-streamer

# ili manual za testing
npm start
```

### 5. Pristup Web Interface-u
- **Lokalno**: http://localhost:3000
- **Remote**: http://SERVER_IP:3000

## 🎮 Kako Koristiti Panel

1. **Osvježi Playlistu** - Učitava kanale sa TVHeadend servera
2. **Odaberi Kvalitet** - Low/Medium/High/Ultra profili
3. **Odaberi GPU** - Auto/NVIDIA/AMD/CPU preference
4. **Start Stream** - Pokreće transkodovanje za kanal
5. **VLC Play** - Direktno puštanje u VLC playeru
6. **Bandwidth Monitor** - Prikazuje potrošnju u MB/s

## 🔧 Service Management

```bash
# Pokreni service
sudo systemctl start tvh-streamer

# Zaustavi service
sudo systemctl stop tvh-streamer

# Restart service
sudo systemctl restart tvh-streamer

# Status service
sudo systemctl status tvh-streamer

# Logovi
sudo journalctl -u tvh-streamer -f
```

## 🛠️ Troubleshooting

### Proveri GPU Status
```bash
# NVIDIA
nvidia-smi

# AMD  
radeontop
lspci | grep -i amd
```

### Proveri FFmpeg Encoders
```bash
ffmpeg -encoders | grep h264
```

### Test TVHeadend Konekciju
```bash
curl -I http://YOUR_TVHEADEND_IP:9981/playlist
```

### Proveri Portove
```bash
netstat -tlnp | grep :3000
```

## 📱 Features Summary

- **GPU Accelerated**: NVIDIA NVENC, AMD AMF encoders
- **HLS Streaming**: HTTP Live Streaming output
- **VLC Integration**: Direct launch iz web interface-a
- **Bandwidth Monitoring**: Real-time MB/s tracking
- **Auto Service**: Starts on boot, restarts on crash
- **Multi-profile**: 480p, 720p, 1080p, 1440p
- **Web Interface**: Modern responsive UI

## 🔥 Ready to Go!

Nakon instalacije, servis će se automatski pokrenuti na boot-u i sve će raditi!

Web panel: **http://localhost:3000**
