const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Auto update booking statuses based on current date
function syncBookingStatuses() {
  const bookings = db.read('bookings');
  const now = new Date();
  let modified = false;

  bookings.forEach(b => {
    if (b.status === 'Cancelled' || b.status === 'Completed') return;

    const start = new Date(b.startTime);
    const end = new Date(b.endTime);

    let newStatus = b.status;
    if (now > end) {
      newStatus = 'Completed';
    } else if (now >= start && now <= end) {
      newStatus = 'Ongoing';
    } else if (now < start) {
      newStatus = 'Upcoming';
    }

    if (newStatus !== b.status) {
      b.status = newStatus;
      modified = true;
    }
  });

  if (modified) {
    db.write('bookings', bookings);
  }
}

// Get bookings
router.get('/', auth, (req, res) => {
  syncBookingStatuses();
  let bookings = db.read('bookings');

  // Role-based data scoping
  if (req.user.role === 'Employee') {
    bookings = bookings.filter(b => b.userId === req.user.id);
  } else if (req.user.role === 'Department Head') {
    bookings = bookings.filter(b => b.departmentId === req.user.departmentId);
  }

  const { resourceType, status, userId } = req.query;

  if (resourceType) bookings = bookings.filter(b => b.resourceType === resourceType);
  if (status) bookings = bookings.filter(b => b.status === status);
  if (userId) bookings = bookings.filter(b => b.userId === userId);

  // Joins
  const users = db.read('users');
  const depts = db.read('departments');
  const assets = db.read('assets');

  const joined = bookings.map(b => {
    const user = users.find(u => u.id === b.userId);
    const dept = depts.find(d => d.id === b.departmentId);
    const asset = b.assetId ? assets.find(a => a.id === b.assetId) : null;

    return {
      ...b,
      bookedByName: user ? user.name : 'Unknown User',
      departmentName: dept ? dept.name : 'Unassigned',
      assetName: asset ? asset.name : ''
    };
  });

  res.json(joined);
});

