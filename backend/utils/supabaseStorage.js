const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'smartverify-files';

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function cleanStoragePath(storagePath) {
  return String(storagePath || '')
    .split('/')
    .filter(Boolean)
    .map(part => part.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');
}

function objectUrl(storagePath) {
  const safePath = cleanStoragePath(storagePath)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${safePath}`;
}

async function uploadFile(storagePath, buffer, contentType) {
  ensureConfigured();
  if (!Buffer.isBuffer(buffer)) throw new Error('Storage upload requires a Buffer.');

  const response = await fetch(objectUrl(storagePath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: buffer
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail}`);
  }

  return {
    bucket: BUCKET,
    path: cleanStoragePath(storagePath)
  };
}

async function downloadFile(storagePath) {
  ensureConfigured();

  const safePath = cleanStoragePath(storagePath)
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  // Private Supabase buckets should be accessed through a short-lived
  // signed URL. This avoids treating the service key as an end-user JWT.
  const signUrl =
    `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(BUCKET)}/${safePath}`;

  const signResponse = await fetch(signUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 300 })
  });

  if (!signResponse.ok) {
    const detail = await signResponse.text();
    const error = new Error(`Supabase Storage signing failed (${signResponse.status}): ${detail}`);
    error.status = signResponse.status;
    throw error;
  }

  const signData = await signResponse.json();
  if (!signData.signedURL) {
    throw new Error('Supabase Storage did not return a signed URL.');
  }

  const signedUrl = signData.signedURL.startsWith('http')
    ? signData.signedURL
    : `${SUPABASE_URL}/storage/v1${signData.signedURL}`;

  const response = await fetch(signedUrl, { method: 'GET' });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Supabase Storage download failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteFile(storagePath) {
  ensureConfigured();

  const response = await fetch(objectUrl(storagePath), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY
    }
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(`Supabase Storage delete failed (${response.status}): ${detail}`);
  }
}

module.exports = {
  BUCKET,
  uploadFile,
  downloadFile,
  deleteFile
};
