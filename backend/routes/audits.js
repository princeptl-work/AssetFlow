const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// GET ALL AUDIT CYCLES
// Admin, Asset Manager: all cycles
// Others: only cycles where they are assigned auditor
// ==========================================
router.get('/', auth, (req, res) => {
  const audits = db.read('audits') || [];

  let filtered = audits;
  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager') {
    filtered = audits.filter(a =>
      a.auditors && Array.isArray(a.auditors) && a.auditors.includes(req.user.id)
    );
  }

  const depts = db.read('departments');
  const users = db.read('users');

  const joined = filtered.map(a => {
    const dept = depts.find(d => d.id === a.departmentId);
    const auditorNames = (a.auditors && Array.isArray(a.auditors))
      ? a.auditors.map(audId => {
          const u = users.find(user => user.id === audId);
          return u ? u.name : 'Unknown Auditor';
        })
      : [];
    return {
      ...a,
      departmentName: dept ? dept.name : 'All Departments',
      auditorNames
    };
  });

  res.json(joined);
});

// ==========================================
// GET SINGLE AUDIT CYCLE + IN-SCOPE ASSETS
// ==========================================
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const audit = db.findById('audits', id);
  if (!audit) {
    return res.status(404).json({ message: 'Audit cycle not found.' });
  }

  const isAssignedAuditor = audit.auditors && Array.isArray(audit.auditors) && audit.auditors.includes(req.user.id);
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isPrivileged && !isAssignedAuditor) {
    return res.status(403).json({ message: 'Access denied. You are not assigned as an auditor for this cycle.' });
  }

  const assets = db.read('assets');
  const scopeAssets = assets.filter(a => {
    const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
    const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
    return matchesDept && matchesLoc;
  });

  const details = audit.details || {};
  const formattedAssets = scopeAssets.map(a => {
    const auditRecord = details[a.id] || { status: 'Pending', condition: a.condition, notes: '' };
    return { ...a, auditRecord };
  });

  const total = formattedAssets.length;
  const verifiedCount = Object.values(details).filter(d => d.status === 'Verified').length;
  const missingCount = Object.values(details).filter(d => d.status === 'Missing').length;
  const damagedCount = Object.values(details).filter(d => d.status === 'Damaged').length;
  const pendingCount = total - Object.keys(details).length;

  res.json({
    ...audit,
    assets: formattedAssets,
    stats: { total, verified: verifiedCount, missing: missingCount, damaged: damagedCount, pending: pendingCount }
  });
});

// ==========================================
// CREATE AUDIT CYCLE — Admin only
// Schema: audits — name, departmentId, location, startDate, endDate, auditors,
//   description, status, details, discrepancyReport, closedAt, createdAt(auto), updatedAt(auto)
// ==========================================
router.post('/', auth, checkRole(['Admin']), (req, res) => {
  const { name, departmentId, location, startDate, endDate, auditors, description } = req.body;

  if (!name || !startDate || !endDate) {
    return res.status(400).json({ message: 'Name and date range are required.' });
  }

  if (!auditors || !Array.isArray(auditors) || auditors.length === 0) {
    return res.status(400).json({ message: 'At least one auditor must be assigned.' });
  }

  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ message: 'End date must be after start date.' });
  }

  // Validate department scope if provided
  if (departmentId && departmentId !== '') {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Specified department not found.' });
    }
  }

  // Validate all auditor IDs
  const users = db.read('users');
  const validAuditors = auditors.filter(audId => users.some(u => u.id === audId && u.status === 'Active'));
  if (validAuditors.length === 0) {
    return res.status(400).json({ message: 'No valid active auditors were specified.' });
  }

  // Schema: audits
  const newAudit = db.create('audits', {
    name,
    departmentId: departmentId || '',
    location: location || '',
    startDate,
    endDate,
    auditors: validAuditors,
    description: description || '',
    status: 'In Progress',
    details: {},
    discrepancyReport: [],
    closedAt: ''
  });

  // Schema: notifications — notify assigned auditors
  validAuditors.forEach(audId => {
    db.create('notifications', {
      userId: audId,
      message: `You have been assigned as an auditor for cycle: "${name}" (${startDate} to ${endDate}).`,
      type: 'Audit Assigned',
      link: '/audits',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Create Audit Cycle', 'Audit', newAudit.id, null, newAudit, req);

  res.status(201).json(newAudit);
});

// ==========================================
// VERIFY ASSET IN AUDIT — Assigned auditors or Admin
// Schema: audits — details (object map: assetId -> {status, condition, notes, verifiedBy, verifiedById, timestamp})
// ==========================================
router.put('/:id/verify', auth, (req, res) => {
  const { id } = req.params;
  const { assetId, status, condition, notes } = req.body;

  if (!assetId || !status) {
    return res.status(400).json({ message: 'Asset ID and verification status are required.' });
  }

  const validStatuses = ['Verified', 'Missing', 'Damaged'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `Verification status must be one of: ${validStatuses.join(', ')}` });
  }

  const audit = db.findById('audits', id);
  if (!audit) {
    return res.status(404).json({ message: 'Audit cycle not found.' });
  }

  if (audit.status === 'Completed') {
    return res.status(400).json({ message: 'Cannot verify assets in a closed audit cycle.' });
  }

  const isAssignedAuditor = audit.auditors && Array.isArray(audit.auditors) && audit.auditors.includes(req.user.id);
  const isAdmin = req.user.role === 'Admin';

  if (!isAssignedAuditor && !isAdmin) {
    return res.status(403).json({ message: 'You are not assigned as an auditor for this cycle.' });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Check condition is valid if provided
  if (condition !== undefined) {
    const validConditions = ['Excellent', 'Good', 'Fair', 'Damaged'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ message: `Condition must be one of: ${validConditions.join(', ')}` });
    }
  }

  const original = { ...audit };
  const details = { ...(audit.details || {}) };

  // Store verification result in details map — this is a JSONB field in schema
  details[assetId] = {
    status,
    condition: condition || asset.condition,
    notes: notes || '',
    verifiedBy: req.user.name,
    verifiedById: req.user.id,
    timestamp: new Date().toISOString()
  };

  // Schema: audits — details
  const { updated } = db.update('audits', id, { details });

  res.json(updated);
});

