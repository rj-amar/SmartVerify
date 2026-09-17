const express = require('express');
const db = require('../db/database');

const router = express.Router();

const CATEGORIES = new Set([
  'suspected_inaccurate_measurement',
  'certificate_verification_issue',
  'suspected_tampering',
  'incorrect_weighing_measuring',
  'instrument_display_issue',
  'other'
]);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validMobile(value) {
  return /^[0-9+()\-\s]{7,20}$/.test(value);
}

function validEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * POST /api/complaints
 * Public consumer complaint submission. No login required.
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const consumerName = clean(body.consumer_name);
    const mobile = clean(body.mobile);
    const email = clean(body.email);
    const instrumentType = clean(body.instrument_type);
    const manufacturer = clean(body.manufacturer);
    const modelNumber = clean(body.model_number);
    const serialNumber = clean(body.serial_number);
    const certificateNumber = clean(body.certificate_number);
    const category = clean(body.category);
    const description = clean(body.description);
    const location = clean(body.location);
    const incidentDate = clean(body.incident_date);

    if (!consumerName || !mobile || !instrumentType || !category || !description || !location) {
      return res.status(400).json({ success: false, error: 'Please complete all required complaint fields.' });
    }
    if (!validMobile(mobile)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid mobile number.' });
    }
    if (!validEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (!CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, error: 'Invalid complaint category.' });
    }
    if (description.length < 15 || description.length > 3000) {
      return res.status(400).json({ success: false, error: 'Complaint description must be between 15 and 3000 characters.' });
    }
    if (location.length > 1000) {
      return res.status(400).json({ success: false, error: 'Location is too long.' });
    }
    if (incidentDate && !/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid incident date.' });
    }

    const year = new Date().getFullYear();
    const insert = await db.query(
      `INSERT INTO complaints (
        complaint_reference, consumer_name, mobile, email,
        instrument_type, manufacturer, model_number, serial_number,
        certificate_number, category, description, location, incident_date
      ) VALUES (
        'CMP-' || $1 || '-' || LPAD(nextval('complaint_serial_seq')::text, 6, '0'),
        $2, $3, NULLIF($4, ''),
        $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''),
        NULLIF($9, ''), $10, $11, $12, NULLIF($13, '')::date
      )
      RETURNING complaint_reference, created_at`,
      [
        year, consumerName, mobile, email,
        instrumentType, manufacturer, modelNumber, serialNumber,
        certificateNumber, category, description, location, incidentDate
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaint: {
        complaint_reference: insert.rows[0].complaint_reference,
        status: 'submitted',
        created_at: insert.rows[0].created_at
      }
    });
  } catch (err) {
    console.error('[Complaint POST Error]:', err);
    return res.status(500).json({ success: false, error: 'Unable to submit the complaint right now. Please try again.' });
  }
});

/**
 * GET /api/complaints/:reference
 * Public read-only complaint tracking by reference number.
 * Deliberately exposes no consumer contact details or internal remarks.
 */
router.get('/:reference', async (req, res) => {
  try {
    const reference = clean(req.params.reference).toUpperCase();
    if (!/^CMP-\d{4}-\d{6}$/.test(reference)) {
      return res.status(400).json({ success: false, error: 'Invalid complaint reference.' });
    }

    const result = await db.query(
      `SELECT complaint_reference, instrument_type, category, status, created_at, updated_at
       FROM complaints WHERE complaint_reference = $1`,
      [reference]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Complaint reference not found.' });
    }

    return res.json({ success: true, complaint: result.rows[0] });
  } catch (err) {
    console.error('[Complaint GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Unable to retrieve complaint status.' });
  }
});

module.exports = router;
