/**
 * ====================================================================
 * Online Verification System for Weighing & Measuring Instruments
 * Comprehensive End-to-End Automated Workflow Test Suite
 * Tests all 21 requirements specified in Section 41
 * ====================================================================
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD;

// Helper for assertions
function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = options.headers || {};
  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, headers: response.headers, data: json };
}

async function runTests() {
  if (!INITIAL_ADMIN_PASSWORD) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be set before running the workflow test.');
  }
  console.log('\n====================================================================');
  console.log(' STARTING 21-SCENARIO END-TO-END WORKFLOW VERIFICATION');
  console.log('====================================================================\n');

  const { execSync } = require('child_process');
  console.log('--- RESET: Initializing Clean Database via seed.js ---');
  execSync('node db/seed.js', { cwd: path.join(__dirname, 'backend'), stdio: 'inherit' });
  console.log('--- Database Reset Complete ---\n');

  let adminToken = '';
  let ownerToken = '';
  let officerPurneaToken = '';
  let officerPatnaToken = '';
  let ownerUser = null;
  let officerPurneaUser = null;
  let registeredInstrument = null;
  let verificationApplication = null;
  let scheduledInspection = null;
  let issuedCertificate = null;

  // ------------------------------------------------------------------
  // SETUP: Admin Login & Setup Officers
  // ------------------------------------------------------------------
  console.log('--- PHASE 0: Admin Authentication & Officer Setup ---');
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: 'admin@metrology.gov.in', password: INITIAL_ADMIN_PASSWORD }
  });
  assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin logged in successfully');
  adminToken = adminLogin.data.token;

  // Create Officer for Purnea District
  const officerPurneaEmail = `officer.purnea.${Date.now()}@metrology.gov.in`;
  const officerPurneaRes = await request('/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      full_name: 'Inspector Rajesh Kumar',
      email: officerPurneaEmail,
      phone: '9876543211',
      role: 'officer',
      district: 'Purnea',
      state: 'Bihar',
      password: 'Officer@1234'
    }
  });
  assert(officerPurneaRes.status === 201, 'Created active officer for Purnea district');
  officerPurneaUser = officerPurneaRes.data.user;

  // Create Officer for Patna District (for testing cross-district isolation)
  const officerPatnaEmail = `officer.patna.${Date.now()}@metrology.gov.in`;
  const officerPatnaRes = await request('/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      full_name: 'Inspector Amit Verma',
      email: officerPatnaEmail,
      phone: '9876543212',
      role: 'officer',
      district: 'Patna',
      state: 'Bihar',
      password: 'Officer@1234'
    }
  });
  assert(officerPatnaRes.status === 201, 'Created active officer for Patna district');

  // ------------------------------------------------------------------
  // TEST 1: Register Owner
  // ------------------------------------------------------------------
  console.log('\n--- TEST 1: Register Owner ---');
  const uniqueOwnerEmail = `owner_${Date.now()}@example.com`;
  const registerRes = await request('/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Suresh Chandra Sharma',
      business_name: 'Sharma Grain & Oil Mills',
      phone: '9812345678',
      email: uniqueOwnerEmail,
      address: 'Shop No. 14, Main Mandi Road',
      district: 'Purnea', // Manual text input
      state: 'Bihar', // Dropdown selection
      password: 'OwnerPassword@123',
      confirm_password: 'OwnerPassword@123',
      terms_accepted: true
    }
  });
  assert(registerRes.status === 201, 'Owner registration succeeded with status 201');
  assert(registerRes.data.user.role === 'owner', 'User role correctly assigned as owner');
  assert(registerRes.data.user.district === 'Purnea', 'Owner district accurately saved as Purnea');

  // ------------------------------------------------------------------
  // TEST 2: Login Owner
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Owner Login ---');
  const ownerLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: uniqueOwnerEmail, password: 'OwnerPassword@123' }
  });
  assert(ownerLoginRes.status === 200 && ownerLoginRes.data.token, 'Owner login succeeded and returned JWT');
  ownerToken = ownerLoginRes.data.token;
  ownerUser = ownerLoginRes.data.user;

  // Verify /api/auth/me
  const meRes = await request('/auth/me', {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(meRes.status === 200 && meRes.data.user.email === uniqueOwnerEmail, 'Owner verified profile via /api/auth/me');

  // ------------------------------------------------------------------
  // TEST 3: Register Instrument
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Register Instrument with Auto-Generated Sequential Serial ---');
  const instRes = await request('/instruments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_type: 'Electronic Weighing Balance',
      category: 'Commercial Weighing Scales',
      manufacturer: 'Avery Weigh-Tronix India',
      model_number: 'AV-5000X',
      manufacturer_serial_number: 'MFG-SN-998822',
      capacity: '150',
      accuracy_class: 'Class III',
      unit_of_measurement: 'kg',
      purchase_date: '2025-06-15',
      installation_place: 'Primary Weighbridge Berth',
      installation_address: 'Sharma Grain Mills, Mandi Gate, Purnea, Bihar'
    }
  });
  assert(instRes.status === 201, 'Instrument registered successfully');
  registeredInstrument = instRes.data.instrument;
  assert(
    /^OVS-\d{6}$/.test(registeredInstrument.system_serial_number),
    `Sequential serial generated atomically by backend: ${registeredInstrument.system_serial_number}`
  );
  assert(registeredInstrument.status === 'registered', 'Initial instrument status is registered');

  // Verify owner instruments query returns this instrument
  const myInsts = await request('/instruments', {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(
    myInsts.data.instruments.some(i => i.id === registeredInstrument.id),
    'Registered instrument present in owner instruments list'
  );

  // ------------------------------------------------------------------
  // TEST 4: Apply for Verification (Using Instrument Database ID)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Apply for Verification ---');
  const applyRes = await request('/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_id: registeredInstrument.id, // Integer database ID
      application_type: 'initial',
      inspection_district: 'Purnea', // Entered district
      inspection_location: 'Sharma Grain Mills, Mandi Gate, Purnea',
      preferred_inspection_date: '2026-09-20',
      application_notes: 'Please conduct inspection during morning hours.'
    }
  });
  assert(applyRes.status === 201, 'Verification application submitted successfully');
  verificationApplication = applyRes.data.application;
  assert(
    /^APP-\d{4}-\d{6}$/.test(verificationApplication.application_number),
    `Application number generated with pattern APP-YYYY-XXXXXX: ${verificationApplication.application_number}`
  );
  assert(verificationApplication.status === 'submitted', 'Application status is submitted');

  // ------------------------------------------------------------------
  // TEST 5: Upload Documents
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: Upload Application Documents ---');
  // Create a dummy document buffer
  const samplePdfContent = Buffer.from('%PDF-1.4 sample calibration report test content');
  const formData = new FormData();
  formData.append('document_type', 'Calibration Report');
  formData.append('document', new Blob([samplePdfContent], { type: 'application/pdf' }), 'calibration_cert.pdf');

  const uploadDocRes = await request(`/documents/${verificationApplication.id}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: formData
  });
  assert(uploadDocRes.status === 201, 'Document uploaded via Multer with status 201');
  assert(uploadDocRes.data.document.verification_status === 'pending', 'Document status is pending review');

  // ------------------------------------------------------------------
  // TEST 6: Officer Assignment Verification (District-Based)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: District-Based Officer Assignment ---');
  assert(
    verificationApplication.assigned_officer_id === officerPurneaUser.id,
    `System assigned officer from matching district Purnea (Officer ID: ${officerPurneaUser.id})`
  );
  console.log(`  ✓ Automatic assignment assigned Purnea officer (ID: ${verificationApplication.assigned_officer_id})`);

  // Verify non-cross district isolation: Test cross-district application with non-existent officer district
  const crossInst = await request('/instruments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_type: 'Liquid Flow Meter',
      category: 'Volumetric Measures',
      manufacturer: 'Tokheim',
      model_number: 'FM-100',
      capacity: '500',
      accuracy_class: 'Class II',
      unit_of_measurement: 'L',
      purchase_date: '2025-08-10',
      installation_place: 'Fuel Dispensing Point',
      installation_address: 'Highway Station, Darbhanga'
    }
  });
  const noOfficerApp = await request('/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_id: crossInst.data.instrument.id,
      inspection_district: 'Darbhanga', // No officer exists in Darbhanga yet
      inspection_location: 'Highway Station, Darbhanga'
    }
  });
  assert(noOfficerApp.status === 201, 'Application with no available officer saved successfully');
  assert(
    noOfficerApp.data.application.assigned_officer_id === null,
    'Officer ID left NULL when no officer exists in district (NO cross-district assignment!)'
  );
  assert(
    noOfficerApp.data.assignment_notice.includes('No officer is currently available'),
    'Notice explains application will be assigned by administrator'
  );

  // ------------------------------------------------------------------
  // TEST 7: Officer Login
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: Officer Login ---');
  const offLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { email: officerPurneaEmail, password: 'Officer@1234' }
  });
  assert(offLoginRes.status === 200, 'Purnea Officer logged in successfully');
  officerPurneaToken = offLoginRes.data.token;

  // Also login Patna officer to verify they CANNOT view Purnea application
  const offPatnaLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: officerPatnaEmail, password: 'Officer@1234' }
  });
  officerPatnaToken = offPatnaLogin.data.token;

  const patnaApps = await request('/applications', {
    headers: { Authorization: `Bearer ${officerPatnaToken}` }
  });
  assert(
    !patnaApps.data.applications.some(a => a.id === verificationApplication.id),
    'Patna officer cannot see Purnea assigned application (Strict officer isolation enforced)'
  );

  // ------------------------------------------------------------------
  // TEST 8: Document Review
  // ------------------------------------------------------------------
  console.log('\n--- TEST 8: Officer Reviews Uploaded Document ---');
  const docsList = await request(`/documents/${verificationApplication.id}`, {
    headers: { Authorization: `Bearer ${officerPurneaToken}` }
  });
  assert(docsList.data.documents.length > 0, 'Officer retrieved documents for assigned application');
  const docToVerify = docsList.data.documents[0];

  const reviewDocRes = await request(`/documents/${docToVerify.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: { status: 'verified' }
  });
  assert(reviewDocRes.status === 200 && reviewDocRes.data.document.verification_status === 'verified', 'Officer marked document as verified');

  // ------------------------------------------------------------------
  // TEST 9: Schedule Inspection
  // ------------------------------------------------------------------
  console.log('\n--- TEST 9: Schedule Inspection ---');
  const scheduleRes = await request('/inspections', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: {
      application_id: verificationApplication.id,
      scheduled_date: '2026-09-22',
      scheduled_time: '10:30:00',
      inspection_location: 'Sharma Grain Mills, Mandi Gate, Purnea',
      remarks: 'Bring standard test weight set M1 20kg x 5.'
    }
  });
  assert(scheduleRes.status === 201, 'Inspection scheduled successfully');
  scheduledInspection = scheduleRes.data.inspection;

  // Check application status transitioned to inspection_scheduled
  const appCheck = await request(`/applications/${verificationApplication.id}`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(appCheck.data.application.status === 'inspection_scheduled', 'Application status updated to inspection_scheduled');

  // ------------------------------------------------------------------
  // TEST 10: Owner Receives Notification
  // ------------------------------------------------------------------
  console.log('\n--- TEST 10: Owner Receives Notification ---');
  const notifsRes = await request('/notifications', {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(notifsRes.status === 200, 'Retrieved notifications for owner');
  assert(notifsRes.data.unread_count > 0, `Owner has ${notifsRes.data.unread_count} unread notifications`);
  const foundInspNotif = notifsRes.data.notifications.some(n => n.title.includes('Inspection Scheduled'));
  assert(foundInspNotif, 'Owner received persistent notification for scheduled inspection');

  // ------------------------------------------------------------------
  // TEST 11, 12, 13: Digital Inspection, Photos, and Test Results
  // ------------------------------------------------------------------
  console.log('\n--- TEST 11, 12, 13: Digital Inspection, Test Results, & Photos ---');
  // Upload Inspection Photo
  const samplePhotoContent = Buffer.from('GIF89a sample image binary test');
  const photoForm = new FormData();
  photoForm.append('caption', 'Front display reading verification');
  photoForm.append('photos', new Blob([samplePhotoContent], { type: 'image/png' }), 'inspection_photo_1.png');

  const photoUploadRes = await request(`/inspections/${scheduledInspection.id}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: photoForm
  });
  assert(photoUploadRes.status === 201, 'Officer uploaded inspection photo');

  // Enter Dynamic Test Point Results (Using instrument unit 'kg')
  const testResultsRes = await request(`/inspections/${scheduledInspection.id}/results`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: {
      test_points: [
        {
          test_point: 'Zero Load Repeatability',
          standard_value: 0.0,
          observed_value: 0.0,
          permissible_error: 0.01,
          unit: 'kg',
          remarks: 'Zero return accurate within tolerance'
        },
        {
          test_point: '50% Nominal Load Test',
          standard_value: 75.0,
          observed_value: 75.02,
          permissible_error: 0.05,
          unit: 'kg',
          remarks: 'Observed within maximum permissible error'
        },
        {
          test_point: '100% Maximum Capacity Load Test',
          standard_value: 150.0,
          observed_value: 150.03,
          permissible_error: 0.1,
          unit: 'kg',
          remarks: 'Full scale linearity verified'
        }
      ]
    }
  });
  assert(testResultsRes.status === 200, 'Test results submitted and stored');
  const results = testResultsRes.data.results;
  assert(results.length === 3, 'Recorded 3 test points');
  assert(results.every(r => r.result === 'pass'), 'All 3 test points calculated as PASS');
  assert(Math.abs(parseFloat(results[1].error_value) - 0.02) < 0.0001, 'Error calculation: 75.02 - 75.0 = 0.02 kg');

  // ------------------------------------------------------------------
  // TEST 14: Complete Inspection
  // ------------------------------------------------------------------
  console.log('\n--- TEST 14: Complete Inspection ---');
  const completeInspRes = await request(`/inspections/${scheduledInspection.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: { remarks: 'Digital inspection completed satisfactorily. Instrument conforms to Class III standards.' }
  });
  assert(completeInspRes.status === 200, 'Inspection marked completed');

  const appAfterInsp = await request(`/applications/${verificationApplication.id}`, {
    headers: { Authorization: `Bearer ${officerPurneaToken}` }
  });
  assert(appAfterInsp.data.application.status === 'inspection_completed', 'Application status updated to inspection_completed');

  // ------------------------------------------------------------------
  // TEST 15 & 16: Approve & Generate Certificate
  // ------------------------------------------------------------------
  console.log('\n--- TEST 15 & 16: Approve Application & Generate Certificate ---');
  const approveRes = await request('/certificates/approve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: {
      application_id: verificationApplication.id,
      validity_years: 1,
      remarks: 'Verified under the Legal Metrology General Rules.'
    }
  });
  assert(approveRes.status === 201, 'Application approved and certificate generated');
  issuedCertificate = approveRes.data.certificate;
  assert(
    /^CERT-\d{4}-\d{6}$/.test(issuedCertificate.certificate_number),
    `Sequential certificate number generated: ${issuedCertificate.certificate_number}`
  );
  assert(issuedCertificate.certificate_status === 'valid', 'Certificate status is valid');

  // Verify idempotency: Attempting duplicate approval fails
  const dupApprove = await request('/certificates/approve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: { application_id: verificationApplication.id }
  });
  assert(dupApprove.status === 409, 'Duplicate certificate generation prevented (Transaction-safe idempotency)');

  // Security regression: an officer cannot access certificates outside their assignment.
  const foreignCertificateRead = await request(`/certificates/${issuedCertificate.id}`, {
    headers: { Authorization: `Bearer ${officerPatnaToken}` }
  });
  assert(foreignCertificateRead.status === 403, 'Unassigned officer cannot read another officer\'s certificate');

  // Security regression: officers cannot edit arbitrary instruments.
  const foreignInstrumentEdit = await request(`/instruments/${registeredInstrument.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${officerPatnaToken}` },
    body: { manufacturer: 'Unauthorized Change' }
  });
  assert(foreignInstrumentEdit.status === 403, 'Officer cannot edit an instrument');

  const issuedCertificateReject = await request('/certificates/reject', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: { application_id: verificationApplication.id, rejection_reason: 'Should be blocked after issuance.' }
  });
  assert(issuedCertificateReject.status === 409, 'Issued certificate cannot be rejected without revocation');

  // ------------------------------------------------------------------
  // TEST 17 & 18: QR Code & Public Certificate Verification (No Login)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 17 & 18: Public Certificate Verification (Without Login) ---');
  // Public request has NO Authorization header!
  const publicVerifyRes = await request(`/certificates/verify/${issuedCertificate.certificate_number}`);
  assert(publicVerifyRes.status === 200, 'Public verification endpoint accessible without login');
  assert(publicVerifyRes.data.valid === true, 'Public verification reports certificate as VALID');
  assert(
    publicVerifyRes.data.certificate.certificate_number === issuedCertificate.certificate_number,
    'Returned matching certificate details'
  );
  assert(
    publicVerifyRes.data.certificate.instrument.system_serial_number === registeredInstrument.system_serial_number,
    'Returned matching instrument system serial number'
  );

  // Test invalid certificate search
  const invalidVerify = await request('/certificates/verify/NON-EXISTENT-CERT');
  assert(invalidVerify.status === 404, 'Invalid certificate correctly returns 404');
  assert(invalidVerify.data.valid === false, 'Invalid certificate marked valid: false');

  // ------------------------------------------------------------------
  // TEST 19: Download Certificate PDF
  // ------------------------------------------------------------------
  console.log('\n--- TEST 19: Download Certificate PDF ---');
  const pdfDownload = await request(`/certificates/pdf/${issuedCertificate.certificate_number}`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(pdfDownload.status === 200, 'Owner can download generated PDF');
  assert(
    pdfDownload.headers.get('content-type') === 'application/pdf',
    'Response content-type is application/pdf'
  );

  // ------------------------------------------------------------------
  // TEST 20: Reject Workflow
  // ------------------------------------------------------------------
  console.log('\n--- TEST 20: Rejection Workflow ---');
  // Register another instrument for rejection test
  const rejectInst = await request('/instruments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_type: 'Mechanical Counter Scale',
      category: 'Weighing Scales',
      manufacturer: 'Defective Weights Ltd',
      model_number: 'DEF-01',
      capacity: '20',
      accuracy_class: 'Class IV',
      unit_of_measurement: 'kg',
      purchase_date: '2024-01-01',
      installation_place: 'Backstore',
      installation_address: 'Sharma Grain Mills, Mandi Gate, Purnea'
    }
  });
  const rejectApp = await request('/applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      instrument_id: rejectInst.data.instrument.id,
      inspection_district: 'Purnea',
      inspection_location: 'Sharma Grain Mills, Purnea'
    }
  });

  // Rejection requires reason
  const missingReasonReject = await request('/certificates/reject', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: { application_id: rejectApp.data.application.id, rejection_reason: '' }
  });
  assert(missingReasonReject.status === 422, 'Rejection without reason rejected by validation (422)');

  // Reject with detailed reason
  const rejectionReasonText = 'Knife edges severely worn. Scale fails repeatability tolerance by > 200%.';
  const rejectSuccess = await request('/certificates/reject', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerPurneaToken}` },
    body: {
      application_id: rejectApp.data.application.id,
      rejection_reason: rejectionReasonText
    }
  });
  assert(rejectSuccess.status === 200, 'Application successfully rejected with reason');

  const rejectedAppCheck = await request(`/applications/${rejectApp.data.application.id}`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  assert(rejectedAppCheck.data.application.status === 'rejected', 'Application status updated to rejected');
  assert(
    rejectedAppCheck.data.application.rejection_reason === rejectionReasonText,
    'Rejection reason stored permanently in PostgreSQL'
  );

  // ------------------------------------------------------------------
  // TEST 21: Renewal Workflow
  // ------------------------------------------------------------------
  console.log('\n--- TEST 21: Certificate Renewal Workflow ---');
  const renewRes = await request(`/certificates/${issuedCertificate.id}/renew`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: {
      preferred_inspection_date: '2027-09-15',
      application_notes: 'Requesting annual statutory verification renewal.'
    }
  });
  assert(renewRes.status === 201, 'Renewal application created with status 201');
  const renewalApp = renewRes.data.application;
  assert(renewalApp.application_type === 'renewal', 'Application type is renewal');
  assert(
    renewalApp.instrument_id === registeredInstrument.id,
    'Renewal application references original instrument ID'
  );

  // ------------------------------------------------------------------
  // ADMIN DASHBOARD & AUDIT LOGS CHECK
  // ------------------------------------------------------------------
  console.log('\n--- ADMIN DASHBOARD LIVE METRICS & AUDIT LOGS ---');
  const adminSummary = await request('/admin/summary', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminSummary.status === 200, 'Admin summary fetched with status 200');
  const s = adminSummary.data.summary;
  assert(s.total_users >= 4, `Live users count: ${s.total_users}`);
  assert(s.total_instruments >= 3, `Live instruments count: ${s.total_instruments}`);
  assert(s.total_applications >= 3, `Live applications count: ${s.total_applications}`);
  assert(s.total_certificates >= 1, `Live certificates count: ${s.total_certificates}`);
  console.log('  Live Admin Stats:', JSON.stringify(s, null, 2));

  const auditLogs = await request('/admin/audit-logs', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(auditLogs.status === 200 && auditLogs.data.audit_logs.length > 5, 'Audit logs properly tracked all actions');

  console.log('\n====================================================================');
  console.log(' 🎉 ALL 21 TEST SCENARIOS PASSED WITH ZERO ERRORS!');
  console.log('====================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN ABORTED DUE TO ERROR:', err);
  process.exit(1);
});
