/**
 * summarization.service.js
 *
 * High-performance summarization powered by Google Gemini (@google/genai).
 * Uses gemini-3.8-flash with structured JSON responseSchema.
 * Extracts: title, overview, keyPoints, takeaways, tips, resources, roadmap.
 */

import { GoogleGenAI, Type } from '@google/genai';
import logger from '../utils/logger.js';

let _aiClient = null;

function getGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.warn('[summarization.service] GEMINI_API_KEY not set.');
        return null;
    }
    if (!_aiClient) {
        _aiClient = new GoogleGenAI({
            apiKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build',
                },
            },
        });
        logger.info('[summarization.service] GoogleGenAI client initialized.');
    }
    return _aiClient;
}

const summaryResponseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: 'Concise, clear video title' },
        overview: { type: Type.STRING, description: '3 to 5 sentence summary overview' },
        keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '6 to 10 key bullet points',
        },
        takeaways: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 5 actionable takeaways',
        },
        tips: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 6 practical speaker tips, pro-tips, and best practices shared in the video',
        },
        resources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 6 suggested tools, websites, platforms, books, or resource links mentioned by the speaker',
        },
        roadmap: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 6 sequential roadmap milestones, learning phases, or step-by-step progression guides',
        },
    },
    required: ['title', 'overview', 'keyPoints', 'takeaways', 'tips', 'resources', 'roadmap'],
};

/**
 * Fast single-pass holistic summarization for transcripts up to 80k characters.
 */
export async function summarizeTranscriptHolistic({ transcript, videoTitle = '', url = '' }) {
    const ai = getGemini();
    if (!ai) {
        return createFallbackSummary(videoTitle, '');
    }

    const prompt = `You are an expert video content analyst and summarizer.
Analyze this complete YouTube video transcript and produce a comprehensive, structured summary:

${videoTitle ? `Video Title: "${videoTitle}"\n` : ''}
${url ? `Video URL: ${url}\n` : ''}

Full Transcript:
${transcript.slice(0, 75000)}

Generate a structured response according to these exact constraints:
1. title: A clear, engaging title representing the video content.
2. overview: A rich, thorough overview of 3 to 5 sentences explaining the video's core premise, narrative, and importance.
3. keyPoints: 6 to 10 distinct, informative key takeaways/points discussed in the video.
4. takeaways: 3 to 5 actionable insights or conclusions for the viewer.
5. tips: 3 to 6 practical tips, pro-tips, tricks, or best practices specifically shared or emphasized by the speaker.
6. resources: 2 to 6 websites, tools, apps, platforms, books, courses, or reference links mentioned or recommended by the speaker (if not explicitly named, include the primary tools/platforms central to the discussion).
7. roadmap: 3 to 6 sequential roadmap phases, learning steps, or implementation milestones outlined or advised by the speaker.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: summaryResponseSchema,
            },
        });

        const text = response.text?.trim();
        if (text) {
            const parsed = JSON.parse(text);
            return {
                title: parsed.title || videoTitle || 'Video Summary',
                overview: parsed.overview || '',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
                tips: Array.isArray(parsed.tips) ? parsed.tips : [],
                resources: Array.isArray(parsed.resources) ? parsed.resources : [],
                roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap : [],
            };
        }
    } catch (err) {
        logger.error(`[summarization.service] Holistic Gemini summarization error: ${err.message}`);
    }

    return createFallbackSummary(videoTitle, '');
}

/**
 * MAP step: Summarize a single chunk into bullet points.
 */
export async function summarizeChunk(chunk, index) {
    const ai = getGemini();

    if (!ai) {
        const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
        return sentences.slice(0, 3).map((s) => `• ${s}`).join('\n');
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Extract the essential key points, tips, resources, and roadmap steps from this transcript excerpt. Return concise bullet points (•).\n\nExcerpt:\n${chunk}`,
        });
        return response.text?.trim() || '';
    } catch (err) {
        logger.warn(`[summarization.service] MAP chunk ${index + 1} Gemini error: ${err.message}`);
        const sentences = chunk.split(/(?<=[.!?])\s+/).filter(Boolean);
        return sentences.slice(0, 3).map((s) => `• ${s}`).join('\n');
    }
}

/**
 * Runs MAP over chunks in batches.
 */
export async function mapSummarize(chunks) {
    if (!chunks || chunks.length === 0) return [];
    const CONCURRENCY = 3;
    const results = new Array(chunks.length);

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map((chunk, idx) => summarizeChunk(chunk, i + idx))
        );
        batchResults.forEach((r, idx) => {
            results[i + idx] = r;
        });
    }

    return results;
}

/**
 * REDUCE step: Combines chunk summaries into structured final output.
 */
