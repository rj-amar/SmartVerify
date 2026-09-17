const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getNextCertificateNumber, getNextApplicationNumber } = require('../utils/serial');
const { generateCertificatePDF } = require('../utils/pdf');
const { logAudit } = require('../utils/audit');
const { notifyUser, notifyAdmins } = require('../utils/notifications');
const { certsDir } = require('../middleware/upload');

/**
 * GET /api/certificates/verify/:code
 * PUBLIC ENDPOINT: Verify certificate authenticity via QR code or manual search.
 * DOES NOT REQUIRE LOGIN.
 */
router.get('/verify/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = String(code || '').trim();

    const certRes = await db.query(
      `SELECT
        c.id,
        c.certificate_number,
        c.verification_code,
        c.issue_date,
        c.expiry_date,
        c.certificate_status,
        c.created_at,
        i.system_serial_number,
        i.instrument_type,
        i.category as instrument_category,
        i.manufacturer,
        i.model_number,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        i.installation_place,
        u.full_name as owner_name,
        u.business_name,
        u.district as owner_district,
        u.state as owner_state,
        off.full_name as verifying_officer_name,
        off.district as officer_district
       FROM certificates c
       JOIN instruments i ON c.instrument_id = i.id
       JOIN users u ON i.owner_id = u.id
       JOIN users off ON c.issued_by = off.id
       WHERE c.certificate_number ILIKE $1 OR c.verification_code ILIKE $1`,
      [cleanCode]
    );

    if (certRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        valid: false,
        status: 'INVALID',
        message: 'No certificate found matching the provided code or certificate number.'
      });
    }

    const cert = certRes.rows[0];

    // Check expiry dynamically
    const now = new Date();
    const expiry = new Date(cert.expiry_date);
    let computedStatus = cert.certificate_status;
    if (computedStatus === 'valid' && now > expiry) {
      computedStatus = 'expired';
    }

    return res.json({
      success: true,
      valid: computedStatus === 'valid',
      status: computedStatus.toUpperCase(),
      certificate: {
        certificate_number: cert.certificate_number,
        verification_code: cert.verification_code,
        issue_date: cert.issue_date,
        expiry_date: cert.expiry_date,
        status: computedStatus.toUpperCase(),
        instrument: {
          system_serial_number: cert.system_serial_number,
          instrument_type: cert.instrument_type,
          category: cert.instrument_category,
          manufacturer: cert.manufacturer,
          model: cert.model_number,
          capacity: `${cert.capacity} ${cert.unit_of_measurement}`,
          accuracy_class: cert.accuracy_class,
          installation_place: cert.installation_place
        },
        holder: {
          owner_name: cert.owner_name,
          business_name: cert.business_name || 'N/A',
          jurisdiction: `${cert.owner_district}, ${cert.owner_state}`
        },
        issuing_authority: {
          officer_name: cert.verifying_officer_name,
          district: cert.officer_district,
          department: 'Department of Legal Metrology, Weights & Measures'
        }
      }
    });
  } catch (err) {
    console.error('[Public Verify Error]:', err);
    return res.status(500).json({ success: false, error: 'Verification service error.' });
  }
});

/**
 * GET /api/certificates
 * List certificates:
 * - Owner: certificates for their own instruments
 * - Officer: certificates issued by this officer
 * - Admin: all certificates
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { status, search, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT
        c.*,
        i.system_serial_number,
        i.instrument_type,
        i.capacity,
        i.unit_of_measurement,
        i.accuracy_class,
        i.manufacturer,
        u.full_name as owner_name,
        u.business_name,
        u.phone as owner_phone,
        off.full_name as officer_name
      FROM certificates c
      JOIN instruments i ON c.instrument_id = i.id
      JOIN users u ON i.owner_id = u.id
      JOIN users off ON c.issued_by = off.id
      WHERE 1=1
    `;
    const params = [];

    if (user.role === 'owner') {
      params.push(user.id);
      queryText += ` AND i.owner_id = $${params.length}`;
    } else if (user.role === 'officer') {
      params.push(user.id);
      queryText += ` AND c.issued_by = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND c.certificate_status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (
        c.certificate_number ILIKE $${params.length} OR
        i.system_serial_number ILIKE $${params.length} OR
        u.business_name ILIKE $${params.length} OR
        u.full_name ILIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY c.issue_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      certificates: result.rows
    });
  } catch (err) {
    console.error('[Certificates GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve certificates.' });
  }
});

/**
 * GET /api/certificates/pdf/:identifier
 * Download certificate PDF with authorization check
 */
