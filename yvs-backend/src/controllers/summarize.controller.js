/**
 * summarize.controller.js
 *
 * Handles video submission and result polling.
 * Operates with an in-process background job runner without requiring BullMQ or Redis.
 */

import { validationResult } from 'express-validator';
import Video from '../models/Video.js';
import { extractVideoId, canonicalUrl } from '../utils/youtube.js';
import { fetchVideoTitle } from '../services/video.service.js';
import { fetchTranscript } from '../services/transcription.service.js';
import { chunkTranscript } from '../utils/chunker.js';
import { mapSummarize, reduceSummarize, summarizeDirectly } from '../services/summarization.service.js';
import logger from '../utils/logger.js';

/**
 * Background processor for video summarization.
 */
async function processVideoJob({ videoId, url, jobId }) {
    logger.info(`[pipeline] Starting job ${jobId} for video: ${videoId}`);
    try {
        // Step 1: Title (progress 10)
        await Video.findOneAndUpdate({ jobId }, { progress: 10 });
        const title = await fetchVideoTitle(url);
        await Video.findOneAndUpdate({ jobId }, { title, progress: 25 });
        logger.info(`[pipeline] Video title: "${title}"`);

        // Step 2: Fetch Transcript (progress 40)
        await Video.findOneAndUpdate({ jobId }, { progress: 40 });
        const transcript = await fetchTranscript(videoId);

        let summary;
        if (transcript && transcript.trim().length > 40) {
            await Video.findOneAndUpdate({ jobId }, { transcript, progress: 55 });

            // Step 3: Chunk transcript (progress 65)
            const chunks = chunkTranscript(transcript);
            await Video.findOneAndUpdate({ jobId }, { chunks, progress: 65 });

            // Step 4: Map summarize (progress 85)
            logger.info(`[pipeline] Summarizing ${chunks.length} chunks...`);
            const chunkSummaries = await mapSummarize(chunks);
            await Video.findOneAndUpdate({ jobId }, { chunkSummaries, progress: 85 });

            // Step 5: Reduce summarize (progress 100)
            logger.info('[pipeline] Synthesizing final structured summary...');
            summary = await reduceSummarize(chunkSummaries, title, transcript.slice(0, 800));
        } else {
            // Direct Gemini video summarization fallback
            await Video.findOneAndUpdate({ jobId }, { progress: 70 });
            logger.info(`[pipeline] Generating direct AI summary for: ${title}`);
            summary = await summarizeDirectly({ videoTitle: title, url, videoId });
        }

        // Job completed
        await Video.findOneAndUpdate({ jobId }, {
            summary,
            status: 'completed',
            progress: 100,
            errorMessage: null,
        });
        logger.info(`[pipeline] ✓ Job ${jobId} finished successfully!`);
    } catch (err) {
        logger.error(`[pipeline] ✗ Job ${jobId} failed: ${err.message}`, { stack: err.stack });
        await Video.findOneAndUpdate({ jobId }, {
            status: 'failed',
            errorMessage: err.message || 'Processing failed. Please try again.',
        });
    }
}

/* ── POST /summarize ────────────────────────────────────────────────────── */

export async function submitSummarize(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map((e) => e.msg),
        });
    }

    const { youtube_url } = req.body;
    const videoId = extractVideoId(youtube_url);
    if (!videoId) {
        return res.status(400).json({
            success: false,
            errors: ['Invalid YouTube URL. Could not extract video ID.'],
        });
    }

    const url = canonicalUrl(videoId);

    try {
        const existing = await Video.findOne({ videoId });

        if (existing) {
            if (existing.status === 'completed') {
                logger.info(`[summarize.controller] Cache hit for videoId: ${videoId}`);
                return res.status(200).json({
                    success: true,
                    cached: true,
                    jobId: existing.jobId,
                    status: 'completed',
                    summary: existing.summary,
                    title: existing.title,
                });
            }

            if (existing.status === 'processing') {
                return res.status(202).json({
                    success: true,
                    cached: true,
                    jobId: existing.jobId,
                    status: 'processing',
                    message: 'This video is already being processed.',
                });
            }

            // If failed, clear and allow re-processing
            logger.info(`[summarize.controller] Retrying failed videoId: ${videoId}`);
            await Video.deleteOne({ videoId });
        }

        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const videoDoc = await Video.create({
            url,
            videoId,
            status: 'processing',
            progress: 5,
            jobId,
        });

        // Trigger processing asynchronously in the background
        setImmediate(() => {
            processVideoJob({ videoId, url, jobId });
        });

        logger.info(`[summarize.controller] Job ${jobId} started for videoId: ${videoId}`);

        return res.status(202).json({
            success: true,
            cached: false,
            jobId,
            status: 'processing',
            message: 'Video is being processed. Poll GET /result/:jobId for updates.',
        });
    } catch (err) {
        logger.error(`[summarize.controller] submitSummarize error: ${err.message}`);
        return res.status(500).json({
            success: false,
            errors: ['Internal server error. Please try again.'],
        });
    }
}

/* ── GET /result/:jobId ─────────────────────────────────────────────────── */

export async function getResult(req, res) {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({
            success: false,
            errors: ['Invalid jobId.'],
        });
    }

    try {
        const video = await Video.findOne({ jobId });

        if (!video) {
            return res.status(404).json({
                success: false,
                errors: [`No job found with id "${jobId}".`],
            });
        }

        const base = {
            success: true,
            jobId,
            status: video.status,
            videoId: video.videoId,
            title: video.title,
            url: video.url,
            createdAt: video.createdAt,
            updatedAt: video.updatedAt,
        };

        if (video.status === 'completed') {
            return res.status(200).json({
                ...base,
                summary: video.summary,
            });
        }

        if (video.status === 'failed') {
            return res.status(200).json({
                ...base,
                errorMessage: video.errorMessage || 'Processing failed.',
            });
        }

        // Still processing
        return res.status(202).json({
            ...base,
            progress: typeof video.progress === 'number' ? video.progress : 15,
        });
    } catch (err) {
        logger.error(`[summarize.controller] getResult error: ${err.message}`);
        return res.status(500).json({
            success: false,
            errors: ['Internal server error.'],
        });
    }
}