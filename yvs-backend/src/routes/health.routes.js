/**
 * Health check endpoint.
 * GET /api/health — used by load balancers, Docker, and uptime monitors.
 */

import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbStatus = states[dbState] !== undefined ? states[dbState] : 'in-memory';

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: dbState === 1 ? 'mongodb' : 'in-memory-fallback',
        services: {
            database: dbState === 1 ? 'connected' : 'in-memory',
        },
    });
});

export default router;