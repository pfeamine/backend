import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { db } from '../dbAdapter.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'velodya_cyan_ev_charging_station_secret_key_2026';

// Helper: Sign JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, rfid: user.rfid, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('rfid')
      .matches(/^[0-9A-Fa-f]{8}$/).withMessage('RFID must be exactly 8 characters containing only numbers and letters A-F.'),
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role type.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const { rfid, name, email, role } = req.body;
    const upperRfid = rfid.toUpperCase();

    try {
      // Check if user already exists
      const existingUser = await db.getUserByRfid(upperRfid);
      if (existingUser) {
        return res.status(400).json({ error: 'This RFID is already registered.' });
      }

      // Create new user
      const user = await db.createUser({
        rfid: upperRfid,
        name,
        email,
        role: role || 'user'
      });

      const token = generateToken(user);

      res.status(201).json({
        message: 'Registration successful!',
        token,
        user: {
          id: user.id,
          rfid: user.rfid,
          name: user.name,
          email: user.email,
          role: user.role,
          is_enabled: user.is_enabled
        }
      });
    } catch (error) {
      console.error('Registration Error:', error.message);
      res.status(500).json({ error: 'Server error during registration.' });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('rfid')
      .matches(/^[0-9A-Fa-f]{8}$/).withMessage('RFID must be exactly 8 characters containing only numbers and letters A-F.'),
    body('email').isEmail().withMessage('Please provide a valid email address.').normalizeEmail()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const { rfid, email } = req.body;
    const upperRfid = rfid.toUpperCase();

    try {
      // Check for user by RFID and email
      const user = await db.getUserByRfidAndEmail(upperRfid, email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid RFID or email address.' });
      }

      // Check if account is enabled
      if (!user.is_enabled) {
        return res.status(403).json({ error: 'Your account has been disabled by an administrator.' });
      }

      // Generate token
      const token = generateToken(user);

      res.json({
        message: 'Login successful!',
        token,
        user: {
          id: user.id,
          rfid: user.rfid,
          name: user.name,
          email: user.email,
          role: user.role,
          is_enabled: user.is_enabled
        }
      });
    } catch (error) {
      console.error('Login Error:', error.message);
      res.status(500).json({ error: 'Server error during login.' });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      rfid: req.user.rfid,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      is_enabled: req.user.is_enabled
    }
  });
});

export default router;
