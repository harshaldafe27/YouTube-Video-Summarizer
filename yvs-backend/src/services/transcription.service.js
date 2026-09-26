/**
 * transcription.service.js
 *
 * Provides transcript fetching via YouTube captions (youtube-transcript),
 * with OpenAI Whisper fallback if audio is available.
 */

import fs from 'fs';
import { YoutubeTranscript } from 'youtube-transcript';
import logger from '../utils/logger.js';

/**
 * Fetches transcript for a YouTube video.
 * Primary method: directly fetches official or auto-generated YouTube captions.
 * Secondary method: Whisper API if audio file is available and OPENAI_API_KEY is provided.
 *
 * @param {string} videoId
 * @param {string} [audioPath]
 * @returns {Promise<string|null>}
 */
export async function fetchTranscript(videoId, audioPath = null) {
    logger.info(`[transcription.service] Fetching transcript for videoId: ${videoId}`);

    // 1. Try YouTube captions via youtube-transcript
    try {
        const items = await YoutubeTranscript.fetchTranscript(videoId);
        if (items && items.length > 0) {
            const transcript = items.map((i) => i.text).join(' ');
            logger.info(`[transcription.service] YouTube captions fetched: ${transcript.length} chars`);
            return transcript;
        }
    } catch (err) {
        logger.warn(`[transcription.service] Could not fetch YouTube captions: ${err.message}`);
    }

    // 2. Fallback to OpenAI Whisper if audio file exists and key is configured
    if (audioPath && fs.existsSync(audioPath) && process.env.OPENAI_API_KEY) {
        try {
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            logger.info(`[transcription.service] Attempting OpenAI Whisper transcription...`);
            const fileStream = fs.createReadStream(audioPath);
            const response = await openai.audio.transcriptions.create({
                model: 'whisper-1',
                file: fileStream,
                response_format: 'text',
            });
            const text = typeof response === 'string' ? response : response.text;
            if (text) {
                logger.info(`[transcription.service] OpenAI transcription complete: ${text.length} chars`);
                return text;
            }
        } catch (whisperErr) {
            logger.warn(`[transcription.service] Whisper fallback failed: ${whisperErr.message}`);
        }
    }

    return null;
}

export async function transcribeAudio(audioPath) {
    if (!audioPath) return '';
    // Backward compatibility for existing callers
    return '';
}