const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const fetch = require('node-fetch');

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
        const info = { gpu: 'None detected' };
        
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
                        info.memory = parts[1];
                    }
                    
                    // Get GPU info
                    if (gpuInfo.nvidia) {
                        exec('lspci | grep -i nvidia', (error, stdout) => {
                            info.gpu = stdout.trim() || 'NVIDIA GPU detected';
                            resolve(info);
                        });
                    } else if (gpuInfo.amd) {
                        exec('lspci | grep -i -E "(amd|radeon)" | grep -i vga', (error, stdout) => {
                            info.gpu = stdout.trim() || 'AMD GPU detected';
                            resolve(info);
                        });
                    } else {
                        resolve(info);
                    }
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
        // Check if amdgpu kernel module is loaded
        exec('lsmod | grep amdgpu', (error, stdout) => {
            if (error || !stdout.trim()) {
                resolve({ available: false, version: null });
                return;
            }
            
            // If amdgpu module is loaded, check Mesa version
            exec('glxinfo | grep "OpenGL version"', (error, glxOutput) => {
                let version = 'Unknown';
                if (!error && glxOutput) {
                    const mesaMatch = glxOutput.match(/Mesa\s+(\d+\.[\d\.]+)/);
                    if (mesaMatch) {
                        version = mesaMatch[1];
                    }
                }
                
                resolve({ 
                    available: true, 
                    version: version
                });
            });
        });
    });
}

