const db = require('./db');

/**
 * Log an action to the database (async — fire and forget, errors are swallowed).
 */
async function logActivity(userId, userName, action, entity, entityId, previousValue, newValue, req) {
  let ip = '127.0.0.1';
  if (req) {
    ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  }

  const prevStr = previousValue && typeof previousValue === 'object' ? JSON.stringify(previousValue) : previousValue || '';
  const newStr  = newValue  && typeof newValue  === 'object' ? JSON.stringify(newValue)  : newValue  || '';

  db.create('logs', {
    userId, userName, action, entity, entityId,
    previousValue: prevStr,
    newValue: newStr,
    ip,
    timestamp: new Date().toISOString()
  }).catch(err => console.error('[Log Error]', err.message));
}

module.exports = { logActivity };
