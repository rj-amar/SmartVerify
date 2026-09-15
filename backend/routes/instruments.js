const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getNextInstrumentSerial } = require('../utils/serial');
const { logAudit } = require('../utils/audit');

/**
 * GET /api/instruments
 * Get instruments list.
 * - Owner: gets their own instruments.
 * - Admin: gets all instruments with optional filter/search.
 * - Officer: gets instruments in their assigned applications.
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    const user = req.user;

    let queryText = `
      SELECT i.*, u.full_name as owner_name, u.business_name, u.phone as owner_phone, u.email as owner_email
      FROM instruments i
      JOIN users u ON i.owner_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user.role === 'owner') {
      params.push(user.id);
      queryText += ` AND i.owner_id = $${params.length}`;
    } else if (user.role === 'officer') {
      params.push(user.id);
      queryText += ` AND i.id IN (SELECT instrument_id FROM applications WHERE assigned_officer_id = $${params.length})`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND i.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (
        i.system_serial_number ILIKE $${params.length} OR
        i.instrument_type ILIKE $${params.length} OR
        i.manufacturer ILIKE $${params.length} OR
        i.model_number ILIKE $${params.length} OR
        u.business_name ILIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      instruments: result.rows
    });
  } catch (err) {
    console.error('[Instruments GET Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve instruments.'
    });
  }
});

/**
 * GET /api/instruments/:id
 * Get single instrument detail
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await db.query(
      `SELECT i.*, u.full_name as owner_name, u.business_name, u.phone as owner_phone, u.email as owner_email, u.district as owner_district
       FROM instruments i
       JOIN users u ON i.owner_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Instrument not found.'
      });
    }

    const instrument = result.rows[0];

    // Authorization check: Owner can only view their own
    if (user.role === 'owner' && instrument.owner_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own instruments.'
      });
    }

    if (user.role === 'officer') {
      const assignment = await db.query(
        'SELECT 1 FROM applications WHERE instrument_id = $1 AND assigned_officer_id = $2 LIMIT 1',
        [id, user.id]
      );
      if (assignment.rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
      }
    }

    // Fetch related applications and certificates history
    const appHistory = await db.query(
      `SELECT a.id, a.application_number, a.status, a.submitted_at, c.certificate_number, c.certificate_status, c.expiry_date
       FROM applications a
       LEFT JOIN certificates c ON c.application_id = a.id
       WHERE a.instrument_id = $1
       ORDER BY a.submitted_at DESC`,
      [id]
    );

    return res.json({
      success: true,
      instrument,
      applications: appHistory.rows
    });
  } catch (err) {
    console.error('[Instrument Detail Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve instrument details.'
    });
  }
});

/**
 * POST /api/instruments
 * Register a new instrument (Owner only)
 * Backend atomically generates the sequential unique system serial number (e.g. OVS-000001).
 */
router.post('/', authenticateToken, requireRole('owner'), async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      instrument_type,
      category,
      manufacturer,
      model_number,
      manufacturer_serial_number,
      capacity,
      accuracy_class,
      unit_of_measurement,
      purchase_date,
      installation_place,
      installation_address
    } = req.body;

    // Validation
    if (
      !instrument_type ||
      !category ||
      !manufacturer ||
      !model_number ||
      !capacity ||
      !accuracy_class ||
      !unit_of_measurement ||
      !purchase_date ||
      !installation_place ||
      !installation_address
    ) {
      return res.status(422).json({
        success: false,
        error: 'All instrument details are required.'
      });
    }

    await client.query('BEGIN');

    // Generate atomic sequential system serial number: OVS-000001
    const systemSerial = await getNextInstrumentSerial(client);

    const insertSql = `
      INSERT INTO instruments (
        system_serial_number,
        owner_id,
        instrument_type,
        category,
        manufacturer,
        model_number,
        manufacturer_serial_number,
        capacity,
        accuracy_class,
        unit_of_measurement,
        purchase_date,
        installation_place,
        installation_address,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'registered'
      ) RETURNING *;
    `;

    const result = await client.query(insertSql, [
      systemSerial,
      req.user.id,
      instrument_type.trim(),
      category.trim(),
      manufacturer.trim(),
      model_number.trim(),
      manufacturer_serial_number ? manufacturer_serial_number.trim() : null,
      capacity.trim(),
      accuracy_class.trim(),
      unit_of_measurement.trim(),
      purchase_date,
      installation_place.trim(),
      installation_address.trim()
    ]);

    const newInstrument = result.rows[0];

    // Audit log
    await logAudit({
      userId: req.user.id,
      action: 'INSTRUMENT_REGISTER',
      entityType: 'instrument',
      entityId: newInstrument.id,
      details: {
        system_serial_number: newInstrument.system_serial_number,
        instrument_type: newInstrument.instrument_type,
        capacity: `${newInstrument.capacity} ${newInstrument.unit_of_measurement}`
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Instrument registered successfully.',
      system_serial_number: newInstrument.system_serial_number,
      instrument: newInstrument
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Instrument Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to register instrument: ' + err.message
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/instruments/:id
 * Update instrument details (Owner or Admin)
 */
router.patch('/:id', authenticateToken, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const checkRes = await db.query('SELECT owner_id, status FROM instruments WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instrument not found.' });
    }

    if (user.role === 'owner' && checkRes.rows[0].owner_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to edit this instrument.' });
    }

    const {
      manufacturer,
      model_number,
      manufacturer_serial_number,
      installation_place,
      installation_address
    } = req.body;

    const updateRes = await db.query(
      `UPDATE instruments
       SET manufacturer = COALESCE($1, manufacturer),
           model_number = COALESCE($2, model_number),
           manufacturer_serial_number = COALESCE($3, manufacturer_serial_number),
           installation_place = COALESCE($4, installation_place),
           installation_address = COALESCE($5, installation_address),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [manufacturer, model_number, manufacturer_serial_number, installation_place, installation_address, id]
    );

    return res.json({
      success: true,
      message: 'Instrument updated successfully.',
      instrument: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[Instrument Patch Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to update instrument.' });
  }
});

module.exports = router;
