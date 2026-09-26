/**
 * Video document schema with seamless in-memory fallback.
 * Operates on MongoDB if connected, or memory store if offline.
 */

import mongoose from 'mongoose';

const summarySchema = new mongoose.Schema({
    title: {
        type: String,
        default: ''
    },
    overview: {
        type: String,
        default: ''
    },
    keyPoints: {
        type: [String],
        default: []
    },
    takeaways: {
        type: [String],
        default: []
    },
}, {
    _id: false
});

const videoSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
        trim: true,
    },
    videoId: {
        type: String,
        required: true,
        trim: true,
    },
    title: {
        type: String,
        default: '',
    },
    transcript: {
        type: String,
        default: '',
    },
    chunks: {
        type: [String],
        default: [],
    },
    chunkSummaries: {
        type: [String],
        default: [],
    },
    summary: {
        type: summarySchema,
        default: () => ({}),
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing',
    },
    progress: {
        type: Number,
        default: 0,
    },
    errorMessage: {
        type: String,
        default: null,
    },
    jobId: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

videoSchema.index({
    url: 1
}, {
    unique: true
});
videoSchema.index({
    jobId: 1
});

const MongooseVideo = mongoose.model('Video', videoSchema);

// In-memory store fallback
const inMemoryStore = new Map();

function isMongooseConnected() {
    return mongoose.connection.readyState === 1;
}

const Video = {
    async findOne(query) {
        if (isMongooseConnected()) {
            try {
                return await MongooseVideo.findOne(query);
            } catch {
                // fall back to memory
            }
        }
        for (const doc of inMemoryStore.values()) {
            let match = true;
            for (const [k, v] of Object.entries(query)) {
                if (doc[k] !== v) {
                    match = false;
                    break;
                }
            }
            if (match) return doc;
        }
        return null;
    },

    async create(data) {
        if (isMongooseConnected()) {
            try {
                return await MongooseVideo.create(data);
            } catch {
                // fall back to memory
            }
        }
        const doc = {
            _id: 'vid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            url: data.url,
            videoId: data.videoId,
            title: data.title || '',
            transcript: data.transcript || '',
            chunks: data.chunks || [],
            chunkSummaries: data.chunkSummaries || [],
            summary: data.summary || { title: '', overview: '', keyPoints: [], takeaways: [] },
            status: data.status || 'processing',
            progress: data.progress || 0,
            errorMessage: data.errorMessage || null,
            jobId: data.jobId || null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        inMemoryStore.set(doc.videoId, doc);
        return doc;
    },

    async findByIdAndUpdate(id, updates) {
        if (isMongooseConnected()) {
            try {
                return await MongooseVideo.findByIdAndUpdate(id, updates, { new: true });
            } catch {
                // fall back to memory
            }
        }
        for (const doc of inMemoryStore.values()) {
            if (doc._id === id || doc.jobId === id) {
                Object.assign(doc, updates, { updatedAt: new Date() });
                return doc;
            }
        }
        return null;
    },

    async findOneAndUpdate(query, updates) {
        if (isMongooseConnected()) {
            try {
                return await MongooseVideo.findOneAndUpdate(query, updates, { new: true });
            } catch {
                // fall back to memory
            }
        }
        const doc = await this.findOne(query);
        if (doc) {
            Object.assign(doc, updates, { updatedAt: new Date() });
            inMemoryStore.set(doc.videoId, doc);
            return doc;
        }
        return null;
    },

    async deleteOne(query) {
        if (isMongooseConnected()) {
            try {
                return await MongooseVideo.deleteOne(query);
            } catch {
                // fall back to memory
            }
        }
        if (query.videoId) {
            inMemoryStore.delete(query.videoId);
        }
        return { acknowledged: true, deletedCount: 1 };
    }
};

export default Video;