const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

// Get active user's notifications
router.get('/', auth, (req, res) => {
  const notifications = db.find('notifications', { userId: req.user.id });
  
  // Sort descending by timestamp
  notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json(notifications);
});

// Mark single notification as read
router.put('/:id/read', auth, (req, res) => {
  const { id } = req.params;
  const notification = db.findById('notifications', id);
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found.' });
  }

  if (notification.userId !== req.user.id) {
    return res.status(403).json({ message: 'Unauthorized.' });
  }

  const { updated } = db.update('notifications', id, { isRead: true });
  res.json(updated);
});

// Mark all as read
router.put('/read-all', auth, (req, res) => {
  const notifications = db.find('notifications', { userId: req.user.id });
  
  notifications.forEach(n => {
    if (!n.isRead) {
      db.update('notifications', n.id, { isRead: true });
    }
  });

  res.json({ message: 'All notifications marked as read.' });
});

module.exports = router;
