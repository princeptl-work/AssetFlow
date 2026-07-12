const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

// Get active user's notifications
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await db.find('notifications', { userId: req.user.id });
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Mark single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await db.findById('notifications', id);
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    if (notification.userId !== req.user.id) return res.status(403).json({ message: 'Unauthorized.' });

    const { updated } = await db.update('notifications', id, { isRead: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Mark all as read
router.put('/read-all', auth, async (req, res) => {
  try {
    const notifications = await db.find('notifications', { userId: req.user.id });
    await Promise.all(
      notifications.filter(n => !n.isRead).map(n => db.update('notifications', n.id, { isRead: true }))
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