router.get('/pdf/:identifier', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const user = req.user;

    // Get certificate data from the permanent database.
    const certRes = await db.query(
      `SELECT
        c.*,
        a.application_number,
        a.assigned_officer_id,
        i.system_serial_number,
        i.instrument_type,
        i.category AS instrument_category,
        i.manufacturer,
        i.model_number,
        i.capacity,
        i.accuracy_class,
        i.unit_of_measurement,
        i.installation_place,
        i.installation_address,
        u.id AS owner_id,
        u.full_name AS owner_name,
        u.business_name,
        off.full_name AS officer_name,
        off.district AS officer_district
       FROM certificates c
       JOIN applications a ON c.application_id = a.id
       JOIN instruments i ON c.instrument_id = i.id
       JOIN users u ON i.owner_id = u.id
       JOIN users off ON c.issued_by = off.id
       WHERE c.certificate_number = $1 OR c.id::text = $1`,
      [identifier]
    );

    if (certRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found.'
      });
    }

    const cert = certRes.rows[0];

    // Authorization
    if (user.role === 'owner' && cert.owner_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied.'
      });
    }

    if (
      user.role === 'officer' &&
      cert.assigned_officer_id !== user.id &&
      cert.issued_by !== user.id
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied.'
      });
    }

    // Vercel only provides temporary writable storage in /tmp.
    // Regenerate the certificate from database data instead of
    // trying to read the old local uploads/certificates path.
    const tempPdfPath = path.join(
      '/tmp',
      `certificate_${cert.certificate_number}_${Date.now()}.pdf`
    );

    const baseUrl =
      process.env.APP_BASE_URL ||
      'https://smart-verify-eight.vercel.app';

    const verifyUrl =
      `${baseUrl}/#verify?code=${cert.certificate_number}`;

    await generateCertificatePDF(
      {
        certificateNumber: cert.certificate_number,
        applicationNumber: cert.application_number,
        systemSerialNumber: cert.system_serial_number,
        instrumentType: cert.instrument_type,
        manufacturer: cert.manufacturer,
        modelNumber: cert.model_number,
        capacity: cert.capacity,
        accuracyClass: cert.accuracy_class,
        unit: cert.unit_of_measurement,
        ownerName: cert.owner_name,
        businessName: cert.business_name,
        installationAddress:
          cert.installation_address || cert.installation_place,
        verificationDate: cert.issue_date,
        expiryDate: cert.expiry_date,
        officerName: cert.officer_name,
        officerDistrict: cert.officer_district,
        status: cert.certificate_status,
        verifyUrl
      },
      tempPdfPath
    );

    // Send the freshly generated PDF to the browser.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${cert.pdf_filename || `certificate_${cert.certificate_number}.pdf`}"`
    );

    return res.sendFile(tempPdfPath, (err) => {
      // Clean up the temporary Vercel file after sending it.
      try {
        if (fs.existsSync(tempPdfPath)) {
          fs.unlinkSync(tempPdfPath);
        }
      } catch (cleanupError) {
        console.error('[Certificate PDF Cleanup Error]:', cleanupError);
      }

      if (err) {
        console.error('[Certificate PDF Send Error]:', err);
      }
    });
  } catch (err) {
    console.error('[Certificate PDF Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate certificate PDF.'
    });
  }
});

