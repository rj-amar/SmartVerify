const db = require('../db/database');

/**
 * Record an action to the audit_logs table.
 * @param {object} param
 * @param {number|null} param.userId
 * @param {string} param.action
 * @param {string} param.entityType
 * @param {number|null} param.entityId
 * @param {object|string|null} param.details
 * @param {string|null} [param.ipAddress]
 * @param {object} [param.client] - optional pg client
 */
async function logAudit({ userId = null, action, entityType, entityId = null, details = null, ipAddress = null, client = null }) {
  try {
    const runner = client || db;
    const detailStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
    await runner.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, detailStr, ipAddress]
    );
  } catch (err) {
    console.error('[Audit Log Error]: Failed to write audit log:', err.message);
  }
}

module.exports = {
  logAudit
};
