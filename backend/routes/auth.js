const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

/**
 * POST /api/auth/register
 * Register a new instrument owner
 */
router.post('/register', async (req, res) => {
  try {
    const {
      full_name,
      business_name,
      phone,
      email,
      address,
      district,
      state,
      password,
      confirm_password,
      terms_accepted
    } = req.body;

    // 1. Validation
    if (!full_name || !business_name || !phone || !email || !address || !district || !state || !password) {
      return res.status(422).json({
        success: false,
        error: 'All fields marked with an asterisk (*) are required.'
      });
    }

    if (!terms_accepted) {
      return res.status(422).json({
        success: false,
        error: 'You must accept the Terms & Conditions to register.'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(422).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }

    // Indian 10-digit mobile number validation
    const phoneClean = String(phone).replace(/\D/g, '');
    if (phoneClean.length !== 10 || !/^[6-9]/.test(phoneClean)) {
      return res.status(422).json({
        success: false,
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      });
    }

    // State validation against official Indian States/UTs
    if (!INDIAN_STATES.some(s => s.toLowerCase() === String(state).trim().toLowerCase())) {
      return res.status(422).json({
        success: false,
        error: 'Please select a valid Indian State or Union Territory.'
      });
    }

    // District validation: manual text input, ensure not empty
    const districtClean = String(district).trim();
    if (districtClean.length < 2) {
      return res.status(422).json({
        success: false,
        error: 'Please enter a valid district name.'
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(422).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
    }

    if (password !== confirm_password) {
      return res.status(422).json({
        success: false,
        error: 'Password and Confirm Password do not match.'
      });
    }

    // Check email uniqueness
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please login instead.'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user (role forced to 'owner' for public registration)
    const insertRes = await db.query(
      `INSERT INTO users (full_name, business_name, email, phone, password_hash, role, district, state, address, is_active)
       VALUES ($1, $2, $3, $4, $5, 'owner', $6, $7, $8, TRUE)
       RETURNING id, full_name, business_name, email, phone, role, district, state, address, created_at`,
      [
        full_name.trim(),
        business_name.trim(),
        email.trim().toLowerCase(),
        phoneClean,
        passwordHash,
        districtClean,
        state.trim(),
        address.trim()
      ]
    );

    const newUser = insertRes.rows[0];

    // Audit log
    await logAudit({
      userId: newUser.id,
      action: 'USER_REGISTER',
      entityType: 'user',
      entityId: newUser.id,
      details: { role: 'owner', email: newUser.email, district: newUser.district },
      ipAddress: req.ip
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Owner account registered successfully.',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('[Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred during registration. Please try again.'
    });
  }
});

/**
 * POST /api/auth/login
 * User login for all roles
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const userRes = await db.query(
      'SELECT id, full_name, business_name, email, phone, password_hash, role, district, state, address, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      details: { role: user.role },
      ipAddress: req.ip
    });

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      business_name: user.business_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      district: user.district,
      state: user.state,
      address: user.address
    };

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred during login. Please try again.'
    });
  }
});

/**
 * GET /api/auth/me
 * Fetch authenticated user profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

/**
 * PATCH /api/auth/profile
 * Update user profile (never allowing role changes)
 */
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, business_name, phone, address, district, state } = req.body;
    const userId = req.user.id;

    // Never allow role alteration
    const updateRes = await db.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           business_name = COALESCE($2, business_name),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           district = COALESCE($5, district),
           state = COALESCE($6, state),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, full_name, business_name, email, phone, role, district, state, address`,
      [full_name, business_name, phone, address, district, state, userId]
    );

    await logAudit({
      userId,
      action: 'UPDATE_PROFILE',
      entityType: 'user',
      entityId: userId,
      details: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[Profile Update Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile.'
    });
  }
});

module.exports = router;
