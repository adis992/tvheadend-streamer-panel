const express = require('express');

// Helper: Save active streams to file
function saveActiveStreamsToFile() {
    const active = [];
    for (const [channelId, stream] of activeStreams) {
        active.push({
            type: 'hls',
            channelId,
            profile: stream.profile,
            gpu: stream.gpu
        });
    }
    for (const [channelId, stream] of activeUdpStreams) {
        active.push({
            type: 'udp',
            channelId,
            profile: stream.profile,
            gpu: stream.gpu,
            ip: stream.udpUrl ? stream.udpUrl.split('@')[1].split(':')[0] : undefined,
            port: stream.udpUrl ? parseInt(stream.udpUrl.split(':')[2]) : undefined
        });
    }
    fs.writeJsonSync(ACTIVE_STREAMS_FILE, active, { spaces: 2 });
}

// Helper: Restore active streams from file
async function restoreActiveStreamsFromFile() {
    if (!fs.existsSync(ACTIVE_STREAMS_FILE)) return;
    try {
        const active = await fs.readJson(ACTIVE_STREAMS_FILE);
        for (const entry of active) {
            if (entry.type === 'hls') {
                await startTranscoding(entry.channelId, entry.profile, entry.gpu);
            } else if (entry.type === 'udp') {
                await startUdpStream(entry.channelId, entry.profile, entry.gpu, { ip: entry.ip, port: entry.port });
            }
        }
    } catch (err) {
        console.error('Failed to restore active streams:', err);
    }
}
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const fetch = require('node-fetch');

const ACTIVE_STREAMS_FILE = path.join(__dirname, 'active-streams.json');


// Helper: Save active streams to file
function saveActiveStreamsToFile() {
    const active = [];
    for (const [channelId, stream] of activeStreams) {
        active.push({
            type: 'hls',
            channelId,
            profile: stream.profile,
            gpu: stream.gpu
        });
    }
    for (const [channelId, stream] of activeUdpStreams) {
        active.push({
            type: 'udp',
            channelId,
            profile: stream.profile,
            gpu: stream.gpu,
            ip: stream.udpUrl ? stream.udpUrl.split('@')[1].split(':')[0] : undefined,
            port: stream.udpUrl ? parseInt(stream.udpUrl.split(':')[2]) : undefined
        });
    }
    fs.writeJsonSync(ACTIVE_STREAMS_FILE, active, { spaces: 2 });
}

// Helper: Restore active streams from file
async function restoreActiveStreamsFromFile() {
    if (!fs.existsSync(ACTIVE_STREAMS_FILE)) return;
    try {
        const active = await fs.readJson(ACTIVE_STREAMS_FILE);
        for (const entry of active) {
            if (entry.type === 'hls') {
                await startTranscoding(entry.channelId, entry.profile, entry.gpu);
            } else if (entry.type === 'udp') {
                await startUdpStream(entry.channelId, entry.profile, entry.gpu, { ip: entry.ip, port: entry.port });
            }
        }
    } catch (err) {
        console.error('Failed to restore active streams:', err);
    }
}

// Import configuration
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Global variables
let channels = [];
let activeStreams = new Map();
let activeUdpStreams = new Map();
let streamStats = new Map();

// Socket.IO events
io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send initial data
    socket.emit('channelsUpdated', channels);
    socket.emit('gpuInfo', gpuInfo);
    socket.emit('tvheadendStatus', tvheadendStatus);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Auto-install API endpoints
