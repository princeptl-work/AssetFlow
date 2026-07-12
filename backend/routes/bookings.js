const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Auto-update booking statuses
async function syncBookingStatuses() {
  const bookings = await db.read('bookings');
  const now = new Date();
  for (const b of bookings) {
    if (b.status === 'Cancelled' || b.status === 'Completed') continue;
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    let newStatus = b.status;
    if (now > end) newStatus = 'Completed';
    else if (now >= start && now <= end) newStatus = 'Ongoing';
    else if (now < start) newStatus = 'Upcoming';
    if (newStatus !== b.status) {
      await db.update('bookings', b.id, { status: newStatus });
    }
  }
}

// GET bookings
router.get('/', auth, async (req, res) => {
  try {
    await syncBookingStatuses();
    let bookings = await db.read('bookings');

    if (req.user.role === 'Employee') {
      bookings = bookings.filter(b => b.userId === req.user.id);
    } else if (req.user.role === 'Department Head') {
      bookings = bookings.filter(b => b.departmentId === req.user.departmentId);
    }

    const { resourceType, status, userId } = req.query;
    if (resourceType) bookings = bookings.filter(b => b.resourceType === resourceType);
    if (status) bookings = bookings.filter(b => b.status === status);
    if (userId) bookings = bookings.filter(b => b.userId === userId);

    const users = await db.read('users');
    const depts = await db.read('departments');
    const assets = await db.read('assets');

    const joined = bookings.map(b => {
      const user = users.find(u => u.id === b.userId);
      const dept = depts.find(d => d.id === b.departmentId);
      const asset = b.assetId ? assets.find(a => a.id === b.assetId) : null;
      return { ...b, bookedByName: user ? user.name : 'Unknown', departmentName: dept ? dept.name : 'Unassigned', assetName: asset ? asset.name : '' };
    });

    res.json(joined);
  } catch (err) {
    console.error('[Bookings GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST book resource
router.post('/', auth, async (req, res) => {
  try {
    const { resourceType, assetId, purpose, startTime, endTime } = req.body;
    if (!resourceType || !startTime || !endTime || !purpose) {
      return res.status(400).json({ message: 'Resource, purpose, start time, and end time are required.' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start < new Date()) return res.status(400).json({ message: 'Cannot book resources in the past.' });
    if (end <= start) return res.status(400).json({ message: 'End time must occur after the start time.' });

    await syncBookingStatuses();
    const bookings = await db.read('bookings');

    const overlapping = bookings.find(b => {
      if (b.status === 'Cancelled') return false;
      const matchesResource = b.resourceType === resourceType && (assetId ? b.assetId === assetId : true);
      if (!matchesResource) return false;
      return start < new Date(b.endTime) && end > new Date(b.startTime);
    });

    if (overlapping) {
      const users = await db.read('users');
      const owner = users.find(u => u.id === overlapping.userId);
      return res.status(400).json({
        message: 'Booking conflict: The time slot overlaps with an existing booking.',
        conflictDetails: { bookedByName: owner ? owner.name : 'Another Employee', purpose: overlapping.purpose, startTime: overlapping.startTime, endTime: overlapping.endTime }
      });
    }

    const newBooking = await db.create('bookings', {
      resourceType, assetId: assetId || '', userId: req.user.id,
      departmentId: req.user.departmentId || '', purpose, startTime, endTime, status: 'Upcoming'
    });

    if (assetId) {
      const asset = await db.findById('assets', assetId);
      if (asset) {
        const history = [...(asset.history || [])];
        history.push({ id: `HIST-${Date.now()}`, eventType: 'Reserved', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Booked as "${resourceType}" for: ${purpose}. Slot: ${startTime} to ${endTime}` });
        await db.update('assets', assetId, { status: 'Reserved', history });
      }
    }

    await db.create('notifications', {
      userId: req.user.id,
      message: `Your booking for "${resourceType}" has been confirmed for ${new Date(startTime).toLocaleString()}.`,
      type: 'Booking Confirmed', link: '/bookings', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Book Resource', 'Booking', newBooking.id, null, newBooking, req);
    res.status(201).json(newBooking);
  } catch (err) {
    console.error('[Booking Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT cancel booking
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.findById('bookings', id);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && booking.userId !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
    }
    if (booking.status === 'Cancelled' || booking.status === 'Completed') {
      return res.status(400).json({ message: `Cannot cancel a booking that is already "${booking.status}".` });
    }

    const original = { ...booking };
    const { updated } = await db.update('bookings', id, { status: 'Cancelled' });

    if (booking.assetId) {
      const asset = await db.findById('assets', booking.assetId);
      if (asset && asset.status === 'Reserved') {
        const history = [...(asset.history || [])];
        history.push({ id: `HIST-${Date.now()}`, eventType: 'Available', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Booking cancelled: ${booking.purpose}. Released to Available.` });
        await db.update('assets', booking.assetId, { status: 'Available', history });
      }
    }

    await db.create('notifications', {
      userId: booking.userId,
      message: `Your booking for "${booking.resourceType}" on ${new Date(booking.startTime).toLocaleDateString()} has been CANCELLED.`,
      type: 'Booking Cancelled', link: '/bookings', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Cancel Booking', 'Booking', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Booking Cancel Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT reschedule booking
router.put('/:id/reschedule', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime, purpose } = req.body;

    const booking = await db.findById('bookings', id);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && booking.userId !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to reschedule this booking.' });
    }
    if (booking.status === 'Cancelled' || booking.status === 'Completed') {
      return res.status(400).json({ message: 'Cannot reschedule a completed or cancelled booking.' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start < new Date()) return res.status(400).json({ message: 'New booking time must be in the future.' });
    if (end <= start) return res.status(400).json({ message: 'End time must be after the start time.' });

    await syncBookingStatuses();
    const bookings = await db.read('bookings');
    const overlapping = bookings.find(b => {
      if (b.id === id || b.status === 'Cancelled') return false;
      const matchesResource = b.resourceType === booking.resourceType && (booking.assetId ? b.assetId === booking.assetId : true);
      if (!matchesResource) return false;
      return start < new Date(b.endTime) && end > new Date(b.startTime);
    });

    if (overlapping) {
      const users = await db.read('users');
      const owner = users.find(u => u.id === overlapping.userId);
      return res.status(400).json({
        message: 'Booking conflict: The rescheduled slot overlaps with an existing reservation.',
        conflictDetails: { bookedByName: owner ? owner.name : 'Another Employee', startTime: overlapping.startTime, endTime: overlapping.endTime }
      });
    }

    const original = { ...booking };
    const { updated } = await db.update('bookings', id, { startTime, endTime, purpose: purpose || booking.purpose, status: 'Upcoming' });

    if (booking.assetId) {
      const asset = await db.findById('assets', booking.assetId);
      if (asset) {
        const history = [...(asset.history || [])];
        history.push({ id: `HIST-${Date.now()}`, eventType: 'Reserved', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Rescheduled booking for "${booking.resourceType}". New Slot: ${startTime} to ${endTime}` });
        await db.update('assets', booking.assetId, { history });
      }
    }

    await db.create('notifications', {
      userId: booking.userId,
      message: `Your booking for "${booking.resourceType}" has been rescheduled to ${new Date(startTime).toLocaleString()}.`,
      type: 'Booking Rescheduled', link: '/bookings', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Reschedule Booking', 'Booking', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Booking Reschedule Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
