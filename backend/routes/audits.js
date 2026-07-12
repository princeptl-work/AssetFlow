const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// GET all audit cycles
router.get('/', auth, async (req, res) => {
  try {
    let audits = await db.read('audits');
    const depts = await db.read('departments');
    const users = await db.read('users');

    if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager') {
      audits = audits.filter(a => a.auditors && Array.isArray(a.auditors) && a.auditors.includes(req.user.id));
    }

    const joined = audits.map(a => {
      const dept = depts.find(d => d.id === a.departmentId);
      const auditorNames = (a.auditors || []).map(audId => {
        const u = users.find(u => u.id === audId);
        return u ? u.name : 'Unknown';
      });
      return { ...a, departmentName: dept ? dept.name : 'All Departments', auditorNames };
    });

    res.json(joined);
  } catch (err) {
    console.error('[Audits GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET single audit
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const audit = await db.findById('audits', id);
    if (!audit) return res.status(404).json({ message: 'Audit cycle not found.' });

    if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && (!audit.auditors || !audit.auditors.includes(req.user.id))) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const assets = await db.read('assets');
    const scopeAssets = assets.filter(a => {
      const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
      const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
      return matchesDept && matchesLoc;
    });

    const details = audit.details || {};
    const formattedAssets = scopeAssets.map(a => ({
      ...a,
      auditRecord: details[a.id] || { status: 'Unknown', condition: a.condition, notes: '' }
    }));

    const total = formattedAssets.length;
    const detailsVals = Object.values(details);

    res.json({
      ...audit,
      assets: formattedAssets,
      stats: {
        total,
        verified: detailsVals.filter(d => d.status === 'Verified').length,
        missing: detailsVals.filter(d => d.status === 'Missing').length,
        damaged: detailsVals.filter(d => d.status === 'Damaged').length,
        pending: total - Object.keys(details).length
      }
    });
  } catch (err) {
    console.error('[Audit GET Single Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST create audit cycle
router.post('/', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { name, departmentId, location, startDate, endDate, auditors, description } = req.body;
    if (!name || !startDate || !endDate || !auditors || auditors.length === 0) {
      return res.status(400).json({ message: 'Name, Date range, and at least one auditor are required.' });
    }

    const users = await db.read('users');
    const validAuditors = auditors.filter(audId => users.some(u => u.id === audId));
    if (validAuditors.length === 0) return res.status(400).json({ message: 'No valid auditors specified.' });

    const newAudit = await db.create('audits', {
      name, departmentId: departmentId || '', location: location || '',
      startDate, endDate, auditors: validAuditors,
      description: description || '', status: 'In Progress',
      details: {}, discrepancyReport: []
    });

    for (const audId of validAuditors) {
      await db.create('notifications', {
        userId: audId,
        message: `You have been assigned as an auditor for cycle: "${name}".`,
        type: 'Audit Assigned', link: '/audits', isRead: false, timestamp: new Date().toISOString()
      });
    }

    logActivity(req.user.id, req.user.name, 'Create Audit Cycle', 'Audit', newAudit.id, null, newAudit, req);
    res.status(201).json(newAudit);
  } catch (err) {
    console.error('[Audit Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT verify asset in audit
router.put('/:id/verify', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assetId, status, condition, notes } = req.body;

    const audit = await db.findById('audits', id);
    if (!audit) return res.status(404).json({ message: 'Audit cycle not found.' });
    if (audit.status === 'Completed') return res.status(400).json({ message: 'Cannot verify: Audit is already closed.' });

    const isAuditor = audit.auditors && audit.auditors.includes(req.user.id);
    const isAdmin = req.user.role === 'Admin';
    if (!isAuditor && !isAdmin) return res.status(403).json({ message: 'You are not assigned as an auditor.' });

    const asset = await db.findById('assets', assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    const validStatuses = ['Verified', 'Missing', 'Damaged', 'Unknown'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid verification status.' });

    const details = { ...(audit.details || {}) };
    details[assetId] = { status, condition: condition || asset.condition, notes: notes || '', verifiedBy: req.user.name, verifiedById: req.user.id, timestamp: new Date().toISOString() };

    const { updated } = await db.update('audits', id, { details });
    res.json(updated);
  } catch (err) {
    console.error('[Audit Verify Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT close audit
router.put('/:id/close', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const audit = await db.findById('audits', id);
    if (!audit) return res.status(404).json({ message: 'Audit cycle not found.' });
    if (audit.status === 'Completed') return res.status(400).json({ message: 'Audit is already closed.' });

    const details = audit.details || {};
    const assets = await db.read('assets');
    const scopeAssets = assets.filter(a => {
      const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
      const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
      return matchesDept && matchesLoc;
    });

    const discrepancyReport = [];
    const originalAudit = { ...audit };

    for (const asset of scopeAssets) {
      const record = details[asset.id];
      const auditStatus = record ? record.status : 'Unknown';
      const auditCondition = record ? record.condition : asset.condition;
      const auditNotes = record ? record.notes : 'Missed during verification.';

      if (auditStatus === 'Missing' || auditStatus === 'Damaged' || auditStatus === 'Unknown') {
        discrepancyReport.push({ assetId: asset.id, assetTag: asset.assetTag, name: asset.name, expectedStatus: asset.status, expectedCondition: asset.condition, auditedStatus: auditStatus, auditedCondition: auditCondition, notes: auditNotes });
      }

      const assetHistory = [...(asset.history || [])];
      assetHistory.push({ id: `HIST-${Date.now()}`, eventType: 'Audited', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Audited in cycle "${audit.name}". Status: ${auditStatus}. Condition: ${auditCondition}.` });

      const updateData = { history: assetHistory };
      if (auditStatus === 'Missing') updateData.status = 'Lost';
      else if (auditStatus === 'Damaged') updateData.condition = 'Damaged';

      await db.update('assets', asset.id, updateData);
    }

    const { updated } = await db.update('audits', id, { status: 'Completed', discrepancyReport, closedAt: new Date().toISOString() });

    if (audit.auditors) {
      for (const audId of audit.auditors) {
        await db.create('notifications', {
          userId: audId,
          message: `Audit cycle "${audit.name}" has been closed by the Administrator.`,
          type: 'Audit Completed', link: '/audits', isRead: false, timestamp: new Date().toISOString()
        });
      }
    }

    logActivity(req.user.id, req.user.name, 'Close Audit Cycle', 'Audit', id, originalAudit, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Audit Close Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
