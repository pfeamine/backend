import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../dbAdapter.js';
import { authMiddleware, isAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth & admin middlewares to all admin routes
router.use(authMiddleware);
router.use(isAdmin);

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Admin Only
router.get('/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Admin Get Users Error:', error.message);
    res.status(500).json({ error: 'Server error retrieving users.' });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Enable or disable user account
// @access  Admin Only
router.put(
  '/users/:id/status',
  [
    body('is_enabled').isBoolean().withMessage('is_enabled must be a boolean value.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const userId = req.params.id;
    const { is_enabled } = req.body;

    // Prevent admin from disabling their own account
    if (userId === req.user.id && !is_enabled) {
      return res.status(400).json({ error: 'You cannot disable your own admin account.' });
    }

    try {
      const updatedUser = await db.updateUserStatus(userId, is_enabled);
      res.json({
        message: `User account has been ${is_enabled ? 'enabled' : 'disabled'}.`,
        user: updatedUser
      });
    } catch (error) {
      console.error('Admin Toggle User Status Error:', error.message);
      res.status(500).json({ error: 'Server error updating user account status.' });
    }
  }
);

// @route   PUT /api/admin/spots/:id/status
// @desc    Change charging spot status (available/maintenance)
// @access  Admin Only
router.put(
  '/spots/:id/status',
  [
    body('status').isIn(['available', 'maintenance']).withMessage('Status must be "available" or "maintenance".')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const spotId = req.params.id;
    const { status } = req.body;

    try {
      const updatedSpot = await db.updateSpotStatus(spotId, status);
      res.json({
        message: `Spot status updated to ${status}.`,
        spot: updatedSpot
      });
    } catch (error) {
      console.error('Admin Toggle Spot Status Error:', error.message);
      res.status(500).json({ error: 'Server error updating spot status.' });
    }
  }
);

// @route   POST /api/admin/reservations
// @desc    Create a reservation for any user (Admin Feature)
// @access  Admin Only
router.post(
  '/reservations',
  [
    body('user_id').isUUID().withMessage('Invalid user ID.'),
    body('charging_spot_id').isUUID().withMessage('Invalid charging spot ID.'),
    body('start_time').isISO8601().withMessage('Start time must be a valid ISO date.'),
    body('end_time').isISO8601().withMessage('End time must be a valid ISO date.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const { user_id, charging_spot_id, start_time, end_time } = req.body;
    const start = new Date(start_time);
    const end = new Date(end_time);

    if (start >= end) {
      return res.status(400).json({ error: 'End time must be after the start time.' });
    }

    try {
      // 1. Verify user exists
      const targetUser = await db.getUserById(user_id);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (!targetUser.is_enabled) {
        return res.status(400).json({ error: 'Target user account is disabled.' });
      }

      // 2. Check overlap
      const hasOverlap = await db.checkOverlap(charging_spot_id, start_time, end_time);
      if (hasOverlap) {
        return res.status(409).json({ error: 'Overlap conflict: Spot is already reserved during these hours.' });
      }

      // 3. Create
      const reservation = await db.createReservation({
        user_id,
        charging_spot_id,
        start_time,
        end_time
      });

      res.status(201).json({
        message: 'Admin reservation created successfully!',
        reservation
      });
    } catch (error) {
      console.error('Admin Create Reservation Error:', error.message);
      res.status(500).json({ error: error.message || 'Server error creating reservation.' });
    }
  }
);

// @route   PUT /api/admin/reservations/:id
// @desc    Edit any reservation (spot, time, status)
// @access  Admin Only
router.put(
  '/reservations/:id',
  [
    body('charging_spot_id').optional().isUUID().withMessage('Invalid spot ID.'),
    body('start_time').optional().isISO8601().withMessage('Invalid start time.'),
    body('end_time').optional().isISO8601().withMessage('Invalid end time.'),
    body('status').optional().isIn(['confirmed', 'cancelled']).withMessage('Status must be confirmed or cancelled.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const resId = req.params.id;
    const { charging_spot_id, start_time, end_time, status } = req.body;

    try {
      // Fetch current reservation details
      const existingRes = await db.getReservationById(resId);
      if (!existingRes) {
        return res.status(404).json({ error: 'Reservation not found.' });
      }

      // Consolidate values
      const targetSpotId = charging_spot_id || existingRes.charging_spot_id;
      const targetStart = start_time || existingRes.start_time;
      const targetEnd = end_time || existingRes.end_time;
      const targetStatus = status || existingRes.status;

      const start = new Date(targetStart);
      const end = new Date(targetEnd);

      if (start >= end) {
        return res.status(400).json({ error: 'End time must be after start time.' });
      }

      // Check overlap ONLY if status is confirmed, excluding this reservation itself
      if (targetStatus === 'confirmed') {
        const hasOverlap = await db.checkOverlap(targetSpotId, targetStart, targetEnd, resId);
        if (hasOverlap) {
          return res.status(409).json({ error: 'Overlap conflict: Spot is already reserved during these hours.' });
        }
      }

      // Update
      const updatedRes = await db.updateReservation(resId, {
        charging_spot_id: targetSpotId,
        start_time: targetStart,
        end_time: targetEnd,
        status: targetStatus
      });

      res.json({
        message: 'Reservation updated successfully by Admin.',
        reservation: updatedRes
      });
    } catch (error) {
      console.error('Admin Edit Reservation Error:', error.message);
      res.status(500).json({ error: error.message || 'Server error updating reservation.' });
    }
  }
);

// @route   DELETE /api/admin/reservations/:id
// @desc    Hard delete a reservation
// @access  Admin Only
router.delete('/reservations/:id', async (req, res) => {
  const resId = req.params.id;

  try {
    const existing = await db.getReservationById(resId);
    if (!existing) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    await db.deleteReservation(resId);
    res.json({ message: 'Reservation removed successfully.' });
  } catch (error) {
    console.error('Admin Delete Reservation Error:', error.message);
    res.status(500).json({ error: 'Server error deleting reservation.' });
  }
});

export default router;
