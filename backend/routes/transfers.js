const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// GET ALL TRANSFER REQUESTS
// Admin, Asset Manager: all transfers
// Department Head: transfers involving their department's assets or target dept
// Employee: transfers they requested or that target them
// ==========================================
router.get('/', auth, (req, res) => {
  const transfers = db.read('transfers') || [];
  const assets = db.read('assets');
  const users = db.read('users');
  const depts = db.read('departments');

  let filtered = transfers;

  if (req.user.role === 'Employee') {
    filtered = transfers.filter(t =>
      t.requestedByUserId === req.user.id || t.targetUserId === req.user.id
    );
  } else if (req.user.role === 'Department Head') {
    filtered = transfers.filter(t => {
      const asset = assets.find(a => a.id === t.assetId);
      const sourceDeptId = asset ? asset.departmentId : null;
      return sourceDeptId === req.user.departmentId || t.targetDepartmentId === req.user.departmentId;
    });
  }

  const joined = filtered.map(t => {
    const asset = assets.find(a => a.id === t.assetId);
    const requester = users.find(u => u.id === t.requestedByUserId);
    const targetUser = t.targetUserId ? users.find(u => u.id === t.targetUserId) : null;
    const targetDept = t.targetDepartmentId ? depts.find(d => d.id === t.targetDepartmentId) : null;
    const deptHeadApprover = t.deptHeadApproverId ? users.find(u => u.id === t.deptHeadApproverId) : null;
    const managerApprover = t.assetManagerApproverId ? users.find(u => u.id === t.assetManagerApproverId) : null;

    return {
      ...t,
      assetName: asset ? asset.name : 'Unknown Asset',
      assetTag: asset ? asset.assetTag : 'N/A',
      requesterName: requester ? requester.name : 'Unknown User',
      targetUserName: targetUser ? targetUser.name : 'N/A',
      targetDepartmentName: targetDept ? targetDept.name : 'N/A',
      deptHeadApproverName: deptHeadApprover ? deptHeadApprover.name : 'N/A',
      managerApproverName: managerApprover ? managerApprover.name : 'N/A'
    };
  });

  res.json(joined);
});

// ==========================================
// CREATE TRANSFER REQUEST
// Any role can request — subject to ownership/department constraints
// Schema: transfers — assetId, requestedByUserId, targetUserId, targetDepartmentId, status,
//   deptHeadApproverId, assetManagerApproverId, notes, requestDate,
//   deptHeadApprovalDate, assetManagerApprovalDate, createdAt(auto), updatedAt(auto)
// ==========================================
router.post('/', auth, (req, res) => {
  const { assetId, targetUserId, targetDepartmentId, notes } = req.body;

  if (req.user.role === 'Admin') {
    return res.status(403).json({ message: 'Administrators cannot initiate asset transfers.' });
  }

  if (!assetId) {
    return res.status(400).json({ message: 'Asset ID is required.' });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Only allocated assets can be transferred
  if (asset.status !== 'Allocated') {
    return res.status(400).json({ message: 'Only currently allocated assets can be transferred.' });
  }

  // Authorization: must be the holder, the dept head of the holding dept, Admin, or Asset Manager
  const isHolder = asset.allocatedToUserId === req.user.id;
  const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isHolder && !isDeptHeadOfAsset && !isPrivileged) {
    return res.status(403).json({ message: 'You can only request transfers for assets allocated to you or your department.' });
  }

  if (!targetUserId && !targetDepartmentId) {
    return res.status(400).json({ message: 'Must specify either a target employee or a target department.' });
  }

  // Validate target user
  if (targetUserId && targetUserId !== '') {
    const target = db.findById('users', targetUserId);
    if (!target) {
      return res.status(400).json({ message: 'Target employee does not exist.' });
    }
    if (target.status !== 'Active') {
      return res.status(400).json({ message: 'Cannot transfer to an inactive employee.' });
    }
    // Prevent self-transfer
    if (targetUserId === asset.allocatedToUserId) {
      return res.status(400).json({ message: 'Cannot transfer to the current holder.' });
    }
  }

  // Validate target department
  if (targetDepartmentId && targetDepartmentId !== '') {
    const targetDept = db.findById('departments', targetDepartmentId);
    if (!targetDept) {
      return res.status(400).json({ message: 'Target department does not exist.' });
    }
    if (targetDept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot transfer to an inactive department.' });
    }
  }

  // Prevent duplicate pending transfer for same asset
  const existingTransfers = db.read('transfers') || [];
  const pending = existingTransfers.find(t =>
    t.assetId === assetId && (t.status === 'Requested' || t.status === 'Dept Head Approved')
  );
  if (pending) {
    return res.status(400).json({ message: 'A transfer request is already pending for this asset.' });
  }

  // Schema: transfers
  const newTransfer = db.create('transfers', {
    assetId,
    requestedByUserId: req.user.id,
    targetUserId: targetUserId || '',
    targetDepartmentId: targetDepartmentId || '',
    status: 'Requested',
    deptHeadApproverId: '',
    assetManagerApproverId: '',
    notes: notes || '',
    requestDate: new Date().toISOString(),
    deptHeadApprovalDate: '',
    assetManagerApprovalDate: ''
  });

  // Notify department head of the source department
  if (asset.departmentId) {
    const dept = db.findById('departments', asset.departmentId);
    if (dept && dept.managerId) {
      db.create('notifications', {
        userId: dept.managerId,
        message: `Transfer requested for asset "${asset.name}" (${asset.assetTag}). Requires your review.`,
        type: 'Transfer Review Requested',
        link: '/transfers',
        isRead: false,
        timestamp: new Date().toISOString()
      });
    }
  }

  logActivity(req.user.id, req.user.name, 'Request Transfer', 'Transfer', newTransfer.id, null, newTransfer, req);

  res.status(201).json(newTransfer);
});

