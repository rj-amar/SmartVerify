const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload storage
// Vercel allows temporary file storage only in /tmp.
// Local development continues to use backend/uploads.
const uploadRoot = process.env.VERCEL
  ? path.join('/tmp', 'smartverify-uploads')
  : path.join(__dirname, '..', 'uploads');

const docsDir = path.join(uploadRoot, 'documents');
const photosDir = path.join(uploadRoot, 'inspection-photos');
const certsDir = path.join(uploadRoot, 'certificates');

[docsDir, photosDir, certsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Allowed MIME types
const ALLOWED_DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

const ALLOWED_PHOTO_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

function hasExpectedSignature(filePath, mimeType) {
  const header = fs.readFileSync(filePath).subarray(0, 12);
  const startsWith = (...bytes) => bytes.every((byte, index) => header[index] === byte);

  if (mimeType === 'application/pdf') return startsWith(0x25, 0x50, 0x44, 0x46, 0x2D);
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return startsWith(0xFF, 0xD8, 0xFF);
  if (mimeType === 'image/png') return startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
  if (mimeType === 'image/webp') return startsWith(0x52, 0x49, 0x46, 0x46) && header.subarray(8, 12).toString() === 'WEBP';
  return false;
}

// Document storage engine
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, docsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

// Inspection photo storage engine
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `insp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

// Document upload multer instance
const uploadDocument = multer({
  storage: docStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB per file
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOC_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG, WEBP.'));
    }
  }
});

// Photo upload multer instance (up to 10 photos)
const uploadInspectionPhotos = multer({
  storage: photoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB per photo
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PHOTO_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Photos must be JPG, JPEG, PNG, or WEBP.'));
    }
  }
});

// Middleware helper to handle multer errors gracefully without crashing or logging out
function handleMulterError(multerUpload) {
  return (req, res, next) => {
    multerUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(422).json({
            success: false,
            error: 'File is too large. Maximum allowed size is 5 MB.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(422).json({
            success: false,
            error: 'Too many files uploaded. Maximum 10 photos allowed per inspection.'
          });
        }
        return res.status(422).json({
          success: false,
          error: `File upload error: ${err.message}`
        });
      } else if (err) {
        return res.status(422).json({
          success: false,
          error: err.message
        });
      }
      next();
    });
  };
}

module.exports = {
  uploadDocument: handleMulterError(uploadDocument.single('document')),
  uploadInspectionPhotos: handleMulterError(uploadInspectionPhotos.array('photos', 10)),
  docsDir,
  photosDir,
  certsDir,
  hasExpectedSignature
};