// Book resource
router.post('/', auth, (req, res) => {
  const { resourceType, assetId, purpose, startTime, endTime } = req.body;

  if (!resourceType || !startTime || !endTime || !purpose) {
    return res.status(400).json({ message: 'Resource, purpose, start time, and end time are required.' });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  // Validation: Past bookings
  if (start < new Date()) {
    return res.status(400).json({ message: 'Cannot book resources in the past.' });
  }

  if (end <= start) {
    return res.status(400).json({ message: 'End time must occur after the start time.' });
  }

  syncBookingStatuses();
  const bookings = db.read('bookings');

  // Check overlap for the same resource
  // Resource can be identified by resourceType + assetId
  const overlapping = bookings.find(b => {
    if (b.status === 'Cancelled') return false;
    
    const matchesResource = b.resourceType === resourceType && (assetId ? b.assetId === assetId : true);
    if (!matchesResource) return false;

    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);

    // Overlap validation: start < bEnd && end > bStart
    return start < bEnd && end > bStart;
  });

  if (overlapping) {
    const users = db.read('users');
    const owner = users.find(u => u.id === overlapping.userId);
    const ownerName = owner ? owner.name : 'Another Employee';

    return res.status(400).json({
      message: 'Booking conflict: The requested time slot overlaps with an existing booking.',
      conflictDetails: {
        bookedByName: ownerName,
        purpose: overlapping.purpose,
        startTime: overlapping.startTime,
        endTime: overlapping.endTime
      }
    });
  }

  // Create booking
  const newBooking = db.create('bookings', {
    resourceType,
    assetId: assetId || '',
    userId: req.user.id,
    departmentId: req.user.departmentId || '',
    purpose,
    startTime,
    endTime,
    status: 'Upcoming'
  });

  // Create timeline history if it's tied to an asset
  if (assetId) {
    const asset = db.findById('assets', assetId);
    if (asset) {
      const history = [...(asset.history || [])];
      history.push({
        id: `HIST-${Date.now()}`,
        eventType: 'Reserved',
        date: new Date().toISOString(),
        user: req.user.name,
        userId: req.user.id,
        notes: `Booked shared resource "${resourceType}" for: ${purpose}. Slot: ${startTime} to ${endTime}`
      });
      db.update('assets', assetId, { status: 'Reserved', history });
    }
  }

  // Create Notification
  db.create('notifications', {
    userId: req.user.id,
    message: `Your booking for "${resourceType}" has been confirmed for ${new Date(startTime).toLocaleString()}.`,
    type: 'Booking Confirmed',
    link: '/bookings',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Book Resource', 'Booking', newBooking.id, null, newBooking, req);

  res.status(201).json(newBooking);
});

// Cancel booking
router.put('/:id/cancel', auth, (req, res) => {
  const { id } = req.params;
  const booking = db.findById('bookings', id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  // Auth check: Employees can only cancel their own. Admin / Asset Manager can cancel any.
  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && booking.userId !== req.user.id) {
    return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
  }

  if (booking.status === 'Cancelled' || booking.status === 'Completed') {
    return res.status(400).json({ message: `Cannot cancel a booking that is already "${booking.status}".` });
  }

  const original = { ...booking };
  const { updated } = db.update('bookings', id, { status: 'Cancelled' });

  // Free up asset if tied
  if (booking.assetId) {
    const asset = db.findById('assets', booking.assetId);
    if (asset && asset.status === 'Reserved') {
      const history = [...(asset.history || [])];
      history.push({
        id: `HIST-${Date.now()}`,
        eventType: 'Available',
        date: new Date().toISOString(),
        user: req.user.name,
        userId: req.user.id,
        notes: `Resource booking cancelled: ${booking.purpose}. Released to Available.`
      });
      db.update('assets', booking.assetId, { status: 'Available', history });
    }
  }

  // Notify User
  db.create('notifications', {
    userId: booking.userId,
    message: `Your booking for "${booking.resourceType}" on ${new Date(booking.startTime).toLocaleDateString()} has been CANCELLED.`,
    type: 'Booking Cancelled',
    link: '/bookings',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Cancel Booking', 'Booking', id, original, updated, req);

  res.json(updated);
});

// Reschedule Booking
router.put('/:id/reschedule', auth, (req, res) => {
  const { id } = req.params;
  const { startTime, endTime, purpose } = req.body;

  const booking = db.findById('bookings', id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && booking.userId !== req.user.id) {
    return res.status(403).json({ message: 'You are not authorized to reschedule this booking.' });
  }

  if (booking.status === 'Cancelled' || booking.status === 'Completed') {
    return res.status(400).json({ message: 'Cannot reschedule a completed or cancelled booking.' });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start < new Date()) {
    return res.status(400).json({ message: 'New booking time must be in the future.' });
  }

  if (end <= start) {
    return res.status(400).json({ message: 'End time must be after the start time.' });
  }

  syncBookingStatuses();
  const bookings = db.read('bookings');

  // Overlap verification (exclude current booking ID)
  const overlapping = bookings.find(b => {
    if (b.id === id || b.status === 'Cancelled') return false;

    const matchesResource = b.resourceType === booking.resourceType && 
      (booking.assetId ? b.assetId === booking.assetId : true);
    if (!matchesResource) return false;

    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);

    return start < bEnd && end > bStart;
  });

  if (overlapping) {
    const users = db.read('users');
    const owner = users.find(u => u.id === overlapping.userId);
    const ownerName = owner ? owner.name : 'Another Employee';

    return res.status(400).json({
      message: 'Booking conflict: The rescheduled slot overlaps with an existing reservation.',
      conflictDetails: {
        bookedByName: ownerName,
        startTime: overlapping.startTime,
        endTime: overlapping.endTime
      }
    });
  }

  const original = { ...booking };
  const { updated } = db.update('bookings', id, {
    startTime,
    endTime,
    purpose: purpose || booking.purpose,
    status: 'Upcoming' // Reset to upcoming to re-evaluate
  });

  // Log in asset history if tied
  if (booking.assetId) {
    const asset = db.findById('assets', booking.assetId);
    if (asset) {
      const history = [...(asset.history || [])];
      history.push({
        id: `HIST-${Date.now()}`,
        eventType: 'Reserved',
        date: new Date().toISOString(),
        user: req.user.name,
        userId: req.user.id,
        notes: `Rescheduled Booking for "${booking.resourceType}". New Slot: ${startTime} to ${endTime}`
      });
      db.update('assets', booking.assetId, { history });
    }
  }

  // Notify User
  db.create('notifications', {
    userId: booking.userId,
    message: `Your booking for "${booking.resourceType}" has been rescheduled to ${new Date(startTime).toLocaleString()}.`,
    type: 'Booking Rescheduled',
    link: '/bookings',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Reschedule Booking', 'Booking', id, original, updated, req);

  res.json(updated);
});

module.exports = router;
