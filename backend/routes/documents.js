const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadDocument, docsDir, hasExpectedSignature } = require('../middleware/upload');
const { logAudit } = require('../utils/audit');
const { notifyUser } = require('../utils/notifications');

/**
 * GET /api/documents/:applicationId
 * List all documents for an application
 */
// Keep the file endpoint before the generic /:applicationId route.
router.get('/file/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);

    const docRes = await db.query(
      `SELECT d.*, a.applicant_id, a.assigned_officer_id
       FROM documents d
       JOIN applications a ON d.application_id = a.id
       WHERE d.stored_filename = $1`,
      [safeFilename]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document record not found.' });
    }

    const doc = docRes.rows[0];
    const user = req.user;
    if (user.role === 'owner' && doc.applicant_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (user.role === 'officer' && doc.assigned_officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const filePath = path.join(docsDir, safeFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Physical file not found.' });
    }

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.original_filename)}`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error('[Document Serve Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve file.' });
  }
});

router.get('/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const user = req.user;

    // Verify application access
    const appRes = await db.query(
      'SELECT applicant_id, assigned_officer_id FROM applications WHERE id = $1',
      [applicationId]
    );

    if (appRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = appRes.rows[0];
    if (user.role === 'owner' && app.applicant_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (user.role === 'officer' && app.assigned_officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const docs = await db.query(
      `SELECT d.*, u.full_name as reviewed_by_name
       FROM documents d
       LEFT JOIN users u ON d.reviewed_by = u.id
       WHERE d.application_id = $1
       ORDER BY d.uploaded_at ASC`,
      [applicationId]
    );

    return res.json({
      success: true,
      documents: docs.rows
    });
  } catch (err) {
    console.error('[Documents GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve documents.' });
  }
});

/**
 * POST /api/documents/:applicationId/upload
 * Upload a document to an application (Owner or Admin)
 */
router.post('/:applicationId/upload', authenticateToken, requireRole('owner', 'admin'), uploadDocument, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { document_type } = req.body;
    const file = req.file;
    const user = req.user;

    if (!file) {
      return res.status(422).json({
        success: false,
        error: 'Please select a document file to upload.'
      });
    }

    if (!hasExpectedSignature(file.path, file.mimetype)) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(422).json({ success: false, error: 'The uploaded file content does not match its declared type.' });
    }

    if (!document_type) {
      // Clean up uploaded file if validation fails
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(422).json({
        success: false,
        error: 'Document type is required.'
      });
    }

    // Verify application belongs to owner
    const appRes = await db.query(
      'SELECT id, applicant_id, application_number FROM applications WHERE id = $1',
      [applicationId]
    );

    if (appRes.rows.length === 0) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const app = appRes.rows[0];
    if (user.role === 'owner' && app.applicant_id !== user.id) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const insertRes = await db.query(
      `INSERT INTO documents (
        application_id,
        uploaded_by,
        document_type,
        original_filename,
        stored_filename,
        file_path,
        mime_type,
        file_size,
        verification_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *`,
      [
        applicationId,
        user.id,
        document_type.trim(),
        file.originalname,
        file.filename,
        file.path,
        file.mimetype,
        file.size
      ]
    );

    const doc = insertRes.rows[0];

    await logAudit({
      userId: user.id,
      action: 'DOCUMENT_UPLOAD',
      entityType: 'document',
      entityId: doc.id,
      details: {
        application_id: applicationId,
        document_type: doc.document_type,
        filename: doc.original_filename
      },
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      document: doc
    });
  } catch (err) {
    console.error('[Document Upload Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload document: ' + err.message });
  }
});

/**
 * PATCH /api/documents/:id/status
 * Officer verifies or rejects a document
 */
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const user = req.user;

    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(422).json({
        success: false,
        error: "Status must be 'verified', 'rejected', or 'pending'."
      });
    }

    if (status === 'rejected' && !rejection_reason) {
      return res.status(422).json({
        success: false,
        error: 'Rejection reason is required when rejecting a document.'
      });
    }

    // Check document and assigned officer
    const docRes = await db.query(
      `SELECT d.*, a.applicant_id, a.assigned_officer_id, a.application_number
       FROM documents d
       JOIN applications a ON d.application_id = a.id
       WHERE d.id = $1`,
      [id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const doc = docRes.rows[0];

    // Only assigned officer or admin can verify documents
    if (user.role === 'officer' && doc.assigned_officer_id !== user.id) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this application.' });
    }
    if (user.role !== 'officer' && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const updateRes = await db.query(
      `UPDATE documents
       SET verification_status = $1,
           rejection_reason = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3
       WHERE id = $4
       RETURNING *`,
      [status, status === 'rejected' ? rejection_reason.trim() : null, user.id, id]
    );

    const updatedDoc = updateRes.rows[0];

    // Keep the applicant informed of review outcomes.
    if (status === 'rejected') {
      await notifyUser({
        userId: doc.applicant_id,
        title: 'Document Rejected',
        message: `Your document '${doc.original_filename}' for application ${doc.application_number} was rejected: ${rejection_reason}`,
        type: 'warning'
      });
    } else if (status === 'verified') {
      await notifyUser({
        userId: doc.applicant_id,
        title: 'Document Verified',
        message: `Your document '${doc.original_filename}' for application ${doc.application_number} has been verified.`,
        type: 'success'
      });
    }

    await logAudit({
      userId: user.id,
      action: `DOCUMENT_${status.toUpperCase()}`,
      entityType: 'document',
      entityId: id,
      details: {
        application_id: doc.application_id,
        status,
        rejection_reason: status === 'rejected' ? rejection_reason : null
      },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Document marked as ${status}.`,
      document: updatedDoc
    });
  } catch (err) {
    console.error('[Document Status Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to update document status.' });
  }
});

module.exports = router;