app.get('/api/detect-system', async (req, res) => {
    try {
        const systemInfo = await detectSystemInfo();
        res.json(systemInfo);
    } catch (error) {
        console.error('Error detecting system:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/check-components', async (req, res) => {
    try {
        const components = await checkSystemComponents();
        res.json(components);
    } catch (error) {
        console.error('Error checking components:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auto-install', async (req, res) => {
    try {
        // Run the install script
        const installProcess = spawn('./install.sh', [], {
            cwd: __dirname,
            stdio: 'pipe'
        });
        
        installProcess.stdout.on('data', (data) => {
            io.emit('installProgress', {
                component: 'auto-install',
                message: data.toString().trim(),
                progress: 50
            });
        });
        
        installProcess.stderr.on('data', (data) => {
            io.emit('installProgress', {
                component: 'auto-install',
                message: data.toString().trim(),
                progress: 50
            });
        });
        
        installProcess.on('close', (code) => {
            if (code === 0) {
                io.emit('installComplete', { component: 'auto-install' });
            } else {
                io.emit('installError', { error: `Installation failed with code ${code}` });
            }
        });
        
        res.json({ success: true, message: 'Auto installation started' });
    } catch (error) {
        console.error('Error starting auto install:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/install/:component', async (req, res) => {
    try {
        const component = req.params.component;
        const success = await installComponent(component);
        
        if (success) {
            res.json({ success: true, message: `${component} installation started` });
        } else {
            res.status(500).json({ error: `Failed to start ${component} installation` });
        }
    } catch (error) {
        console.error(`Error installing ${component}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions for system detection
async function detectSystemInfo() {
    return new Promise((resolve) => {
        const info = { 
            gpu: 'None detected',
            gpuInfo: { ...gpuInfo },  // Include detailed GPU info from detection
            encoders: {
                nvidia: false,
                amd: false,
                intel: false,
                cpu: true
            },
            ports: {
                webInterface: config.server.port,
                streaming: config.streaming.port
            },
            udp: {
                defaultIp: config.streaming.udp.defaultIp,
                defaultPort: config.streaming.udp.defaultPort,
                activeStreams: Array.from(activeUdpStreams.entries()).map(([id, stream]) => ({
                    channelId: id,
                    udpUrl: stream.udpUrl,
                    profile: stream.profile,
                    gpu: stream.gpu
                }))
            }
        };
        
        // Get OS info
        exec('cat /etc/os-release', (error, stdout) => {
            if (!error) {
                const lines = stdout.split('\n');
                const prettyName = lines.find(line => line.startsWith('PRETTY_NAME='));
                if (prettyName) {
                    info.os = prettyName.split('=')[1].replace(/"/g, '');
                }
            }
            
            // Get CPU info
            exec('cat /proc/cpuinfo | grep "model name" | head -1', (error, stdout) => {
                if (!error) {
                    info.cpu = stdout.split(':')[1]?.trim();
                }
                
                // Get Memory info
                exec('free -h | grep Mem', (error, stdout) => {
                    if (!error) {
                        const parts = stdout.split(/\s+/);
                        info.memory = {
                            total: parts[1],
                            used: parts[2],
                            free: parts[3]
                        };
                    }
                    
                    // Get FFmpeg encoders
                    exec('ffmpeg -encoders 2>/dev/null | grep -E "(h264_nvenc|h264_amf|h264_qsv|libx264)"', (error, stdout) => {
                        if (!error && stdout) {
                            info.encoders.nvidia = stdout.includes('h264_nvenc');
                            info.encoders.amd = stdout.includes('h264_amf');
                            info.encoders.intel = stdout.includes('h264_qsv');
                            info.encoders.cpu = stdout.includes('libx264');
                        }
                        
                        // Get GPU info
                        if (gpuInfo.nvidia) {
                            exec('nvidia-smi --query-gpu=gpu_name,driver_version,memory.total --format=csv,noheader', (error, stdout) => {
                                if (!error) {
                                    info.gpu = stdout.trim();
                                    info.gpuInfo.detail = stdout.trim();
                                } else {
                                    info.gpu = 'NVIDIA GPU detected (driver issue)';
                                }
                                resolve(info);
                            });
                        } else if (gpuInfo.amd) {
                            exec('lspci | grep -i -E "(amd|radeon)" | grep -i vga', (error, stdout) => {
                                info.gpu = stdout.trim() || 'AMD GPU detected';
                                
                                // Check OpenCL
                                exec('clinfo 2>/dev/null | grep -i "device name"', (error, stdout) => {
                                    if (!error && stdout) {
                                        info.gpuInfo.openclDevices = stdout.trim().split('\n').length;
                                    }
                                    
                                    // Check Mesa
                                    exec('glxinfo | grep "OpenGL renderer"', (error, stdout) => {
                                        if (!error && stdout) {
                                            info.gpuInfo.glRenderer = stdout.split(':')[1]?.trim();
                                            // Check if using software rendering (llvmpipe)
                                            info.gpuInfo.softwareRendering = stdout.includes('llvmpipe');
                                        }
                                        resolve(info);
                                    });
                                });
                            });
                        } else {
                            resolve(info);
                        }
                    });
                });
            });
        });
    });
}

async function checkSystemComponents() {
    const components = [];
    
    // Check Node.js
    const nodeCheck = await checkCommand('node --version');
    components.push({
        name: 'nodejs',
        displayName: 'Node.js',
        description: 'JavaScript runtime for server',
        status: nodeCheck.available ? 'available' : 'missing',
        version: nodeCheck.version
    });
    
    // Check NPM
    const npmCheck = await checkCommand('npm --version');
    components.push({
        name: 'npm',
        displayName: 'NPM',
        description: 'Node package manager',
        status: npmCheck.available ? 'available' : 'missing',
        version: npmCheck.version
    });
    
    // Check FFmpeg
    const ffmpegCheck = await checkCommand('ffmpeg -version');
    components.push({
        name: 'ffmpeg',
        displayName: 'FFmpeg',
        description: 'Video processing with GPU acceleration',
        status: ffmpegCheck.available ? 'available' : 'missing',
        version: ffmpegCheck.version
    });
    
    // Check VLC
    const vlcCheck = await checkCommand('vlc --version');
    components.push({
        name: 'vlc',
        displayName: 'VLC Media Player',
        description: 'Media player for testing streams',
        status: vlcCheck.available ? 'available' : 'missing',
        version: vlcCheck.version
    });
    
    // Check NVIDIA
    if (gpuInfo.nvidia) {
        const nvidiaCheck = await checkCommand('nvidia-smi');
        components.push({
            name: 'nvidia-drivers',
            displayName: 'NVIDIA Drivers',
            description: 'NVIDIA GPU drivers and CUDA',
            status: nvidiaCheck.available ? 'available' : 'missing',
            version: nvidiaCheck.version
        });
    }
    
    // Check AMD
    if (gpuInfo.amd) {
        const amdCheck = await checkAMDDrivers();
        components.push({
            name: 'amd-drivers',
            displayName: 'AMD Drivers',
            description: 'AMD GPU drivers and Mesa',
            status: amdCheck.available ? 'available' : 'missing',
            version: amdCheck.version
        });
    }
    
    return components;
}

async function checkCommand(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ available: false, version: null });
            } else {
                const output = stdout || stderr;
                const versionMatch = output.match(/(\d+\.[\d\.]+)/);
                resolve({ 
                    available: true, 
                    version: versionMatch ? versionMatch[1] : 'Unknown'
                });
            }
        });
    });
}

async function checkAMDDrivers() {
    return new Promise((resolve) => {
        // Method 1: Check if amdgpu module is available (not necessarily loaded)
        exec('modinfo amdgpu 2>/dev/null', (error1, modinfo) => {
            if (!error1 && modinfo.includes('filename:')) {
                // amdgpu module exists, check Mesa/OpenGL support
                exec('glxinfo 2>/dev/null | grep "OpenGL"', (error2, glxOutput) => {
                    let version = 'Available';
                    if (!error2 && glxOutput) {
                        const mesaMatch = glxOutput.match(/Mesa\s+(\d+\.[\d\.]+)/);
                        if (mesaMatch) {
                            version = `Mesa ${mesaMatch[1]}`;
                        } else if (glxOutput.includes('OpenGL')) {
                            version = 'OpenGL Available';
                        }
                    }
                    
                    resolve({ 
                        available: true, 
                        version: version
                    });
                    return; // Exit here to prevent falling through to Method 2
                });
                return; // Exit here to prevent falling through to Method 2
            }
            
            // Method 2: Check if AMD GPU is detected in lspci
            exec('lspci | grep -i "amd\\|radeon" | grep -i vga', (error3, lspciOutput) => {
                if (!error3 && lspciOutput.trim()) {
                    // GPU is detected, assume drivers are available even if not optimally configured
                    resolve({ 
                        available: true, 
                        version: 'Basic Support'
                    });
                } else {
                    resolve({ available: false, version: null });
                }
            });
        });
    });
}

async function installComponent(component) {
    try {
        if (component === 'amd-drivers' || component === 'amd-gpu') {
            // For AMD components, trigger the specialized installation
            io.emit('installProgress', {
                component: 'amd-gpu',
                message: 'Starting AMD GPU installation...',
                progress: 10
            });
            
            // Execute AMD installation script
            const { spawn } = require('child_process');
            const amdInstallScript = `#!/bin/bash
set -e

echo "Installing AMD GPU support..."

# Colors for output
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
NC='\\033[0m' # No Color

log() {
    echo -e "\${GREEN}[INFO]\${NC} $1"
}

warn() {
    echo -e "\${YELLOW}[WARN]\${NC} $1"
}

# Detect AMD GPU
GPU_INFO=$(lspci | grep -i -E "(amd|radeon)" | grep -i vga)
log "Detected GPU: $GPU_INFO"

# Install basic Mesa drivers and VAAPI support
log "Installing Mesa drivers and VAAPI support..."
sudo apt update
sudo apt install -y \\
    mesa-va-drivers \\
    mesa-vdpau-drivers \\
    libva-dev \\
    vainfo \\
    radeontop \\
    mesa-opencl-icd \\
    clinfo \\
    mesa-vulkan-drivers \\
    opencl-headers

log "AMD GPU support installation completed!"
`;

            const fs = require('fs');
            const path = require('path');
            const scriptPath = path.join(__dirname, 'temp_amd_install.sh');
            fs.writeFileSync(scriptPath, amdInstallScript);
            fs.chmodSync(scriptPath, 0o755);
            
            const installProcess = spawn('bash', [scriptPath], {
                cwd: __dirname,
                stdio: 'pipe'
            });
            
            installProcess.stdout.on('data', (data) => {
                io.emit('installProgress', {
                    component: 'amd-gpu',
                    message: data.toString().trim(),
                    progress: 50
                });
            });
            
            installProcess.on('close', (code) => {
                // Clean up temp script
                try {
                    fs.unlinkSync(scriptPath);
                } catch (err) {
                    console.warn('Could not delete temp script');
                }
                
                if (code === 0) {
                    io.emit('installComplete', { component: 'amd-gpu' });
                } else {
                    io.emit('installError', { component: 'amd-gpu', error: `Failed with code ${code}` });
                }
            });
            
            return true;
        }
        
        // For other components, use the general install script
        const installProcess = spawn('./install.sh', [], {
            cwd: __dirname,
            stdio: 'pipe'
        });
        
        installProcess.stdout.on('data', (data) => {
            io.emit('installProgress', {
                component: component,
                message: data.toString().trim(),
                progress: 50
            });
        });
        
        installProcess.stderr.on('data', (data) => {
            io.emit('installProgress', {
                component: component,
                message: data.toString().trim(),
                progress: 50
            });
        });
        
        installProcess.on('close', (code) => {
            if (code === 0) {
                io.emit('installComplete', { component: component });
            } else {
                io.emit('installError', { error: `Installation failed with code ${code}` });
            }
        });
        
        return true;
    } catch (error) {
        console.error(`Error installing ${component}:`, error);
        return false;
    }
}

// Bandwidth monitoring
let gpuInfo = { nvidia: false, amd: false };
let tvheadendStatus = { connected: false, lastError: null, lastCheck: null };

// GPU Detection
async function detectGPU() {
    try {
        // Check for NVIDIA GPU
        const nvidiaCheck = await new Promise((resolve) => {
            exec('nvidia-smi', (error) => {
                resolve(!error);
            });
        });
        
        // Check for AMD GPU with better detection for older cards like RX580
        const amdCheck = await new Promise((resolve) => {
            // First try rocm-smi (for newer AMD GPUs)
            exec('rocm-smi', (error) => {
                if (error) {
                    // Try lspci to detect AMD/Radeon GPU and get model information
                    exec('lspci | grep -i -E "(amd|radeon)" | grep -i vga', (error, stdout) => {
                        if (!error && stdout.trim()) {
                            console.log('AMD GPU detected via lspci:', stdout.trim());
                            
                            // Extract model name if possible
                            const modelMatch = stdout.match(/\[AMD\/ATI\]\s+([^\[]+)\s+(\[|$)/i);
                            if (modelMatch && modelMatch[1]) {
                                gpuInfo.amdModelName = modelMatch[1].trim();
                                console.log('AMD GPU model detected:', gpuInfo.amdModelName);
                            }
                            
                            // Check for driver availability
                            exec('lsmod | grep -i amdgpu', (error, stdout) => {
                                if (!error && stdout.trim()) {
                                    console.log('AMD GPU driver (amdgpu) is loaded');
                                    gpuInfo.amdDriverLoaded = true;
                                } else {
                                    console.log('AMD GPU driver not loaded or not available');
                                    gpuInfo.amdDriverLoaded = false;
                                }
                                resolve(true);
                            });
                        } else {
                            resolve(false);
                        }
                    });
                } else {
                    console.log('AMD GPU detected via rocm-smi');
                    gpuInfo.amdRocmSupport = true;
                    resolve(true);
                }
            });
        });
        
        gpuInfo.nvidia = nvidiaCheck;
        gpuInfo.amd = amdCheck;
        
        console.log('GPU Detection Results:', gpuInfo);
        return gpuInfo;
    } catch (error) {
        console.error('Error detecting GPU:', error);
        return gpuInfo;
    }
}

// Parse M3U playlist
function parseM3U(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentChannel = {};
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            // Parse channel info
            const info = line.substring(8);
            const nameMatch = info.match(/,(.+)$/);
            const logoMatch = info.match(/tvg-logo="([^"]+)"/);
            const groupMatch = info.match(/group-title="([^"]+)"/);
            const chnoMatch = info.match(/tvg-chno="([^"]+)"/);
            
            // ALWAYS use tvg-chno as the primary channel ID
            const channelNumber = chnoMatch ? parseInt(chnoMatch[1]) : null;
            
            if (!channelNumber) {
                console.warn(`Skipping channel without tvg-chno: ${nameMatch ? nameMatch[1] : 'Unknown'}`);
                continue; // Skip channels without channel numbers
            }
            
            currentChannel = {
                id: channelNumber, // Use channel number as primary ID
                channelNumber: channelNumber,
                name: nameMatch ? nameMatch[1] : 'Unknown Channel',
                logo: logoMatch ? logoMatch[1] : '',
                group: groupMatch ? groupMatch[1] : 'Uncategorized',
                url: '',
                isActive: false,
                transcoding: false,
                passthrough: false,
                udpStreaming: false,
                udpUrl: null,
                profile: 'passthrough',
                bandwidth: 0,
                totalData: 0
            };
            
            console.log(`Parsed channel ${channelNumber}: ${currentChannel.name}`);
        } else if (line && !line.startsWith('#') && currentChannel.name) {
            // ALWAYS replace channelid with channelnumber in the URL
            if (currentChannel.channelNumber && line.includes('/stream/channelid/')) {
                // Extract the base URL and profile parameters
                const baseUrl = line.split('/stream/channelid/')[0];
                const urlParts = line.split('?');
                const profilePart = urlParts.length > 1 ? `?${urlParts[1]}` : '?profile=pass';
                
                // Build the correct channelnumber URL
                currentChannel.url = `${baseUrl}/stream/channelnumber/${currentChannel.channelNumber}${profilePart}`;
                console.log(`🔄 Replaced channelid with channelnumber: ${currentChannel.url}`);
            } else {
                // Keep original URL if no channelid found
                currentChannel.url = line;
            }
            
            // For backwards compatibility, also store as channelNumberUrl
            currentChannel.channelNumberUrl = currentChannel.url;
            
            channels.push({ ...currentChannel });
            currentChannel = {};
        }
    }
    
    console.log(`Parsed ${channels.length} channels with valid channel numbers from TVHeadend playlist`);
    return channels;
}

// Fetch TVHeadend playlist
async function fetchPlaylist() {
    try {
        console.log('Fetching playlist from:', config.tvheadend.url);
        const response = await fetch(config.tvheadend.url, {
            timeout: 10000 // 10 second timeout
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const content = await response.text();
        channels = parseM3U(content);
        
        // Update TVHeadend status
        tvheadendStatus.connected = true;
        tvheadendStatus.lastError = null;
        tvheadendStatus.lastCheck = new Date();
        
        console.log(`Successfully loaded ${channels.length} channels`);
        io.emit('channelsUpdated', channels);
        io.emit('tvheadendStatus', tvheadendStatus);
        
        return channels;
    } catch (error) {
        console.error('Error fetching playlist:', error);
        
        // Update TVHeadend status
        tvheadendStatus.connected = false;
        tvheadendStatus.lastError = error.message;
        tvheadendStatus.lastCheck = new Date();
        
        console.log('TVHeadend not available, loading demo channels...');
        
        // Demo channels when TVHeadend is not available
        channels = [
            {
                id: 'demo1',
                name: 'Demo Channel 1 (HD)',
                logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Big_Buck_Bunny_medium.jpg/275px-Big_Buck_Bunny_medium.jpg',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                group: 'Demo Animations',
                isActive: false,
                transcoding: false,
                profile: 'medium',
                gpu: 'auto',
                bandwidth: 0,
                totalData: 0
            },
            {
                id: 'demo2',
                name: 'Demo Channel 2 (4K)',
                logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Elephants_Dream_promo.jpg',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                group: 'Demo Animations',
                isActive: false,
                transcoding: false,
                profile: 'high',
                gpu: 'auto',
                bandwidth: 0,
                totalData: 0
            },
            {
                id: 'demo3',
                name: 'Demo Channel 3 (FullHD)',
                logo: 'https://media.thinklandia.com/wp-content/uploads/2020/10/29081209/bigblaze-poster.jpg',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                group: 'Demo Footage',
                isActive: false,
                transcoding: false,
                profile: 'medium',
                gpu: 'auto',
                bandwidth: 0,
                totalData: 0
            },
            {
                id: 'demo4',
                name: 'Demo Channel 4 (HD)',
                logo: 'https://media.autoexpress.co.uk/image/private/s--X-WVjvBW--/f_auto,t_content-image-full-desktop@1/v1562246965/autoexpress/2017/08/subaru_outback.jpg',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
                group: 'Demo Footage',
                isActive: false,
                transcoding: false,
                profile: 'low',
                gpu: 'auto',
                bandwidth: 0,
                totalData: 0
            }
        ];
        
        console.log(`Demo mode: loaded ${channels.length} demo channels`);
        io.emit('channelsUpdated', channels);
        io.emit('tvheadendStatus', tvheadendStatus);
        
        return channels;
    }
}

// Check TVHeadend connectivity
async function checkTVHeadendConnection() {
    try {
        console.log('Checking TVHeadend connectivity...');
        const response = await fetch(`http://${config.tvheadend.host}:${config.tvheadend.port}/api/status`, {
            timeout: 5000
        });
        
        tvheadendStatus.connected = response.ok;
        tvheadendStatus.lastError = response.ok ? null : `Server responded with status ${response.status}`;
        tvheadendStatus.lastCheck = new Date();
        
        io.emit('tvheadendStatus', tvheadendStatus);
        return response.ok;
    } catch (error) {
        console.error('TVHeadend connection check failed:', error);
        tvheadendStatus.connected = false;
        tvheadendStatus.lastError = `Connection failed: ${error.message}`;
        tvheadendStatus.lastCheck = new Date();
        
        io.emit('tvheadendStatus', tvheadendStatus);
        return false;
    }
}

// Check FFmpeg installation
async function checkFFmpegInstallation() {
    try {
        console.log('Checking FFmpeg installation...');
        const result = await new Promise((resolve) => {
            exec('ffmpeg -version', (error, stdout) => {
                if (error) {
                    resolve({ installed: false, error: error.message });
                } else {
                    const version = stdout.split('\n')[0];
                    resolve({ installed: true, version: version });
                }
            });
        });
        
        if (result.installed) {
            console.log('FFmpeg is installed:', result.version);
            return true;
        } else {
            console.warn('FFmpeg not found:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error checking FFmpeg installation:', error);
        return false;
    }
}

// Auto-install FFmpeg if not present
async function autoInstallFFmpeg() {
    try {
        console.log('Attempting to auto-install FFmpeg...');
        
        // Detect OS type
        const osCheck = await new Promise((resolve) => {
            exec('cat /etc/os-release', (error, stdout) => {
                if (error) {
                    resolve({ os: 'unknown' });
                } else {
                    const isUbuntu = stdout.includes('Ubuntu') || stdout.includes('Debian');
                    const isFedora = stdout.includes('Fedora');
                    const isCentOS = stdout.includes('CentOS') || stdout.includes('Red Hat');
                    resolve({ 
                        os: isUbuntu ? 'ubuntu' : isFedora ? 'fedora' : isCentOS ? 'centos' : 'unknown',
                        details: stdout 
                    });
                }
            });
        });
        
        let installCommand = '';
        
        switch (osCheck.os) {
            case 'ubuntu':
                installCommand = 'sudo apt update && sudo apt install -y ffmpeg';
                break;
            case 'fedora':
                installCommand = 'sudo dnf install -y ffmpeg || sudo dnf install -y --enablerepo=rpmfusion-free ffmpeg';
                break;
            case 'centos':
                installCommand = 'sudo yum install -y epel-release && sudo yum install -y ffmpeg';
                break;
            default:
                console.warn('Unknown OS, cannot auto-install FFmpeg. Please install manually.');
                return false;
        }
        
        console.log(`Installing FFmpeg on ${osCheck.os}...`);
        console.log(`Command: ${installCommand}`);
        
        const installResult = await new Promise((resolve) => {
            exec(installCommand, { timeout: 300000 }, (error, stdout, stderr) => { // 5 min timeout
                if (error) {
                    resolve({ success: false, error: error.message, stderr: stderr });
                } else {
                    resolve({ success: true, stdout: stdout });
                }
            });
        });
        
        if (installResult.success) {
            console.log('FFmpeg installation completed successfully');
            
            // Verify installation
            const verifyResult = await checkFFmpegInstallation();
            if (verifyResult) {
                console.log('FFmpeg installation verified successfully');
                return true;
            } else {
                console.error('FFmpeg installation verification failed');
                return false;
            }
        } else {
            console.error('FFmpeg installation failed:', installResult.error);
            console.error('stderr:', installResult.stderr);
            return false;
        }
        
    } catch (error) {
        console.error('Error during FFmpeg auto-installation:', error);
        return false;
    }
}

// Get FFmpeg encoder based on GPU using config.js
function getFFmpegEncoder(gpu, codec = 'h264') {
    const preferences = config.transcoding.gpuPreferences;
    
    // Handle HEVC codec
    if (codec === 'hevc') {
        if (gpu === 'nvidia' && gpuInfo.nvidia) {
            return {
                video: 'hevc_nvenc',
                preset: 'medium',
                extraArgs: ['-gpu', '0', '-rc', 'cbr', '-profile:v', 'main'],
                fallback: {
                    video: 'libx265',
                    preset: 'medium',
                    extraArgs: ['-threads', '0', '-x265-params', 'pools=+,-']
                }
            };
        } else if (gpu === 'amd' && gpuInfo.amd) {
            // Try AMD HEVC encoder first, fallback to software
            return {
                video: 'hevc_amf',
                preset: 'quality',
                extraArgs: [
                    '-usage', 'transcoding',
                    '-quality', 'quality',
                    '-rc', 'cqp',
                    '-qp_i', '28',
                    '-qp_p', '30',
                    '-profile:v', 'main'
                ],
                fallback: {
                    video: 'libx265',
                    preset: 'medium',
                    extraArgs: ['-threads', '0', '-crf', '28', '-preset', 'medium']
                }
            };
        } else {
            // Software HEVC encoding
            return {
                video: 'libx265',
                preset: 'medium',
                extraArgs: ['-threads', '0', '-crf', '28', '-preset', 'medium']
            };
        }
    }
    
    // H.264 codec handling
    if (gpu === 'nvidia' && gpuInfo.nvidia && preferences.nvidia) {
        return {
            video: preferences.nvidia.encoder,
            preset: preferences.nvidia.preset,
            extraArgs: preferences.nvidia.extraArgs,
            fallback: preferences.cpu
        };
    } else if (gpu === 'amd' && gpuInfo.amd && preferences.amd) {
        // Enhanced AMD encoding for RX580
        return {
            video: 'h264_amf',
            preset: 'quality',
            extraArgs: [
                '-usage', 'transcoding',
                '-quality', 'quality',
                '-rc', 'cqp',
                '-qp_i', '23',
                '-qp_p', '25',
                '-profile:v', 'high',
                '-level', '4.1'
            ],
            fallback: {
                video: 'libx264',
                preset: 'medium',
                extraArgs: ['-threads', '0', '-crf', '23', '-preset', 'medium']
            }
        };
    } else {
        // Software encoding fallback
        return {
            video: preferences.cpu.encoder,
            preset: preferences.cpu.preset,
            extraArgs: preferences.cpu.extraArgs
        };
    }
}

// Start transcoding stream
async function startTranscoding(channelId, profile = 'passthrough', gpu = 'auto') {
    console.log('Starting transcoding for channel:', channelId, 'profile:', profile, 'gpu:', gpu);
    
    // Find channel by ID (now using channel numbers as IDs)
    const channel = channels.find(c => c.id == channelId);
    if (!channel) {
        throw new Error(`Channel not found with ID: ${channelId}`);
    }
    
    console.log(`Found channel: ${channel.name} (Number: ${channel.channelNumber})`);
    
    // Stop existing stream if running
    if (activeStreams.has(channelId)) {
        stopTranscoding(channelId);
    }
    
    // Determine GPU to use
    let selectedGPU = gpu;
    if (gpu === 'auto') {
        selectedGPU = gpuInfo.nvidia ? 'nvidia' : (gpuInfo.amd ? 'amd' : 'cpu');
    }
    
    const profileConfig = config.transcoding.profiles[profile];
    if (!profileConfig) {
        throw new Error(`Profile not found: ${profile}`);
    }
    
    // Check if using passthrough profile FIRST (no FFmpeg, no directories)
    if (profileConfig.passthrough) {
        console.log('Using passthrough mode - direct stream');
        
        // Use channelNumberUrl if available
        let passthroughUrl = channel.channelNumberUrl || channel.url;
        console.log(`Passthrough URL: ${passthroughUrl}`);
        
        // Update channel status
        const channelIndex = channels.findIndex(c => c.id == channelId);
        if (channelIndex !== -1) {
            channels[channelIndex].isActive = true;
            channels[channelIndex].transcoding = false;
            channels[channelIndex].passthrough = true;
            channels[channelIndex].profile = profile;
            channels[channelIndex].gpu = selectedGPU;
        }
        
        // Store passthrough stream info (no FFmpeg process)
        activeStreams.set(channelId, {
            process: null, // No FFmpeg for passthrough
            profile,
            gpu: selectedGPU,
            startTime: Date.now(),
            outputPath: null, // No output files for passthrough
            passthrough: true,
            originalUrl: passthroughUrl,
            channelNumber: channel.channelNumber
        });
        
        io.emit('streamStarted', { channelId, profile, gpu: selectedGPU, passthrough: true });
        io.emit('channelsUpdated', channels);
        
        // Save state after starting
        saveActiveStreamsToFile();
        return {
            channelId,
            streamUrl: passthroughUrl,
            channelNumber: channel.channelNumber,
            profile,
            gpu: selectedGPU,
            passthrough: true
        };
    }
    
    // TRANSCODING MODE - create output directory and FFmpeg process
    const outputDir = path.join(config.streaming.outputDir, channelId.toString());
    await fs.ensureDir(outputDir);
    
    // Use channelNumberUrl if available, otherwise use original URL
    const inputUrl = channel.channelNumberUrl || channel.url;
    console.log(`Transcoding input URL: ${inputUrl}`);
    
    // Get appropriate encoder based on profile and GPU - DECLARE PROPERLY
    const encoder = getFFmpegEncoder(selectedGPU, profileConfig.codec);
    
    // Build FFmpeg command for transcoding
    const ffmpegArgs = [
        // Pre-input options for hardware acceleration
        '-hwaccel', 'auto',
        '-probesize', '10000000',
        '-analyzeduration', '10000000',
        
        // Input
        '-i', inputUrl,
        
        // Video encoding
        '-c:v', encoder.video,
        ...encoder.extraArgs, // Add extra arguments for encoder
        '-b:v', profileConfig.bitrate,
        '-s', `${profileConfig.width}x${profileConfig.height}`,
        '-r', profileConfig.fps || 25,
        
        // Audio
        '-c:a', 'aac',
        '-b:a', profileConfig.audioBitrate || '128k',
        
        // Output format and HLS settings
        '-f', 'hls',
        '-hls_time', config.streaming.hlsSegmentTime,
        '-hls_list_size', config.streaming.hlsListSize,
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        path.join(outputDir, 'playlist.m3u8')
    ];
    
    console.log('Starting FFmpeg with args:', ffmpegArgs);
    console.log(`Using encoder: ${encoder.video} (GPU: ${selectedGPU})`);
    
    let ffmpeg = spawn('ffmpeg', ffmpegArgs);
    let usingFallback = false;
    
    // Handle FFmpeg events
    ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Check for various encoder errors that require fallback
        const needsFallback = (
            (output.includes('h264_amf') && (output.includes('not found') || output.includes('Failed to initialize'))) ||
            (output.includes('hevc_amf') && (output.includes('not found') || output.includes('Failed to initialize'))) ||
            (output.includes('Unknown encoder') && (output.includes('amf') || output.includes('nvenc'))) ||
            output.includes('No such filter')
        );
        
        if (needsFallback && encoder.fallback && !usingFallback) {
            console.warn(`GPU encoder failed (${encoder.video}), falling back to software encoding (${encoder.fallback.video})`);
            
            ffmpeg.kill('SIGTERM');
            usingFallback = true;
            
            // Rebuild with fallback encoder
            const fallbackArgs = [
                '-hwaccel', 'auto',
                '-probesize', '10000000',
                '-analyzeduration', '10000000',
                '-i', inputUrl,
                '-c:v', encoder.fallback.video,
                ...encoder.fallback.extraArgs,
                '-s', `${profileConfig.width}x${profileConfig.height}`,
                '-r', profileConfig.fps || 25,
                '-b:v', profileConfig.bitrate,
                '-c:a', 'aac',
                '-b:a', profileConfig.audioBitrate || '128k',
                '-f', 'hls',
                '-hls_time', config.streaming.hlsSegmentTime,
                '-hls_list_size', config.streaming.hlsListSize,
                '-hls_flags', 'delete_segments',
                '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
                path.join(outputDir, 'playlist.m3u8')
            ];
            
            console.log('Restarting with fallback encoder:', fallbackArgs);
            ffmpeg = spawn('ffmpeg', fallbackArgs);
            attachEventListeners();
            return;
        }
        
        // Emit progress updates
        if (output.includes('frame=')) {
            io.emit('transcodingProgress', {
                channelId,
                status: 'running',
                output: output,
                encoder: usingFallback ? encoder.fallback.video : encoder.video
            });
        }
    });
    
    function attachEventListeners() {
        ffmpeg.stdout.on('data', (data) => {
            console.log(`FFmpeg stdout [${channelId}]:`, data.toString());
        });
        
        ffmpeg.on('close', (code) => {
            console.log(`FFmpeg process [${channelId}] exited with code ${code}`);
            activeStreams.delete(channelId);
            streamStats.delete(channelId);
            
            // Update channel status
            const channelIndex = channels.findIndex(c => c.id == channelId);
            if (channelIndex !== -1) {
                channels[channelIndex].isActive = false;
                channels[channelIndex].transcoding = false;
                channels[channelIndex].passthrough = false;
                channels[channelIndex].bandwidth = 0;
            }
            
            io.emit('streamStopped', { channelId, code });
            io.emit('channelsUpdated', channels);
        });
        
        ffmpeg.on('error', (error) => {
            console.error(`FFmpeg error [${channelId}]:`, error);
            io.emit('transcodingError', { channelId, error: error.message });
        });
    }
    
    // Attach initial event listeners
    attachEventListeners();
    
    // Store stream info
    activeStreams.set(channelId, {
        process: ffmpeg,
        profile,
        gpu: selectedGPU,
        startTime: Date.now(),
        outputPath: path.join(outputDir, 'playlist.m3u8'),
        passthrough: false,
        channelNumber: channel.channelNumber
    });
    
    // Initialize bandwidth monitoring
    streamStats.set(channelId, {
        bandwidth: 0,
        totalData: 0,
        lastCheck: Date.now(),
        lastBytes: 0
    });
    
    // Update channel status
    const channelIndex = channels.findIndex(c => c.id == channelId);
    if (channelIndex !== -1) {
        channels[channelIndex].isActive = true;
        channels[channelIndex].transcoding = true;
        channels[channelIndex].passthrough = false;
        channels[channelIndex].profile = profile;
        channels[channelIndex].gpu = selectedGPU;
    }
    
    io.emit('streamStarted', { channelId, profile, gpu: selectedGPU, passthrough: false });
    io.emit('channelsUpdated', channels);
    
    // Save state after starting
    saveActiveStreamsToFile();
    return {
        channelId,
        streamUrl: `/stream/${channelId}/playlist.m3u8`,
        channelNumber: channel.channelNumber,
        profile,
        gpu: selectedGPU,
        passthrough: false
    };
}

// Stop transcoding stream
function stopTranscoding(channelId) {
    const stream = activeStreams.get(channelId);
    if (stream) {
        // Only kill FFmpeg process if it exists (not for passthrough)
        if (stream.process) {
            stream.process.kill('SIGTERM');
        }
        
        activeStreams.delete(channelId);
        streamStats.delete(channelId); // Remove bandwidth stats
        
        // Update channel status
        const channelIndex = channels.findIndex(c => c.id == channelId);
        if (channelIndex !== -1) {
            channels[channelIndex].isActive = false;
            channels[channelIndex].transcoding = false;
            channels[channelIndex].passthrough = false;
            channels[channelIndex].bandwidth = 0;
            channels[channelIndex].totalData = 0;
        }
        
        io.emit('streamStopped', { channelId });
        io.emit('channelsUpdated', channels);
        
        // Save state after stopping
        saveActiveStreamsToFile();
        return true;
    }
    return false;
}

// Start UDP streaming
async function startUdpStream(channelId, profile = 'passthrough', gpu = 'auto', udpOptions = {}) {
    console.log('Starting UDP stream for channel:', channelId);
    
    const channel = channels.find(c => c.id == channelId);
    if (!channel) throw new Error('Channel not found');
    
    // Stop existing UDP stream if running
    if (activeUdpStreams.has(channelId)) {
        stopUdpStream(channelId);
    }
    
    // Setup UDP destination options
    const udpConfig = config.streaming.udp;
    const udpIp = udpOptions.ip || udpConfig.defaultIp;
    let udpPort = udpOptions.port || udpConfig.defaultPort;
    
    // Auto-increment port if starting multiple streams
    // Check if this port is already in use by another stream
    let portInUse = false;
    for (const [existingChannelId, existingStream] of activeUdpStreams) {
        if (existingChannelId !== channelId && existingStream.udpUrl && existingStream.udpUrl.includes(`:${udpPort}`)) {
            portInUse = true;
            break;
        }
    }
    
    // If port is in use, find next available port
    while (portInUse) {
        udpPort++;
        portInUse = false;
        for (const [existingChannelId, existingStream] of activeUdpStreams) {
            if (existingChannelId !== channelId && existingStream.udpUrl && existingStream.udpUrl.includes(`:${udpPort}`)) {
                portInUse = true;
                break;
            }
        }
    }
    
    console.log(`Using UDP port ${udpPort} for channel ${channelId}`);
    
    // Generate UDP URLs with @ prefix for multicast
    const udpOutputUrl = `udp://@${udpIp}:${udpPort}?pkt_size=${udpConfig.mtu}&ttl=${udpConfig.ttl}`;
    const simpleUdpUrl = `udp://@${udpIp}:${udpPort}/1`;
    
    // Determine GPU to use
    let selectedGPU = gpu;
    if (gpu === 'auto') {
        selectedGPU = gpuInfo.nvidia ? 'nvidia' : (gpuInfo.amd ? 'amd' : 'cpu');
    }
    
    const profileConfig = config.transcoding.profiles[profile];
    
    // Use channelNumberUrl if available for input
    const inputUrl = channel.channelNumberUrl || channel.url;
    
    // Build FFmpeg command
    let ffmpegArgs = [
        '-hwaccel', 'auto',
        '-probesize', '10000000',
        '-analyzeduration', '10000000',
        '-i', inputUrl,
    ];
    
    // If using passthrough profile, don't transcode
    if (profileConfig.passthrough) {
        ffmpegArgs = ffmpegArgs.concat([
            '-map', '0:v',
            '-map', '0:a:0',
            '-c', 'copy',
            '-f', 'mpegts',
            udpOutputUrl
        ]);
    } else {
        // Get encoder for transcoding
        const encoder = getFFmpegEncoder(selectedGPU);
        
        ffmpegArgs = ffmpegArgs.concat([
            '-c:v', encoder.video,
            '-preset', encoder.preset,
            ...encoder.extraArgs,
            '-s', `${profileConfig.width}x${profileConfig.height}`,
            '-b:v', profileConfig.bitrate,
            '-c:a', 'aac',
            '-b:a', profileConfig.audioBitrate || '128k',
            '-f', 'mpegts',
            udpOutputUrl
        ]);
    }
    
    console.log('Starting UDP FFmpeg with args:', ffmpegArgs);
    console.log(`UDP output: ${udpOutputUrl}`);
    
    let ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    // Add timeout to detect if FFmpeg fails to start properly
    let startupTimeout = setTimeout(() => {
        if (ffmpeg && !ffmpeg.killed) {
            console.error(`UDP stream startup timeout for channel ${channelId}`);
            ffmpeg.kill('SIGTERM');
        }
    }, 10000); // 10 seconds timeout
    
    // Handle FFmpeg events
    ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        console.log(`UDP FFmpeg stderr [${channelId}]:`, output);
        
        // Clear startup timeout on first output (indicates FFmpeg is running)
        if (startupTimeout) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
        }
        
        // Check for critical errors that should restart the stream
        if (output.includes('Connection refused') || 
            output.includes('Network is unreachable') ||
            output.includes('No route to host')) {
            console.error(`UDP stream network error for channel ${channelId}, will retry`);
        }
    });
    
    ffmpeg.on('close', (code) => {
        console.log(`UDP stream closed with code ${code} for channel ${channelId}`);
        if (startupTimeout) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
        }
        handleUdpStreamClose(code, channelId);
    });
    
    ffmpeg.on('error', (error) => {
        console.error(`UDP FFmpeg error [${channelId}]:`, error);
        if (startupTimeout) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
        }
    });
    
    // Store UDP stream
    activeUdpStreams.set(channelId, {
        process: ffmpeg,
        channelId: channelId,
        profile: profile,
        gpu: selectedGPU,
        udpUrl: udpOutputUrl,
        simpleUdpUrl: simpleUdpUrl,
        startTime: Date.now(),
        channelNumber: channel.channelNumber
    });
    
    // Update channel status
    const channelIndex = channels.findIndex(c => c.id == channelId);
    if (channelIndex !== -1) {
        channels[channelIndex].isActive = true;
        channels[channelIndex].udpStreaming = true;
        channels[channelIndex].udpUrl = udpOutputUrl;
        channels[channelIndex].simpleUdpUrl = simpleUdpUrl;
    }
    
    // Notify clients
    io.emit('udpStreamStarted', { 
        channelId,
        channelNumber: channel.channelNumber,
        profile: profile,
        gpu: selectedGPU,
        udpUrl: udpOutputUrl,
        simpleUdpUrl: simpleUdpUrl
    });
    io.emit('channelsUpdated', channels);
    
    // Save state after starting
    saveActiveStreamsToFile();
    return {
        success: true,
        channelId,
        channelNumber: channel.channelNumber,
        profile: profile,
        gpu: selectedGPU,
        udpUrl: udpOutputUrl,
        simpleUdpUrl: simpleUdpUrl
    };
}

// Handle UDP stream close event
function handleUdpStreamClose(code, channelId) {
    console.log(`UDP stream closed with code ${code} for channel ${channelId}`);
    
    // Update channel status
    const channelIndex = channels.findIndex(c => c.id == channelId);
    if (channelIndex !== -1) {
        channels[channelIndex].udpStreaming = false;
        channels[channelIndex].udpUrl = null;
        channels[channelIndex].simpleUdpUrl = null;
        
        // Check if channel is still active with transcoding
        if (!channels[channelIndex].transcoding) {
            channels[channelIndex].isActive = false;
        }
    }
    
    // Remove stream from active streams
    activeUdpStreams.delete(channelId);
    
    // Notify clients
    io.emit('udpStreamStopped', { channelId });
    io.emit('channelsUpdated', channels);
}

// Stop UDP stream
function stopUdpStream(channelId) {
    const stream = activeUdpStreams.get(channelId);
    if (stream) {
        stream.process.kill('SIGTERM');
        activeUdpStreams.delete(channelId);
        
        // Update channel status
        const channelIndex = channels.findIndex(c => c.id == channelId);
        if (channelIndex !== -1) {
            channels[channelIndex].udpStreaming = false;
            channels[channelIndex].udpUrl = null;
            channels[channelIndex].simpleUdpUrl = null;
            
            // Check if channel is still active with transcoding
            if (!channels[channelIndex].transcoding) {
                channels[channelIndex].isActive = false;
            }
        }
        
        io.emit('udpStreamStopped', { channelId });
        io.emit('channelsUpdated', channels);
        
        // Save state after stopping
        saveActiveStreamsToFile();
        return true;
    }
    return false;
}

// Monitor bandwidth usage
function monitorBandwidth() {
    for (const [channelId, stream] of activeStreams) {
        try {
            const channelIndex = channels.findIndex(c => c.id == channelId);
            if (channelIndex === -1) continue;
            
            // For passthrough streams, simulate bandwidth based on stream activity
            if (stream.passthrough || !stream.outputPath) {
                // Simulate realistic bandwidth for passthrough streams (5-15 MB/s)
                const simulatedBandwidth = 8 + Math.random() * 7; // 8-15 MB/s
                channels[channelIndex].bandwidth = simulatedBandwidth;
                channels[channelIndex].totalData = ((Date.now() - stream.startTime) / 1000) * simulatedBandwidth / 60; // Total MB
                continue;
            }
            
            const outputDir = path.dirname(stream.outputPath);
            const stats = streamStats.get(channelId);
            
            if (stats && fs.existsSync(outputDir)) {
                // Calculate directory size
                let totalBytes = 0;
                const files = fs.readdirSync(outputDir);
                
                for (const file of files) {
                    const filePath = path.join(outputDir, file);
                    try {
                        if (fs.existsSync(filePath)) {
                            const fileStat = fs.statSync(filePath);
                            if (fileStat.isFile()) {
                                totalBytes += fileStat.size;
                            }
                        }
                    } catch (fileError) {
                        // Skip files that can't be read
                        continue;
                    }
                }
                
                const now = Date.now();
                const timeDiff = (now - stats.lastCheck) / 1000; // seconds
                const bytesDiff = totalBytes - stats.lastBytes;
                
                if (timeDiff > 0 && bytesDiff >= 0) {
                    // Calculate bandwidth in MB/s
                    const bandwidth = (bytesDiff / (1024 * 1024)) / timeDiff;
                    
                    stats.bandwidth = Math.max(0, bandwidth);
                    stats.totalData = totalBytes / (1024 * 1024); // MB
                    stats.lastCheck = now;
                    stats.lastBytes = totalBytes;
                    
                    // Update channel info
                    channels[channelIndex].bandwidth = stats.bandwidth;
                    channels[channelIndex].totalData = stats.totalData;
                    
                    console.log(`Channel ${channelId} bandwidth: ${stats.bandwidth.toFixed(2)} MB/s, total: ${stats.totalData.toFixed(2)} MB`);
                }
            }
        } catch (error) {
            console.error(`Bandwidth monitoring error for channel ${channelId}:`, error);
        }
    }
    
    // Emit updated channel data
    io.emit('channelsUpdated', channels);
}

// Start bandwidth monitoring
setInterval(monitorBandwidth, 2000); // Every 2 seconds

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/channels', (req, res) => {
    res.json(channels);
});

app.get('/api/gpu-info', (req, res) => {
    res.json(gpuInfo);
});

app.get('/api/profiles', (req, res) => {
    res.json({
        profiles: config.transcoding.profiles,
        gpuPreferences: config.transcoding.gpuPreferences,
        availableGPUs: {
            nvidia: {
                name: 'NVIDIA GPU',
                available: gpuInfo.nvidia
            },
            amd: {
                name: 'AMD GPU', 
                available: gpuInfo.amd
            },
            intel: {
                name: 'Intel GPU',
                available: gpuInfo.intel || false
            },
            auto: {
                name: 'Auto (Best Available)',
                available: true
            }
        }
    });
});

// Create new profile  
app.post('/api/profiles', (req, res) => {
    try {
        const profileData = req.body;
        
        if (!profileData.name) {
            return res.status(400).json({ error: 'Profile name is required' });
        }
        
        if (config.transcoding.profiles[profileData.name]) {
            return res.status(409).json({ error: 'Profile already exists' });
        }
        
        // Create new profile
        config.transcoding.profiles[profileData.name] = {
            width: parseInt(profileData.width),
            height: parseInt(profileData.height),
            bitrate: profileData.bitrate,
            audioBitrate: profileData.audioBitrate || '128k',
            fps: parseInt(profileData.fps) || 25,
            codec: profileData.codec || 'h264',
            passthrough: profileData.passthrough || false
        };
        
        // If it's passthrough, only keep necessary fields
        if (profileData.passthrough) {
            config.transcoding.profiles[profileData.name] = {
                description: 'Direct passthrough without transcoding',
                passthrough: true
            };
        }
        
        res.json({ 
            success: true, 
            message: `Profile "${profileData.name}" created successfully`,
            profile: config.transcoding.profiles[profileData.name]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single profile
app.get('/api/profiles/:profileName', (req, res) => {
    try {
        const { profileName } = req.params;
        const profile = config.transcoding.profiles[profileName];
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json({
            name: profileName,
            gpu: 'amd', // Default GPU
            width: profile.width || 1280,
            height: profile.height || 720,
            bitrate: profile.bitrate || '1500k',
            codec: profile.codec || 'h264',
            preset: 'medium', // Default preset
            customArgs: '',
            passthrough: profile.passthrough || false,
            ...profile
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update profile
app.put('/api/profiles/:profileName', (req, res) => {
    try {
        const { profileName } = req.params;
        const profileData = req.body;
        
        if (!config.transcoding.profiles[profileName]) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        // Update the profile in config
        config.transcoding.profiles[profileName] = {
            width: parseInt(profileData.width),
            height: parseInt(profileData.height),
            bitrate: profileData.bitrate,
            audioBitrate: profileData.audioBitrate || '128k',
            fps: parseInt(profileData.fps) || 25,
            codec: profileData.codec || 'h264',
            passthrough: profileData.passthrough || false
        };
        
        // If it's passthrough, only keep necessary fields
        if (profileData.passthrough) {
            config.transcoding.profiles[profileName] = {
                description: 'Direct passthrough without transcoding',
                passthrough: true
            };
        }
        
        res.json({ 
            success: true, 
            message: `Profile "${profileName}" updated successfully`,
            profile: config.transcoding.profiles[profileName]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete profile
app.delete('/api/profiles/:profileName', (req, res) => {
    try {
        const { profileName } = req.params;
        
        if (!config.transcoding.profiles[profileName]) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        if (['passthrough', 'low', 'medium', 'high'].includes(profileName)) {
            return res.status(400).json({ error: 'Cannot delete default profiles' });
        }
        
        delete config.transcoding.profiles[profileName];
        
        res.json({ 
            success: true, 
            message: `Profile "${profileName}" deleted successfully`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/settings', (req, res) => {
    res.json({
        server: {
            port: config.server.port
        },
        streaming: {
            port: config.streaming.port,
            outputDir: config.streaming.outputDir,
            hlsSegmentTime: config.streaming.hlsSegmentTime,
            hlsListSize: config.streaming.hlsListSize
        },
        tvheadend: {
            url: config.tvheadend.url,
            host: config.tvheadend.host,
            port: config.tvheadend.port
        }
    });
});

app.post('/api/settings', (req, res) => {
    try {
        // For now, just return success since we're not persisting config changes
        // In a full implementation, you'd update the config file
        res.json({ 
            success: true, 
            message: 'Settings received (note: changes require restart to take effect)'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/system-info', async (req, res) => {
    try {
        const systemInfo = await detectSystemInfo();
        res.json(systemInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check VLC installation
app.get('/api/check-vlc', async (req, res) => {
    try {
        const result = await new Promise((resolve) => {
            exec('which vlc || command -v vlc', (error, stdout) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });
        
        res.json({ installed: result });
    } catch (error) {
        console.error('Error checking VLC:', error);
        res.json({ installed: false, error: error.message });
    }
});

// TVHeadend status endpoint
app.get('/api/tvheadend-status', (req, res) => {
    res.json(tvheadendStatus);
});

// Check TVHeadend connection endpoint
app.post('/api/check-tvheadend', async (req, res) => {
    try {
        const isConnected = await checkTVHeadendConnection();
        res.json({ 
            connected: isConnected, 
            status: tvheadendStatus 
        });
    } catch (error) {
        res.status(500).json({ 
            connected: false, 
            error: error.message,
            status: tvheadendStatus 
        });
    }
});

// FFmpeg status and installation endpoints
app.get('/api/check-ffmpeg', async (req, res) => {
    try {
        const isInstalled = await checkFFmpegInstallation();
        res.json({ 
            installed: isInstalled,
            message: isInstalled ? 'FFmpeg is available' : 'FFmpeg not found'
        });
    } catch (error) {
        res.status(500).json({ 
            installed: false, 
            error: error.message 
        });
    }
});

app.post('/api/install-ffmpeg', async (req, res) => {
    try {
        // First check if already installed
        const alreadyInstalled = await checkFFmpegInstallation();
        if (alreadyInstalled) {
            return res.json({ 
                success: true, 
                message: 'FFmpeg is already installed',
                alreadyInstalled: true 
            });
        }
        
        // Attempt auto-installation
        const installSuccess = await autoInstallFFmpeg();
        
        if (installSuccess) {
            res.json({ 
                success: true, 
                message: 'FFmpeg installed successfully' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'FFmpeg installation failed. Please install manually.',
                installScript: 'You can run: chmod +x install.sh && ./install.sh'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/api/refresh-playlist', async (req, res) => {
    try {
        await fetchPlaylist();
        res.json({ success: true, count: channels.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/start-stream/:channelId', async (req, res) => {
    try {
        const { channelId } = req.params;
        const { profile = 'medium', gpu = 'auto' } = req.body;
        
        // Keep channelId as string to support both numeric and string IDs
        const result = await startTranscoding(channelId, profile, gpu);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-stream/:channelId', (req, res) => {
    try {
        const { channelId } = req.params;
        const result = stopTranscoding(channelId);
        
        if (result) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Stream not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/start-all-streams', async (req, res) => {
    try {
        const { profile = 'medium', gpu = 'auto' } = req.body;
        const results = [];
        
        for (const channel of channels) {
            try {
                const result = await startTranscoding(channel.id, profile, gpu);
                results.push({ channelId: channel.id, success: true, result });
            } catch (error) {
                results.push({ channelId: channel.id, success: false, error: error.message });
            }
        }
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-all-streams', (req, res) => {
    try {
        const results = [];
        
        for (const [channelId] of activeStreams) {
            const result = stopTranscoding(channelId);
            results.push({ channelId, success: result });
        }
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UDP streaming endpoints
app.post('/api/start-udp/:channelId', async (req, res) => {
    try {
        const { channelId } = req.params;
        const { profile = 'passthrough', gpu = 'auto', ip, port } = req.body;
        
        const udpOptions = {
            ip: ip || config.streaming.udp.defaultIp,
            port: port || config.streaming.udp.defaultPort
        };
        
        const result = await startUdpStream(channelId, profile, gpu, udpOptions);
        res.json(result);
    } catch (error) {
        console.error('Error starting UDP stream:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-udp/:channelId', (req, res) => {
    try {
        const { channelId } = req.params;
        const result = stopUdpStream(channelId);
        
        if (result) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'UDP stream not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/start-all-udp', async (req, res) => {
    try {
        const { profile = 'passthrough', gpu = 'auto', ip, port } = req.body;
        const results = [];
        
        const udpOptions = {
            ip: ip || config.streaming.udp.defaultIp,
            port: port || config.streaming.udp.defaultPort
        };
        
        // If port specified, increment for each channel
        let currentPort = udpOptions.port;
        
        for (const channel of channels) {
            try {
                // Assign unique port for each channel if starting all
                const channelUdpOptions = { 
                    ip: udpOptions.ip,
                    port: currentPort++
                };
                
                const result = await startUdpStream(channel.id, profile, gpu, channelUdpOptions);
                results.push({ 
                    channelId: channel.id, 
                    success: true, 
                    udpUrl: result.udpUrl 
                });
            } catch (error) {
                results.push({ channelId: channel.id, success: false, error: error.message });
            }
        }
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-all-udp', (req, res) => {
    try {
        const results = [];
        
        for (const [channelId] of activeUdpStreams) {
            const result = stopUdpStream(channelId);
            results.push({ channelId, success: result });
        }
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/add-demo-channel', (req, res) => {
    try {
        // Generate a unique demo channel
        const demoChannelNames = ['Big Buck Bunny', 'Sintel', 'Elephants Dream', 'Tears of Steel'];
        const demoUrls = [
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
        ];
        
        const randomIndex = Math.floor(Math.random() * demoChannelNames.length);
        const name = demoChannelNames[randomIndex];
        const url = demoUrls[randomIndex];
        
        const demoChannel = {
            id: Date.now() + Math.random(),
            name: `${name} (Demo)`,
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
            url: url,
            group: 'Demo Videos',
            isActive: false,
            transcoding: false,
            udpStreaming: false,
            udpUrl: null,
            simpleUdpUrl: null,
            profile: 'passthrough',
            bandwidth: 0,
            totalData: 0
        };
        
        channels.push(demoChannel);
        
        // Notify clients about updated channel list
        io.emit('channelsUpdated', channels);
        
        res.json({ success: true, channel: demoChannel });
    } catch (error) {
        console.error('Error adding demo channel:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/active-udp-streams', (req, res) => {
    const streams = Array.from(activeUdpStreams.entries()).map(([channelId, stream]) => ({
        channelId,
        profile: stream.profile,
        gpu: stream.gpu,
        udpUrl: stream.udpUrl,
        startTime: stream.startTime,
        uptime: Date.now() - stream.startTime
    }));
    
    res.json(streams);
});

app.get('/api/config', (req, res) => {
    res.json({
        streaming: {
            port: config.streaming.port
        },
        transcoding: {
            profiles: Object.keys(config.transcoding.profiles)
        }
    });
});

app.post('/api/open-vlc', (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        // Check if VLC is installed
        exec('which vlc', (error) => {
            if (error) {
                return res.status(400).json({ 
                    error: 'VLC not installed',
                    message: 'Please install VLC media player first: sudo apt install vlc'
                });
            }
            
            // Launch VLC with the URL - ensure GUI is shown
            // Remove --intf dummy to show VLC interface
            const vlcCommand = `DISPLAY=:0 vlc "${url}" >/dev/null 2>&1 &`;
            
            console.log(`Launching VLC with command: ${vlcCommand}`);
            
            exec(vlcCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('VLC launch error:', error);
                    return res.status(500).json({ 
                        error: 'Failed to launch VLC',
                        details: error.message 
                    });
                }
                
                console.log(`VLC pokrennut za URL: ${url}`);
                res.json({ 
                    success: true, 
                    message: `VLC launched successfully for ${url}`,
                    url: url
                });
            });
        });
        
    } catch (error) {
        console.error('Open VLC error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/kernel/check', (req, res) => {
    exec('uname -r', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: 'Failed to get kernel version' });
        }
        res.json({ 
            current: stdout.trim(),
            success: true 
        });
    });
});

app.get('/api/kernel/available', (req, res) => {
    // Get available kernels from apt
    exec('apt list --installed | grep linux-image | head -10', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: 'Failed to get available kernels' });
        }
        
        const kernels = stdout.split('\n')
            .filter(line => line.includes('linux-image'))
            .map(line => {
                const match = line.match(/linux-image-([^\s\/]+)/);
                return match ? match[1] : null;
            })
            .filter(Boolean)
            .slice(0, 10);
            
        res.json({ 
            kernels,
            success: true 
        });
    });
});

app.get('/api/kernel/check', (req, res) => {
    exec('uname -r', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: 'Failed to check kernel' });
        }
        
        const currentKernel = stdout.trim();
        
        // Also get available kernels
        exec('apt list --installed | grep linux-image | head -10', (error2, stdout2, stderr2) => {
            const kernels = error2 ? [] : stdout2.split('\n')
                .filter(line => line.includes('linux-image'))
                .map(line => {
                    const match = line.match(/linux-image-([^\s\/]+)/);
                    return match ? match[1] : null;
                })
                .filter(Boolean)
                .slice(0, 10);
                
            res.json({
                currentKernel,
                availableKernels: kernels,
                success: true
            });
        });
    });
});

// Export active streams in simple format
app.get('/api/export-active-streams', (req, res) => {
    try {
        let exportText = '';
        
        for (const channel of channels) {
            if (channel.isActive) {
                exportText += `"${channel.name}"\n`;
                
                // Add HLS/Direct stream URL
                if (channel.passthrough) {
                    exportText += `${channel.url}\n`;
                } else {
                    exportText += `http://192.168.100.3:${config.streaming.port}/streams/${channel.channelNumber || channel.id}/playlist.m3u8\n`;
                }
                
                // Add UDP stream URL if available
                if (channel.udpStreaming && channel.simpleUdpUrl) {
                    exportText += `${channel.simpleUdpUrl}\n`;
                }
                
                exportText += '\n';
            }
        }
        
        if (exportText === '') {
            exportText = 'No active streams found.\n';
        }
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename="active-streams.txt"');
        res.send(exportText);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update system from GitHub
app.post('/api/update-system', async (req, res) => {
    try {
        const updateStartTime = Date.now();
        log.info('System update requested via API');
        
        // Make update.sh executable first to avoid permission issues
        try {
            fs.chmodSync(path.join(__dirname, 'update.sh'), 0o755);
            log.info('Made update.sh executable');
        } catch (err) {
            log.error(`Error setting update.sh permissions: ${err.message}`);
            return res.status(500).json({
                success: false,
                error: 'Could not set executable permissions on update script',
                details: err.message
            });
        }
        
        // Set a timeout for the update process (15 minutes)
        const updateTimeout = 15 * 60 * 1000;
        let updateTimedOut = false;
        
        const updateProcess = spawn('bash', ['./update.sh'], {
            cwd: __dirname,
            stdio: 'pipe',
            env: {...process.env, FORCE_COLOR: '1'} // Preserve colors in output
        });
        
        // Set up timeout handler
        const timeoutId = setTimeout(() => {
            updateTimedOut = true;
            try {
                // Try to kill the update process if it's still running
                updateProcess.kill('SIGTERM');
                log.error('Update process timed out after 15 minutes');
            } catch (err) {
                log.error(`Error terminating update process: ${err.message}`);
            }
        }, updateTimeout);
        
        let stdoutData = '';
        let stderrData = '';
        
        updateProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            log.info(`Update stdout: ${output.trim()}`);
        });
        
        updateProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderrData += output;
            log.error(`Update stderr: ${output.trim()}`);
        });
        
        updateProcess.on('error', (err) => {
            clearTimeout(timeoutId);
            log.error(`Error spawning update process: ${err.message}`);
            res.status(500).json({
                success: false,
                error: `Failed to start update process: ${err.message}`
            });
        });
        
        updateProcess.on('close', (code) => {
            clearTimeout(timeoutId);
            const updateDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2);
            
            if (updateTimedOut) {
                log.error(`Update process timed out after ${updateDuration} seconds`);
                return res.status(500).json({
                    success: false,
                    error: 'Update process timed out after 15 minutes',
                    stdout: stdoutData,
                    stderr: stderrData
                });
            }
            
            if (code === 0) {
                log.info(`Update completed successfully in ${updateDuration} seconds`);
                res.json({ 
                    success: true, 
                    message: 'System updated successfully',
                    duration: `${updateDuration} seconds`,
                    output: stdoutData
                });
                
                // Restart check - this could be used for auto-restart if needed
                const needsRestart = stdoutData.includes('Application restart required');
                if (needsRestart) {
                    log.info('Update indicates application needs restart - will be handled by systemd');
                }
            } else {
                log.error(`Update failed with code ${code} after ${updateDuration} seconds`);
                res.status(500).json({ 
                    success: false, 
                    error: `Update failed with code ${code}`,
                    duration: `${updateDuration} seconds`,
                    output: stdoutData,
                    errorOutput: stderrData
                });
            }
        });
    } catch (error) {
        log.error(`Error in update system endpoint: ${error.message}`);
        console.error('Error updating system:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// AMD GPU auto-install endpoint
app.post('/api/install-amd-gpu', async (req, res) => {
    try {
        log.info('AMD GPU auto-install requested');
        
        // First check if AMD GPU is detected
        const amdGpuDetected = await new Promise((resolve) => {
            exec('lspci | grep -i -E "(amd|radeon)" | grep -i vga', (error, stdout) => {
                if (!error && stdout.trim()) {
                    log.info(`AMD GPU detected: ${stdout.trim()}`);
                    resolve(true);
                } else {
                    log.warn('No AMD GPU detected');
                    resolve(false);
                }
            });
        });
        
        if (!amdGpuDetected) {
            return res.status(400).json({
                success: false,
                error: 'No AMD GPU detected on this system'
            });
        }
        
        // Create AMD-specific install script
        const amdInstallScript = `#!/bin/bash
set -e

echo "Installing AMD GPU support..."

# Colors for output
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
NC='\\033[0m' # No Color

log() {
    echo -e "\${GREEN}[INFO]\${NC} $1"
}

warn() {
    echo -e "\${YELLOW}[WARN]\${NC} $1"
}

error() {
    echo -e "\${RED}[ERROR]\${NC} $1"
}

# Detect AMD GPU
GPU_INFO=$(lspci | grep -i -E "(amd|radeon)" | grep -i vga)
log "Detected GPU: $GPU_INFO"

# Install basic Mesa drivers and VAAPI support (works for all AMD GPUs)
log "Installing Mesa drivers and VAAPI support..."
sudo apt update
sudo apt install -y \\
    mesa-va-drivers \\
    mesa-vdpau-drivers \\
    libva-dev \\
    vainfo \\
    radeontop \\
    mesa-opencl-icd \\
    clinfo \\
    mesa-vulkan-drivers \\
    opencl-headers

# Check if this is a newer GPU that supports ROCm
if echo "$GPU_INFO" | grep -i -E "(vega|navi|rdna|rx 6|rx 7)" &> /dev/null; then
    log "Modern AMD GPU detected, installing ROCm support..."
    VERSION_ID=$(grep VERSION_ID /etc/os-release | cut -d'"' -f2)
    if [[ "$VERSION_ID" == "20.04" ]] || [[ "$VERSION_ID" == "22.04" ]]; then
        curl -fsSL https://repo.radeon.com/rocm/rocm.gpg.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/rocm.gpg
        echo "deb [arch=amd64] https://repo.radeon.com/rocm/apt/$VERSION_ID jammy main" | sudo tee /etc/apt/sources.list.d/rocm.list
        sudo apt update
        sudo apt install -y rocm-dev rocm-libs hip-runtime-amd || {
            warn "ROCm installation failed, continuing with Mesa drivers only"
        }
    fi
else
    log "Older AMD GPU (GCN/Polaris like RX580) detected - ROCm not supported"
    log "Using Mesa drivers with OpenCL support for basic acceleration"
fi

log "Testing OpenCL support..."
if command -v clinfo &> /dev/null; then
    clinfo | head -10 || warn "OpenCL may not be working properly"
fi

log "Testing VAAPI support..."
if command -v vainfo &> /dev/null; then
    vainfo || warn "VAAPI may not be working properly"
fi

# Test FFmpeg with AMD support
log "Testing FFmpeg AMD encoder support..."
if ffmpeg -encoders 2>/dev/null | grep -q "h264_amf"; then
    log "✓ AMD H.264 encoder (AMF) available"
elif ffmpeg -encoders 2>/dev/null | grep -q "h264_vaapi"; then
    log "✓ VAAPI H.264 encoder available"
else
    warn "✗ No AMD hardware encoders found, will use software encoding with OpenCL acceleration"
fi

log "AMD GPU support installation completed successfully!"
`;

        // Write the script to a temporary file
        const fs = require('fs');
        const path = require('path');
        const scriptPath = path.join(__dirname, 'temp_amd_install.sh');
        fs.writeFileSync(scriptPath, amdInstallScript);
        fs.chmodSync(scriptPath, 0o755);
        
        // Execute the AMD install script
        const installProcess = spawn('bash', [scriptPath], {
            cwd: __dirname,
            stdio: 'pipe',
            env: {...process.env, FORCE_COLOR: '1'}
        });
        
        let stdoutData = '';
        let stderrData = '';
        
        installProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            console.log(`AMD Install: ${output.trim()}`);
            // Send real-time progress to frontend
            io.emit('installProgress', {
                component: 'amd-gpu',
                message: output.trim(),
                progress: 50
            });
        });
        
        installProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderrData += output;
            console.error(`AMD Install Error: ${output.trim()}`);
        });
        
        installProcess.on('close', (code) => {
            // Clean up temp script
            try {
                fs.unlinkSync(scriptPath);
            } catch (err) {
                console.warn('Could not delete temp script:', err.message);
            }
            
            if (code === 0) {
                log.info('AMD GPU installation completed successfully');
                io.emit('installComplete', { 
                    component: 'amd-gpu',
                    message: 'AMD GPU support installed successfully!'
                });
                res.json({ 
                    success: true, 
                    message: 'AMD GPU support installed successfully',
                    output: stdoutData
                });
                
                // Trigger GPU detection refresh
                setTimeout(() => {
                    detectGPU();
                }, 2000);
            } else {
                log.error(`AMD GPU installation failed with code ${code}`);
                io.emit('installError', { 
                    component: 'amd-gpu',
                    error: `Installation failed with code ${code}`,
                    output: stderrData
                });
                res.status(500).json({ 
                    success: false, 
                    error: `Installation failed with code ${code}`,
                    output: stdoutData,
                    errorOutput: stderrData
                });
            }
        });
        
        installProcess.on('error', (err) => {
            log.error(`Error spawning AMD install process: ${err.message}`);
            res.status(500).json({
                success: false,
                error: `Failed to start installation: ${err.message}`
            });
        });
        
    } catch (error) {
        log.error(`Error in AMD GPU auto-install: ${error.message}`);
        console.error('Error in AMD GPU auto-install:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 TVHeadend Streamer Panel running on port ${PORT}`);
    console.log(`🔗 Access at: http://localhost:${PORT}`);
    console.log('Server started successfully');
    // Restore active streams after reboot
    restoreActiveStreamsFromFile();
});

