import { Router } from 'express';
import { wsService } from '../services/websocketService.js';

const router = Router();

/**
 * @route GET /api/history
 * @desc Retrieves historical event logs
 */
router.get('/history', (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const data = wsService.getHistory(limit);
        
        res.json({
            status: 'success',
            data
        });
    } catch (error) {
        next(error);
    }
});

export default router;
