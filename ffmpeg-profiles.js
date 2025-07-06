// FFmpeg Transcoding Profiles Configuration
module.exports = {
    // Quality-based profiles
    quality: {
        ultra_hd_4k: {
            name: "Ultra HD 4K",
            description: "3840x2160, 8-15 Mbps",
            video: {
                codec: "libx264",
                width: 3840,
                height: 2160,
                bitrate: "12000k",
                preset: "medium",
                profile: "high",
                level: "5.1"
            },
            audio: {
                codec: "aac",
                bitrate: "256k",
                channels: 2,
                sample_rate: 48000
            }
        },
        
        full_hd_1080p: {
            name: "Full HD 1080p",
            description: "1920x1080, 3-6 Mbps",
            video: {
                codec: "libx264",
                width: 1920,
                height: 1080,
                bitrate: "4500k",
                preset: "medium",
                profile: "high",
                level: "4.0"
            },
            audio: {
                codec: "aac",
                bitrate: "192k",
                channels: 2,
                sample_rate: 48000
            }
        },
        
        hd_720p: {
            name: "HD 720p",
            description: "1280x720, 1.5-3 Mbps",
            video: {
                codec: "libx264",
                width: 1280,
                height: 720,
                bitrate: "2500k",
                preset: "medium",
                profile: "main",
                level: "3.1"
            },
            audio: {
                codec: "aac",
                bitrate: "128k",
                channels: 2,
                sample_rate: 44100
            }
        },
        
        sd_480p: {
            name: "SD 480p",
            description: "854x480, 0.5-1.5 Mbps",
            video: {
                codec: "libx264",
                width: 854,
                height: 480,
                bitrate: "1200k",
                preset: "fast",
                profile: "main",
                level: "3.0"
            },
            audio: {
                codec: "aac",
                bitrate: "96k",
                channels: 2,
                sample_rate: 44100
            }
        },
        
        low_360p: {
            name: "Low 360p",
            description: "640x360, 0.2-0.8 Mbps",
            video: {
                codec: "libx264",
                width: 640,
                height: 360,
                bitrate: "600k",
                preset: "fast",
                profile: "baseline",
                level: "3.0"
            },
            audio: {
                codec: "aac",
                bitrate: "64k",
                channels: 2,
                sample_rate: 22050
            }
        }
    },

    // GPU-specific profiles
    gpu: {
        // NVIDIA NVENC profiles
        nvidia_4k_high: {
            name: "NVIDIA 4K High",
            description: "3840x2160, NVENC H.264",
            video: {
                codec: "h264_nvenc",
                width: 3840,
                height: 2160,
                bitrate: "15000k",
                preset: "p4",
                profile: "high",
                rc: "cbr",
                gpu: 0
            },
            audio: {
                codec: "aac",
                bitrate: "256k",
                channels: 2
            }
        },
        
        nvidia_1080p_fast: {
            name: "NVIDIA 1080p Fast",
            description: "1920x1080, NVENC H.264 Fast",
            video: {
                codec: "h264_nvenc",
                width: 1920,
                height: 1080,
                bitrate: "6000k",
                preset: "p1",
                profile: "main",
                rc: "vbr",
                gpu: 0
            },
            audio: {
                codec: "aac",
                bitrate: "192k",
                channels: 2
            }
        },
        
        nvidia_720p_quality: {
            name: "NVIDIA 720p Quality",
            description: "1280x720, NVENC H.264 Quality",
            video: {
                codec: "h264_nvenc",
                width: 1280,
                height: 720,
                bitrate: "3500k",
                preset: "p6",
                profile: "main",
                rc: "vbr",
                gpu: 0
            },
            audio: {
                codec: "aac",
                bitrate: "128k",
                channels: 2
            }
        },

        // AMD AMF profiles
        amd_4k_high: {
            name: "AMD 4K High",
            description: "3840x2160, AMF H.264",
            video: {
                codec: "h264_amf",
                width: 3840,
                height: 2160,
                bitrate: "15000k",
                preset: "quality",
                profile: "high",
                rc: "cbr"
            },
            audio: {
                codec: "aac",
                bitrate: "256k",
                channels: 2
            }
        },
        
        amd_1080p_balanced: {
            name: "AMD 1080p Balanced",
            description: "1920x1080, AMF H.264 Balanced",
            video: {
                codec: "h264_amf",
                width: 1920,
                height: 1080,
                bitrate: "5000k",
                preset: "balanced",
                profile: "main",
                rc: "vbr"
            },
            audio: {
                codec: "aac",
                bitrate: "192k",
                channels: 2
            }
        },
        
        amd_720p_speed: {
            name: "AMD 720p Speed",
            description: "1280x720, AMF H.264 Speed",
            video: {
                codec: "h264_amf",
                width: 1280,
                height: 720,
                bitrate: "2500k",
                preset: "speed",
                profile: "main",
                rc: "cbr"
            },
            audio: {
                codec: "aac",
                bitrate: "128k",
                channels: 2
            }
        }
    },

    // Specialized profiles
    specialized: {
        mobile_optimized: {
            name: "Mobile Optimized",
            description: "854x480, Low latency, Battery friendly",
            video: {
                codec: "libx264",
                width: 854,
                height: 480,
                bitrate: "800k",
                preset: "ultrafast",
                profile: "baseline",
                level: "3.0",
                tune: "zerolatency"
            },
            audio: {
                codec: "aac",
                bitrate: "64k",
                channels: 2,
                sample_rate: 22050
            }
        },
        
        streaming_optimized: {
            name: "Streaming Optimized",
            description: "1920x1080, Low latency, Stable bitrate",
            video: {
                codec: "libx264",
                width: 1920,
                height: 1080,
                bitrate: "3500k",
                preset: "veryfast",
                profile: "main",
                tune: "zerolatency",
                keyint: 60
            },
            audio: {
                codec: "aac",
                bitrate: "128k",
                channels: 2,
                sample_rate: 44100
            }
        },
        
        archive_quality: {
            name: "Archive Quality",
            description: "1920x1080, High quality, Slow encode",
            video: {
                codec: "libx264",
                width: 1920,
                height: 1080,
                bitrate: "8000k",
                preset: "slow",
                profile: "high",
                crf: 18
            },
            audio: {
                codec: "aac",
                bitrate: "320k",
                channels: 2,
                sample_rate: 48000
            }
        },
        
        bandwidth_saver: {
            name: "Bandwidth Saver",
            description: "640x360, Ultra low bitrate",
            video: {
                codec: "libx264",
                width: 640,
                height: 360,
                bitrate: "300k",
                preset: "fast",
                profile: "baseline",
                level: "3.0"
            },
            audio: {
                codec: "aac",
                bitrate: "32k",
                channels: 1,
                sample_rate: 22050
            }
        },
        
        high_framerate: {
            name: "High Framerate",
            description: "1280x720, 60fps Gaming",
            video: {
                codec: "libx264",
                width: 1280,
                height: 720,
                bitrate: "4500k",
                preset: "veryfast",
                profile: "main",
                fps: 60,
                tune: "zerolatency"
            },
            audio: {
                codec: "aac",
                bitrate: "192k",
                channels: 2,
                sample_rate: 48000
            }
        }
    },

    // HEVC/H.265 profiles
    hevc: {
        hevc_4k_efficient: {
            name: "HEVC 4K Efficient",
            description: "3840x2160, H.265 High efficiency",
            video: {
                codec: "libx265",
                width: 3840,
                height: 2160,
                bitrate: "8000k",
                preset: "medium",
                profile: "main",
                level: "5.1"
            },
            audio: {
                codec: "aac",
                bitrate: "256k",
                channels: 2
            }
        },
        
        hevc_1080p_balanced: {
            name: "HEVC 1080p Balanced",
            description: "1920x1080, H.265 Balanced",
            video: {
                codec: "libx265",
                width: 1920,
                height: 1080,
                bitrate: "2500k",
                preset: "medium",
                profile: "main",
                level: "4.0"
            },
            audio: {
                codec: "aac",
                bitrate: "192k",
                channels: 2
            }
        }
    }
};
