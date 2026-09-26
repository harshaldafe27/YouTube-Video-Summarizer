/**
 * video.service.js
 *
 * Handles video metadata retrieval and audio processing.
 * Upgraded to use YouTube oEmbed for instant, binary-free title fetching.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { extractVideoId } from '../utils/youtube.js';

const execFileAsync = promisify(execFile);

function getYtdlpPath() {
    return process.env.YTDLP_PATH || 'yt-dlp';
}

function getFfmpegPath() {
    return process.env.FFMPEG_PATH || 'ffmpeg';
}

function getTempDir() {
    return process.env.TEMP_DIR || './tmp';
}

function ensureTempDir() {
    const dir = getTempDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Fetches the video title using YouTube's oEmbed API (fast, HTTP-based, no binaries needed).
 * Falls back to yt-dlp or video ID.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchVideoTitle(url) {
    const videoId = extractVideoId(url);

    // 1. Try YouTube oEmbed API
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const res = await fetch(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.title) {
                logger.info(`[video.service] oEmbed title found: "${data.title}"`);
                return data.title.trim();
            }
        }
    } catch (err) {
        logger.warn(`[video.service] oEmbed fetch failed: ${err.message}`);
    }

    // 2. Try HTML scraping fallback
    try {
        const htmlRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(6000),
        });
        if (htmlRes.ok) {
            const html = await htmlRes.text();
            const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
                || html.match(/<title>([^<]+)<\/title>/i);
            if (ogTitleMatch && ogTitleMatch[1]) {
                const title = ogTitleMatch[1].replace(/ - YouTube$/, '').trim();
                logger.info(`[video.service] HTML title found: "${title}"`);
                return title;
            }
        }
    } catch (err) {
        logger.warn(`[video.service] HTML title fetch failed: ${err.message}`);
    }

    // 3. Fallback to yt-dlp if installed
    try {
        const { stdout } = await execFileAsync(
            getYtdlpPath(),
            ['--get-title', '--no-warnings', '--quiet', url],
            { timeout: 10000 }
        );
        if (stdout && stdout.trim()) {
            return stdout.trim();
        }
    } catch {
        // ignore
    }

    return `YouTube Video (${videoId || 'Unknown'})`;
}

/**
 * Downloads audio using yt-dlp if available.
 */
export async function downloadAudio(videoId, url) {
    ensureTempDir();
    const YTDLP_PATH = getYtdlpPath();
    const TEMP_DIR = getTempDir();
    const outputTemplate = path.join(TEMP_DIR, `${videoId}.%(ext)s`);

    const args = [
        url,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--output', outputTemplate,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
    ];

    try {
        await execFileAsync(YTDLP_PATH, args, { timeout: 120000 });
        const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(videoId));
        if (files.length > 0) {
            return path.join(TEMP_DIR, files[0]);
        }
    } catch (err) {
        logger.warn(`[video.service] yt-dlp audio download skipped: ${err.message}`);
    }
    return null;
}

/**
 * Normalises audio to 16 kHz mono WAV using FFmpeg if available.
 */
export async function normaliseAudio(inputPath, videoId) {
    if (!inputPath || !fs.existsSync(inputPath)) return null;

    ensureTempDir();
    const FFMPEG_PATH = getFfmpegPath();
    const outputPath = path.join(getTempDir(), `${videoId}_norm.wav`);

    const args = [
        '-y',
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        outputPath,
    ];

    try {
        await execFileAsync(FFMPEG_PATH, args, { timeout: 120000 });
        return outputPath;
    } catch (err) {
        logger.warn(`[video.service] FFmpeg normalisation skipped: ${err.message}`);
        return null;
    }
}

export function deleteFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        logger.warn(`[video.service] Could not delete ${filePath}: ${err.message}`);
    }
}