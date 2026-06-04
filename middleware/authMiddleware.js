import jwt from 'jsonwebtoken';
import { db } from '../dbAdapter.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'velodya_cyan_ev_charging_station_secret_key_2026';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid. Use "Bearer <token>".' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch fresh user record to verify status and role
    const user = await db.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User associated with this token no longer exists.' });
    }

    if (!user.is_enabled) {
      return res.status(403).json({ error: 'Your account has been disabled. Please contact the administrator.' });
    }

    // Attach user payload to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Session invalid. Please log in again.' });
  }
};

export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
};
