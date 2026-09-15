const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

// Enforce admin-only for all routes in this file
router.use(authenticateToken, requireRole('admin'));

/**
 * GET /api/admin/summary
 * Live real-time statistics directly from PostgreSQL
 */
router.get('/summary', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'officer') as total_officers,
        (SELECT COUNT(*) FROM users WHERE role = 'owner') as total_owners,
        (SELECT COUNT(*) FROM instruments) as total_instruments,
        (SELECT COUNT(*) FROM applications) as total_applications,
        (SELECT COUNT(*) FROM applications WHERE status IN ('submitted', 'under_review', 'inspection_scheduled')) as pending_applications,
        (SELECT COUNT(*) FROM applications WHERE status = 'verified') as verified_applications,
        (SELECT COUNT(*) FROM applications WHERE status = 'rejected') as rejected_applications,
        (SELECT COUNT(*) FROM inspections WHERE status = 'scheduled') as scheduled_inspections,
        (SELECT COUNT(*) FROM inspections WHERE status = 'completed') as completed_inspections,
        (SELECT COUNT(*) FROM certificates) as total_certificates,
        (SELECT COUNT(*) FROM certificates WHERE certificate_status = 'valid' AND expiry_date >= CURRENT_DATE) as active_certificates,
        (SELECT COUNT(*) FROM certificates WHERE certificate_status = 'expired' OR (certificate_status = 'valid' AND expiry_date < CURRENT_DATE)) as expired_certificates,
        (SELECT COUNT(*) FROM districts WHERE is_active = TRUE) as total_active_districts
    `;

    const statsRes = await db.query(statsQuery);
    const raw = statsRes.rows[0];

    // Format all counts as integers
    const summary = {};
    for (const [key, val] of Object.entries(raw)) {
      summary[key] = parseInt(val || '0', 10);
    }

    // Recent activity audit logs
    const recentLogs = await db.query(
      `SELECT al.*, u.full_name as user_name, u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC LIMIT 10`
    );

    return res.json({
      success: true,
      summary,
      recent_activity: recentLogs.rows
    });
  } catch (err) {
    console.error('[Admin Summary Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate admin summary.' });
  }
});

/**
 * GET /api/admin/users
 * Manage users: list officers, owners, admins
 */
router.get('/users', async (req, res) => {
  try {
    const { role, district, search, limit = 100, offset = 0 } = req.query;

    let queryText = `
      SELECT u.id, u.full_name, u.business_name, u.email, u.phone, u.role, u.district, u.state, u.address, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM applications a WHERE a.assigned_officer_id = u.id AND a.status IN ('submitted', 'under_review', 'inspection_scheduled')) as active_inspections_count,
        (SELECT COUNT(*) FROM instruments inst WHERE inst.owner_id = u.id) as instruments_owned_count
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      params.push(role);
      queryText += ` AND u.role = $${params.length}`;
    }

    if (district) {
      params.push(`%${district.trim()}%`);
      queryText += ` AND u.district ILIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (
        u.full_name ILIKE $${params.length} OR
        u.email ILIKE $${params.length} OR
        u.business_name ILIKE $${params.length} OR
        u.phone ILIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      users: result.rows
    });
  } catch (err) {
    console.error('[Admin Users GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve users.' });
  }
});

/**
 * POST /api/admin/users
 * Admin creates a new Officer or Administrator account
 */
router.post('/users', async (req, res) => {
  try {
    const { full_name, email, phone, role, district, state, address, password } = req.body;

    if (!full_name || !email || !phone || !role || !district || !state || !password) {
      return res.status(422).json({
        success: false,
        error: 'Full name, email, phone, role, district, state, and password are required.'
      });
    }

    if (!['officer', 'admin'].includes(role)) {
      return res.status(422).json({
        success: false,
        error: "Role must be 'officer' or 'admin'."
      });
    }

    const emailCheck = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await db.query(
      `INSERT INTO users (full_name, business_name, email, phone, password_hash, role, district, state, address, is_active)
       VALUES ($1, 'Legal Metrology Department', $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id, full_name, email, phone, role, district, state, address, is_active, created_at`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        passwordHash,
        role,
        district.trim(),
        state.trim(),
        address ? address.trim() : 'District Metrology Office'
      ]
    );

    const newUser = insertRes.rows[0];

    await logAudit({
      userId: req.user.id,
      action: 'ADMIN_CREATE_USER',
      entityType: 'user',
      entityId: newUser.id,
      details: { role: newUser.role, email: newUser.email, district: newUser.district },
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: `${role.toUpperCase()} account created successfully.`,
      user: newUser
    });
  } catch (err) {
    console.error('[Admin Create User Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to create user: ' + err.message });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user status (activate/deactivate) or district assignment
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, district, state, phone, full_name } = req.body;

    const userRes = await db.query('SELECT id, role, email FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const updateRes = await db.query(
      `UPDATE users
       SET is_active = COALESCE($1, is_active),
           district = COALESCE($2, district),
           state = COALESCE($3, state),
           phone = COALESCE($4, phone),
           full_name = COALESCE($5, full_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, full_name, email, phone, role, district, state, is_active`,
      [is_active, district, state, phone, full_name, id]
    );

    await logAudit({
      userId: req.user.id,
      action: 'ADMIN_UPDATE_USER',
      entityType: 'user',
      entityId: id,
      details: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'User updated successfully.',
      user: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[Admin Update User Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
});

/**
 * GET /api/admin/districts
 * List all master districts
 */
router.get('/districts', async (req, res) => {
  try {
    const { state } = req.query;
    let queryText = `
      SELECT d.*,
        (SELECT COUNT(*) FROM users u WHERE u.role = 'officer' AND LOWER(TRIM(u.district)) = LOWER(TRIM(d.district_name)) AND u.is_active = TRUE) as officer_count
      FROM districts d
      WHERE 1=1
    `;
    const params = [];
    if (state) {
      params.push(state.trim());
      queryText += ` AND d.state_name ILIKE $${params.length}`;
    }
    queryText += ' ORDER BY d.state_name ASC, d.district_name ASC';

    const result = await db.query(queryText, params);
    return res.json({
      success: true,
      count: result.rows.length,
      districts: result.rows
    });
  } catch (err) {
    console.error('[Districts GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve districts.' });
  }
});

/**
 * POST /api/admin/districts
 * Add a new district to master table
 */
router.post('/districts', async (req, res) => {
  try {
    const { district_name, state_name } = req.body;

    if (!district_name || !state_name) {
      return res.status(422).json({ success: false, error: 'District name and state name are required.' });
    }

    const insertRes = await db.query(
      `INSERT INTO districts (district_name, state_name, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (district_name, state_name) DO UPDATE SET is_active = TRUE
       RETURNING *`,
      [district_name.trim(), state_name.trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'District added successfully.',
      district: insertRes.rows[0]
    });
  } catch (err) {
    console.error('[Add District Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to add district: ' + err.message });
  }
});

/**
 * GET /api/admin/audit-logs
 * View audit logs with filtering
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const { action, entity_type, search, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT al.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      params.push(action);
      queryText += ` AND al.action = $${params.length}`;
    }

    if (entity_type) {
      params.push(entity_type);
      queryText += ` AND al.entity_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (
        al.action ILIKE $${params.length} OR
        al.details ILIKE $${params.length} OR
        u.full_name ILIKE $${params.length} OR
        u.email ILIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      audit_logs: result.rows
    });
  } catch (err) {
    console.error('[Audit Logs Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve audit logs.' });
  }
});

module.exports = router;
