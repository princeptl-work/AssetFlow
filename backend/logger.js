const db = require('./db');

/**
 * Log an action to the database.
 * @param {string} userId - User performing the action (or 'system')
 * @param {string} userName - Name of the user (or 'System')
 * @param {string} action - Action performed (e.g. 'Create', 'Update', 'Delete', 'Approve', 'Reject')
 * @param {string} entity - Target entity type (e.g. 'Asset', 'Department', 'Category', 'Booking', 'Maintenance')
 * @param {string} entityId - ID of the target entity
 * @param {object|string|null} previousValue - State before change
 * @param {object|string|null} newValue - State after change
 * @param {object} req - Express request object to extract IP address
 */
function logActivity(userId, userName, action, entity, entityId, previousValue, newValue, req) {
  let ip = '127.0.0.1';
  if (req) {
    ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    // Clean IPv6 prefix
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }
  }

  // Convert objects to formatted strings/JSON for storage
  const prevStr = previousValue && typeof previousValue === 'object' ? JSON.stringify(previousValue) : previousValue || '';
  const newStr = newValue && typeof newValue === 'object' ? JSON.stringify(newValue) : newValue || '';

  db.create('logs', {
    userId,
    userName,
    action,
    entity,
    entityId,
    previousValue: prevStr,
    newValue: newStr,
    ip,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  logActivity
};
