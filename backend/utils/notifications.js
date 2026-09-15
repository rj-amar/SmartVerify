const db = require('../db/database');

/**
 * Sends a persistent notification to a user.
 * @param {object} param
 * @param {number} param.userId
 * @param {string} param.title
 * @param {string} param.message
 * @param {string} [param.type='info']
 * @param {object} [param.client]
 */
async function notifyUser({ userId, title, message, type = 'info', client = null }) {
  try {
    const runner = client || db;
    await runner.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [userId, title, message, type]
    );
  } catch (err) {
    console.error('[Notification Error]: Failed to create notification for user', userId, err.message);
  }
}

/**
 * Notifies all active administrators.
 * @param {object} param
 * @param {string} param.title
 * @param {string} param.message
 * @param {string} [param.type='warning']
 * @param {object} [param.client]
 */
async function notifyAdmins({ title, message, type = 'warning', client = null }) {
  try {
    const runner = client || db;
    const res = await runner.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`
    );
    for (const admin of res.rows) {
      await notifyUser({ userId: admin.id, title, message, type, client: runner });
    }
  } catch (err) {
    console.error('[Notification Error]: Failed to notify admins:', err.message);
  }
}

module.exports = {
  notifyUser,
  notifyAdmins
};
