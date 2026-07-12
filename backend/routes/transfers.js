const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Get all transfer requests
router.get('/', auth, (req, res) => {
  const transfers = db.read('transfers') || [];
  
  // Joins
  const users = db.read('users');
  const depts = db.read('departments');
  const assets = db.read('assets');

  const joined = transfers.map(t => {
    const asset = assets.find(a => a.id === t.assetId);
    const requester = users.find(u => u.id === t.requestedByUserId);
    const targetUser = users.find(u => u.id === t.targetUserId);
    const targetDept = depts.find(d => d.id === t.targetDepartmentId);

    return {
      ...t,
      assetName: asset ? asset.name : 'Unknown Asset',
      assetTag: asset ? asset.assetTag : 'N/A',
      requesterName: requester ? requester.name : 'Unknown User',
      targetUserName: targetUser ? targetUser.name : 'N/A',
      targetDepartmentName: targetDept ? targetDept.name : 'N/A'
    };
  });

  res.json(joined);
});

// Create transfer request (Employee or Dept Head or Admin)
router.post('/', auth, (req, res) => {
  const { assetId, targetUserId, targetDepartmentId, notes } = req.body;

  if (!assetId) {
    return res.status(400).json({ message: 'Asset ID is required.' });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Enforce validation: Asset must be allocated
  if (asset.status !== 'Allocated') {
    return res.status(400).json({ message: 'Only currently allocated assets can be transferred.' });
  }

  // Auth: An employee can only request transfer for an asset allocated to them.
  // Admin, Asset Manager, and Department Head can request for others.
  const isOwner = asset.allocatedToUserId === req.user.id;
  const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isOwner && !isDeptHeadOfAsset && !isPrivileged) {
    return res.status(403).json({ message: 'You can only request transfers for your own or your department\'s assets.' });
  }

  // Validate target user if provided
  if (targetUserId) {
    const target = db.findById('users', targetUserId);
    if (!target) {
      return res.status(400).json({ message: 'Target employee does not exist.' });
    }
    if (target.status !== 'Active') {
      return res.status(400).json({ message: 'Cannot transfer to an inactive employee.' });
    }
  }

  // Validate target department if provided
  if (targetDepartmentId) {
    const targetDept = db.findById('departments', targetDepartmentId);
    if (!targetDept) {
      return res.status(400).json({ message: 'Target department does not exist.' });
    }
    if (targetDept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot transfer to an inactive department.' });
    }
  }

  if (!targetUserId && !targetDepartmentId) {
    return res.status(400).json({ message: 'Must specify either a target employee or department.' });
  }

  // Check if a transfer request is already pending for this asset
  const existingTransfers = db.read('transfers') || [];
  const pending = existingTransfers.find(t => t.assetId === assetId && (t.status === 'Requested' || t.status === 'Dept Head Approved'));
  if (pending) {
    return res.status(400).json({ message: 'A transfer request is already pending for this asset.' });
  }

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

  // Notify target department head
  if (asset.departmentId) {
    const dept = db.findById('departments', asset.departmentId);
    if (dept && dept.managerId) {
      db.create('notifications', {
        userId: dept.managerId,
        message: `Transfer requested for asset "${asset.name}" (${asset.assetTag}) to another unit. Needs your review.`,
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

// Department Head Approval
router.put('/:id/approve-dept', auth, checkRole(['Admin', 'Department Head']), (req, res) => {
  const { id } = req.params;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  if (transfer.status !== 'Requested') {
    return res.status(400).json({ message: `Cannot approve. Transfer request is currently in "${transfer.status}" status.` });
  }

  const asset = db.findById('assets', transfer.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Validate department head authority
  if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId) {
    return res.status(403).json({ message: 'You can only approve transfer requests within your department.' });
  }

  const original = { ...transfer };
  const { updated } = db.update('transfers', id, {
    status: 'Dept Head Approved',
    deptHeadApproverId: req.user.id,
    deptHeadApprovalDate: new Date().toISOString()
  });

  // Notify Asset Managers
  const users = db.read('users');
  const assetManagers = users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin');
  assetManagers.forEach(am => {
    db.create('notifications', {
      userId: am.id,
      message: `Transfer of asset "${asset.name}" approved by Dept Head, pending final asset manager approval.`,
      type: 'Transfer Final Approval Pending',
      link: '/transfers',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Dept Head Approve Transfer', 'Transfer', id, original, updated, req);

  res.json(updated);
});

// Asset Manager Final Approval
router.put('/:id/approve-manager', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  // Allow bypass of department head if admin/manager approves directly?
  // Let's enforce standard workflow: Requested -> Dept Head Approved -> Asset Manager Approved
  if (transfer.status !== 'Dept Head Approved' && transfer.status !== 'Requested') {
    return res.status(400).json({ message: 'Transfer request is not ready for final manager approval.' });
  }

  const asset = db.findById('assets', transfer.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const originalTransfer = { ...transfer };
  const originalAsset = { ...asset };

  // Perform reallocation
  const targetUser = transfer.targetUserId ? db.findById('users', transfer.targetUserId) : null;
  const targetDept = transfer.targetDepartmentId ? db.findById('departments', transfer.targetDepartmentId) : null;

  const history = [...(asset.history || [])];
  const approverNames = `DH: ${transfer.deptHeadApproverId ? db.findById('users', transfer.deptHeadApproverId).name : 'Direct'}, AM: ${req.user.name}`;
  
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Transferred',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Transferred to ${targetUser ? targetUser.name : `Dept: ${targetDept.name}`}. Approved by ${approverNames}. Notes: ${transfer.notes}`
  });

  // Update Asset
  db.update('assets', asset.id, {
    allocatedToUserId: transfer.targetUserId || '',
    departmentId: targetUser ? (targetUser.departmentId || transfer.targetDepartmentId || '') : (transfer.targetDepartmentId || ''),
    allocatedDate: new Date().toISOString().split('T')[0],
    history
  });

  // Update Transfer
  const { updated } = db.update('transfers', id, {
    status: 'Reallocated',
    assetManagerApproverId: req.user.id,
    assetManagerApprovalDate: new Date().toISOString()
  });

  // Notifications
  db.create('notifications', {
    userId: transfer.requestedByUserId,
    message: `Your transfer request for asset "${asset.name}" has been APPROVED and successfully reallocated.`,
    type: 'Transfer Approved',
    link: '/assets',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  if (transfer.targetUserId) {
    db.create('notifications', {
      userId: transfer.targetUserId,
      message: `Asset "${asset.name}" has been transferred and allocated to you.`,
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

// Reject Transfer Request
router.put('/:id/reject', auth, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const transfer = db.findById('transfers', id);
  if (!transfer) {
    return res.status(404).json({ message: 'Transfer request not found.' });
  }

  const asset = db.findById('assets', transfer.assetId);

  // Check auth: Requester's Dept Head, Admin, or Asset Manager can reject
  const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset && asset.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isDeptHeadOfAsset && !isPrivileged) {
    return res.status(403).json({ message: 'You are not authorized to reject this transfer request.' });
  }

  if (transfer.status === 'Reallocated' || transfer.status === 'Rejected') {
    return res.status(400).json({ message: `Cannot reject. Transfer request is already in "${transfer.status}" status.` });
  }

  const original = { ...transfer };
  const { updated } = db.update('transfers', id, {
    status: 'Rejected',
    notes: `${transfer.notes ? transfer.notes + ' | ' : ''}Rejected: ${reason || 'No reason provided.'}`
  });

  // Notify Requester
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