async function installComponent(component) {
    // This would trigger individual component installation
    // For now, we'll just trigger auto install
    try {
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
                    // Try radeontop (works for older AMD GPUs like RX580)
                    exec('radeontop -d - -l 1', { timeout: 3000 }, (error) => {
                        if (error) {
                            // Try lspci to detect AMD/Radeon GPU
                            exec('lspci | grep -i -E "(amd|radeon)" | grep -i vga', (error, stdout) => {
                                if (!error && stdout.trim()) {
                                    console.log('AMD GPU detected via lspci:', stdout.trim());
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            });
                        } else {
                            console.log('AMD GPU detected via radeontop');
                            resolve(true);
                        }
                    });
                } else {
                    console.log('AMD GPU detected via rocm-smi');
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
            
            currentChannel = {
                id: Date.now() + Math.random(),
                name: nameMatch ? nameMatch[1] : 'Unknown Channel',
                logo: logoMatch ? logoMatch[1] : '',
                group: groupMatch ? groupMatch[1] : 'Uncategorized',
                url: '',
                isActive: false,
                transcoding: false,
                profile: 'medium',
                bandwidth: 0, // MB/s
                totalData: 0 // Total MB transferred
            };
        } else if (line && !line.startsWith('#') && currentChannel.name) {
            currentChannel.url = line;
            channels.push({ ...currentChannel });
            currentChannel = {};
        }
    }
    
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
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                status: 'idle',
                quality: 'HD'
            },
            {
                id: 'demo2',
                name: 'Demo Channel 2 (4K)',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                status: 'idle',
                quality: '4K'
            },
            {
                id: 'demo3',
                name: 'Demo Channel 3 (FullHD)',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                status: 'idle',
                quality: 'FullHD'
            },
            {
                id: 'demo4',
                name: 'Demo Channel 4 (HD)',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
                status: 'idle',
                quality: 'HD'
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
function getFFmpegEncoder(gpu) {
    const preferences = config.transcoding.gpuPreferences;
    
    if (gpu === 'nvidia' && gpuInfo.nvidia && preferences.nvidia) {
        return {
            video: preferences.nvidia.encoder,
            preset: preferences.nvidia.preset,
            extraArgs: preferences.nvidia.extraArgs,
            fallback: preferences.cpu // fallback to CPU
        };
    } else if (gpu === 'amd' && gpuInfo.amd && preferences.amd) {
        // For older AMD GPUs like RX580, h264_amf may not be available
        return {
            video: preferences.amd.encoder,
            preset: preferences.amd.preset,
            extraArgs: preferences.amd.extraArgs,
            fallback: {
                video: preferences.cpu.encoder,
                preset: preferences.cpu.preset,
                extraArgs: [...preferences.cpu.extraArgs, '-x264-params', 'opencl=true']
            }
        };
    } else {
        return {
            video: preferences.cpu.encoder,
            preset: preferences.cpu.preset,
            extraArgs: preferences.cpu.extraArgs
        };
    }
}

// Start transcoding stream
async function startTranscoding(channelId, profile = 'medium', gpu = 'auto') {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');
    
    // Stop existing stream if running
    if (activeStreams.has(channelId)) {
        stopTranscoding(channelId);
    }
    
    // Determine GPU to use
    let selectedGPU = gpu;
    if (gpu === 'auto') {
        selectedGPU = gpuInfo.nvidia ? 'nvidia' : (gpuInfo.amd ? 'amd' : 'cpu');
    }
    
    const encoder = getFFmpegEncoder(selectedGPU);
    const profileConfig = config.transcoding.profiles[profile];
    
    // Create output directory
    const outputDir = path.join(config.streaming.outputDir, channelId.toString());
    await fs.ensureDir(outputDir);
    
    // Build FFmpeg command
    let ffmpegArgs = [
        '-i', channel.url,
        '-c:v', encoder.video,
        '-preset', encoder.preset,
        ...encoder.extraArgs,
        '-s', `${profileConfig.width}x${profileConfig.height}`,
        '-b:v', profileConfig.bitrate,
        '-c:a', 'aac',
        '-b:a', '128k',
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
    
    // Handle encoder fallback for older AMD GPUs
    ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Check for h264_amf not available error (common on RX580)
        if (output.includes('h264_amf') && output.includes('not found') && encoder.fallback && !usingFallback) {
            console.warn('h264_amf encoder not available, falling back to software encoding with OpenCL optimization');
            
            // Kill current process
            ffmpeg.kill('SIGTERM');
            usingFallback = true;
            
            // Rebuild command with fallback encoder
            ffmpegArgs = [
                '-i', channel.url,
                '-c:v', encoder.fallback.video,
                '-preset', encoder.fallback.preset,
                ...encoder.fallback.extraArgs,
                '-s', `${profileConfig.width}x${profileConfig.height}`,
                '-b:v', profileConfig.bitrate,
                '-c:a', 'aac',
                '-b:a', '128k',
                '-f', 'hls',
                '-hls_time', config.streaming.hlsSegmentTime,
                '-hls_list_size', config.streaming.hlsListSize,
                '-hls_flags', 'delete_segments',
                '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
                path.join(outputDir, 'playlist.m3u8')
            ];
            
            console.log('Restarting with fallback encoder:', ffmpegArgs);
            ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            // Re-attach event listeners for new process
            attachFFmpegListeners();
            return;
        }
        
        console.log(`FFmpeg stderr [${channelId}]:`, output);
        
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
    
    function attachFFmpegListeners() {
        ffmpeg.stdout.on('data', (data) => {
            console.log(`FFmpeg stdout [${channelId}]:`, data.toString());
        });
        
        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            console.log(`FFmpeg stderr [${channelId}]:`, output);
            
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
        
        ffmpeg.on('close', (code) => {
            console.log(`FFmpeg process [${channelId}] exited with code ${code}`);
            activeStreams.delete(channelId);
            
            // Update channel status
            const channelIndex = channels.findIndex(c => c.id === channelId);
            if (channelIndex !== -1) {
                channels[channelIndex].isActive = false;
                channels[channelIndex].transcoding = false;
            }
            
            io.emit('streamStopped', { channelId, code });
            io.emit('channelsUpdated', channels);
        });
        
        ffmpeg.on('error', (error) => {
            console.error(`FFmpeg error [${channelId}]:`, error);
            io.emit('transcodingError', { channelId, error: error.message });
        });
    }
    
    // Attach initial listeners
    ffmpeg.stdout.on('data', (data) => {
        console.log(`FFmpeg stdout [${channelId}]:`, data.toString());
    });
    
    // Store stream info
    activeStreams.set(channelId, {
        process: ffmpeg,
        profile,
        gpu: selectedGPU,
        startTime: Date.now(),
        outputPath: path.join(outputDir, 'playlist.m3u8'),
        lastBandwidthCheck: Date.now(),
        bytesTransferred: 0
    });
    
    // Initialize bandwidth monitoring
    streamStats.set(channelId, {
        bandwidth: 0,
        totalData: 0,
        lastCheck: Date.now(),
        lastBytes: 0
    });
    
    // Update channel status
    const channelIndex = channels.findIndex(c => c.id === channelId);
    if (channelIndex !== -1) {
        channels[channelIndex].isActive = true;
        channels[channelIndex].transcoding = true;
        channels[channelIndex].profile = profile;
    }
    
    io.emit('streamStarted', { channelId, profile, gpu: selectedGPU });
    io.emit('channelsUpdated', channels);
    
    return {
        channelId,
        streamUrl: `/stream/${channelId}/playlist.m3u8`,
        profile,
        gpu: selectedGPU
    };
}

// Stop transcoding stream
function stopTranscoding(channelId) {
    const stream = activeStreams.get(channelId);
    if (stream) {
        stream.process.kill('SIGTERM');
        activeStreams.delete(channelId);
        streamStats.delete(channelId); // Remove bandwidth stats
        
        // Update channel status
        const channelIndex = channels.findIndex(c => c.id === channelId);
        if (channelIndex !== -1) {
            channels[channelIndex].isActive = false;
            channels[channelIndex].transcoding = false;
            channels[channelIndex].bandwidth = 0;
        }
        
        io.emit('streamStopped', { channelId });
        io.emit('channelsUpdated', channels);
        
        return true;
    }
    return false;
}

// Monitor bandwidth usage
function monitorBandwidth() {
    for (const [channelId, stream] of activeStreams) {
        try {
            const outputDir = path.dirname(stream.outputPath);
            const stats = streamStats.get(channelId);
            
            if (stats && fs.existsSync(outputDir)) {
                // Calculate directory size
                let totalBytes = 0;
                const files = fs.readdirSync(outputDir);
                
                for (const file of files) {
                    const filePath = path.join(outputDir, file);
                    if (fs.existsSync(filePath)) {
                        const fileStat = fs.statSync(filePath);
                        totalBytes += fileStat.size;
                    }
                }
                
                const now = Date.now();
                const timeDiff = (now - stats.lastCheck) / 1000; // seconds
                const bytesDiff = totalBytes - stats.lastBytes;
                
                if (timeDiff > 0) {
                    // Calculate bandwidth in MB/s
                    const bandwidth = (bytesDiff / (1024 * 1024)) / timeDiff;
                    
                    stats.bandwidth = Math.max(0, bandwidth);
                    stats.totalData = totalBytes / (1024 * 1024); // MB
                    stats.lastCheck = now;
                    stats.lastBytes = totalBytes;
                    
                    // Update channel info
                    const channelIndex = channels.findIndex(c => c.id === channelId);
                    if (channelIndex !== -1) {
                        channels[channelIndex].bandwidth = stats.bandwidth;
                        channels[channelIndex].totalData = stats.totalData;
                    }
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
            nvidia: gpuInfo.nvidia,
            amd: gpuInfo.amd,
            cpu: true
        }
    });
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
        
        const result = await startTranscoding(parseInt(channelId), profile, gpu);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-stream/:channelId', (req, res) => {
    try {
        const { channelId } = req.params;
        const result = stopTranscoding(parseInt(channelId));
        
        if (result) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Stream not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/active-streams', (req, res) => {
    const streams = Array.from(activeStreams.entries()).map(([channelId, stream]) => ({
        channelId,
        profile: stream.profile,
        gpu: stream.gpu,
        startTime: stream.startTime,
        uptime: Date.now() - stream.startTime
    }));
    
    res.json(streams);
});

app.post('/api/launch-vlc/:channelId', (req, res) => {
    try {
        const { channelId } = req.params;
        const stream = activeStreams.get(parseInt(channelId));
        
        if (!stream) {
            return res.status(404).json({ error: 'Stream not found or not active' });
        }
        
        const streamUrl = `http://localhost:3000/stream/${channelId}/playlist.m3u8`;
        
        // Check if VLC is installed
        exec('which vlc', (error) => {
            if (error) {
                return res.status(400).json({ 
                    error: 'VLC not installed',
                    message: 'Please install VLC media player first'
                });
            }
            
            // Launch VLC with the stream URL
            const vlcCommand = `vlc "${streamUrl}" --intf dummy --extraintf http --http-password vlcpassword`;
            
            exec(vlcCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('VLC launch error:', error);
                    return res.status(500).json({ error: 'Failed to launch VLC' });
                }
                
                res.json({ 
                    success: true, 
                    message: 'VLC launched successfully',
                    streamUrl 
                });
            });
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/check-vlc', (req, res) => {
    exec('which vlc', (error) => {
        res.json({ 
            installed: !error,
            message: error ? 'VLC not installed' : 'VLC is available'
        });
    });
});

// Serve HLS streams
app.use('/stream', express.static(config.streaming.outputDir));

// Socket.IO events
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send initial data
    socket.emit('channelsUpdated', channels);
    socket.emit('gpuInfo', gpuInfo);
    socket.emit('tvheadendStatus', tvheadendStatus);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize server
async function initializeServer() {
    try {
        console.log('Initializing server...');
        
        // Detect GPU capabilities
        await detectGPU();
        console.log('GPU detection completed:', gpuInfo);
        
        // Check TVHeadend connectivity
        const tvhConnected = await checkTVHeadendConnection();
        if (!tvhConnected) {
            console.warn('Could not connect to TVHeadend server. Service will start but streaming may not work.');
        }
        
        // Fetch initial channel list if TVHeadend is available
        if (tvhConnected) {
            await fetchPlaylist();
        }
        
        // Start the server
        const PORT = config.server.port || 3000;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
        
        // Start the streaming server
        const STREAM_PORT = config.streaming.port || 8080;
        const streamApp = express();
        streamApp.use('/streams', express.static(path.join(__dirname, config.streaming.outputDir)));
        streamApp.listen(STREAM_PORT, () => {
            console.log(`Streaming server running on port ${STREAM_PORT}`);
        });
        
        console.log('Server initialization completed');
    } catch (error) {
        console.error('Error initializing server:', error);
        // Continue running the server even if initialization fails
        const PORT = config.server.port || 3000;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT} (fallback mode)`);
        });
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    
    // Stop all active streams
    for (const [channelId, stream] of activeStreams) {
        stream.process.kill('SIGTERM');
    }
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start the server
initializeServer();
