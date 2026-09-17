const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { testConnection } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;
const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const defaultOrigin = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const allowedOrigins = [
  ...((process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)),
  defaultOrigin,
  vercelOrigin
].filter(Boolean);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; connect-src 'self'");
  next();
});

// Security & Parsing Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS policy.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure upload folders exist
// Vercel's deployed filesystem is read-only except for /tmp.
const uploadRoot = process.env.VERCEL
  ? path.join('/tmp', 'smartverify-uploads')
  : path.join(__dirname, 'uploads');

const uploadDirs = [
  path.join(uploadRoot, 'documents'),
  path.join(uploadRoot, 'inspection-photos'),
  path.join(uploadRoot, 'certificates')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve frontend static assets
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// API Routes Registration
app.use('/api/auth', require('./routes/auth'));
app.use('/api/instruments', require('./routes/instruments'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/inspections', require('./routes/inspections'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/admin', require('./routes/admin'));

// Public QR Code verification URL redirect / fallback
app.get('/verify-certificate/:code', (req, res) => {
  res.redirect(`/#verify?code=${encodeURIComponent(req.params.code)}`);
});

// Single Page Application Fallback: deliver frontend/index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: `API endpoint '${req.path}' not found.` });
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Central Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Local development startup only.
// On Vercel, the exported Express app is managed by the platform.
async function startServer() {
  const dbCheck = await testConnection();
  if (!dbCheck.success) {
    console.error('[FATAL DATABASE ERROR]: Unable to connect to PostgreSQL database:', dbCheck.error);
    process.exit(1);
  }

  console.log(`[Database Connected]: Connected to PostgreSQL database '${dbCheck.db}' at ${dbCheck.time}`);

  app.listen(PORT, () => {
    console.log(`\n===================================================================`);
    console.log(` Online Verification System for Weighing & Measuring Instruments`);
    console.log(` Server running at: http://localhost:${PORT}`);
    console.log(` Environment:       ${process.env.NODE_ENV || 'development'}`);
    console.log(` Database:          ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`===================================================================\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
