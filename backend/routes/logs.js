const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

// GET activity logs (Admin only, with search/filter)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Administrator privileges required.' });

    let logs = await db.read('logs');
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const { search, entity, action } = req.query;
    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter(l =>
        (l.userName && l.userName.toLowerCase().includes(s)) ||
        (l.action && l.action.toLowerCase().includes(s)) ||
        (l.entity && l.entity.toLowerCase().includes(s)) ||
        (l.entityId && l.entityId.toLowerCase().includes(s)) ||
        (l.previousValue && l.previousValue.toLowerCase().includes(s)) ||
        (l.newValue && l.newValue.toLowerCase().includes(s))
      );
    }
    if (entity) logs = logs.filter(l => l.entity === entity);
    if (action) logs = logs.filter(l => l.action === action);

    res.json(logs);
  } catch (err) {
    console.error('[Logs GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET global search across multiple entities
router.get('/global-search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') return res.json([]);

    const query = q.toLowerCase().trim();
    const results = [];

    // 1. Assets
    let assets = await db.read('assets');
    if (req.user.role === 'Employee') assets = assets.filter(a => a.allocatedToUserId === req.user.id);
    else if (req.user.role === 'Department Head') assets = assets.filter(a => a.departmentId === req.user.departmentId);

    assets.forEach(a => {
      if (
        a.name.toLowerCase().includes(query) ||
        a.assetTag.toLowerCase().includes(query) ||
        (a.serialNumber && a.serialNumber.toLowerCase().includes(query)) ||
        (a.location && a.location.toLowerCase().includes(query))
      ) {
        results.push({ id: a.id, type: 'Asset', title: `${a.name} (${a.assetTag})`, subtitle: `SN: ${a.serialNumber || 'N/A'} | Status: ${a.status} | Loc: ${a.location || 'N/A'}`, link: '/assets' });
      }
    });

    // 2. Employees
    let users = await db.read('users');
    if (req.user.role === 'Employee') users = [];
    else if (req.user.role === 'Department Head') users = users.filter(u => u.departmentId === req.user.departmentId);

    users.forEach(u => {
      if (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.employeeId.toLowerCase().includes(query) || u.role.toLowerCase().includes(query)) {
        results.push({ id: u.id, type: 'Employee', title: u.name, subtitle: `ID: ${u.employeeId} | Role: ${u.role} | Email: ${u.email}`, link: '/organization' });
      }
    });

    // 3. Departments
    let depts = await db.read('departments');
    if (req.user.role === 'Employee') depts = [];
    else if (req.user.role === 'Department Head') depts = depts.filter(d => d.id === req.user.departmentId);

    depts.forEach(d => {
      if (d.name.toLowerCase().includes(query) || (d.description && d.description.toLowerCase().includes(query))) {
        results.push({ id: d.id, type: 'Department', title: d.name, subtitle: `${d.description || 'No description'} | Status: ${d.status}`, link: '/organization' });
      }
    });

    // 4. Bookings
    let bookings = await db.read('bookings');
    if (req.user.role === 'Employee') bookings = bookings.filter(b => b.userId === req.user.id);
    else if (req.user.role === 'Department Head') bookings = bookings.filter(b => b.departmentId === req.user.departmentId);

    const allUsers = await db.read('users');
    bookings.forEach(b => {
      const user = allUsers.find(u => u.id === b.userId);
      if (b.resourceType.toLowerCase().includes(query) || b.purpose.toLowerCase().includes(query) || (user && user.name.toLowerCase().includes(query))) {
        results.push({ id: b.id, type: 'Booking', title: `${b.resourceType} Reservation`, subtitle: `For: ${b.purpose} | By: ${user ? user.name : 'Unknown'} | Status: ${b.status}`, link: '/bookings' });
      }
    });

    // 5. Maintenance
    let tickets = await db.read('maintenance');
    const allAssets = await db.read('assets');
    if (req.user.role === 'Employee') tickets = tickets.filter(t => t.raisedByUserId === req.user.id);
    else if (req.user.role === 'Department Head') {
      tickets = tickets.filter(t => {
        const asset = allAssets.find(a => a.id === t.assetId);
        return asset && asset.departmentId === req.user.departmentId;
      });
    }

    tickets.forEach(t => {
      const asset = allAssets.find(a => a.id === t.assetId);
      if (t.issue.toLowerCase().includes(query) || (t.description && t.description.toLowerCase().includes(query)) || (asset && asset.name.toLowerCase().includes(query))) {
        results.push({ id: t.id, type: 'Maintenance', title: t.issue, subtitle: `Asset: ${asset ? asset.name : 'Unknown'} | Status: ${t.status} | Priority: ${t.priority}`, link: '/maintenance' });
      }
    });

    // 6. Audits (Admin/Asset Manager only)
    if (req.user.role === 'Admin' || req.user.role === 'Asset Manager') {
      const audits = await db.read('audits');
      audits.forEach(au => {
        if (au.name.toLowerCase().includes(query) || (au.location && au.location.toLowerCase().includes(query))) {
          results.push({ id: au.id, type: 'Audit', title: au.name, subtitle: `Location: ${au.location || 'All'} | Status: ${au.status} | ${au.startDate} to ${au.endDate}`, link: '/audits' });
        }
      });
    }

    res.json(results.slice(0, 15));
  } catch (err) {
    console.error('[Global Search Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
