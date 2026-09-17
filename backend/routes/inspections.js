const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadInspectionPhotos, hasExpectedSignature } = require('../middleware/upload');
const { uploadFile, downloadFile } = require('../utils/supabaseStorage');
const { logAudit } = require('../utils/audit');
const { notifyUser } = require('../utils/notifications');

/**
 * GET /api/inspections
 * List inspections:
 * - Officer: inspections assigned to officer
 * - Owner: inspections for owner's applications
 * - Admin: all inspections
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { status, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT
        insp.*,
        a.application_number,
        a.inspection_district,
        a.status as application_status,
        i.id as instrument_id,
        i.system_serial_number,
        i.instrument_type,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        u.full_name as applicant_name,
        u.business_name,
        u.phone as applicant_phone,
        off.full_name as officer_name
      FROM inspections insp
      JOIN applications a ON insp.application_id = a.id
      JOIN instruments i ON a.instrument_id = i.id
      JOIN users u ON a.applicant_id = u.id
      JOIN users off ON insp.officer_id = off.id
      WHERE 1=1
    `;
    const params = [];

    if (user.role === 'officer') {
      params.push(user.id);
      queryText += ` AND insp.officer_id = $${params.length}`;
    } else if (user.role === 'owner') {
      params.push(user.id);
      queryText += ` AND a.applicant_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND insp.status = $${params.length}`;
    }

    queryText += ` ORDER BY insp.scheduled_date DESC, insp.scheduled_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      inspections: result.rows
    });
  } catch (err) {
    console.error('[Inspections GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve inspections.' });
  }
});

/**
 * GET /api/inspections/photo/:filename
 * Securely serve inspection photo
 */
router.get('/photo/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);

    const photoRes = await db.query(
      `SELECT p.*, a.applicant_id, a.assigned_officer_id
       FROM inspection_photos p
       JOIN inspections insp ON p.inspection_id = insp.id
       JOIN applications a ON insp.application_id = a.id
       WHERE p.stored_filename = $1`,
      [safeFilename]
    );

    if (photoRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Photo not found.' });
    }

    const photo = photoRes.rows[0];
    const user = req.user;

    if (user.role === 'owner' && photo.applicant_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (user.role === 'officer' && photo.assigned_officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const storagePath = photo.file_path && !path.isAbsolute(photo.file_path) && photo.file_path.includes('/')
      ? photo.file_path.replace(/\\/g, '/')
      : `inspection-photos/${safeFilename}`;

    const fileBuffer = await downloadFile(storagePath);

    res.setHeader('Content-Type', photo.mime_type);
    return res.send(fileBuffer);
  } catch (err) {
    console.error('[Photo Serve Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to serve photo.' });
  }
});


/**
 * GET /api/inspections/:id
 * Retrieve inspection detail with test points and uploaded photos
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const inspRes = await db.query(
      `SELECT
        insp.*,
        a.application_number,
        a.applicant_id,
        a.assigned_officer_id,
        a.status as application_status,
        a.inspection_location as app_inspection_location,
        i.id as instrument_id,
        i.system_serial_number,
        i.instrument_type,
        i.category as instrument_category,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        i.manufacturer,
        i.model_number,
        i.installation_place,
        i.installation_address,
        u.full_name as applicant_name,
        u.business_name,
        u.phone as applicant_phone,
        u.email as applicant_email,
        u.address as applicant_address,
        off.full_name as officer_name,
        off.email as officer_email,
        off.phone as officer_phone
      FROM inspections insp
      JOIN applications a ON insp.application_id = a.id
      JOIN instruments i ON a.instrument_id = i.id
      JOIN users u ON a.applicant_id = u.id
      JOIN users off ON insp.officer_id = off.id
      WHERE insp.id = $1`,
      [id]
    );

    if (inspRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inspection not found.' });
    }

    const inspection = inspRes.rows[0];

    // Authorization
    if (user.role === 'owner' && inspection.applicant_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (user.role === 'officer' && inspection.officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const resultsRes = await db.query(
      'SELECT * FROM inspection_results WHERE inspection_id = $1 ORDER BY id ASC',
      [id]
    );

    const photosRes = await db.query(
      'SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY uploaded_at ASC',
      [id]
    );

    return res.json({
      success: true,
      inspection,
      results: resultsRes.rows,
      photos: photosRes.rows
    });
  } catch (err) {
    console.error('[Inspection Detail Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve inspection detail.' });
  }
});

/**
 * POST /api/inspections
 * Officer schedules an inspection for an assigned application
 */
