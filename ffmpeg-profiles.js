// FFmpeg Profiles Configuration
// This file defines transcoding profiles with GPU optimization

module.exports = {
    // HEVC profiles (modern, efficient)
    'hevc_hd': {
        width: 1280,
        height: 720,
        bitrate: '3500k',
        audioBitrate: '128k',
        fps: 30,
        codec: 'hevc',
        description: 'HEVC HD 720p - High efficiency'
    },
    'hevc_fhd': {
        width: 1920,
        height: 1080,
        bitrate: '4000k',
        audioBitrate: '192k',
        fps: 30,
        codec: 'hevc',
        description: 'HEVC FHD 1080p - High efficiency'
    },
    
    // H.264 profiles (compatible)
    'h264_hd': {
        width: 1280,
        height: 720,
        bitrate: '3500k',
        audioBitrate: '128k',
        fps: 30,
        codec: 'h264',
        description: 'H.264 HD 720p - Wide compatibility'
    },
    'h264_fhd': {
        width: 1920,
        height: 1080,
        bitrate: '4000k',
        audioBitrate: '192k',
        fps: 30,
        codec: 'h264',
        description: 'H.264 FHD 1080p - Wide compatibility'
    },
    
    // Legacy profiles (for compatibility)
    'low': {
        width: 640,
        height: 480,
        bitrate: '800k',
        audioBitrate: '96k',
        fps: 25,
        codec: 'h264',
        description: 'Low Quality - Mobile/Low bandwidth'
    },
    'medium': {
        width: 1280,
        height: 720,
        bitrate: '2000k',
        audioBitrate: '128k',
        fps: 25,
        codec: 'h264',
        description: 'Medium Quality - Standard HD'
    },
    'high': {
        width: 1920,
        height: 1080,
        bitrate: '3500k',
        audioBitrate: '192k',
        fps: 30,
        codec: 'h264',
        description: 'High Quality - Full HD'
    },
    
    // Ultra profiles
    'ultra_4k': {
        width: 3840,
        height: 2160,
        bitrate: '8000k',
        audioBitrate: '256k',
        fps: 30,
        codec: 'hevc',
        description: '4K Ultra HD - HEVC required'
    },
    
    // Passthrough (no transcoding)
    'passthrough': {
        width: null,
        height: null,
        bitrate: null,
        audioBitrate: null,
        fps: null,
        codec: 'copy',
        description: 'Direct stream - No transcoding'
    }
};
