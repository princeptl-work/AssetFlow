const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Get all audit cycles
router.get('/', auth, (req, res) => {
  const audits = db.read('audits') || [];
  
  // Role scoping: Admin/Manager see all. Others see only cycles where they are assigned as auditor.
  let filteredAudits = audits;
  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager') {
    filteredAudits = audits.filter(a => a.auditors && Array.isArray(a.auditors) && a.auditors.includes(req.user.id));
  }

  const depts = db.read('departments');
  const users = db.read('users');

  const joined = filteredAudits.map(a => {
    const dept = depts.find(d => d.id === a.departmentId);
    
    let auditorNames = [];
    if (a.auditors && Array.isArray(a.auditors)) {
      auditorNames = a.auditors.map(audId => {
        const u = users.find(user => user.id === audId);
        return u ? u.name : 'Unknown Auditor';
      });
    }

    return {
      ...a,
      departmentName: dept ? dept.name : 'All Departments',
      auditorNames
    };
  });

  res.json(joined);
});

// Get single audit details + auto list of assets in scope
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const audit = db.findById('audits', id);
  if (!audit) {
    return res.status(404).json({ message: 'Audit cycle not found.' });
  }

  // Role scoping checks
  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager' && (!audit.auditors || !audit.auditors.includes(req.user.id))) {
    return res.status(403).json({ message: 'Access denied. You are not authorized to view this audit cycle.' });
  }

  // Find all assets within the audit scope (department and/or location matching)
  const assets = db.read('assets');
  let scopeAssets = assets.filter(a => {
    const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
    const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
    return matchesDept && matchesLoc;
  });

  // Attach status and condition verified in details if present
  const details = audit.details || {};
  const formattedAssets = scopeAssets.map(a => {
    const auditRecord = details[a.id] || { status: 'Unknown', condition: a.condition, notes: '' };
    return {
      ...a,
      auditRecord
    };
  });

  // Calculate stats for dashboard/progress
  const total = formattedAssets.length;
  const verifiedCount = Object.values(details).filter(d => d.status === 'Verified').length;
  const missingCount = Object.values(details).filter(d => d.status === 'Missing').length;
  const damagedCount = Object.values(details).filter(d => d.status === 'Damaged').length;
  const pendingCount = total - Object.keys(details).length;

  res.json({
    ...audit,
    assets: formattedAssets,
    stats: {
      total,
      verified: verifiedCount,
      missing: missingCount,
      damaged: damagedCount,
      pending: pendingCount
    }
  });
});

