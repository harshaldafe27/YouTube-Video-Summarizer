/**
 * Root Server Entry Point
 * Serves Express backend API on /api and mounts Vite frontend on port 3000.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import { createApp } from './yvs-backend/src/app.js';
import { connectDB } from './yvs-backend/src/config/db.js';
import logger from './yvs-backend/src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const isDev = process.env.NODE_ENV !== 'production';

async function bootstrap() {
    // Non-blocking database initialization with in-memory fallback
    connectDB().catch((err) => {
        logger.warn(`[server] Database startup warning: ${err.message}`);
    });

    const app = createApp();

    if (isDev) {
        logger.info('[server] Mounting Vite development middleware...');
        const vite = await createViteServer({
            server: {
                middlewareMode: true,
                host: '0.0.0.0',
                port: PORT,
            },
            appType: 'spa',
            root: path.resolve(__dirname, 'yvs-frontend'),
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.resolve(distPath, 'index.html'));
        });
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
        logger.info(`YVS Server listening on http://0.0.0.0:${PORT}`);
    });

    const shutdown = async (signal) => {
        logger.info(`Received ${signal}. Shutting down...`);
        server.close(async () => {
            try {
                const mongoose = (await import('mongoose')).default;
                await mongoose.disconnect();
            } catch {
                // ignore
            }
            logger.info('Server closed cleanly.');
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
        logger.error(`Unhandled rejection: ${reason}`);
    });
}

bootstrap();