// ==========================================
// DEPARTMENT HEAD APPROVAL
// Department Head: must own the asset's department
// Admin: can bypass
// ==========================================
router.put('/:id/approve-dept', auth, checkRole(['Admin', 'Department Head']), (req, res) => {
  const { id } = req.params;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  if (transfer.status !== 'Requested') {
    return res.status(400).json({ message: `Cannot approve. Transfer is in "${transfer.status}" status.` });
  }

  const asset = db.findById('assets', transfer.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Associated asset not found.' });
  }

  // Dept Head can only approve for their own department
  if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId) {
    return res.status(403).json({ message: 'You can only approve transfers within your department.' });
  }

  const original = { ...transfer };

  // Schema fields: status, deptHeadApproverId, deptHeadApprovalDate
  const { updated } = db.update('transfers', id, {
    status: 'Dept Head Approved',
    deptHeadApproverId: req.user.id,
    deptHeadApprovalDate: new Date().toISOString()
  });

  // Notify Asset Managers and Admins for final approval
  const users = db.read('users');
  users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin').forEach(am => {
    db.create('notifications', {
      userId: am.id,
      message: `Transfer of asset "${asset.name}" (${asset.assetTag}) approved by Dept Head. Pending final manager approval.`,
      type: 'Transfer Final Approval Pending',
      link: '/transfers',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Dept Head Approve Transfer', 'Transfer', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// ASSET MANAGER FINAL APPROVAL + REALLOCATION
// Admin or Asset Manager
// ==========================================
router.put('/:id/approve-manager', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  // Must be Dept Head Approved or Requested (Admin can bypass dept head step)
  if (transfer.status !== 'Dept Head Approved' && transfer.status !== 'Requested') {
    return res.status(400).json({ message: 'Transfer is not ready for final manager approval.' });
  }

  const asset = db.findById('assets', transfer.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Associated asset not found.' });
  }

  const targetUser = transfer.targetUserId ? db.findById('users', transfer.targetUserId) : null;
  const targetDept = transfer.targetDepartmentId ? db.findById('departments', transfer.targetDepartmentId) : null;
  const dhUser = transfer.deptHeadApproverId ? db.findById('users', transfer.deptHeadApproverId) : null;

  const originalTransfer = { ...transfer };
  const originalAsset = { ...asset };

  // Append history entry to asset
  const history = [...(asset.history || [])];
  const approverNames = `DH: ${dhUser ? dhUser.name : 'Bypassed'}, AM: ${req.user.name}`;
  const targetLabel = targetUser ? targetUser.name : (targetDept ? `Dept: ${targetDept.name}` : 'Unknown');

  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Transferred',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Transferred to ${targetLabel}. Approved by: ${approverNames}. Notes: ${transfer.notes || 'None'}`
  });

  // Update asset — schema fields: allocatedToUserId, departmentId, allocatedDate, history
  db.update('assets', asset.id, {
    allocatedToUserId: transfer.targetUserId || '',
    departmentId: targetUser
      ? (targetUser.departmentId || transfer.targetDepartmentId || asset.departmentId || '')
      : (transfer.targetDepartmentId || asset.departmentId || ''),
    allocatedDate: new Date().toISOString().split('T')[0],
    history
  });

  // Update transfer — schema fields: status, assetManagerApproverId, assetManagerApprovalDate
  const { updated } = db.update('transfers', id, {
    status: 'Reallocated',
    assetManagerApproverId: req.user.id,
    assetManagerApprovalDate: new Date().toISOString()
  });

  // Notify requester
  db.create('notifications', {
    userId: transfer.requestedByUserId,
    message: `Your transfer request for asset "${asset.name}" has been APPROVED and completed.`,
    type: 'Transfer Approved',
    link: '/assets',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  // Notify new holder
  if (transfer.targetUserId) {
    db.create('notifications', {
      userId: transfer.targetUserId,
      message: `Asset "${asset.name}" (${asset.assetTag}) has been transferred and allocated to you.`,
      type: 'Asset Assigned',
      link: '/assets',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  }

  logActivity(req.user.id, req.user.name, 'Manager Approve Transfer', 'Transfer', id, originalTransfer, updated, req);
  logActivity(req.user.id, req.user.name, 'Reallocate Asset (Transfer)', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

  res.json(updated);
});

// ==========================================
// REJECT TRANSFER REQUEST
// Dept Head (of source dept), Admin, Asset Manager
// ==========================================
router.put('/:id/reject', auth, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  if (transfer.status === 'Reallocated' || transfer.status === 'Rejected') {
    return res.status(400).json({ message: `Cannot reject. Transfer is already "${transfer.status}".` });
  }

  const asset = db.findById('assets', transfer.assetId);

  const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset && asset.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isDeptHeadOfAsset && !isPrivileged) {
    return res.status(403).json({ message: 'You are not authorized to reject this transfer request.' });
  }

  const original = { ...transfer };

  // Schema field: status, notes
  const { updated } = db.update('transfers', id, {
    status: 'Rejected',
    notes: `${transfer.notes ? transfer.notes + ' | ' : ''}Rejected: ${reason || 'No reason provided.'}`
  });

  // Notify requester
  db.create('notifications', {
    userId: transfer.requestedByUserId,
    message: `Your transfer request for asset "${asset ? asset.name : 'Asset'}" was REJECTED: ${reason || 'No reason provided.'}`,
    type: 'Transfer Rejected',
    link: '/transfers',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Reject Transfer', 'Transfer', id, original, updated, req);

  res.json(updated);
});

module.exports = router;