// Create audit cycle (Admin only)
router.post('/', auth, checkRole(['Admin']), (req, res) => {
  const { name, departmentId, location, startDate, endDate, auditors, description } = req.body;

  if (!name || !startDate || !endDate || !auditors || auditors.length === 0) {
    return res.status(400).json({ message: 'Name, Date range, and at least one auditor are required.' });
  }

  // Verify auditors exist
  const users = db.read('users');
  const validAuditors = auditors.filter(audId => users.some(u => u.id === audId));
  if (validAuditors.length === 0) {
    return res.status(400).json({ message: 'No valid auditors were specified.' });
  }

  const newAudit = db.create('audits', {
    name,
    departmentId: departmentId || '',
    location: location || '',
    startDate,
    endDate,
    auditors: validAuditors,
    description: description || '',
    status: 'In Progress', // In Progress initially
    details: {}, // stores results map: assetId -> { status, condition, notes, timestamp, auditorId }
    discrepancyReport: []
  });

  // Notify assigned auditors
  validAuditors.forEach(audId => {
    db.create('notifications', {
      userId: audId,
      message: `You have been assigned as an auditor for cycle: "${name}".`,
      type: 'Audit Assigned',
      link: `/audits`,
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Create Audit Cycle', 'Audit', newAudit.id, null, newAudit, req);

  res.status(201).json(newAudit);
});

// Verify Asset (Auditors or Admin)
router.put('/:id/verify', auth, (req, res) => {
  const { id } = req.params;
  const { assetId, status, condition, notes } = req.body; // status: Verified, Missing, Damaged

  const audit = db.findById('audits', id);
  if (!audit) {
    return res.status(404).json({ message: 'Audit cycle not found.' });
  }

  if (audit.status === 'Completed') {
    return res.status(400).json({ message: 'Cannot verify assets: Audit cycle is already closed and locked.' });
  }

  // Auth: User must be assigned auditor or Admin
  const isAuditor = audit.auditors && audit.auditors.includes(req.user.id);
  const isAdmin = req.user.role === 'Admin';
  if (!isAuditor && !isAdmin) {
    return res.status(403).json({ message: 'You are not assigned as an auditor for this cycle.' });
  }

  // Check asset in scope
  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const validStatuses = ['Verified', 'Missing', 'Damaged', 'Unknown'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid verification status.' });
  }

  const original = { ...audit };
  const details = { ...(audit.details || {}) };

  details[assetId] = {
    status,
    condition: condition || asset.condition,
    notes: notes || '',
    verifiedBy: req.user.name,
    verifiedById: req.user.id,
    timestamp: new Date().toISOString()
  };

  const { updated } = db.update('audits', id, { details });

  res.json(updated);
});

// Close Audit (Admin Only) -> Lock records and resolve discrepancy
router.put('/:id/close', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const audit = db.findById('audits', id);
  if (!audit) {
    return res.status(404).json({ message: 'Audit cycle not found.' });
  }

  if (audit.status === 'Completed') {
    return res.status(400).json({ message: 'Audit cycle is already closed.' });
  }

  const details = audit.details || {};
  
  // Find all assets that should have been audited
  const assets = db.read('assets');
  const scopeAssets = assets.filter(a => {
    const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
    const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
    return matchesDept && matchesLoc;
  });

  const discrepancyReport = [];
  const originalAudit = { ...audit };

  // Loop through scope assets, update statuses where applicable, write to histories
  scopeAssets.forEach(asset => {
    const record = details[asset.id];
    
    // If not audited, default to Unknown
    const auditStatus = record ? record.status : 'Unknown';
    const auditCondition = record ? record.condition : asset.condition;
    const auditNotes = record ? record.notes : 'Missed during verification.';

    // Discrepancy check: Expected condition vs audited, or if Missing
    const isDiscrepant = auditStatus === 'Missing' || auditStatus === 'Damaged' || auditStatus === 'Unknown';
    if (isDiscrepant) {
      discrepancyReport.push({
        assetId: asset.id,
        assetTag: asset.assetTag,
        name: asset.name,
        expectedStatus: asset.status,
        expectedCondition: asset.condition,
        auditedStatus: auditStatus,
        auditedCondition: auditCondition,
        notes: auditNotes
      });
    }

    // Prepare asset update
    const assetHistory = [...(asset.history || [])];
    assetHistory.push({
      id: `HIST-${Date.now()}`,
      eventType: 'Audited',
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Audited in cycle "${audit.name}". Verified status: ${auditStatus}. Condition: ${auditCondition}. Notes: ${auditNotes}`
    });

    const updateData = { history: assetHistory };

    // Strict Rule: If marked Missing -> update status to Lost
    if (auditStatus === 'Missing') {
      updateData.status = 'Lost';
    } else if (auditStatus === 'Damaged') {
      updateData.condition = 'Damaged';
    }

    // Save asset updates
    db.update('assets', asset.id, updateData);
  });

  // Close the audit cycle
  const { updated } = db.update('audits', id, {
    status: 'Completed',
    discrepancyReport,
    closedAt: new Date().toISOString()
  });

  // Notify auditors of closure
  if (audit.auditors) {
    audit.auditors.forEach(audId => {
      db.create('notifications', {
        userId: audId,
        message: `Audit cycle: "${audit.name}" has been closed by the Administrator.`,
        type: 'Audit Completed',
        link: `/audits`,
        isRead: false,
        timestamp: new Date().toISOString()
      });
    });
  }

  logActivity(req.user.id, req.user.name, 'Close Audit Cycle', 'Audit', id, originalAudit, updated, req);

  res.json(updated);
});

module.exports = router;
