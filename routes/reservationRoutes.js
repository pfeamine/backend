import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../dbAdapter.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all reservation endpoints
router.use(authMiddleware);

// @route   GET /api/reservations/spots
// @desc    Get all charging spots
// @access  Private
router.get('/spots', async (req, res) => {
  try {
    const spots = await db.getAllSpots();
    res.json(spots);
  } catch (error) {
    console.error('Fetch Spots Error:', error.message);
    res.status(500).json({ error: 'Server error retrieving spots.' });
  }
});

// @route   GET /api/reservations
// @desc    Get reservations for current user (or all if admin)
// @access  Private
router.get('/', async (req, res) => {
  try {
    let reservations;
    if (req.user.role === 'admin') {
      reservations = await db.getAllReservations();
    } else {
      reservations = await db.getUserReservations(req.user.id);
    }
    res.json(reservations);
  } catch (error) {
    console.error('Fetch Reservations Error:', error.message);
    res.status(500).json({ error: 'Server error retrieving reservations.' });
  }
});

// @route   POST /api/reservations
// @desc    Create a reservation
// @access  Private
router.post(
  '/',
  [
    body('charging_spot_id').isUUID().withMessage('Invalid charging spot ID.'),
    body('start_time').isISO8601().withMessage('Start time must be a valid ISO 8601 date.'),
    body('end_time').isISO8601().withMessage('End time must be a valid ISO 8601 date.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => e.msg) });
    }

    const { charging_spot_id, start_time, end_time } = req.body;
    const start = new Date(start_time);
    const end = new Date(end_time);
    const now = new Date();

    // Validations:
    if (start < now) {
      return res.status(400).json({ error: 'Start time must be in the future.' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'End time must be after the start time.' });
    }

    // Minimum reservation 15 minutes, max 24 hours
    const durationMs = end - start;
    if (durationMs < 15 * 60 * 1000) {
      return res.status(400).json({ error: 'Minimum booking duration is 15 minutes.' });
    }
    if (durationMs > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Maximum booking duration is 24 hours.' });
    }

    try {
      // 1. Verify spot exists and is available (not maintenance)
      const spots = await db.getAllSpots();
      const targetSpot = spots.find(s => s.id === charging_spot_id);
      if (!targetSpot) {
        return res.status(404).json({ error: 'Charging spot not found.' });
      }
      if (targetSpot.status === 'maintenance') {
        return res.status(400).json({ error: 'This charging spot is currently under maintenance.' });
      }

      // 2. Double Booking Check (Overlap check)
      const hasOverlap = await db.checkOverlap(charging_spot_id, start_time, end_time);
      if (hasOverlap) {
        return res.status(409).json({ error: 'Time slot conflict: This charging spot is already booked during your selected time.' });
      }

      // 3. Create reservation
      const reservation = await db.createReservation({
        user_id: req.user.id,
        charging_spot_id,
        start_time,
        end_time
      });

      res.status(201).json({
        message: 'Reservation created successfully!',
        reservation
      });
    } catch (error) {
      console.error('Create Reservation Error:', error.message);
      res.status(500).json({ error: error.message || 'Server error creating reservation.' });
    }
  }
);

// @route   PUT /api/reservations/:id/cancel
// @desc    Cancel a reservation
// @access  Private
router.put('/:id/cancel', async (req, res) => {
  const reservationId = req.params.id;

  try {
    // 1. Check reservation exists
    const reservation = await db.getReservationById(reservationId);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    // 2. Security Check: Only own user or admin can cancel
    if (req.user.role !== 'admin' && reservation.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You can only cancel your own reservations.' });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ error: 'Reservation is already cancelled.' });
    }

    // 3. Cancel
    const updatedReservation = await db.cancelReservation(reservationId);
    res.json({
      message: 'Reservation cancelled successfully.',
      reservation: updatedReservation
    });
  } catch (error) {
    console.error('Cancel Reservation Error:', error.message);
    res.status(500).json({ error: 'Server error cancelling reservation.' });
  }
});

export default router;
