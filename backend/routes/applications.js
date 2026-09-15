const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getNextApplicationNumber } = require('../utils/serial');
const { logAudit } = require('../utils/audit');
const { notifyUser, notifyAdmins } = require('../utils/notifications');

/**
 * Helper to perform District-Based Officer Assignment:
 * 1. Matches active officers whose district equals inspectionDistrict (case-insensitive, trimmed).
 * 2. If multiple officers found, selects the one with least active workload.
 * 3. If no officer found, returns null.
 */
async function findDistrictOfficer(inspectionDistrict, client) {
  const runner = client || db;
  const cleanDistrict = String(inspectionDistrict || '').trim();

  // Find active officers in the exact district (case-insensitive & trimmed)
  const officersRes = await runner.query(
    `SELECT u.id, u.full_name, u.email,
       (SELECT COUNT(*) FROM applications a
        WHERE a.assigned_officer_id = u.id
        AND a.status IN ('submitted', 'under_review', 'inspection_scheduled')
       ) as active_workload
     FROM users u
     WHERE u.role = 'officer'
       AND u.is_active = TRUE
       AND LOWER(TRIM(u.district)) = LOWER(TRIM($1))
     ORDER BY active_workload ASC, u.id ASC`,
    [cleanDistrict]
  );

  if (officersRes.rows.length === 0) {
    return null;
  }

  // Return officer with the lowest active workload
  return officersRes.rows[0];
}

