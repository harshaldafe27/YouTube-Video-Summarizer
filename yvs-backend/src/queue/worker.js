import {
    fileURLToPath
} from 'url';
import {
    dirname,
    resolve
} from 'path';
import {
    config
} from 'dotenv';

// Load .env from yvs-backend/ regardless of where the process is started from
const __dirname = dirname(fileURLToPath(
    import.meta.url));
const envPath = resolve(__dirname, '../../.env');
console.log(`[worker] Loading .env from: ${envPath}`);
config({
    path: envPath
});
console.log(`[worker] SUMMARIZATION_BACKEND after load: ${process.env.SUMMARIZATION_BACKEND}`);

import {
    Worker
} from 'bullmq';
import mongoose from 'mongoose';

import {
    getRedisOptions
} from '../config/redis.js';
import {
    connectDB
} from '../config/db.js';
import {
    QUEUE_NAME
} from './queue.js';
import Video from '../models/Video.js';
import {
    downloadAudio,
    normaliseAudio,
    deleteFile,
    fetchVideoTitle
}
    from '../services/video.service.js';
import {
    transcribeAudio
} from '../services/transcription.service.js';
import {
    mapSummarize,
    reduceSummarize
}
    from '../services/summarization.service.js';
import {
    chunkTranscript
} from '../utils/chunker.js';
import logger from '../utils/logger.js';

/* ── Connect to DB before processing any jobs ───────────────────────────── */
await connectDB();
if (mongoose.connection.readyState === 1) {
    logger.info('[worker] Connected to MongoDB. Worker is ready.');
} else {
    logger.info('[worker] In-memory storage active. Worker is ready.');
}
logger.info(`[worker] SUMMARIZATION_BACKEND = ${process.env.SUMMARIZATION_BACKEND}`);
logger.info(`[worker] OLLAMA_HOST = ${process.env.OLLAMA_HOST || 'http://localhost:11434'}`);

/* ── Worker ─────────────────────────────────────────────────────────────── */
const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
        const {
            videoId,
            url
        } = job.data;
        logger.info(`[worker] ▶ Job ${job.id} started — videoId: ${videoId}`);

        let rawAudioPath = null;
        let normAudioPath = null;

        try {
            // ── Step 1: Title ──────────────────────────────────────────────────
            logger.info(`[worker] Step 1/7: Fetching title`);
            await job.updateProgress(5);
            const title = await fetchVideoTitle(url);
            await Video.findOneAndUpdate({
                videoId
            }, {
                title
            });
            logger.info(`[worker] Step 1 done — title: "${title}"`);

            // ── Step 2: Download audio ─────────────────────────────────────────
            logger.info(`[worker] Step 2/7: Downloading audio`);
            await job.updateProgress(10);
            rawAudioPath = await downloadAudio(videoId, url);
            logger.info(`[worker] Step 2 done — file: ${rawAudioPath}`);

            // ── Step 3: Normalise audio ────────────────────────────────────────
            logger.info(`[worker] Step 3/7: Normalising audio`);
            await job.updateProgress(25);
            normAudioPath = await normaliseAudio(rawAudioPath, videoId);
            deleteFile(rawAudioPath);
            rawAudioPath = null;
            logger.info(`[worker] Step 3 done — normalised: ${normAudioPath}`);

            // ── Step 4: Transcribe ─────────────────────────────────────────────
            logger.info(`[worker] Step 4/7: Transcribing audio`);
            await job.updateProgress(40);
            let transcript;
            try {
                transcript = await transcribeAudio(normAudioPath);
                logger.info(`[worker] Transcription successful, length: ${transcript.length} chars`);
            } catch (transcribeErr) {
                logger.error(`[worker] Transcription failed: ${transcribeErr.message}`);
                logger.error(`[worker] Transcription error stack:`, transcribeErr);
                throw transcribeErr;
            }
            deleteFile(normAudioPath);
            normAudioPath = null;
            await Video.findOneAndUpdate({
                videoId
            }, {
                transcript
            });
            logger.info(`[worker] Step 4 done — transcript length: ${transcript.length} chars`);

            // ── Step 5: Chunk ──────────────────────────────────────────────────
            logger.info(`[worker] Step 5/7: Chunking transcript`);
            await job.updateProgress(55);
            const chunks = chunkTranscript(transcript);
            await Video.findOneAndUpdate({
                videoId
            }, {
                chunks
            });
            logger.info(`[worker] Step 5 done — ${chunks.length} chunks`);

            // ── Step 6: MAP summarize ──────────────────────────────────────────
            logger.info(`[worker] Step 6/7: MAP summarizing ${chunks.length} chunks`);
            await job.updateProgress(60);
            const chunkSummaries = await mapSummarize(chunks);
            await Video.findOneAndUpdate({
                videoId
            }, {
                chunkSummaries
            });
            logger.info(`[worker] Step 6 done`);

            // ── Step 7: REDUCE summarize ───────────────────────────────────────
            logger.info(`[worker] Step 7/7: REDUCE — building final summary`);
            await job.updateProgress(85);
            const summary = await reduceSummarize(chunkSummaries, title);
            await job.updateProgress(100);
            await Video.findOneAndUpdate({
                videoId
            }, {
                summary,
                status: 'completed',
                errorMessage: null
            });
            logger.info(`[worker] ✓ Job ${job.id} completed successfully`);
            return {
                videoId,
                status: 'completed'
            };

        } catch (err) {
            // Print full error details so we can diagnose exactly which step failed
            logger.error(`[worker] ✗ Job ${job.id} FAILED at message: ${err.message}`);
            logger.error(`[worker] ✗ Error name: ${err.name}`);
            logger.error(`[worker] ✗ Stack: ${err.stack}`);

            if (rawAudioPath) deleteFile(rawAudioPath);
            if (normAudioPath) deleteFile(normAudioPath);

            await Video.findOneAndUpdate({
                videoId
            }, {
                status: 'failed',
                errorMessage: err.message
            }).catch(() => { });

            throw err;
        }
    }, {
    connection: getRedisOptions(),
    concurrency: 2,
    // Increase lock settings for long-running transcription jobs
    lockDuration: 600000, // 10 minutes (600,000 ms)
    stalledInterval: 300000, // 5 minutes (300,000 ms)
}
);

/* ── Worker event listeners ─────────────────────────────────────────────── */
worker.on('completed', (job) => {
    logger.info(`[worker] ✓ Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
    const id = job && job.id;
    const attempts = job && job.attemptsMade;
    logger.error(`[worker] ✗ Job ${id} failed (attempt ${attempts}): ${err.message}`);
    logger.error(`[worker] ✗ Error details:`, err);
});

worker.on('error', (err) => {
    logger.error(`[worker] Worker error: ${err.message}`);
    logger.error(`[worker] Worker error stack: ${err.stack}`);
});

// Add event listeners for connection issues
worker.on('connectionError', (err) => {
    logger.error(`[worker] Redis connection error: ${err.message}`);
});

worker.on('ioredis:close', () => {
    logger.warn(`[worker] Redis connection closed`);
});

worker.on('ioredis:reconnecting', (ms) => {
    logger.warn(`[worker] Redis reconnecting in ${ms}ms`);
});

/* ── Graceful shutdown ──────────────────────────────────────────────────── */
async function shutdown(signal) {
    logger.info(`[worker] Received ${signal}. Shutting down gracefully...`);
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));