const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database (it automatically seeds on require)
require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware (optional, debug)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Database live-sync middleware: Sync Postgres into local files before serving any API requests
const dbObj = require('./db');
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    try {
      await dbObj.syncFromPostgres();
    } catch (err) {
      console.error('[Sync Middleware Error]:', err);
    }
  }
  next();
});

// Import Modular Routers
const authRouter = require('./routes/auth');
const orgRouter = require('./routes/organization');
const assetsRouter = require('./routes/assets');
const transfersRouter = require('./routes/transfers');
const bookingsRouter = require('./routes/bookings');
const maintenanceRouter = require('./routes/maintenance');
const auditsRouter = require('./routes/audits');
const notifyRouter = require('./routes/notifications');
const logsRouter = require('./routes/logs');
const analyticsRouter = require('./routes/analytics');

// Register API Routes
app.use('/api/auth', authRouter);
app.use('/api/organization', orgRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/audits', auditsRouter);
app.use('/api/notifications', notifyRouter);
app.use('/api/logs', logsRouter);
app.use('/api/analytics', analyticsRouter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AssetFlow ERP API'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    message: 'An unexpected internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Serve frontend build static files (optional, for production bundle execution)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  AssetFlow ERP Server running on Port ${PORT}`);
  console.log(`  Local Health Check: http://localhost:${PORT}/api/health`);
  console.log(`==================================================`);
});