/**
 * GET /api/applications
 * List applications:
 * - Owner: sees their own applications
 * - Officer: sees applications assigned to them ONLY (cannot view other officers' applications)
 * - Admin: sees all applications
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search, district, limit = 50, offset = 0 } = req.query;
    const user = req.user;

    let queryText = `
      SELECT
        a.*,
        i.system_serial_number,
        i.instrument_type,
        i.category as instrument_category,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        i.manufacturer,
        i.model_number,
        u.full_name as applicant_name,
        u.business_name,
        u.phone as applicant_phone,
        u.email as applicant_email,
        off.full_name as officer_name,
        off.email as officer_email,
        c.id as certificate_id,
        c.certificate_number,
        c.certificate_status,
        c.expiry_date as certificate_expiry
      FROM applications a
      JOIN instruments i ON a.instrument_id = i.id
      JOIN users u ON a.applicant_id = u.id
      LEFT JOIN users off ON a.assigned_officer_id = off.id
      LEFT JOIN certificates c ON c.application_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (user.role === 'owner') {
      params.push(user.id);
      queryText += ` AND a.applicant_id = $${params.length}`;
    } else if (user.role === 'officer') {
      // RULE 6: Officer cannot access another officer's private assigned applications
      params.push(user.id);
      queryText += ` AND a.assigned_officer_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND a.status = $${params.length}`;
    }

    if (district) {
      params.push(`%${district.trim()}%`);
      queryText += ` AND a.inspection_district ILIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (
        a.application_number ILIKE $${params.length} OR
        i.system_serial_number ILIKE $${params.length} OR
        i.instrument_type ILIKE $${params.length} OR
        u.business_name ILIKE $${params.length} OR
        u.full_name ILIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY a.submitted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      applications: result.rows
    });
  } catch (err) {
    console.error('[Applications GET Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve applications.'
    });
  }
});

/**
 * GET /api/applications/:id
 * Retrieve full application details including documents, inspection, and timeline
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const appRes = await db.query(
      `SELECT
        a.*,
        i.system_serial_number,
        i.instrument_type,
        i.category as instrument_category,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        i.manufacturer,
        i.model_number,
        i.manufacturer_serial_number,
        i.installation_place,
        i.installation_address,
        u.full_name as applicant_name,
        u.business_name,
        u.phone as applicant_phone,
        u.email as applicant_email,
        u.address as applicant_address,
        u.district as applicant_district,
        u.state as applicant_state,
        off.full_name as officer_name,
        off.email as officer_email,
        off.phone as officer_phone,
        off.district as officer_district,
        c.id as certificate_id,
        c.certificate_number,
        c.certificate_status,
        c.verification_code,
        c.issue_date as certificate_issue_date,
        c.expiry_date as certificate_expiry_date,
        c.pdf_filename
      FROM applications a
      JOIN instruments i ON a.instrument_id = i.id
      JOIN users u ON a.applicant_id = u.id
      LEFT JOIN users off ON a.assigned_officer_id = off.id
      LEFT JOIN certificates c ON c.application_id = a.id
      WHERE a.id = $1`,
      [id]
    );

    if (appRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const application = appRes.rows[0];

    // Authorization guard
    if (user.role === 'owner' && application.applicant_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied to this application.' });
    }
    if (user.role === 'officer' && application.assigned_officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied. You are not assigned to this application.' });
    }

    // Fetch documents
    const docsRes = await db.query(
      `SELECT d.*, u.full_name as reviewed_by_name
       FROM documents d
       LEFT JOIN users u ON d.reviewed_by = u.id
       WHERE d.application_id = $1
       ORDER BY d.uploaded_at ASC`,
      [id]
    );

    // Fetch inspection & results & photos
    const inspRes = await db.query(
      `SELECT insp.*, u.full_name as inspector_name
       FROM inspections insp
       JOIN users u ON insp.officer_id = u.id
       WHERE insp.application_id = $1
       ORDER BY insp.created_at DESC`,
      [id]
    );

    let inspectionDetails = null;
    if (inspRes.rows.length > 0) {
      const activeInsp = inspRes.rows[0];
      const resultsRes = await db.query(
        `SELECT * FROM inspection_results WHERE inspection_id = $1 ORDER BY id ASC`,
        [activeInsp.id]
      );
      const photosRes = await db.query(
        `SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY uploaded_at ASC`,
        [activeInsp.id]
      );

      inspectionDetails = {
        ...activeInsp,
        results: resultsRes.rows,
        photos: photosRes.rows
      };
    }

    return res.json({
      success: true,
      application,
      documents: docsRes.rows,
      inspection: inspectionDetails
    });
  } catch (err) {
    console.error('[Application Detail Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve application detail.' });
  }
});

/**
 * POST /api/applications
 * Submit a new verification application (Owner only)
 * Follows District-Based Officer Assignment:
 * - Match active officer in same district
 * - Assign officer with lowest active workload
 * - If none found, assign NULL, notify admins, inform owner
 */
