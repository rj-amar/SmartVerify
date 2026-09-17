const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Documents and inspection photos are stored permanently in Supabase Storage.
// Certificates may still be generated temporarily on the server and are cleaned up.
const certsDir = path.join(os.tmpdir(), 'smartverify-certificates');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

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

function hasExpectedSignature(fileOrBuffer, mimeType) {
  const header = Buffer.isBuffer(fileOrBuffer)
    ? fileOrBuffer.subarray(0, 12)
    : fs.readFileSync(fileOrBuffer).subarray(0, 12);

  const startsWith = (...bytes) => bytes.every((byte, index) => header[index] === byte);

  if (mimeType === 'application/pdf') return startsWith(0x25, 0x50, 0x44, 0x46, 0x2D);
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return startsWith(0xFF, 0xD8, 0xFF);
  if (mimeType === 'image/png') return startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
  if (mimeType === 'image/webp') return startsWith(0x52, 0x49, 0x46, 0x46) && header.subarray(8, 12).toString() === 'WEBP';
  return false;
}

// Keep files in memory only long enough to upload them to Supabase Storage.
// This avoids relying on Vercel's temporary project filesystem.
const memoryStorage = multer.memoryStorage();

const uploadDocument = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOC_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG, WEBP.'));
    }
  }
});

const uploadInspectionPhotos = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_PHOTO_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Photos must be JPG, JPEG, PNG, or WEBP.'));
    }
  }
});

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
  // Kept for certificate generation compatibility.
  certsDir,
  hasExpectedSignature
};