router.post('/', authenticateToken, requireRole('officer', 'admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      application_id,
      scheduled_date,
      scheduled_time,
      inspection_location,
      remarks
    } = req.body;

    if (!application_id || !scheduled_date || !scheduled_time || !inspection_location) {
      return res.status(422).json({
        success: false,
        error: 'Application, scheduled date, scheduled time, and inspection location are required.'
      });
    }

    await client.query('BEGIN');

    // Verify application
    const appRes = await client.query(
      'SELECT id, application_number, applicant_id, assigned_officer_id, status FROM applications WHERE id = $1 FOR UPDATE',
      [application_id]
    );

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = appRes.rows[0];

    // Officer scoping
    if (req.user.role === 'officer' && app.assigned_officer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'You can only schedule inspections for applications assigned to you.'
      });
    }

    if (!['submitted', 'under_review'].includes(app.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'An inspection can only be scheduled for an application under review.' });
    }

    // Insert inspection
    const insertRes = await client.query(
      `INSERT INTO inspections (
        application_id,
        officer_id,
        scheduled_date,
        scheduled_time,
        inspection_location,
        status,
        remarks
      ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6)
      RETURNING *`,
      [
        application_id,
        req.user.id,
        scheduled_date,
        scheduled_time,
        inspection_location.trim(),
        remarks ? remarks.trim() : null
      ]
    );

    const inspection = insertRes.rows[0];

    // Update application status to inspection_scheduled
    await client.query(
      "UPDATE applications SET status = 'inspection_scheduled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [application_id]
    );

    // Notify applicant
    await notifyUser({
      userId: app.applicant_id,
      title: 'Inspection Scheduled',
      message: `Your verification inspection for Application ${app.application_number} is scheduled on ${scheduled_date} at ${scheduled_time}. Location: ${inspection_location}.`,
      type: 'info',
      client
    });

    await logAudit({
      userId: req.user.id,
      action: 'INSPECTION_SCHEDULED',
      entityType: 'inspection',
      entityId: inspection.id,
      details: {
        application_id,
        scheduled_date,
        scheduled_time,
        inspection_location
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Inspection scheduled successfully.',
      inspection
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Schedule Inspection Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to schedule inspection: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/inspections/:id/results
 * Save/record test point measurements with calculated error and pass/fail
 */
router.post('/:id/results', authenticateToken, requireRole('officer', 'admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { test_points } = req.body; // Array of test point objects

    if (!Array.isArray(test_points) || test_points.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'At least one test point measurement is required.'
      });
    }

    await client.query('BEGIN');

    // Verify inspection
    const inspRes = await client.query(
      'SELECT insp.*, a.assigned_officer_id, i.unit_of_measurement FROM inspections insp JOIN applications a ON insp.application_id = a.id JOIN instruments i ON a.instrument_id = i.id WHERE insp.id = $1 FOR UPDATE',
      [id]
    );

    if (inspRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Inspection not found.' });
    }

    const inspection = inspRes.rows[0];
    if (req.user.role === 'officer' && inspection.assigned_officer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    if (inspection.status !== 'scheduled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Inspection results are locked once an inspection is completed or cancelled.' });
    }

    // Clear previous results if updating
    await client.query('DELETE FROM inspection_results WHERE inspection_id = $1', [id]);

    const insertedResults = [];
    const defaultUnit = inspection.unit_of_measurement || 'kg';

    for (const tp of test_points) {
      const stdVal = parseFloat(tp.standard_value);
      const obsVal = parseFloat(tp.observed_value);
      const permErr = parseFloat(tp.permissible_error);
      const unit = tp.unit || defaultUnit;

      if (isNaN(stdVal) || isNaN(obsVal) || isNaN(permErr)) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          error: `Invalid numeric value in test point '${tp.test_point}'. Standard, observed, and permissible error must be valid numbers.`
        });
      }

      // Safe calculations
      const errorVal = obsVal - stdVal;
      const errorPct = stdVal !== 0 ? ((obsVal - stdVal) / stdVal) * 100 : 0;
      const passed = Math.abs(errorVal) <= (permErr + 0.000001);
      const result = passed ? 'pass' : 'fail';

      const resInsert = await client.query(
        `INSERT INTO inspection_results (
          inspection_id,
          test_point,
          standard_value,
          observed_value,
          error_value,
          error_percentage,
          permissible_error,
          unit,
          result,
          remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          tp.test_point.trim(),
          stdVal,
          obsVal,
          errorVal,
          errorPct,
          permErr,
          unit.trim(),
          result,
          tp.remarks ? tp.remarks.trim() : null
        ]
      );
      insertedResults.push(resInsert.rows[0]);
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Test point measurements saved successfully.',
      results: insertedResults
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Save Results Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to save test results: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/inspections/:id/photos
 * Upload inspection photographs (up to 10 photos)
 */
router.post('/:id/photos', authenticateToken, requireRole('officer', 'admin'), uploadInspectionPhotos, async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No photograph files provided.'
      });
    }

    if (files.some(file => !hasExpectedSignature(file.buffer, file.mimetype))) {
      return res.status(422).json({ success: false, error: 'One or more uploaded files do not contain a valid image signature.' });
    }

    // Verify inspection
    const inspRes = await db.query(
      'SELECT insp.*, a.assigned_officer_id FROM inspections insp JOIN applications a ON insp.application_id = a.id WHERE insp.id = $1',
      [id]
    );

    if (inspRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inspection not found.' });
    }

    const inspection = inspRes.rows[0];
    if (req.user.role === 'officer' && inspection.assigned_officer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    if (inspection.status !== 'scheduled') {
      return res.status(409).json({ success: false, error: 'Photos can only be added to a scheduled inspection.' });
    }

    // Check count limit: max 10 photos per inspection
    const existingPhotosRes = await db.query(
      'SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = $1',
      [id]
    );
    const existingCount = parseInt(existingPhotosRes.rows[0].count, 10);

    if (existingCount + files.length > 10) {
      return res.status(422).json({
        success: false,
        error: `Maximum 10 photos allowed per inspection. Currently already uploaded: ${existingCount}.`
      });
    }

    const savedPhotos = [];
    const uploadedStoragePaths = [];
    try {
      for (const file of files) {
        const storageFilename = file.filename || `insp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname).toLowerCase()}`;
        const storagePath = `inspection-photos/${storageFilename}`;
        const caption = req.body.caption || `Inspection photo ${existingCount + savedPhotos.length + 1}`;

        await uploadFile(storagePath, file.buffer, file.mimetype);
        uploadedStoragePaths.push(storagePath);

        const insertRes = await db.query(
          `INSERT INTO inspection_photos (
            inspection_id,
            filename,
            stored_filename,
            file_path,
            mime_type,
            file_size,
            caption
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            id,
            file.originalname,
            storageFilename,
            storagePath,
            file.mimetype,
            file.size,
            caption
          ]
        );
        savedPhotos.push(insertRes.rows[0]);
      }
    } catch (uploadError) {
      for (const storagePath of uploadedStoragePaths) {
        try {
          const { deleteFile } = require('../utils/supabaseStorage');
          await deleteFile(storagePath);
        } catch (cleanupError) {
          console.error('[Inspection Photo Storage Cleanup Error]:', cleanupError);
        }
      }
      throw uploadError;
    }

    return res.status(201).json({
      success: true,
      message: `${savedPhotos.length} photo(s) uploaded successfully.`,
      photos: savedPhotos
    });
  } catch (err) {
    console.error('[Upload Photos Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload inspection photos.' });
  }
});

