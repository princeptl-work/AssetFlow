const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');

router.get('/', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const assets = db.read('assets');
  const categories = db.read('categories');
  const departments = db.read('departments');
  const bookings = db.read('bookings');
  const maintenance = db.read('maintenance') || [];
  const users = db.read('users');

  const todayStr = new Date().toISOString().split('T')[0];

  const statusDistribution = assets.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const departmentAllocation = assets.reduce((acc, a) => {
    if (a.status === 'Allocated' && a.departmentId) {
      const dept = departments.find(d => d.id === a.departmentId);
      const name = dept ? dept.name : 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
    }
    return acc;
  }, {});

  const categoryDistribution = assets.reduce((acc, a) => {
    const cat = categories.find(c => c.id === a.categoryId);
    const name = cat ? cat.name : 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const maintenanceFrequency = maintenance.reduce((acc, t) => {
    const asset = assets.find(a => a.id === t.assetId);
    const tag = asset ? asset.assetTag : 'Unknown';
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});

  const bookingHeatmap = bookings.reduce((acc, b) => {
    if (b.status === 'Cancelled') return acc;
    const day = new Date(b.startTime).toLocaleDateString('en-US', { weekday: 'short' });
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  const idleAssets = assets.filter(a => a.status === 'Available').map(a => ({
    id: a.id,
    assetTag: a.assetTag,
    name: a.name,
    location: a.location
  }));

  const assetsNearRetirement = assets.filter(a => {
    const cat = categories.find(c => c.id === a.categoryId);
    if (!cat || !cat.expectedLife || !a.acquisitionDate) return false;
    const acqYear = new Date(a.acquisitionDate).getFullYear();
    const retireYear = acqYear + cat.expectedLife;
    const currentYear = new Date().getFullYear();
    return retireYear - currentYear <= 1;
  }).map(a => ({
    id: a.id,
    assetTag: a.assetTag,
    name: a.name,
    acquisitionDate: a.acquisitionDate
  }));

  const assetsDueMaintenance = maintenance
    .filter(t => t.status === 'Pending' || t.status === 'In Progress')
    .map(t => {
      const asset = assets.find(a => a.id === t.assetId);
      return {
        ticketId: t.id,
        assetTag: asset ? asset.assetTag : 'N/A',
        issue: t.issue,
        priority: t.priority,
        status: t.status
      };
    });

  const utilizationMap = {};
  assets.forEach(a => {
    const historyCount = (a.history || []).filter(h =>
      ['Allocated', 'Transferred', 'Reserved'].includes(h.eventType)
    ).length;
    utilizationMap[a.id] = {
      id: a.id,
      assetTag: a.assetTag,
      name: a.name,
      usageScore: historyCount + (a.status === 'Allocated' ? 2 : 0)
    };
  });

  const utilizationList = Object.values(utilizationMap);
  const mostUsed = [...utilizationList].sort((a, b) => b.usageScore - a.usageScore).slice(0, 5);
  const leastUsed = [...utilizationList].sort((a, b) => a.usageScore - b.usageScore).slice(0, 5);

  const overdueReturns = assets.filter(a =>
    a.status === 'Allocated' && a.expectedReturnDate && a.expectedReturnDate < todayStr
  ).length;

  res.json({
    summary: {
      totalAssets: assets.length,
      available: assets.filter(a => a.status === 'Available').length,
      allocated: assets.filter(a => a.status === 'Allocated').length,
      underMaintenance: assets.filter(a => a.status === 'Under Maintenance').length,
      activeBookings: bookings.filter(b => b.status === 'Upcoming' || b.status === 'Ongoing').length,
      overdueReturns,
      totalEmployees: users.filter(u => u.status === 'Active').length
    },
    statusDistribution,
    departmentAllocation,
    categoryDistribution,
    maintenanceFrequency,
    bookingHeatmap,
    idleAssets,
    assetsNearRetirement,
    assetsDueMaintenance,
    mostUsedAssets: mostUsed,
    leastUsedAssets: leastUsed
  });
});

module.exports = router;
