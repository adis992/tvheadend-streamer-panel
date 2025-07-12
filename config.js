module.exports = {
    // Server configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0'
    },
    
    // TVHeadend server configuration
    tvheadend: {
        url: process.env.TVH_URL || 'http://192.168.100.3:9981/playlist/channels',
        host: process.env.TVH_HOST || '192.168.100.3',
        port: process.env.TVH_PORT || 9981,
        username: process.env.TVH_USERNAME || 'noname',
        password: process.env.TVH_PASSWORD || 'noname',
        timeout: process.env.TVH_TIMEOUT || 10000
    },
    
    // Streaming configuration
    streaming: {
        port: process.env.STREAM_PORT || 8080,
        // Always use 'streams' directory (with 's'). Both STREAMS_DIR and STREAM_DIR env vars supported for compatibility
        outputDir: process.env.STREAMS_DIR || process.env.STREAM_DIR || 'streams',
        hlsSegmentTime: parseInt(process.env.HLS_SEGMENT_TIME) || 4,
        hlsListSize: parseInt(process.env.HLS_LIST_SIZE) || 10,
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 60000, // 1 minute
        udp: {
            defaultIp: process.env.UDP_DEFAULT_IP || '239.255.0.1',  // Default multicast address
            defaultPort: parseInt(process.env.UDP_DEFAULT_PORT) || 1234,
            ttl: parseInt(process.env.UDP_TTL) || 1,
            mtu: parseInt(process.env.UDP_MTU) || 1316
        }
    },
    
    // Transcoding profiles
    transcoding: {
        defaultProfile: 'passthrough', // Set passthrough as default
        profiles: {
            'passthrough': {
                description: 'Direct passthrough without transcoding',
                passthrough: true
            },
            // HEVC profiles for best compression
            'hevc_hd': {
                description: 'HEVC HD 720p - 3.5MB/s max bitrate',
                width: 1280,
                height: 720,
                bitrate: '3500k',
                audioBitrate: '128k',
                fps: 25,
                codec: 'hevc'
            },
            'hevc_fhd': {
                description: 'HEVC FHD 1080p - 4MB/s max bitrate', 
                width: 1920,
                height: 1080,
                bitrate: '4000k',
                audioBitrate: '192k',
                fps: 30,
                codec: 'hevc'
            },
            // H.264 profiles for compatibility
            'h264_hd': {
                description: 'H.264 HD 720p - 3.5MB/s max bitrate',
                width: 1280,
                height: 720,
                bitrate: '3500k',
                audioBitrate: '128k',
                fps: 25,
                codec: 'h264'
            },
            'h264_fhd': {
                description: 'H.264 FHD 1080p - 4MB/s max bitrate',
                width: 1920,
                height: 1080,
                bitrate: '4000k',
                audioBitrate: '192k',
                fps: 30,
                codec: 'h264'
            },
            // Legacy profiles (keep for compatibility)
            'low': {
                width: 640,
                height: 480,
                bitrate: '800k',
                audioBitrate: '96k',
                fps: 25,
                codec: 'h264'
            },
            'medium': {
                width: 1280,
                height: 720,
                bitrate: '2000k',
                audioBitrate: '128k',
                fps: 25,
                codec: 'h264'
            },
            'high': {
                width: 1920,
                height: 1080,
                bitrate: '3500k',
                audioBitrate: '192k',
                fps: 30,
                codec: 'h264'
            }
        },
        
        // GPU preferences
        gpuPreferences: {
            nvidia: {
                encoder: 'h264_nvenc',
                preset: 'fast',
                extraArgs: ['-gpu', '0', '-rc', 'cbr'],
                fallback: {
                    encoder: 'libx264',
                    preset: 'fast',
                    extraArgs: ['-threads', '0']
                }
            },
            amd: {
                encoder: 'h264_amf', // AMD hardware encoder for H.264
                preset: 'quality',
                extraArgs: [
                    '-usage', 'transcoding',
                    '-quality', 'quality',
                    '-rc', 'cbr', // Use CBR for consistent bitrate
                    '-profile:v', 'high'
                ],
                fallback: {
                    encoder: 'libx264',
                    preset: 'fast',
                    extraArgs: ['-threads', '0', '-profile:v', 'high']
                }
            },
            amd_hevc: {
                encoder: 'hevc_amf', // AMD HEVC encoder
                preset: 'quality',
                extraArgs: [
                    '-usage', 'transcoding',
                    '-quality', 'quality',
                    '-rc', 'cbr', // Use CBR for consistent bitrate
                    '-profile:v', 'main',
                    '-tier', 'main'
                ],
                fallback: {
                    encoder: 'libx265',
                    preset: 'fast',
                    extraArgs: ['-threads', '0', '-crf', '28', '-profile:v', 'main']
                }
            },
            intel: {
                encoder: 'h264_qsv',
                preset: 'fast',
                extraArgs: ['-look_ahead', '1'],
                fallback: {
                    encoder: 'libx264',
                    preset: 'fast',
                    extraArgs: ['-threads', '0']
                }
            },
            cpu: {
                encoder: 'libx264',
                preset: 'fast',
                extraArgs: ['-threads', '0']
            },
            cpu_hevc: {
                encoder: 'libx265',
                preset: 'fast',
                extraArgs: ['-threads', '0', '-crf', '28']
            }
        }
    },
    
    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || './logs/app.log',
        maxFiles: 5,
        maxSize: '10MB'
    },
    
    // Security configuration
    security: {
        enableCors: true,
        corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
        rateLimitWindow: 15 * 60 * 1000, // 15 minutes
        rateLimitMax: 100 // limit each IP to 100 requests per windowMs
    },
    
    // Performance configuration
    performance: {
        maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 10,
        maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE) || 1024 * 1024, // 1MB
        ffmpegTimeout: parseInt(process.env.FFMPEG_TIMEOUT) || 30000 // 30 seconds
    }
};
