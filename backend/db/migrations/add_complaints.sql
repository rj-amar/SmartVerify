-- SmartVerify Consumer Complaints migration
-- Safe to run once on an existing database.

CREATE SEQUENCE IF NOT EXISTS complaint_serial_seq START WITH 1;

CREATE TABLE IF NOT EXISTS complaints (
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
        'submitted',
        'under_review',
        'assigned',
        'inspection_required',
        'resolved',
        'closed'
    )),
    assigned_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    internal_remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_reference ON complaints(complaint_reference);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_officer ON complaints(assigned_officer_id);
