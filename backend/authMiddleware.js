const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET_KEY = 'assetflow_secret_key_2026';

// Async middleware to verify JWT and load user from Supabase
const auth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization token, access denied' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await db.findById('users', decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User profile not found or deleted' });
    }
    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'User account is deactivated. Contact Admin.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is invalid or has expired' });
  }
};

// Role-based access middleware
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied. Requires one of: ${roles.join(', ')}` });
    }
    next();
  };
};

module.exports = { auth, checkRole, SECRET_KEY };