export async function reduceSummarize(chunkSummaries, videoTitle = '', videoContext = '') {
    const ai = getGemini();
    const bullets = chunkSummaries.filter(Boolean).join('\n\n');

    if (!ai) {
        return createFallbackSummary(videoTitle, bullets);
    }

    const prompt = `You are an expert video content summarizer.
Produce a comprehensive, insightful summary of this YouTube video based on the following content:

${videoTitle ? `Video Title: "${videoTitle}"\n\n` : ''}
${videoContext ? `Context / Excerpt: ${videoContext}\n\n` : ''}
${bullets ? `Key Excerpts from video:\n${bullets}\n\n` : ''}

Generate:
1. title: A clear, engaging title representing the video content.
2. overview: A rich, thorough overview of 3 to 5 sentences explaining the video's core premise, narrative, and importance.
3. keyPoints: 6 to 10 distinct, informative key takeaways/points discussed in the video.
4. takeaways: 3 to 5 actionable insights or conclusions for the viewer.
5. tips: 3 to 6 practical tips, pro-tips, tricks, or best practices specifically shared or emphasized by the speaker.
6. resources: 2 to 6 websites, tools, apps, platforms, books, courses, or reference links mentioned or recommended by the speaker.
7. roadmap: 3 to 6 sequential roadmap phases, learning steps, or implementation milestones outlined or advised by the speaker.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: summaryResponseSchema,
            },
        });

        const text = response.text?.trim();
        if (text) {
            const parsed = JSON.parse(text);
            return {
                title: parsed.title || videoTitle || 'Video Summary',
                overview: parsed.overview || '',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
                tips: Array.isArray(parsed.tips) ? parsed.tips : [],
                resources: Array.isArray(parsed.resources) ? parsed.resources : [],
                roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap : [],
            };
        }
    } catch (err) {
        logger.error(`[summarization.service] REDUCE Gemini error: ${err.message}`);
    }

    return createFallbackSummary(videoTitle, bullets);
}

/**
 * Direct summarization when transcript is short or unavailable.
 */
export async function summarizeDirectly({ videoTitle, url, videoId }) {
    const ai = getGemini();
    if (!ai) {
        return createFallbackSummary(videoTitle, '');
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Summarize the YouTube video titled "${videoTitle}" (${url}).
Provide an accurate, high quality summary including overview, key points, takeaways, speaker tips, suggested resources, and roadmap milestones based on the video content.`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: summaryResponseSchema,
            },
        });

        const text = response.text?.trim();
        if (text) {
            const parsed = JSON.parse(text);
            return {
                title: parsed.title || videoTitle || 'Video Summary',
                overview: parsed.overview || '',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
                tips: Array.isArray(parsed.tips) ? parsed.tips : [],
                resources: Array.isArray(parsed.resources) ? parsed.resources : [],
                roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap : [],
            };
        }
    } catch (err) {
        logger.error(`[summarization.service] Direct Gemini summarization error: ${err.message}`);
    }

    return createFallbackSummary(videoTitle, '');
}

function createFallbackSummary(videoTitle, bullets) {
    const rawLines = bullets
        .split('\n')
        .map((l) => l.replace(/^•\s*/, '').trim())
        .filter(Boolean);

    return {
        title: videoTitle || 'Video Summary',
        overview: `This video covers key concepts regarding "${videoTitle}". It provides insights and discussions relevant to viewers interested in this subject.`,
        keyPoints: rawLines.length > 0
            ? rawLines.slice(0, 8)
            : [
                `Core topic analysis for "${videoTitle}".`,
                'Important themes and concepts presented throughout the video.',
                'Key explanations and demonstrations provided by the creator.',
                'Practical applications and discussions of the primary topic.',
            ],
        takeaways: [
            `Clear understanding of the main message behind "${videoTitle}".`,
            'Actionable insights that can be referenced or applied directly.',
            'Key perspectives shared to broaden knowledge on the subject.',
        ],
        tips: [
            'Follow the practical demonstration steps outlined by the speaker.',
            'Experiment with the core techniques presented to build familiarity.',
            'Apply the recommended best practices to avoid common pitfalls.',
        ],
        resources: [
            'Official documentation and tutorials for the discussed technologies.',
            'Recommended developer tools, repositories, and learning platforms.',
            'Community forums and references highlighted in the video.',
        ],
        roadmap: [
            'Step 1: Understand the foundational concepts and requirements.',
            'Step 2: Set up your environment and follow along with the examples.',
            'Step 3: Practice by building a mini-project applying the core techniques.',
            'Step 4: Explore advanced features and integrate with existing workflows.',
        ],
    };
}