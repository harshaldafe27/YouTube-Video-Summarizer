/**
 * MongoDB Atlas connection via Mongoose.
 * If MONGODB_URI is not configured, contains placeholders, or is unreachable,
 * gracefully falls back to in-memory storage.
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Validates whether a given URI is an actual valid connection string
 * or an unconfigured placeholder from documentation/.env.example.
 */
function isPlaceholderUri(uri) {
    if (!uri || typeof uri !== 'string') return true;
    const trimmed = uri.trim();
    if (!trimmed || trimmed === '""' || trimmed === "''") return true;

    // Check for standard placeholders
    const placeholders = [
        'YOUR_USER',
        'YOUR_PASSWORD',
        'YOUR_DB',
        'host1',
        'host2',
        'host3',
        'atlas-xxxxx',
        'username:password',
        'example.com',
    ];

    if (placeholders.some((ph) => trimmed.includes(ph))) {
        return true;
    }

    // Check for template bracket variables like <db_password>, <username>
    if (/<[^>]+>/.test(trimmed)) {
        return true;
    }

    // Must start with standard MongoDB prefixes
    if (!trimmed.startsWith('mongodb://') && !trimmed.startsWith('mongodb+srv://')) {
        return true;
    }

    return false;
}

export async function connectDB() {
    const rawUri = process.env.MONGODB_URI;

    if (!rawUri || isPlaceholderUri(rawUri)) {
        logger.info('[db] MONGODB_URI not configured or contains placeholder values — running with in-memory storage fallback.');
        return;
    }

    const uri = rawUri.trim();

    // Attach connection lifecycle handlers (using warn instead of error to avoid crashing health checks)
    mongoose.connection.on('connected', () => {
        logger.info('[db] MongoDB connected successfully.');
    });

    mongoose.connection.on('error', (err) => {
        logger.warn(`[db] MongoDB connection issue: ${err.message}. In-memory fallback is active.`);
    });

    mongoose.connection.on('disconnected', () => {
        logger.info('[db] MongoDB disconnected.');
    });

    try {
        mongoose.set('bufferCommands', false); // Fail fast, don't hang requests
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 3000,
            socketTimeoutMS: 10000,
            connectTimeoutMS: 3000,
            family: 4, // Force IPv4 to prevent spurious getaddrinfo EAI_AGAIN lookups
        });
        logger.info('[db] MongoDB connection established.');
    } catch (err) {
        logger.warn(`[db] Could not connect to MongoDB (${err.message}) — operating with in-memory storage.`);
        try {
            await mongoose.disconnect();
        } catch {
            // ignore
        }
    }
}