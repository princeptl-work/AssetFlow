const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Auto-sync booking statuses based on current time
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

// ==========================================
// GET ALL BOOKINGS
// Admin, Asset Manager: all bookings
// Department Head: their department's bookings
// Employee: their own bookings
// ==========================================
router.get('/', auth, (req, res) => {
  syncBookingStatuses();
  let bookings = db.read('bookings');

  if (req.user.role === 'Employee') {
    bookings = bookings.filter(b => b.userId === req.user.id);
  } else if (req.user.role === 'Department Head') {
    bookings = bookings.filter(b => b.departmentId === req.user.departmentId);
  }

  const { resourceType, status, userId } = req.query;
  if (resourceType) bookings = bookings.filter(b => b.resourceType === resourceType);
  if (status) bookings = bookings.filter(b => b.status === status);
  if (userId && (req.user.role === 'Admin' || req.user.role === 'Asset Manager')) {
    bookings = bookings.filter(b => b.userId === userId);
  }

  // Enrich with related names
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
      assetName: asset ? asset.name : '',
      assetTag: asset ? asset.assetTag : ''
    };
  });

  res.json(joined);
});

// ==========================================
// CREATE BOOKING
// Any authenticated user (Employee, Department Head, Asset Manager, Admin)
// Schema: bookings — resourceType, assetId, userId, purpose, startTime, endTime, status, departmentId, createdAt(auto), updatedAt(auto)
// ==========================================
router.post('/', auth, (req, res) => {
  const { resourceType, assetId, purpose, startTime, endTime } = req.body;

  if (!resourceType || !startTime || !endTime || !purpose) {
    return res.status(400).json({ message: 'Resource type, purpose, start time, and end time are required.' });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date format for startTime or endTime.' });
  }

  if (start < new Date()) {
    return res.status(400).json({ message: 'Cannot book resources in the past.' });
  }

  if (end <= start) {
    return res.status(400).json({ message: 'End time must be after the start time.' });
  }

  // Validate bookable asset if provided
  if (assetId && assetId !== '') {
    const asset = db.findById('assets', assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Linked asset not found.' });
    }
    if (asset.bookable !== 'Yes') {
      return res.status(400).json({ message: 'This asset is not marked as a bookable/shared resource.' });
    }
    if (asset.status !== 'Available' && asset.status !== 'Reserved') {
      return res.status(400).json({ message: `Asset is not available for booking (current status: ${asset.status}).` });
    }
  }

  syncBookingStatuses();
  const bookings = db.read('bookings');

  // Overlap check — specific asset bookings match only same asset; general bookings match only same resourceType without asset
  const overlapping = bookings.find(b => {
    if (b.status === 'Cancelled' || b.status === 'Completed') return false;

    // Both have assetId: check same asset
    if (assetId && b.assetId) {
      if (b.assetId !== assetId) return false;
    } else if (!assetId && !b.assetId) {
      // Both are general: check same resourceType
      if (b.resourceType !== resourceType) return false;
    } else {
      // One has asset, one doesn't — different booking types, no conflict
      return false;
    }

    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);
    return start < bEnd && end > bStart;
  });

  if (overlapping) {
    const users = db.read('users');
    const owner = users.find(u => u.id === overlapping.userId);
    return res.status(400).json({
      message: 'Booking conflict: The requested time slot overlaps with an existing booking.',
      conflictDetails: {
        bookedByName: owner ? owner.name : 'Another user',
        purpose: overlapping.purpose,
        startTime: overlapping.startTime,
        endTime: overlapping.endTime
      }
    });
  }

  // Schema: bookings
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

  // If tied to a bookable asset, mark it Reserved and log in history
  if (assetId && assetId !== '') {
    const asset = db.findById('assets', assetId);
    if (asset) {
      const history = [...(asset.history || [])];
      history.push({
        id: `HIST-${Date.now()}`,
        eventType: 'Reserved',
        date: new Date().toISOString(),
        user: req.user.name,
        userId: req.user.id,
        notes: `Booked as shared resource for: ${purpose}. Slot: ${startTime} to ${endTime}`
      });
      // Schema fields: status, history
      db.update('assets', assetId, { status: 'Reserved', history });
    }
  }

  // Schema: notifications
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

// ==========================================
// CANCEL BOOKING
// Employee: own bookings only
// Department Head: their department's bookings
// Admin, Asset Manager: any booking
// ==========================================
router.put('/:id/cancel', auth, (req, res) => {
  const { id } = req.params;
  const booking = db.findById('bookings', id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const isOwner = booking.userId === req.user.id;
  const isDeptHead = req.user.role === 'Department Head' && booking.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isOwner && !isDeptHead && !isPrivileged) {
    return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
  }

  if (booking.status === 'Cancelled' || booking.status === 'Completed') {
    return res.status(400).json({ message: `Cannot cancel a booking that is already "${booking.status}".` });
  }

  const original = { ...booking };
  // Schema field: status
  const { updated } = db.update('bookings', id, { status: 'Cancelled' });

  // Release linked asset back to Available
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
        notes: `Booking cancelled: "${booking.purpose}". Asset released back to Available.`
      });
      db.update('assets', booking.assetId, { status: 'Available', history });
    }
  }

  // Schema: notifications
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

// ==========================================
// RESCHEDULE BOOKING
// Employee: own bookings only
// Department Head: their department's bookings
// Admin, Asset Manager: any booking
// ==========================================
router.put('/:id/reschedule', auth, (req, res) => {
  const { id } = req.params;
  const { startTime, endTime, purpose } = req.body;

  if (!startTime || !endTime) {
    return res.status(400).json({ message: 'New start time and end time are required.' });
  }

  const booking = db.findById('bookings', id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const isOwner = booking.userId === req.user.id;
  const isDeptHead = req.user.role === 'Department Head' && booking.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isOwner && !isDeptHead && !isPrivileged) {
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

  // Overlap check excluding this booking
  const overlapping = bookings.find(b => {
    if (b.id === id || b.status === 'Cancelled' || b.status === 'Completed') return false;

    if (booking.assetId && b.assetId) {
      if (b.assetId !== booking.assetId) return false;
    } else if (!booking.assetId && !b.assetId) {
      if (b.resourceType !== booking.resourceType) return false;
    } else {
      return false;
    }

    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);
    return start < bEnd && end > bStart;
  });

  if (overlapping) {
    const users = db.read('users');
    const owner = users.find(u => u.id === overlapping.userId);
    return res.status(400).json({
      message: 'Booking conflict: The rescheduled slot overlaps with an existing reservation.',
      conflictDetails: {
        bookedByName: owner ? owner.name : 'Another user',
        startTime: overlapping.startTime,
        endTime: overlapping.endTime
      }
    });
  }

  const original = { ...booking };

  // Schema fields: startTime, endTime, purpose, status
  const updateData = {
    startTime,
    endTime,
    status: 'Upcoming'
  };
  if (purpose !== undefined) updateData.purpose = purpose;

  const { updated } = db.update('bookings', id, updateData);

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
        notes: `Booking rescheduled. New slot: ${startTime} to ${endTime}`
      });
      db.update('assets', booking.assetId, { history });
    }
  }

  // Schema: notifications
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
