import { execFile } from 'child_process';
import path from 'path';

// --- Types ---

export interface MediaInfo {
    resolution: string | null;      // e.g. "2160p", "1080p", "720p", "480p"
    videoCodec: string | null;      // e.g. "HEVC", "H.264", "AV1", "VP9"
    audioCodec: string | null;      // e.g. "AAC", "DTS", "TrueHD", "EAC3", "AC3"
    audioChannels: string | null;   // e.g. "7.1", "5.1", "2.0"
    isHDR: boolean;
    bitrate: number | null;         // in Mbps
    duration: number | null;        // in seconds
    fileSize: number | null;        // in bytes
}

// --- Codec Label Maps ---

const VIDEO_CODEC_MAP: Record<string, string> = {
    'hevc': 'HEVC', 'h265': 'HEVC', 'hev1': 'HEVC',
    'h264': 'H.264', 'avc1': 'H.264', 'avc': 'H.264',
    'av1': 'AV1', 'av01': 'AV1',
    'vp9': 'VP9', 'vp09': 'VP9',
    'vp8': 'VP8',
    'mpeg4': 'MPEG-4', 'mpeg2video': 'MPEG-2',
    'wmv3': 'WMV', 'vc1': 'VC-1',
};

const AUDIO_CODEC_MAP: Record<string, string> = {
    'aac': 'AAC', 'mp3': 'MP3', 'ac3': 'AC3', 'eac3': 'EAC3',
    'dts': 'DTS', 'dca': 'DTS',
    'truehd': 'TrueHD', 'mlp': 'TrueHD',
    'flac': 'FLAC', 'opus': 'Opus', 'vorbis': 'Vorbis',
    'pcm_s16le': 'PCM', 'pcm_s24le': 'PCM', 'pcm_s32le': 'PCM',
    'wmav2': 'WMA',
};

// --- Resolution Helper ---

function getResolutionLabel(width: number, height: number): string {
    // Use the larger dimension to handle widescreen (e.g. 1920x800) correctly
    // Width is more reliable for aspect ratios like 2.40:1 where height is misleadingly low
    if (width >= 3200 || height >= 1800) return '2160p';
    if (width >= 1800 || height >= 900) return '1080p';
    if (width >= 1200 || height >= 600) return '720p';
    if (width >= 640 || height >= 350) return '480p';
    return `${height}p`;
}

// --- Channel Layout Helper ---

function getChannelLabel(channels: number, layout?: string): string {
    if (layout) {
        if (layout.includes('7.1') || layout.includes('7point1')) return '7.1';
        if (layout.includes('5.1') || layout.includes('5point1')) return '5.1';
        if (layout.includes('stereo') || layout.includes('2.0')) return '2.0';
        if (layout.includes('mono') || layout.includes('1.0')) return '1.0';
    }
    // Fallback to channel count
    if (channels >= 8) return '7.1';
    if (channels >= 6) return '5.1';
    if (channels >= 2) return '2.0';
    if (channels === 1) return '1.0';
    return `${channels}ch`;
}

// --- HDR Detection ---

function detectHDRFromStreams(videoStream: any): boolean {
    // Check color_transfer for HDR indicators
    const colorTransfer = videoStream.color_transfer || '';
    const colorPrimaries = videoStream.color_primaries || '';

    // HDR10: SMPTE ST 2084 PQ transfer
    if (colorTransfer === 'smpte2084') return true;
    // HLG: ARIB STD-B67
    if (colorTransfer === 'arib-std-b67') return true;
    // BT.2020 color primaries (usually HDR)
    if (colorPrimaries === 'bt2020') return true;

    // Check side_data for Dolby Vision or HDR10+
    const sideData = videoStream.side_data_list || [];
    for (const sd of sideData) {
        const type = (sd.side_data_type || '').toLowerCase();
        if (type.includes('dolby vision') || type.includes('dovi')) return true;
        if (type.includes('hdr10+') || type.includes('hdr10plus')) return true;
        if (type.includes('mastering display')) return true;
        if (type.includes('content light level')) return true;
    }

    return false;
}

// --- FFprobe Runner ---

function findFFprobe(): string {
    // Check common locations on Windows
    const commonPaths = [
        'C:\\ffmpeg\\ffprobe.exe',
        'C:\\ffmpeg\\bin\\ffprobe.exe',
        path.join(process.cwd(), 'ffprobe.exe'),
    ];

    // Check if any of the common paths exist
    const fs = require('fs');
    for (const p of commonPaths) {
        try {
            if (fs.existsSync(p)) return p;
        } catch { /* ignore */ }
    }

    // Fall back to PATH lookup
    return 'ffprobe';
}

export async function probeFile(filePath: string): Promise<MediaInfo | null> {
    return new Promise((resolve) => {
        const ffprobe = findFFprobe();

        execFile(ffprobe, [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            filePath
        ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
            if (error) {
                console.warn(`[MediaInfo] FFprobe failed for ${path.basename(filePath)}:`, error.message);
                resolve(null);
                return;
            }

            try {
                const data = JSON.parse(stdout);
                const streams = data.streams || [];
                const format = data.format || {};

                // Find primary video and audio streams
                const videoStream = streams.find((s: any) => s.codec_type === 'video');
                const audioStream = streams.find((s: any) => s.codec_type === 'audio');

                // Resolution
                const width = videoStream?.width || videoStream?.coded_width || 0;
                const height = videoStream?.height || videoStream?.coded_height || 0;
                const resolution = (width || height) ? getResolutionLabel(width, height) : null;

                // Video codec
                const rawVideoCodec = (videoStream?.codec_name || '').toLowerCase();
                const videoCodec = VIDEO_CODEC_MAP[rawVideoCodec] || rawVideoCodec.toUpperCase() || null;

                // Audio codec
                const rawAudioCodec = (audioStream?.codec_name || '').toLowerCase();
                const audioCodec = AUDIO_CODEC_MAP[rawAudioCodec] || rawAudioCodec.toUpperCase() || null;

                // Audio channels
                const channels = audioStream?.channels || 0;
                const channelLayout = audioStream?.channel_layout || '';
                const audioChannels = channels > 0 ? getChannelLabel(channels, channelLayout) : null;

                // HDR
                const isHDR = videoStream ? detectHDRFromStreams(videoStream) : false;

                // Bitrate (from format, in bits/s → Mbps)
                const rawBitrate = parseFloat(format.bit_rate || '0');
                const bitrate = rawBitrate > 0 ? Math.round(rawBitrate / 1_000_000 * 10) / 10 : null;

                // Duration
                const rawDuration = parseFloat(format.duration || videoStream?.duration || '0');
                const duration = rawDuration > 0 ? Math.round(rawDuration) : null;

                // File size
                const fileSize = parseInt(format.size || '0') || null;

                resolve({
                    resolution,
                    videoCodec,
                    audioCodec,
                    audioChannels,
                    isHDR,
                    bitrate,
                    duration,
                    fileSize,
                });
            } catch (parseError) {
                console.warn(`[MediaInfo] Failed to parse FFprobe output for ${path.basename(filePath)}`);
                resolve(null);
            }
        });
    });
}
