const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const fetch = require('node-fetch');

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

// Configuration
const config = {
    tvheadend: {
        url: 'http://192.168.100.3:9981/playlist',
        host: '192.168.100.3',
        port: 9981
    },
    streaming: {
        port: 8080,
        outputDir: './streams',
        hlsSegmentTime: 4,
        hlsListSize: 6
    },
    transcoding: {
        profiles: {
            'low': { width: 640, height: 480, bitrate: '500k' },
            'medium': { width: 1280, height: 720, bitrate: '1500k' },
            'high': { width: 1920, height: 1080, bitrate: '3000k' }
        }
    }
};

// Global variables
let channels = [];
let activeStreams = new Map();
let streamStats = new Map(); // Bandwidth monitoring
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
        
        // Check for AMD GPU
        const amdCheck = await new Promise((resolve) => {
            exec('rocm-smi', (error) => {
                if (error) {
                    exec('radeontop -d -', (error) => {
                        resolve(!error);
                    });
                } else {
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

// Get FFmpeg encoder based on GPU
function getFFmpegEncoder(gpu) {
    if (gpu === 'nvidia' && gpuInfo.nvidia) {
        return {
            video: 'h264_nvenc',
            preset: 'fast',
            extraArgs: ['-gpu', '0']
        };
    } else if (gpu === 'amd' && gpuInfo.amd) {
        return {
            video: 'h264_amf',
            preset: 'speed',
            extraArgs: ['-usage', 'transcoding']
        };
    } else {
        return {
            video: 'libx264',
            preset: 'fast',
            extraArgs: []
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
    
    // FFmpeg command
    const ffmpegArgs = [
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
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
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
                output: output
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
        // Create directories
        await fs.ensureDir(config.streaming.outputDir);
        
        // Check FFmpeg installation
        console.log('Checking system requirements...');
        const ffmpegInstalled = await checkFFmpegInstallation();
        
        if (!ffmpegInstalled) {
            console.warn('FFmpeg not found! Transcoding will not work without FFmpeg.');
            console.warn('You can:');
            console.warn('1. Install manually: sudo apt install ffmpeg (Ubuntu/Debian)');
            console.warn('2. Run the install script: chmod +x install.sh && ./install.sh');
            console.warn('3. Use the web interface to auto-install');
            console.warn('Server will continue but transcoding features will be disabled.');
        }
        
        // Detect GPU
        await detectGPU();
        
        // Check TVHeadend connection first
        console.log('Checking TVHeadend server connectivity...');
        const isConnected = await checkTVHeadendConnection();
        
        if (isConnected) {
            console.log('TVHeadend server is reachable, fetching playlist...');
            try {
                await fetchPlaylist();
            } catch (error) {
                console.warn('Failed to fetch playlist, but TVHeadend is reachable:', error.message);
            }
        } else {
            console.warn('TVHeadend server is not reachable. Using demo channels.');
            console.warn('Please check TVHeadend server at:', `http://${config.tvheadend.host}:${config.tvheadend.port}`);
            // Try to fetch playlist anyway (will fallback to demo channels)
            try {
                await fetchPlaylist();
            } catch (error) {
                console.log('Loading demo channels as fallback');
            }
        }
        
        // Start periodic TVHeadend connectivity checks
        setInterval(async () => {
            await checkTVHeadendConnection();
        }, 30000); // Check every 30 seconds
        
        // Start server
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`TVHeadend Streamer running on port ${PORT}`);
            console.log(`Available GPUs:`, gpuInfo);
            console.log(`TVHeadend Status:`, tvheadendStatus);
            console.log(`Loaded ${channels.length} channels`);
            console.log(`Access the web interface at: http://localhost:${PORT}`);
        });
        
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
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