router.post('/', authenticateToken, requireRole('owner'), async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      instrument_id, // Integer database ID
      application_type = 'initial',
      inspection_district,
      inspection_location,
      preferred_inspection_date,
      application_notes
    } = req.body;

    // Validate foreign key instrument_id
    const intInstrumentId = parseInt(instrument_id, 10);
    if (!intInstrumentId || isNaN(intInstrumentId)) {
      return res.status(422).json({
        success: false,
        error: 'A valid registered instrument must be selected (using database ID).'
      });
    }

    if (!inspection_district || !inspection_location) {
      return res.status(422).json({
        success: false,
        error: 'Inspection District and Inspection Location are required.'
      });
    }

    await client.query('BEGIN');

    // Verify instrument ownership and availability
    const instCheck = await client.query(
      'SELECT id, system_serial_number, owner_id, status FROM instruments WHERE id = $1 FOR UPDATE',
      [intInstrumentId]
    );

    if (instCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Selected instrument does not exist.' });
    }

    const inst = instCheck.rows[0];
    if (inst.owner_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'You do not own this instrument.' });
    }

    // Check if there is already an active pending application for this instrument
    const activeAppCheck = await client.query(
      `SELECT id, application_number, status FROM applications
       WHERE instrument_id = $1 AND status NOT IN ('verified', 'rejected', 'certificate_issued')`,
      [intInstrumentId]
    );

    if (activeAppCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Instrument already has an active verification application (${activeAppCheck.rows[0].application_number}) in status: ${activeAppCheck.rows[0].status}.`
      });
    }

    // Generate human-readable unique application number: APP-2026-000001
    const appNumber = await getNextApplicationNumber(client);

    // District-based Officer Assignment
    const assignedOfficer = await findDistrictOfficer(inspection_district, client);
    const assignedOfficerId = assignedOfficer ? assignedOfficer.id : null;
    const initialStatus = 'submitted';

    const insertSql = `
      INSERT INTO applications (
        application_number,
        instrument_id,
        applicant_id,
        application_type,
        inspection_district,
        inspection_location,
        preferred_inspection_date,
        application_notes,
        assigned_officer_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const appResult = await client.query(insertSql, [
      appNumber,
      intInstrumentId,
      req.user.id,
      application_type,
      inspection_district.trim(),
      inspection_location.trim(),
      preferred_inspection_date || null,
      application_notes ? application_notes.trim() : null,
      assignedOfficerId,
      initialStatus
    ]);

    const newApplication = appResult.rows[0];

    // Update instrument status to pending_verification
    await client.query(
      "UPDATE instruments SET status = 'pending_verification', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [intInstrumentId]
    );

    // Notifications and Audit
    if (assignedOfficerId) {
      await notifyUser({
        userId: assignedOfficerId,
        title: 'New Inspection Assigned',
        message: `Application ${appNumber} in district ${inspection_district} has been assigned to you.`,
        type: 'info',
        client
      });
    } else {
      // Notify admin that manual assignment is needed
      await notifyAdmins({
        title: 'Application Needs Officer Assignment',
        message: `Application ${appNumber} submitted for district '${inspection_district}' has no active officer assigned. Administrator action required.`,
        type: 'warning',
        client
      });
    }

    await logAudit({
      userId: req.user.id,
      action: 'APPLICATION_SUBMIT',
      entityType: 'application',
      entityId: newApplication.id,
      details: {
        application_number: appNumber,
        instrument_id: intInstrumentId,
        inspection_district: inspection_district.trim(),
        assigned_officer_id: assignedOfficerId
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    const assignmentNotice = assignedOfficerId
      ? `Assigned to District Legal Metrology Officer (${assignedOfficer.full_name}).`
      : 'No officer is currently available in this district. Your application has been submitted and will be assigned by an administrator.';

    return res.status(201).json({
      success: true,
      message: 'Verification application submitted successfully.',
      application: newApplication,
      assignment_notice: assignmentNotice
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Application Submit Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit application: ' + err.message
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/applications/:id/assign
 * Admin reassigns or manually assigns an officer to an application
 */
router.patch('/:id/assign', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { officer_id } = req.body;

    if (!officer_id) {
      return res.status(422).json({ success: false, error: 'Officer ID is required.' });
    }

    // Verify officer exists and has role 'officer'
    const offRes = await db.query(
      "SELECT id, full_name, email, district FROM users WHERE id = $1 AND role = 'officer' AND is_active = TRUE",
      [officer_id]
    );

    if (offRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Active officer not found.' });
    }

    const officer = offRes.rows[0];

    const updateRes = await db.query(
      `UPDATE applications
       SET assigned_officer_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [officer.id, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = updateRes.rows[0];

    // Notify assigned officer
    await notifyUser({
      userId: officer.id,
      title: 'Application Assigned by Admin',
      message: `Administrator assigned application ${app.application_number} to you.`,
      type: 'info'
    });

    await logAudit({
      userId: req.user.id,
      action: 'ADMIN_ASSIGN_OFFICER',
      entityType: 'application',
      entityId: app.id,
      details: { officer_id: officer.id, officer_name: officer.full_name },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Officer ${officer.full_name} assigned successfully.`,
      application: app
    });
  } catch (err) {
    console.error('[Assign Officer Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to assign officer.' });
  }
});

module.exports = router;