/**
 * POST /api/inspections/:id/complete
 * Complete digital inspection: verifies results and marks completed
 */
router.post('/:id/complete', authenticateToken, requireRole('officer', 'admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    await client.query('BEGIN');

    const inspRes = await client.query(
      `SELECT insp.*, a.id as app_id, a.application_number, a.applicant_id, a.assigned_officer_id
       FROM inspections insp
       JOIN applications a ON insp.application_id = a.id
       WHERE insp.id = $1 FOR UPDATE`,
      [id]
    );

    if (inspRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Inspection not found.' });
    }

    const inspection = inspRes.rows[0];
    if (req.user.role === 'officer' && inspection.assigned_officer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    if (inspection.status !== 'scheduled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Only a scheduled inspection can be completed.' });
    }

    // Verify test points exist
    const resultsCount = await client.query(
      'SELECT COUNT(*) FROM inspection_results WHERE inspection_id = $1',
      [id]
    );
    if (parseInt(resultsCount.rows[0].count, 10) === 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        error: 'Cannot complete inspection: You must enter and save at least one test point measurement result.'
      });
    }

    // Mark inspection completed
    await client.query(
      `UPDATE inspections
       SET status = 'completed',
           remarks = COALESCE($1, remarks),
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [remarks ? remarks.trim() : null, id]
    );

    // Update application status to inspection_completed
    await client.query(
      "UPDATE applications SET status = 'inspection_completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [inspection.app_id]
    );

    // Notify applicant
    await notifyUser({
      userId: inspection.applicant_id,
      title: 'Inspection Completed',
      message: `The digital inspection for Application ${inspection.application_number} has been completed and is pending final verification decision.`,
      type: 'info',
      client
    });

    await logAudit({
      userId: req.user.id,
      action: 'INSPECTION_COMPLETED',
      entityType: 'inspection',
      entityId: id,
      details: {
        application_id: inspection.app_id,
        application_number: inspection.application_number
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Inspection completed successfully. You may now approve or reject the application.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Complete Inspection Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to complete inspection: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
