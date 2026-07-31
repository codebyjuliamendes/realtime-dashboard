import { Router } from 'express';
import { wsService } from '../services/websocketService.js';
import { eventStore } from '../services/eventStore.js';

const router = Router();

/**
 * @route GET /api/history
 * @desc Retrieves historical event logs
 */
router.get('/history', (req, res, next) => {
    try {
        const { start, end, limit } = req.query;
        let data;
        
        if (start && end) {
            data = eventStore.getHistory(parseInt(start), parseInt(end));
        } else {
            data = wsService.getHistory(parseInt(limit) || 100);
        }
        
        res.json({
            status: 'success',
            data
        });
    } catch (error) {
        next(error);
    }
});

export default router;
