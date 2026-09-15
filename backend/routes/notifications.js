const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/notifications
 * Get notifications for current user with live unread count
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 30 } = req.query;

    const notifsRes = await db.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, parseInt(limit, 10)]
    );

    const unreadRes = await db.query(
      `SELECT COUNT(*) FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    const unreadCount = parseInt(unreadRes.rows[0].count, 10);

    return res.json({
      success: true,
      unread_count: unreadCount,
      notifications: notifsRes.rows
    });
  } catch (err) {
    console.error('[Notifications GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    return res.json({
      success: true,
      message: 'Notification marked as read.'
    });
  } catch (err) {
    console.error('[Mark Notification Read Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all user notifications as read
 */
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [userId]
    );

    return res.json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (err) {
    console.error('[Mark All Read Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to mark all as read.' });
  }
});

module.exports = router;
