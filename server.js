const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const fetch = require('node-fetch');
const ffmpegProfiles = require('./ffmpeg-profiles');

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
                profile: null, // No default profile
                gpu: null,     // No default GPU
                bandwidth: 0,  // MB/s
                totalData: 0   // Total MB transferred
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

// Start transcoding stream with new profile system
async function startTranscoding(channelId, profileCategory = 'quality', profileName = 'hd_720p', gpuType = 'auto') {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');
    
    // Stop existing stream if running
    if (activeStreams.has(channelId)) {
        stopTranscoding(channelId);
    }
    
    // Get profile configuration
    let profile;
    if (ffmpegProfiles[profileCategory] && ffmpegProfiles[profileCategory][profileName]) {
        profile = ffmpegProfiles[profileCategory][profileName];
    } else {
        throw new Error(`Profile not found: ${profileCategory}.${profileName}`);
    }
    
    // Determine GPU to use and adjust codec if needed (AMD prioritet)
    let selectedGPU = gpuType;
    if (gpuType === 'auto') {
        selectedGPU = gpuInfo.amd ? 'amd' : (gpuInfo.nvidia ? 'nvidia' : 'cpu');
    }
    
    // Adjust codec based on GPU availability
    let videoCodec = profile.video.codec;
    if (selectedGPU === 'nvidia' && !gpuInfo.nvidia && videoCodec.includes('nvenc')) {
        videoCodec = 'libx264'; // Fallback to CPU
        selectedGPU = 'cpu';
    }
    if (selectedGPU === 'amd' && !gpuInfo.amd && videoCodec.includes('amf')) {
        videoCodec = 'libx264'; // Fallback to CPU  
        selectedGPU = 'cpu';
    }
    
    // Create output directory
    const outputDir = path.join(config.streaming.outputDir, channelId.toString());
    await fs.ensureDir(outputDir);
    
    // Build FFmpeg command arguments
    const ffmpegArgs = [
        '-i', channel.url,
        '-c:v', videoCodec
    ];
    
    // Video encoding parameters
    if (profile.video.width && profile.video.height) {
        ffmpegArgs.push('-s', `${profile.video.width}x${profile.video.height}`);
    }
    
    if (profile.video.bitrate) {
        ffmpegArgs.push('-b:v', profile.video.bitrate);
    }
    
    if (profile.video.preset) {
        ffmpegArgs.push('-preset', profile.video.preset);
    }
    
    if (profile.video.profile) {
        ffmpegArgs.push('-profile:v', profile.video.profile);
    }
    
    if (profile.video.level) {
        ffmpegArgs.push('-level', profile.video.level);
    }
    
    if (profile.video.crf) {
        ffmpegArgs.push('-crf', profile.video.crf.toString());
    }
    
    if (profile.video.fps) {
        ffmpegArgs.push('-r', profile.video.fps.toString());
    }
    
    if (profile.video.keyint) {
        ffmpegArgs.push('-g', profile.video.keyint.toString());
    }
    
    if (profile.video.tune) {
        ffmpegArgs.push('-tune', profile.video.tune);
    }
    
    // GPU-specific parameters
    if (selectedGPU === 'nvidia' && videoCodec.includes('nvenc')) {
        if (profile.video.gpu !== undefined) {
            ffmpegArgs.push('-gpu', profile.video.gpu.toString());
        }
        if (profile.video.rc) {
            ffmpegArgs.push('-rc', profile.video.rc);
        }
    }
    
    if (selectedGPU === 'amd' && videoCodec.includes('amf')) {
        if (profile.video.rc) {
            ffmpegArgs.push('-rc', profile.video.rc);
        }
    }
    
    // Audio encoding parameters
    ffmpegArgs.push('-c:a', profile.audio.codec || 'aac');
    
    if (profile.audio.bitrate) {
        ffmpegArgs.push('-b:a', profile.audio.bitrate);
    }
    
    if (profile.audio.channels) {
        ffmpegArgs.push('-ac', profile.audio.channels.toString());
    }
    
    if (profile.audio.sample_rate) {
        ffmpegArgs.push('-ar', profile.audio.sample_rate.toString());
    }
    
    // HLS output parameters
    ffmpegArgs.push(
        '-f', 'hls',
        '-hls_time', config.streaming.hlsSegmentTime,
        '-hls_list_size', config.streaming.hlsListSize,
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        path.join(outputDir, 'playlist.m3u8')
    );
    
    console.log(`Starting transcoding for channel ${channelId} with profile ${profileCategory}.${profileName} on ${selectedGPU}`);
    console.log('FFmpeg args:', ffmpegArgs);
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    // Store stream info
    activeStreams.set(channelId, {
        process: ffmpeg,
        profile: { category: profileCategory, name: profileName },
        gpu: selectedGPU,
        startTime: new Date(),
        outputDir
    });
    
    // Initialize bandwidth monitoring for this stream
    streamStats.set(channelId, {
        bandwidth: 0,
        totalData: 0,
        lastCheck: Date.now(),
        lastBytes: 0
    });
    
    // Update channel status
    let channelIndex = channels.findIndex(c => c.id === channelId);
    if (channelIndex !== -1) {
        channels[channelIndex].isActive = true;
        channels[channelIndex].transcoding = true;
        channels[channelIndex].profile = `${profileCategory}.${profileName}`;
        channels[channelIndex].gpu = selectedGPU;
    }
    
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
                profile: `${profileCategory}.${profileName}`,
                gpu: selectedGPU,
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
            delete channels[channelIndex].profile;
            delete channels[channelIndex].gpu;
        }
        
        io.emit('streamStopped', { channelId, code });
        io.emit('channelsUpdated', channels);
    });
    
    // Emit updates
    io.emit('streamStarted', { 
        channelId, 
        profile: `${profileCategory}.${profileName}`, 
        gpu: selectedGPU 
    });
    io.emit('channelsUpdated', channels);
    
    ffmpeg.on('error', (error) => {
        console.error(`FFmpeg error [${channelId}]:`, error);
        io.emit('transcodingError', { channelId, error: error.message });
    });
    
    return {
        success: true,
        channelId,
        profile: { category: profileCategory, name: profileName },
        gpu: selectedGPU,
        streamUrl: `http://localhost:${config.streaming.port}/stream/${channelId}/playlist.m3u8`
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

// Monitor bandwidth usage (only for active streams)
function monitorBandwidth() {
    if (activeStreams.size === 0) return; // Skip if no active streams
    
    for (const [channelId, stream] of activeStreams) {
        try {
            const outputDir = stream.outputDir;
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
    
    // Emit updated channel data only if there are active streams
    if (activeStreams.size > 0) {
        io.emit('channelsUpdated', channels);
    }
}

// Start bandwidth monitoring (only when streams are active)
setInterval(monitorBandwidth, 5000); // Every 5 seconds

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
    res.json(ffmpegProfiles);
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
        const { profileCategory = 'quality', profileName = 'hd_720p', gpuType = 'auto' } = req.body;
        
        const result = await startTranscoding(parseInt(channelId), profileCategory, profileName, gpuType);
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
        
        const streamUrl = `http://192.168.1.100:3001/stream/${channelId}/playlist.m3u8`;
        
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
        // Define port
        const PORT = process.env.PORT || 3001;
        
        // Create directories
        await fs.ensureDir(config.streaming.outputDir);
        
        // Detect GPU
        await detectGPU();
        
        // Start server first
        server.listen(PORT, () => {
            console.log(`TVHeadend Streamer running on port ${PORT}`);
            console.log(`Available GPUs:`, gpuInfo);
            
            // Fetch initial playlist in background (non-blocking)
            fetchPlaylist().then(() => {
                console.log(`Loaded ${channels.length} channels`);
            }).catch(error => {
                console.log('Playlist fetch failed (will retry later):', error.message);
            });
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
