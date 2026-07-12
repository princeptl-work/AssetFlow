const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET_KEY = process.env.JWT_SECRET || 'assetflow_secret_key_2026';

// Middleware to verify JWT and attach the current user to req.user
const auth = (req, res, next) => {
  const authHeader = req.header('Authorization') || req.header('authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization token, access denied.' });
  }

  // Safely extract token — handles "Bearer <token>" case-insensitively
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ message: 'Authorization header format must be: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    // Always re-fetch user from DB to get the latest role/status (not from stale token payload)
    const user = db.findById('users', decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User account not found or has been deleted.' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Your account is deactivated. Please contact your Administrator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid token. Authentication failed.' });
  }
};

// Middleware to restrict access to specific roles
// Usage: checkRole(['Admin', 'Asset Manager'])
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      // Should never happen if auth middleware is chained correctly
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. This action requires one of the following roles: ${roles.join(', ')}.`
      });
    }
    next();
  };
};

module.exports = {
  auth,
  checkRole,
  SECRET_KEY
};
