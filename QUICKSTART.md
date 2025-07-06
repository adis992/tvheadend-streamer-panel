# 🚀 TVHeadend Streamer - QUICK START

## ⚡ Na Novom PC-u (sve što treba!)

### 1. Clone Repository
```bash
git clone https://github.com/VASE_USERNAME/VASE_REPO_NAME.git
cd tvh-streamer-transcoder
```

### 2. Pokretanje Auto-Install (instalira SVE!)
```bash
chmod +x install.sh
./install.sh
```

**Auto-install instalira:**
- ✅ Node.js 18+
- ✅ FFmpeg sa GPU podrškom  
- ✅ NVIDIA/AMD drivere 
- ✅ VLC media player
- ✅ Systemd service (auto-start na boot)
- ✅ Firewall konfiguraciju
- ✅ Sve dependencies

### 3. Konfigurisanje TVHeadend IP-a (ako nije 192.168.100.3)
```bash
nano config.js
# Promeni:
# url: 'http://VASA_IP:9981/playlist'
# host: 'VASA_IP'
```

### 4. Pokretanje
```bash
# Service mode (auto-start na boot)
sudo systemctl start tvh-streamer
sudo systemctl status tvh-streamer

# ili manual za testing
npm start
```

## 🎮 Pristup Web Panel-u

**Web Interface**: http://localhost:3000

### Funkcije Panel-a:
1. **Osvježi Playlistu** - Učitava kanale sa TVHeadend-a
2. **Odaberi Kvalitet** - Low/Medium/High/Ultra
3. **Odaberi GPU** - Auto/NVIDIA/AMD/CPU
4. **Start Stream** - Pokreće transkodovanje
5. **VLC Play** - Direktno pokreće VLC player
6. **Bandwidth** - Prikazuje MB/s potrošnju

## 🔧 Portovi

- **Web Panel**: http://localhost:3000 (glavni interface)
- **HLS Streams**: http://localhost:8080/stream/{id}/playlist.m3u8

## �️ Service Management

```bash
# Pokreni
sudo systemctl start tvh-streamer

# Zaustavi
sudo systemctl stop tvh-streamer

# Status
sudo systemctl status tvh-streamer

# Logovi
sudo journalctl -u tvh-streamer -f
```

## ⚡ TO JE SVE!

Nakon `./install.sh` - sve radi automatski! 🚀
