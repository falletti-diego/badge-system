/**
 * Notifications Routes
 * GET /api/notifications       - Employee's notifications (polling)
 * PUT /api/notifications/read-all - Mark all as read
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// =====================================================
// GET /api/notifications — Employee's notifications
// =====================================================

router.get('/', requireAuth, async (req, res, next) => {
  const userEmployeeId = req.user.employee_id;

  try {
    // Only employees receive notifications; managers/admins get empty list
    if (!userEmployeeId) {
      return res.json({ data: [], unread_count: 0 });
    }

    const result = await pool.query(
      `SELECT id, type, message, shift_date, new_shift, read, created_at
       FROM notifications
       WHERE employee_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 20`,
      [userEmployeeId]
    );

    const unreadCount = result.rows.filter(n => !n.read).length;

    logger.debug({ action: 'notifications_fetched', employee_id: userEmployeeId, count: result.rows.length });

    res.json({ data: result.rows, unread_count: unreadCount });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// PUT /api/notifications/read-all — Mark all as read
// IMPORTANT: Must be defined BEFORE /:id to avoid being matched as an ID
// =====================================================

router.put('/read-all', requireAuth, async (req, res, next) => {
  const userEmployeeId = req.user.employee_id;

  try {
    if (!userEmployeeId) {
      return res.json({ success: true, updated: 0 });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET read = true
       WHERE employee_id = $1::uuid AND read = false`,
      [userEmployeeId]
    );

    logger.info({ action: 'notifications_marked_read', employee_id: userEmployeeId, updated: result.rowCount });

    res.json({ success: true, updated: result.rowCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