/**
 * GET /api/certificates/:id
 * Get single certificate details
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const certRes = await db.query(
      `SELECT
        c.*,
        a.application_number,
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
        u.id as owner_id,
        u.full_name as owner_name,
        u.business_name,
        u.phone as owner_phone,
        u.email as owner_email,
        off.full_name as officer_name,
        off.district as officer_district,
        a.assigned_officer_id
       FROM certificates c
       JOIN applications a ON c.application_id = a.id
       JOIN instruments i ON c.instrument_id = i.id
       JOIN users u ON i.owner_id = u.id
       JOIN users off ON c.issued_by = off.id
       WHERE c.id = $1 OR c.certificate_number = $1`,
      [id]
    );

    if (certRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }

    const cert = certRes.rows[0];

    // Authorization
    if (user.role === 'owner' && cert.owner_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (user.role === 'officer' && cert.assigned_officer_id !== user.id && cert.issued_by !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    return res.json({
      success: true,
      certificate: cert
    });
  } catch (err) {
    console.error('[Certificate GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve certificate.' });
  }
});

/**
 * POST /api/certificates/approve
 * Officer completes approval of application and generates official Digital Certificate
 * Uses PostgreSQL transaction locking to guarantee no duplicate certificate is generated.
 */
router.post('/approve', authenticateToken, requireRole('officer', 'admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { application_id, validity_years = 1, remarks } = req.body;

    if (!application_id) {
      return res.status(422).json({ success: false, error: 'Application ID is required.' });
    }

    await client.query('BEGIN');

    // 1. Lock application record FOR UPDATE
    const appRes = await client.query(
      `SELECT a.*,
        i.id as inst_id,
        i.system_serial_number,
        i.instrument_type,
        i.category as instrument_category,
        i.manufacturer,
        i.model_number,
        i.capacity,
        i.accuracy_class,
        i.unit_of_measurement,
        i.installation_address,
        u.id as applicant_user_id,
        u.full_name as owner_name,
        u.business_name,
        off.full_name as officer_name,
        off.district as officer_district
       FROM applications a
       JOIN instruments i ON a.instrument_id = i.id
       JOIN users u ON a.applicant_id = u.id
       LEFT JOIN users off ON a.assigned_officer_id = off.id
       WHERE a.id = $1 FOR UPDATE OF a`,
      [application_id]
    );

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = appRes.rows[0];

    // Officer assignment check
    if (req.user.role === 'officer' && app.assigned_officer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Unauthorized. You are not assigned to this application.' });
    }

    if (app.status !== 'inspection_completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Only an application with a completed inspection can be approved.' });
    }

    // Check if certificate already exists (Transaction-safe idempotency)
    const existingCert = await client.query(
      'SELECT id, certificate_number FROM certificates WHERE application_id = $1',
      [application_id]
    );

    if (existingCert.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `A certificate (${existingCert.rows[0].certificate_number}) has already been generated for this application.`
      });
    }

    // 2. Validate that an inspection has been scheduled and completed
    const inspCheck = await client.query(
      "SELECT id, status FROM inspections WHERE application_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
      [application_id]
    );

    if (inspCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        error: 'Cannot approve application: A digital inspection must be completed before approving and generating certificate.'
      });
    }

    const failedResults = await client.query(
      "SELECT COUNT(*) FILTER (WHERE result = 'fail') AS failed_count, COUNT(*) AS total_count FROM inspection_results WHERE inspection_id = $1",
      [inspCheck.rows[0].id]
    );
    if (Number(failedResults.rows[0].total_count) === 0 || Number(failedResults.rows[0].failed_count) > 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Cannot approve application: every recorded inspection result must pass.' });
    }

    // 3. Generate unique sequential Certificate Number: CERT-2026-000001
    const certNumber = await getNextCertificateNumber(client);
    const verificationCode = `VER-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

    // Dates
    const issueDate = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + parseInt(validity_years, 10));

    const issueDateStr = issueDate.toISOString().split('T')[0];
    const expiryDateStr = expiryDate.toISOString().split('T')[0];

    const pdfFilename = `cert_${certNumber}.pdf`;
    const pdfPath = path.join(certsDir, pdfFilename);
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
    const verifyUrl = `${baseUrl}/#verify?code=${certNumber}`;

    // 4. Generate Official PDF Certificate with Embedded QR Code
    await generateCertificatePDF({
      certificateNumber: certNumber,
      applicationNumber: app.application_number,
      systemSerialNumber: app.system_serial_number,
      instrumentType: app.instrument_type,
      manufacturer: app.manufacturer,
      modelNumber: app.model_number,
      capacity: app.capacity,
      accuracyClass: app.accuracy_class,
      unit: app.unit_of_measurement,
      ownerName: app.owner_name,
      businessName: app.business_name,
      installationAddress: app.installation_address,
      verificationDate: issueDateStr,
      expiryDate: expiryDateStr,
      officerName: req.user.full_name,
      officerDistrict: req.user.district,
      status: 'valid',
      verifyUrl
    }, pdfPath);

    // 5. Insert Certificate into Database
    const certInsert = await client.query(
      `INSERT INTO certificates (
        certificate_number,
        application_id,
        instrument_id,
        issued_by,
        issue_date,
        expiry_date,
        certificate_status,
        verification_code,
        pdf_filename,
        pdf_path,
        qr_code_data
      ) VALUES ($1, $2, $3, $4, $5, $6, 'valid', $7, $8, $9, $10)
      RETURNING *`,
      [
        certNumber,
        application_id,
        app.inst_id,
        req.user.id,
        issueDateStr,
        expiryDateStr,
        verificationCode,
        pdfFilename,
        pdfPath,
        verifyUrl
      ]
    );

    const certificate = certInsert.rows[0];

    // 6. Update Application status to 'verified'
    await client.query(
      "UPDATE applications SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [application_id]
    );

    // 7. Update Instrument status to 'verified'
    await client.query(
      "UPDATE instruments SET status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [app.inst_id]
    );

    // 8. Notify Owner
    await notifyUser({
      userId: app.applicant_user_id,
      title: 'Verification Certificate Issued!',
      message: `Your instrument (${app.system_serial_number} - ${app.instrument_type}) has been verified. Certificate ${certNumber} has been generated and is ready for download.`,
      type: 'success',
      client
    });

    // 9. Audit Log
    await logAudit({
      userId: req.user.id,
      action: 'CERTIFICATE_GENERATED',
      entityType: 'certificate',
      entityId: certificate.id,
      details: {
        certificate_number: certNumber,
        application_number: app.application_number,
        instrument_id: app.inst_id,
        valid_until: expiryDateStr
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Application approved and Digital Certificate generated successfully.',
      certificate
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Approve Certificate Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to approve application: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/certificates/reject
 * Officer rejects application with required rejection reason
 */
router.post('/reject', authenticateToken, requireRole('officer', 'admin'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { application_id, rejection_reason } = req.body;

    if (!application_id || !rejection_reason || rejection_reason.trim().length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Application ID and a detailed rejection reason are required.'
      });
    }

    await client.query('BEGIN');

    const appRes = await client.query(
      `SELECT a.*, i.id as inst_id, i.system_serial_number
       FROM applications a
       JOIN instruments i ON a.instrument_id = i.id
       WHERE a.id = $1 FOR UPDATE`,
      [application_id]
    );

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = appRes.rows[0];

    if (req.user.role === 'officer' && app.assigned_officer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const existingCert = await client.query('SELECT id FROM certificates WHERE application_id = $1', [application_id]);
    if (existingCert.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'An issued certificate cannot be rejected. Revoke it through a dedicated revocation workflow.' });
    }

    // Update application to rejected
    await client.query(
      `UPDATE applications
       SET status = 'rejected',
           rejection_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [rejection_reason.trim(), application_id]
    );

    // Update instrument status to rejected
    await client.query(
      "UPDATE instruments SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [app.inst_id]
    );

    // Notify Owner
    await notifyUser({
      userId: app.applicant_id,
      title: 'Verification Application Rejected',
      message: `Your application ${app.application_number} for instrument ${app.system_serial_number} was rejected. Reason: ${rejection_reason}`,
      type: 'warning',
      client
    });

    await logAudit({
      userId: req.user.id,
      action: 'APPLICATION_REJECTED',
      entityType: 'application',
      entityId: application_id,
      details: {
        application_number: app.application_number,
        rejection_reason: rejection_reason.trim()
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Application rejected.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Reject Application Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to reject application: ' + err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/certificates/:id/renew
 * Owner requests renewal for an expiring or expired certificate.
 * Creates a real renewal application (application_type = 'renewal') rather than modifying old certificate.
 */
router.post('/:id/renew', authenticateToken, requireRole('owner'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { preferred_inspection_date, application_notes } = req.body;

    await client.query('BEGIN');

    // Find certificate and instrument
    const certRes = await client.query(
      `SELECT c.*, i.id as inst_id, i.owner_id, i.system_serial_number, i.installation_place, i.installation_address, u.district as owner_district
       FROM certificates c
       JOIN instruments i ON c.instrument_id = i.id
       JOIN users u ON i.owner_id = u.id
       WHERE c.id = $1 FOR UPDATE`,
      [id]
    );

    if (certRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }

    const cert = certRes.rows[0];

    if (cert.owner_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'You do not own this certified instrument.' });
    }

    // Check if another renewal/active application already exists for this instrument
    const activeApp = await client.query(
      `SELECT id, application_number, status FROM applications
       WHERE instrument_id = $1 AND status NOT IN ('verified', 'rejected')`,
      [cert.inst_id]
    );

    if (activeApp.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Instrument already has an active verification/renewal application (${activeApp.rows[0].application_number}).`
      });
    }

    // Generate unique renewal application number
    const appNumber = await getNextApplicationNumber(client);

    // District officer lookup
    const { findDistrictOfficer } = require('./applications');
    // Direct query for district officer
    const offRes = await client.query(
      `SELECT u.id, u.full_name
       FROM users u
       WHERE u.role = 'officer'
         AND u.is_active = TRUE
         AND LOWER(TRIM(u.district)) = LOWER(TRIM($1))
       ORDER BY (
         SELECT COUNT(*) FROM applications a
         WHERE a.assigned_officer_id = u.id AND a.status IN ('submitted', 'under_review', 'inspection_scheduled')
       ) ASC, u.id ASC`,
      [cert.owner_district]
    );

    const assignedOfficerId = offRes.rows.length > 0 ? offRes.rows[0].id : null;

    const insertApp = await client.query(
      `INSERT INTO applications (
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
      ) VALUES ($1, $2, $3, 'renewal', $4, $5, $6, $7, $8, 'submitted')
      RETURNING *`,
      [
        appNumber,
        cert.inst_id,
        req.user.id,
        cert.owner_district,
        cert.installation_address,
        preferred_inspection_date || null,
        `Renewal for Certificate ${cert.certificate_number}. ${application_notes || ''}`,
        assignedOfficerId
      ]
    );

    const renewalApp = insertApp.rows[0];

    // Mark instrument status as pending_verification
    await client.query(
      "UPDATE instruments SET status = 'pending_verification', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [cert.inst_id]
    );

    if (assignedOfficerId) {
      await notifyUser({
        userId: assignedOfficerId,
        title: 'New Certificate Renewal Application',
        message: `Renewal application ${appNumber} has been assigned to you.`,
        type: 'info',
        client
      });
    } else {
      await notifyAdmins({
        title: 'Renewal Application Needs Officer Assignment',
        message: `Renewal application ${appNumber} submitted for district '${cert.owner_district}' requires manual officer assignment.`,
        type: 'warning',
        client
      });
    }

    await logAudit({
      userId: req.user.id,
      action: 'CERTIFICATE_RENEWAL_REQUEST',
      entityType: 'application',
      entityId: renewalApp.id,
      details: {
        certificate_number: cert.certificate_number,
        renewal_application_number: appNumber
      },
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Certificate renewal application submitted successfully.',
      application: renewalApp
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Certificate Renewal Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to request renewal: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
