module.exports = {
    // Server configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0'
    },
    
    // TVHeadend server configuration
    tvheadend: {
        url: process.env.TVH_URL || 'http://192.168.100.3:9981/playlist',
        host: process.env.TVH_HOST || '192.168.100.3',
        port: process.env.TVH_PORT || 9981,
        username: process.env.TVH_USERNAME || '',
        password: process.env.TVH_PASSWORD || '',
        timeout: process.env.TVH_TIMEOUT || 10000
    },
    
    // Streaming configuration
    streaming: {
        outputDir: process.env.STREAM_DIR || './streams',
        hlsSegmentTime: parseInt(process.env.HLS_SEGMENT_TIME) || 4,
        hlsListSize: parseInt(process.env.HLS_LIST_SIZE) || 6,
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 60000 // 1 minute
    },
    
    // Transcoding profiles
    transcoding: {
        profiles: {
            'low': {
                width: 640,
                height: 480,
                bitrate: '500k',
                audioBitrate: '64k',
                fps: 25
            },
            'medium': {
                width: 1280,
                height: 720,
                bitrate: '1500k',
                audioBitrate: '128k',
                fps: 25
            },
            'high': {
                width: 1920,
                height: 1080,
                bitrate: '3000k',
                audioBitrate: '192k',
                fps: 30
            },
            'ultra': {
                width: 2560,
                height: 1440,
                bitrate: '6000k',
                audioBitrate: '256k',
                fps: 30
            }
        },
        
        // GPU preferences
        gpuPreferences: {
            nvidia: {
                encoder: 'h264_nvenc',
                preset: 'fast',
                extraArgs: ['-gpu', '0', '-rc', 'cbr']
            },
            amd: {
                encoder: 'h264_amf',
                preset: 'speed',
                extraArgs: ['-usage', 'transcoding', '-rc', 'cbr']
            },
            intel: {
                encoder: 'h264_qsv',
                preset: 'fast',
                extraArgs: ['-look_ahead', '1']
            },
            cpu: {
                encoder: 'libx264',
                preset: 'fast',
                extraArgs: ['-threads', '0']
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
