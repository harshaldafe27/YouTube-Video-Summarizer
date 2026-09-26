/**
 * MongoDB Atlas connection via Mongoose.
 * If MONGODB_URI is not configured or offline, logs a warning and falls back to in-memory storage.
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        logger.warn('[db] MONGODB_URI not configured — running with in-memory storage fallback.');
        return;
    }

    mongoose.connection.on('connected', () =>
        logger.info('[db] MongoDB connected.')
    );
    mongoose.connection.on('error', (err) =>
        logger.error(`[db] MongoDB connection error: ${err.message}`)
    );
    mongoose.connection.on('disconnected', () =>
        logger.warn('[db] MongoDB disconnected.')
    );

    try {
        mongoose.set('bufferCommands', false); // Fail fast, don't hang requests
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 15000,
            connectTimeoutMS: 5000,
        });
        logger.info('[db] MongoDB connected successfully.');
    } catch (err) {
        logger.warn(`[db] Could not connect to MongoDB: ${err.message}. Running with in-memory storage.`);
    }
}