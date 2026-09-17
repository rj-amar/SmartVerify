-- ====================================================================
-- Online Verification System for Weighing & Measuring Instruments
-- PostgreSQL Database Schema
-- ====================================================================

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS complaints CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS inspection_photos CASCADE;
DROP TABLE IF EXISTS inspection_results CASCADE;
DROP TABLE IF EXISTS inspections CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS instruments CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS districts CASCADE;

-- Sequences for sequential, unique system identifiers
DROP SEQUENCE IF EXISTS instrument_serial_seq;
CREATE SEQUENCE instrument_serial_seq START WITH 1;

DROP SEQUENCE IF EXISTS app_serial_seq;
CREATE SEQUENCE app_serial_seq START WITH 1;

DROP SEQUENCE IF EXISTS cert_serial_seq;
CREATE SEQUENCE cert_serial_seq START WITH 1;

DROP SEQUENCE IF EXISTS complaint_serial_seq;
CREATE SEQUENCE complaint_serial_seq START WITH 1;

-- 1. DISTRICTS MASTER TABLE
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    district_name VARCHAR(100) NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_district_state UNIQUE (district_name, state_name)
);

-- 2. USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    business_name VARCHAR(200),
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'officer', 'admin')),
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. INSTRUMENTS TABLE
CREATE TABLE instruments (
    id SERIAL PRIMARY KEY,
    system_serial_number VARCHAR(50) UNIQUE NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instrument_type VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(150) NOT NULL,
    model_number VARCHAR(100) NOT NULL,
    manufacturer_serial_number VARCHAR(100),
    capacity VARCHAR(100) NOT NULL,
    accuracy_class VARCHAR(50) NOT NULL,
    unit_of_measurement VARCHAR(20) NOT NULL,
    purchase_date DATE NOT NULL,
    installation_place VARCHAR(150) NOT NULL,
    installation_address TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'registered' CHECK (status IN (
        'registered',
        'pending_verification',
        'verified',
        'rejected',
        'expired'
    )),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. VERIFICATION APPLICATIONS TABLE
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    application_number VARCHAR(50) UNIQUE NOT NULL,
    instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_type VARCHAR(30) NOT NULL DEFAULT 'initial' CHECK (application_type IN (
        'initial',
        'renewal',
        'reverification'
    )),
    inspection_district VARCHAR(100) NOT NULL,
    inspection_location TEXT NOT NULL,
    preferred_inspection_date DATE,
    application_notes TEXT,
    assigned_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN (
        'submitted',
        'under_review',
        'inspection_scheduled',
        'inspection_completed',
        'verified',
        'rejected',
        'certificate_issued'
    )),
    rejection_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. DOCUMENTS TABLE
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    verification_status VARCHAR(30) DEFAULT 'pending' CHECK (verification_status IN (
        'pending',
        'verified',
        'rejected'
    )),
    rejection_reason TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 6. INSPECTIONS TABLE
CREATE TABLE inspections (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    officer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    inspection_location TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'scheduled' CHECK (status IN (
        'scheduled',
        'completed',
        'cancelled'
    )),
    remarks TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. INSPECTION RESULTS TABLE
CREATE TABLE inspection_results (
    id SERIAL PRIMARY KEY,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    test_point VARCHAR(150) NOT NULL,
    standard_value NUMERIC(14,4) NOT NULL,
    observed_value NUMERIC(14,4) NOT NULL,
    error_value NUMERIC(14,4) NOT NULL,
    error_percentage NUMERIC(8,4) DEFAULT 0,
    permissible_error NUMERIC(14,4) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    result VARCHAR(20) NOT NULL CHECK (result IN ('pass', 'fail')),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. INSPECTION PHOTOS TABLE
CREATE TABLE inspection_photos (
    id SERIAL PRIMARY KEY,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    caption VARCHAR(255),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. CERTIFICATES TABLE
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    issued_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE NOT NULL,
    certificate_status VARCHAR(20) DEFAULT 'valid' CHECK (certificate_status IN (
        'valid',
        'expired',
        'revoked'
    )),
    verification_code VARCHAR(100) UNIQUE NOT NULL,
    pdf_filename VARCHAR(255),
    pdf_path TEXT,
    qr_code_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. CONSUMER COMPLAINTS TABLE
CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    complaint_reference VARCHAR(50) UNIQUE NOT NULL,
    consumer_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    instrument_type VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(150),
    model_number VARCHAR(100),
    serial_number VARCHAR(100),
    certificate_number VARCHAR(100),
    category VARCHAR(80) NOT NULL CHECK (category IN (
        'suspected_inaccurate_measurement',
        'certificate_verification_issue',
        'suspected_tampering',
        'incorrect_weighing_measuring',
        'instrument_display_issue',
        'other'
    )),
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    incident_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'under_review', 'assigned', 'inspection_required', 'resolved', 'closed'
    )),
    assigned_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    internal_remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_complaints_reference ON complaints(complaint_reference);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX idx_complaints_assigned_officer ON complaints(assigned_officer_id);

-- 11. NOTIFICATIONS TABLE
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. AUDIT LOGS TABLE
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INTEGER,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance and Lookup Indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_district ON users(LOWER(TRIM(district)));
CREATE INDEX idx_instruments_owner ON instruments(owner_id);
CREATE INDEX idx_instruments_status ON instruments(status);
CREATE INDEX idx_instruments_serial ON instruments(system_serial_number);
CREATE INDEX idx_applications_applicant ON applications(applicant_id);
CREATE INDEX idx_applications_officer ON applications(assigned_officer_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_district ON applications(LOWER(TRIM(inspection_district)));
CREATE INDEX idx_documents_app ON documents(application_id);
CREATE INDEX idx_inspections_app ON inspections(application_id);
CREATE INDEX idx_inspections_officer ON inspections(officer_id);
CREATE INDEX idx_inspection_results_insp ON inspection_results(inspection_id);
CREATE INDEX idx_inspection_photos_insp ON inspection_photos(inspection_id);
CREATE INDEX idx_certificates_app ON certificates(application_id);
CREATE INDEX idx_certificates_code ON certificates(verification_code);
CREATE INDEX idx_certificates_status ON certificates(certificate_status);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
