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
        const response = await fetch(config.tvheadend.url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const content = await response.text();
        channels = parseM3U(content);
        
        console.log(`Successfully loaded ${channels.length} channels`);
        io.emit('channelsUpdated', channels);
        
        return channels;
    } catch (error) {
        console.error('Error fetching playlist:', error);
        throw error;
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
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Initialize server
async function initializeServer() {
    try {
        // Create directories
        await fs.ensureDir(config.streaming.outputDir);
        
        // Detect GPU
        await detectGPU();
        
        // Fetch initial playlist
        await fetchPlaylist();
        
        // Start server
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`TVHeadend Streamer running on port ${PORT}`);
            console.log(`Available GPUs:`, gpuInfo);
            console.log(`Loaded ${channels.length} channels`);
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
