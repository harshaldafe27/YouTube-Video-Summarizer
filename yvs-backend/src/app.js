/**
 * Express application factory.
 */

import express from 'express';
import cors from 'cors';
import summarizeRoutes from './routes/summarize.routes.js';
import healthRoutes from './routes/health.routes.js';
import logger from './utils/logger.js';

export function createApp() {
    const app = express();

    /* ── CORS ─────────────────────────────────────────────────────────────── */
    app.use(cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    /* ── Body parsing ─────────────────────────────────────────────────────── */
    app.use(express.json({ limit: '5mb' }));
    app.use(express.urlencoded({ extended: false }));

    /* ── Request logging (dev only) ───────────────────────────────────────── */
    if (process.env.NODE_ENV !== 'production') {
        app.use((req, _res, next) => {
            if (req.path.startsWith('/api')) {
                logger.info(`→ ${req.method} ${req.path}`);
            }
            next();
        });
    }

    /* ── Routes ───────────────────────────────────────────────────────────── */
    app.use('/api', summarizeRoutes);
    app.use('/api', healthRoutes);

    /* ── 404 handler for unmatched /api routes ────────────────────────────── */
    app.use('/api', (req, res) => {
        res.status(404).json({
            success: false,
            errors: [`API route ${req.method} ${req.path} not found.`]
        });
    });

    /* ── Global error handler ─────────────────────────────────────────────── */
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
        logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
        if (req.path.startsWith('/api')) {
            return res.status(500).json({
                success: false,
                errors: [err.message || 'Internal server error.']
            });
        }
        res.status(500).send('Internal Server Error');
    });

    return app;
}