// ==========================================
// CLOSE AUDIT CYCLE — Admin only
// Locks cycle, auto-generates discrepancy report,
// updates affected asset statuses (Missing -> Lost, Damaged -> condition update)
// Schema: audits — status, discrepancyReport, closedAt
// Schema: assets — status, condition, history
// ==========================================
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
  const assets = db.read('assets');

  // Determine scope of assets
  const scopeAssets = assets.filter(a => {
    const matchesDept = !audit.departmentId || a.departmentId === audit.departmentId;
    const matchesLoc = !audit.location || (a.location && a.location.toLowerCase().includes(audit.location.toLowerCase()));
    return matchesDept && matchesLoc;
  });

  const discrepancyReport = [];
  const originalAudit = { ...audit };

  scopeAssets.forEach(asset => {
    const record = details[asset.id];
    const auditStatus = record ? record.status : 'Missing'; // unverified assets treated as Missing
    const auditCondition = record ? record.condition : asset.condition;
    const auditNotes = record ? record.notes : 'Not verified during audit cycle.';

    const isDiscrepant = auditStatus === 'Missing' || auditStatus === 'Damaged';
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

    // Append audit event to asset history
    const assetHistory = [...(asset.history || [])];
    assetHistory.push({
      id: `HIST-${Date.now()}`,
      eventType: 'Audited',
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Audited in cycle "${audit.name}". Verified status: ${auditStatus}. Condition: ${auditCondition}. ${auditNotes}`
    });

    // Schema: assets — status, condition, history
    const assetUpdate = { history: assetHistory };
    if (auditStatus === 'Missing') {
      assetUpdate.status = 'Lost';
    } else if (auditStatus === 'Damaged') {
      assetUpdate.condition = 'Damaged';
    }

    db.update('assets', asset.id, assetUpdate);
  });

  // Schema: audits — status, discrepancyReport, closedAt
  const { updated } = db.update('audits', id, {
    status: 'Completed',
    discrepancyReport,
    closedAt: new Date().toISOString()
  });

  // Notify assigned auditors of closure
  if (audit.auditors && Array.isArray(audit.auditors)) {
    audit.auditors.forEach(audId => {
      db.create('notifications', {
        userId: audId,
        message: `Audit cycle "${audit.name}" has been closed. ${discrepancyReport.length} discrepanc${discrepancyReport.length === 1 ? 'y' : 'ies'} found.`,
        type: 'Audit Completed',
        link: '/audits',
        isRead: false,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Notify Admins if there are discrepancies
  if (discrepancyReport.length > 0) {
    const users = db.read('users');
    users.filter(u => u.role === 'Admin' || u.role === 'Asset Manager').forEach(u => {
      db.create('notifications', {
        userId: u.id,
        message: `Audit cycle "${audit.name}" closed with ${discrepancyReport.length} discrepanc${discrepancyReport.length === 1 ? 'y' : 'ies'} flagged.`,
        type: 'Audit Discrepancy Flagged',
        link: '/audits',
        isRead: false,
        timestamp: new Date().toISOString()
      });
    });
  }

  logActivity(req.user.id, req.user.name, 'Close Audit Cycle', 'Audit', id, originalAudit, updated, req);

  res.json(updated);
});

module.exports = router;
