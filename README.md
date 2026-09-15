# Online Verification System for Weighing & Measuring Instruments

A production-grade, full-stack digital metrology platform that digitizes the verification, inspection, and certification lifecycle for commercial weighing and measuring instruments under statutory Legal Metrology rules.

Built with **Node.js, Express, PostgreSQL, PDFKit, QRCode, Multer, and Vanilla JavaScript (SPA architecture)** with zero fake/hardcoded data.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Key Features](#2-key-features)
3. [Architecture & Design](#3-architecture--design)
4. [Directory & File Structure](#4-directory--file-structure)
5. [Prerequisites & Requirements](#5-prerequisites--requirements)
6. [PostgreSQL Setup & Database Creation](#6-postgresql-setup--database-creation)
7. [Environment Configuration (.env)](#7-environment-configuration-env)
8. [Installation & Dependencies](#8-installation--dependencies)
9. [Database Initialization & Seeding](#9-database-initialization--seeding)
10. [Starting the Application](#10-starting-the-application)
11. [User Roles & Permissions](#11-user-roles--permissions)
12. [End-to-End Workflow](#12-end-to-end-workflow)
13. [REST API Documentation](#13-rest-api-documentation)
14. [Automated Testing Suite (21 Scenarios)](#14-automated-testing-suite-21-scenarios)
15. [Security & Data Integrity](#15-security--data-integrity)
16. [Troubleshooting & FAQ](#16-troubleshooting--faq)

---

## 1. Project Overview

The **Online Verification System (OVS)** replaces paper-based verification stamps and manual registers in Weights & Measures / Legal Metrology directorates with a synchronized digital registry:

- **Instrument Inventory:** Generates permanent sequential serial numbers (e.g. `OVS-000001`) via PostgreSQL atomic sequences.
- **Verification Application Wizard:** 5-step wizard referencing database IDs and capturing exact inspection premises and districts.
- **Jurisdictional Officer Assignment:** Automatically matches active officers in the applicant's district and assigns the officer with the least active workload. If none exist in that district, safely marks the application for administrator assignment without cross-district leakage.
- **Digital Inspection Form:** Field officers log standard values, observed values, and permissible errors across dynamic units (`kg`, `g`, `ton`, `L`, `mL`, `m`, `mm`, `kWh`, etc.), automatically computing error tolerances and PASS/FAIL results.
- **Multi-Photo Field Evidence:** Up to 10 photos per inspection (JPG, PNG, WEBP) validated for MIME type and file size (<5MB).
- **Statutory Digital Certificates:** High-resolution PDF certificates generated via PDFKit featuring an embedded QR code linking to an unauthenticated public verification page.
- **Lifecycle Management:** Real annual renewal workflows and audit logging of every statutory action.

---

## 2. Key Features

- **No Dummy Data:** Displays live PostgreSQL counts (`0` for new accounts; updates in real-time).
- **Sequential System Identifiers:**
  - Instruments: `OVS-000001`
  - Applications: `APP-2026-000001`
  - Certificates: `CERT-2026-000001`
- **Strict Role-Based Authorization:** Separate dashboards and scoped permissions for **OWNER**, **OFFICER**, and **ADMIN**.
- **Dynamic Unit Adaptation:** Unit-aware calculations for mass, volume, length, energy, and pressure instruments.
- **Public QR Code Authenticity Check:** Scan or enter certificate code without logging in to inspect live validity.
- **Persistent In-App Notifications:** Real unread count badges updated across all lifecycle events.
- **Audit Logs:** Permanent ledger of user logins, registrations, submissions, approvals, rejections, and certificate generations.

---

## 3. Architecture & Design

```
+-------------------------------------------------------------------------+
|                        Browser Client (Frontend)                        |
|   HTML5 + CSS3 (Government Portal Theme) + Vanilla JavaScript (SPA)    |
+-------------------------------------------------------------------------+
                                    |
                          REST API / JSON & Multipart
                                    v
+-------------------------------------------------------------------------+
|                         Node.js / Express Server                        |
|  - JWT Middleware (Auth & Role Guard)                                   |
|  - Multer Storage (MIME & 5MB file validation)                          |
|  - PDFKit & QRCode Generator                                            |
|  - Atomic Serial Generator (PostgreSQL sequences)                       |
+-------------------------------------------------------------------------+
                                    |
                          Parameterized SQL Queries
                                    v
+-------------------------------------------------------------------------+
|                       PostgreSQL 18 Database                            |
|  - Users, Districts, Instruments, Applications, Documents               |
|  - Inspections, Inspection Results, Inspection Photos                   |
|  - Certificates, Notifications, Audit Logs                              |
|  - Foreign Keys, Constraints, Unique Indexes, Sequences                 |
+-------------------------------------------------------------------------+
```

---

## 4. Directory & File Structure

```
online-verification-system/
├── frontend/
│   ├── index.html                  # Single Page Application container
│   ├── css/
│   │   └── style.css               # Government portal design system
│   └── js/
│       ├── config.js               # API helper, Indian States/UTs, units, toasts
│       ├── auth.js                 # Login, registration, session management
│       ├── instruments.js          # Owner instruments & auto-serial display
│       ├── applications.js         # 5-step wizard & status timeline tracker
│       ├── inspections.js          # Digital inspection & dynamic unit calculations
│       ├── certificates.js         # PDF download, public QR verification, renewal
│       ├── notifications.js        # Persistent notifications & unread badge
│       ├── admin.js                # Central administration & live statistics
│       ├── officer.js              # Officer assigned workload dashboard
│       └── app.js                  # Main orchestrator & hash router
│
├── backend/
│   ├── server.js                   # Express application entry point
│   ├── .env                        # Environment variables
│   ├── package.json                # Project dependencies
│   ├── db/
│   │   ├── database.js             # pg connection pool & strict env validation
│   │   ├── schema.sql              # Clean DDL with tables, sequences, indexes
│   │   └── seed.js                 # Master districts & default admin account
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification & role authorization
│   │   └── upload.js               # Multer storage configs for docs and photos
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints (/register, /login, /me)
│   │   ├── instruments.js          # Instrument registry endpoints
│   │   ├── applications.js         # Application submission & district assignment
│   │   ├── documents.js            # Document upload & verification
│   │   ├── inspections.js          # Scheduling, test results, photo uploads
│   │   ├── certificates.js         # Approval, PDF generation, QR verify, renewal
│   │   ├── notifications.js        # User notifications & read status
│   │   └── admin.js                # Admin summary, users, districts, audit logs
│   ├── uploads/
│   │   ├── documents/              # Stored verification documents
│   │   ├── inspection-photos/      # Stored digital field photos
│   │   └── certificates/           # Generated PDF certificates
│   └── utils/
│       ├── serial.js               # Transaction-safe sequence generators
│       ├── pdf.js                  # PDFKit certificate layout with QR code
│       ├── notifications.js        # Persistent notification delivery helper
│       └── audit.js                # Audit trail logger
│
├── test-workflow.js                # Automated 21-scenario end-to-end test suite
└── README.md                       # Complete documentation
```

---

## 5. Prerequisites & Requirements

- **Operating System:** Windows 10/11, macOS, or Linux
- **Node.js:** v18.0.0 or later (tested on Node v24)
- **PostgreSQL:** v14 or later (tested on PostgreSQL 18)
- **Browser:** Modern Chrome, Edge, Firefox, or Safari

---

## 6. PostgreSQL Setup & Database Creation

Ensure PostgreSQL is running. In a command prompt or PowerShell:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create the database
CREATE DATABASE online_verification;
\q
```

---

## 7. Environment Configuration (.env)

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=online_verification
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h
APP_BASE_URL=http://localhost:5000
```

> **Note:** The backend validates these variables at startup. If any required variable (such as `DB_PASSWORD`) is missing, the server will fail immediately with an explicit error message.

---

## 8. Installation & Dependencies

Navigate to the `backend/` directory and install dependencies:

```bash
cd backend
npm install
```

Required packages:
- `express`: REST API web framework
- `pg`: PostgreSQL client pool
- `bcryptjs`: Password hashing
- `jsonwebtoken`: Stateless JWT authentication
- `multer`: Secure multipart file uploads
- `pdfkit`: Official vector PDF certificate generation
- `qrcode`: 2D QR code generator
- `cors`: Cross-Origin Resource Sharing
- `dotenv`: Environment configuration loader

---

## 9. Database Initialization & Seeding

Run the seed script only against an isolated development database. It drops and recreates all application tables, so it is blocked unless you explicitly opt in with `ALLOW_DATABASE_RESET=true`:

```bash
cd backend
$env:ALLOW_DATABASE_RESET='true' # PowerShell
$env:INITIAL_ADMIN_PASSWORD='use-a-unique-local-password'
node db/seed.js
```

The seed account is for local development only. Its password is the required `INITIAL_ADMIN_PASSWORD` environment variable; never deploy a bootstrap credential:
- **Email:** `admin@metrology.gov.in`
- **Password:** value of `INITIAL_ADMIN_PASSWORD`
- **Role:** `admin`

---

## 10. Starting the Application

### Start the Backend Server
```bash
cd backend
node server.js
```
The server will start at `http://localhost:5000` and automatically serve the frontend Single Page Application.

### Accessing the Portal
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 11. User Roles & Permissions

| Feature / Action | OWNER | OFFICER | ADMIN |
| :--- | :---: | :---: | :---: |
| Register Business Profile | Yes | No (Admin creates) | No |
| Register Weighing Instruments | Yes | No | View All |
| Submit Verification Application | Yes | No | View All |
| Upload Supporting Documents | Yes | No | Yes |
| View Private Application Queue | Own only | Assigned district only | All |
| Review & Verify Documents | No | Yes | Yes |
| Schedule Field Inspection | No | Yes | Yes |
| Enter Test Point Measurements | No | Yes | Yes |
| Upload Inspection Photographs | No | Yes | Yes |
| Approve / Reject Verification | No | Yes | Yes |
| Generate Official Certificate | Auto on Approve | Initiates | Initiates |
| Download Private Certificate PDF | Own only | Assigned only | All |
| Public QR Certificate Verification | Public | Public | Public |
| Request Certificate Renewal | Yes | No | No |
| Create Officers & Assign Districts | No | No | Yes |
| View System Metrics & Audit Logs | No | No | Yes |

---

## 12. End-to-End Workflow

1. **Owner Registration:** Enter enterprise name, contact details, official state dropdown, and **manual district input** (e.g. "Purnea").
2. **Instrument Registration:** Enter category, type, manufacturer, model, capacity, and unit (`kg`, `L`, etc.). Backend atomically generates `OVS-000001`.
3. **Verification Application:** Launch the 5-step wizard, specify the inspection district ("Purnea"), select preferred dates, and upload calibration documents.
4. **District-Based Officer Assignment:** The system queries active officers matching the inspection district. The officer with the minimum active caseload is assigned. If no officer is found, the application is queued for manual admin allocation.
5. **Inspection Scheduling:** The assigned officer schedules a physical test date. The owner is notified immediately.
6. **Digital Inspection:** The officer opens the digital inspection form. Native units (`kg`, `ton`, `L`, etc.) are pulled directly from PostgreSQL. Observed vs standard values are evaluated for permissible error tolerances with real-time PASS/FAIL calculations.
7. **Photo Evidence:** Up to 10 inspection photos are uploaded and previewed.
8. **Statutory Approval & Certification:** The officer approves the completed test. PDFKit generates the official statutory certificate (`CERT-2026-000001`) with an embedded QR code.
9. **Public Verification:** Anyone can scan the QR code or visit `http://localhost:5000/#verify?code=CERT-2026-000001` to view official verification credentials without logging in.
10. **Renewal:** When a certificate approaches expiry, the owner clicks "Renew" to create a fresh renewal application linked to the instrument.

---

## 13. REST API Documentation

### Authentication (`/api/auth`)
- `POST /api/auth/register`: Register new instrument owner
- `POST /api/auth/login`: Authenticate and receive JWT token
- `GET /api/auth/me`: Retrieve current user profile
- `PATCH /api/auth/profile`: Update business profile

### Instruments (`/api/instruments`)
- `GET /api/instruments`: List user/assigned instruments with search
- `POST /api/instruments`: Register instrument with auto-generated serial
- `GET /api/instruments/:id`: Detail view with verification history
- `PATCH /api/instruments/:id`: Update instrument installation details

### Verification Applications (`/api/applications`)
- `GET /api/applications`: Scoped applications list
- `POST /api/applications`: Submit new application with district officer matching
- `GET /api/applications/:id`: Application detail, timeline, and documents
- `PATCH /api/applications/:id/assign`: Admin manually assigns or reassigns officer

### Documents (`/api/documents`)
- `GET /api/documents/:applicationId`: List documents for application
- `POST /api/documents/:applicationId/upload`: Multer upload (PDF/JPG/PNG < 5MB)
- `GET /api/documents/file/:filename`: Secure file streaming
- `PATCH /api/documents/:id/status`: Officer marks document verified or rejected

### Inspections (`/api/inspections`)
- `GET /api/inspections`: List scheduled inspections
- `POST /api/inspections`: Officer schedules date/time/site
- `GET /api/inspections/:id`: Inspection detail, test points, and photo gallery
- `POST /api/inspections/:id/results`: Save dynamic test point measurements
- `POST /api/inspections/:id/photos`: Upload field inspection photos (up to 10)
- `GET /api/inspections/photo/:filename`: Secure photo streaming
- `POST /api/inspections/:id/complete`: Complete inspection after verifying tests

### Certificates (`/api/certificates`)
- `GET /api/certificates`: List verified certificates
- `POST /api/certificates/approve`: Approve application and generate PDFKit certificate
- `POST /api/certificates/reject`: Reject application with mandatory reason
- `GET /api/certificates/pdf/:identifier`: Download official PDF certificate
- `GET /api/certificates/verify/:code`: **Public unauthenticated** QR verification endpoint
- `POST /api/certificates/:id/renew`: Create statutory renewal application

### Notifications (`/api/notifications`)
- `GET /api/notifications`: Retrieve notifications with unread count
- `PATCH /api/notifications/:id/read`: Mark single notification as read
- `PATCH /api/notifications/read-all`: Mark all notifications read

### Admin (`/api/admin`)
- `GET /api/admin/summary`: Live PostgreSQL metric counts (Zero fake data)
- `GET /api/admin/users`: List owners, officers, admins with search & filters
- `POST /api/admin/users`: Create new officer account with assigned district
- `PATCH /api/admin/users/:id`: Activate/deactivate user or reassign district
- `GET /api/admin/districts`: Master districts directory
- `POST /api/admin/districts`: Add new district
- `GET /api/admin/audit-logs`: System audit trail

---

## 14. Automated Testing Suite (21 Scenarios)

The project includes an end-to-end test script covering all 21 verification scenarios specified in Section 41:

```bash
# Run the automated test suite
$env:ALLOW_DATABASE_RESET='true'
$env:INITIAL_ADMIN_PASSWORD='use-a-unique-local-password'
node test-workflow.js
```

### Verified Test Scenarios:
1. **TEST 1:** Register Owner with manual district & dropdown state
2. **TEST 2:** Login Owner and verify profile via `/api/auth/me`
3. **TEST 3:** Register Instrument; verify `OVS-000001` sequential serial generation
4. **TEST 4:** Apply for Verification using database ID; verify `APP-2026-000001` format
5. **TEST 5:** Upload Application Documents via Multer (PDF/JPG)
6. **TEST 6:** Verify District-Based Officer Assignment (ensures officer in same district is assigned; verifies no cross-district leakage)
7. **TEST 7:** Officer Login & verify strict officer isolation
8. **TEST 8:** Review Documents (verify/reject)
9. **TEST 9:** Schedule Inspection and verify status updates to `inspection_scheduled`
10. **TEST 10:** Verify Owner receives persistent notification
11. **TEST 11:** Officer conduct Digital Inspection
12. **TEST 12:** Upload Inspection Photos with MIME and count validation
13. **TEST 13:** Enter Test Results with dynamic units and automatic error calculations
14. **TEST 14:** Complete Inspection and verify status updates to `inspection_completed`
15. **TEST 15:** Approve Application with validation guards
16. **TEST 16:** Generate Certificate; verify sequential `CERT-2026-000001` format and idempotency
17. **TEST 17:** Generate embedded QR code with public URL
18. **TEST 18:** Public Certificate Verification without login
19. **TEST 19:** Download Certificate PDF
20. **TEST 20:** Rejection Workflow with mandatory reason
21. **TEST 21:** Renewal Workflow creating linked renewal application
- **Bonus:** Live Admin Metrics & Audit Logs verified against PostgreSQL.

---

## 15. Security & Data Integrity

- **Password Security:** Salted bcrypt password hashes (10 rounds). Passwords are never stored or returned in plain text.
- **Stateless Authorization:** Signed JSON Web Tokens (JWT) verified on every private endpoint with role-based checks.
- **SQL Injection Prevention:** 100% parameterized queries using `pg.Pool`.
- **File Upload Security:** Multer enforces MIME filtering (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) and strict 5MB size limits.
- **Transaction Safety:** Multi-table operations (such as certificate generation, serial generation, and status transitions) execute inside `BEGIN...COMMIT` blocks with row-level locks (`FOR UPDATE OF a`).
- **Resilient Error Handling:** API errors return structured JSON (`{ success: false, error: "..." }`) and never cause unintended user logouts.

---

## 16. Troubleshooting & FAQ

**Q: Database connection error (`ECONNREFUSED` or authentication failure)**  
A: Ensure PostgreSQL service is running (`Get-Service *postgres*` on Windows) and verify `DB_PASSWORD` and `DB_PORT` in `backend/.env`.

**Q: Port 5000 is already in use**  
A: Change `PORT=5001` in `backend/.env`. The frontend automatically adapts as it makes relative requests to `/api`.

**Q: How do I reset the database to a clean slate?**  
A: Run `node backend/db/seed.js`. This re-executes `schema.sql`, resets sequences to `1`, and recreates the default admin account.

---

&copy; 2026 Directorate of Legal Metrology &bull; Online Verification System
