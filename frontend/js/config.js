/**
 * Online Verification System - Frontend Global Configuration & Utilities
 */

const CONFIG = {
  API_BASE: '/api',
  TOKEN_KEY: 'ovs_auth_token',
  USER_KEY: 'ovs_user_profile',
  
  INDIAN_STATES: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ],

  INSTRUMENT_CATEGORIES: [
    'Commercial Weighing Scales',
    'Industrial Weighbridges',
    'Precision Laboratory Balances',
    'Volumetric Measures & Flow Meters',
    'Length & Linear Measuring Devices',
    'Automatic Tank Gauges',
    'Commercial Fuel Dispensers',
    'Electricity & Energy Meters'
  ],

  UNITS: ['kg', 'g', 'mg', 'ton', 'L', 'mL', 'm', 'cm', 'mm', 'kWh', 'bar', 'psi'],

  ACCURACY_CLASSES: [
    'Class I (Special Precision)',
    'Class II (High Precision)',
    'Class III (Medium / Commercial)',
    'Class IV (Ordinary / Industrial)'
  ],

  DOCUMENT_TYPES: [
    'Previous Verification Certificate',
    'Calibration Report',
    'Identity Proof',
    'Purchase Invoice',
    'Site Installation Approval',
    'Other Supporting Document'
  ]
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeApiData(value) {
  if (typeof value === 'string') return escapeHtml(value);
  if (Array.isArray(value)) return value.map(sanitizeApiData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeApiData(item)]));
  }
  return value;
}

// ====================================================================
// Storage Helpers
// ====================================================================
const Storage = {
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },
  setToken(token) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
  },
  removeToken() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
  },
  getUser() {
    try {
      const data = localStorage.getItem(CONFIG.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  setUser(user) {
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  },
  removeUser() {
    localStorage.removeItem(CONFIG.USER_KEY);
  },
  clearAuth() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
  }
};

// ====================================================================
// Robust API Request Handler
// Crucial Rule: Normal API errors must NEVER automatically log out.
// Only 401 when verifying token expiration can prompt re-login.
// ====================================================================
async function apiRequest(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE}${endpoint}`;
  const token = Storage.getToken();

  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, { ...options, headers });
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = sanitizeApiData(await response.json());
    } else {
      data = { raw: await response.text() };
    }

    // Handle Auth expiration specifically without dropping token on normal 401s from invalid credentials
    if (response.status === 401 && endpoint === '/auth/me') {
      Storage.clearAuth();
      if (window.App) window.App.renderAuthUI();
      showToast('Your session has expired. Please log in again.', 'warning');
    }

    return {
      status: response.status,
      ok: response.ok,
      data
    };
  } catch (err) {
    console.error(`API Error on [${endpoint}]:`, err);
    showToast('Unable to connect to the server. Please check your network connection.', 'danger');
    return {
      status: 0,
      ok: false,
      data: { success: false, error: 'Network connection failed.' }
    };
  }
}

// ====================================================================
// Toast Notification System
// ====================================================================
function showToast(message, type = 'info', duration = 4500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconMap = {
    success: 'bi-check-circle-fill',
    danger: 'bi-exclamation-octagon-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };
  const icon = iconMap[type] || 'bi-info-circle-fill';

  toast.innerHTML = `
    <i class="bi ${icon} toast-icon"></i>
    <div class="toast-body">${escapeHtml(message)}</div>
    <button type="button" class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Formatters
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch (e) {
    return dateStr;
  }
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  const map = {
    registered: { label: 'Registered', cls: 'badge-secondary' },
    submitted: { label: 'Submitted', cls: 'badge-info' },
    under_review: { label: 'Under Review', cls: 'badge-primary' },
    inspection_scheduled: { label: 'Inspection Scheduled', cls: 'badge-warning' },
    inspection_completed: { label: 'Inspection Completed', cls: 'badge-info' },
    verified: { label: 'Verified', cls: 'badge-success' },
    certificate_issued: { label: 'Certificate Issued', cls: 'badge-success' },
    valid: { label: 'Valid', cls: 'badge-success' },
    expired: { label: 'Expired', cls: 'badge-danger' },
    rejected: { label: 'Rejected', cls: 'badge-danger' },
    cancelled: { label: 'Cancelled', cls: 'badge-secondary' },
    pending: { label: 'Pending', cls: 'badge-warning' },
    pass: { label: 'PASS', cls: 'badge-success' },
    fail: { label: 'FAIL', cls: 'badge-danger' }
  };
  const item = map[s] || { label: status, cls: 'badge-secondary' };
  return `<span class="badge ${item.cls}">${item.label}</span>`;
}
