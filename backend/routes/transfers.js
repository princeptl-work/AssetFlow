const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// GET all transfers
router.get('/', auth, async (req, res) => {
  try {
    const transfers = await db.read('transfers');
    const assets = await db.read('assets');
    const users = await db.read('users');
    const depts = await db.read('departments');

    let filtered = transfers;
    if (req.user.role === 'Employee') {
      filtered = transfers.filter(t => t.requestedByUserId === req.user.id || t.targetUserId === req.user.id);
    } else if (req.user.role === 'Department Head') {
      filtered = transfers.filter(t => {
        const asset = assets.find(a => a.id === t.assetId);
        const srcDeptId = asset ? asset.departmentId : null;
        return srcDeptId === req.user.departmentId || t.targetDepartmentId === req.user.departmentId;
      });
    }

    const joined = filtered.map(t => {
      const asset = assets.find(a => a.id === t.assetId);
      const requester = users.find(u => u.id === t.requestedByUserId);
      const targetUser = users.find(u => u.id === t.targetUserId);
      const targetDept = depts.find(d => d.id === t.targetDepartmentId);
      return { ...t, assetName: asset ? asset.name : 'Unknown', assetTag: asset ? asset.assetTag : 'N/A', requesterName: requester ? requester.name : 'Unknown', targetUserName: targetUser ? targetUser.name : 'N/A', targetDepartmentName: targetDept ? targetDept.name : 'N/A' };
    });

    res.json(joined);
  } catch (err) {
    console.error('[Transfers GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST create transfer request
router.post('/', auth, async (req, res) => {
  try {
    const { assetId, targetUserId, targetDepartmentId, notes } = req.body;
    if (!assetId) return res.status(400).json({ message: 'Asset ID is required.' });

    const asset = await db.findById('assets', assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });
    if (asset.status !== 'Allocated') return res.status(400).json({ message: 'Only allocated assets can be transferred.' });

    const isOwner = asset.allocatedToUserId === req.user.id;
    const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset.departmentId === req.user.departmentId;
    const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';
    if (!isOwner && !isDeptHeadOfAsset && !isPrivileged) {
      return res.status(403).json({ message: 'You can only request transfers for your own or your department\'s assets.' });
    }

    if (targetUserId) {
      const target = await db.findById('users', targetUserId);
      if (!target) return res.status(400).json({ message: 'Target employee does not exist.' });
      if (target.status !== 'Active') return res.status(400).json({ message: 'Cannot transfer to an inactive employee.' });
    }
    if (targetDepartmentId) {
      const targetDept = await db.findById('departments', targetDepartmentId);
      if (!targetDept) return res.status(400).json({ message: 'Target department does not exist.' });
      if (targetDept.status === 'Inactive') return res.status(400).json({ message: 'Cannot transfer to an inactive department.' });
    }
    if (!targetUserId && !targetDepartmentId) return res.status(400).json({ message: 'Must specify either a target employee or department.' });

    const existingTransfers = await db.read('transfers');
    const pending = existingTransfers.find(t => t.assetId === assetId && (t.status === 'Requested' || t.status === 'Dept Head Approved'));
    if (pending) return res.status(400).json({ message: 'A transfer request is already pending for this asset.' });

    const newTransfer = await db.create('transfers', {
      assetId, requestedByUserId: req.user.id,
      targetUserId: targetUserId || '', targetDepartmentId: targetDepartmentId || '',
      status: 'Requested', deptHeadApproverId: '', assetManagerApproverId: '',
      notes: notes || '', requestDate: new Date().toISOString(),
      deptHeadApprovalDate: '', assetManagerApprovalDate: ''
    });

    if (asset.departmentId) {
      const dept = await db.findById('departments', asset.departmentId);
      if (dept && dept.managerId) {
        await db.create('notifications', {
          userId: dept.managerId,
          message: `Transfer requested for asset "${asset.name}" (${asset.assetTag}). Needs your review.`,
          type: 'Transfer Review Requested', link: '/transfers', isRead: false, timestamp: new Date().toISOString()
        });
      }
    }

    logActivity(req.user.id, req.user.name, 'Request Transfer', 'Transfer', newTransfer.id, null, newTransfer, req);
    res.status(201).json(newTransfer);
  } catch (err) {
    console.error('[Transfer Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT dept head approve
router.put('/:id/approve-dept', auth, checkRole(['Admin', 'Department Head']), async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await db.findById('transfers', id);
    if (!transfer) return res.status(404).json({ message: 'Transfer request not found.' });
    if (transfer.status !== 'Requested') return res.status(400).json({ message: `Cannot approve. Status: "${transfer.status}".` });

    const asset = await db.findById('assets', transfer.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId) {
      return res.status(403).json({ message: 'You can only approve transfers within your department.' });
    }

    const original = { ...transfer };
    const { updated } = await db.update('transfers', id, {
      status: 'Dept Head Approved',
      deptHeadApproverId: req.user.id,
      deptHeadApprovalDate: new Date().toISOString()
    });

    const users = await db.read('users');
    const managers = users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin');
    for (const am of managers) {
      await db.create('notifications', {
        userId: am.id,
        message: `Transfer of "${asset.name}" approved by Dept Head. Pending final approval.`,
        type: 'Transfer Final Approval Pending', link: '/transfers', isRead: false, timestamp: new Date().toISOString()
      });
    }

    logActivity(req.user.id, req.user.name, 'Dept Head Approve Transfer', 'Transfer', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Transfer Dept Approve Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT asset manager final approval
router.put('/:id/approve-manager', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await db.findById('transfers', id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
    if (transfer.status !== 'Dept Head Approved' && transfer.status !== 'Requested') {
      return res.status(400).json({ message: 'Transfer is not ready for final manager approval.' });
    }

    const asset = await db.findById('assets', transfer.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    const originalTransfer = { ...transfer };
    const originalAsset = { ...asset };

    const targetUser = transfer.targetUserId ? await db.findById('users', transfer.targetUserId) : null;
    const targetDept = transfer.targetDepartmentId ? await db.findById('departments', transfer.targetDepartmentId) : null;

    const dhUser = transfer.deptHeadApproverId ? await db.findById('users', transfer.deptHeadApproverId) : null;
    const approverNames = `DH: ${dhUser ? dhUser.name : 'Direct'}, AM: ${req.user.name}`;

    const history = [...(asset.history || [])];
    history.push({
      id: `HIST-${Date.now()}`, eventType: 'Transferred', date: new Date().toISOString(),
      user: req.user.name, userId: req.user.id,
      notes: `Transferred to ${targetUser ? targetUser.name : `Dept: ${targetDept ? targetDept.name : 'N/A'}`}. Approved by ${approverNames}. Notes: ${transfer.notes}`
    });

    await db.update('assets', asset.id, {
      allocatedToUserId: transfer.targetUserId || '',
      departmentId: targetUser ? (targetUser.departmentId || transfer.targetDepartmentId || '') : (transfer.targetDepartmentId || ''),
      allocatedDate: new Date().toISOString().split('T')[0],
      history
    });

    const { updated } = await db.update('transfers', id, {
      status: 'Reallocated',
      assetManagerApproverId: req.user.id,
      assetManagerApprovalDate: new Date().toISOString()
    });

    await db.create('notifications', {
      userId: transfer.requestedByUserId,
      message: `Your transfer request for "${asset.name}" has been APPROVED and reallocated.`,
      type: 'Transfer Approved', link: '/assets', isRead: false, timestamp: new Date().toISOString()
    });

    if (transfer.targetUserId) {
      await db.create('notifications', {
        userId: transfer.targetUserId,
        message: `Asset "${asset.name}" has been transferred and allocated to you.`,
        type: 'Asset Assigned', link: '/assets', isRead: false, timestamp: new Date().toISOString()
      });
    }

    logActivity(req.user.id, req.user.name, 'Manager Approve Transfer', 'Transfer', id, originalTransfer, updated, req);
    logActivity(req.user.id, req.user.name, 'Reallocate Asset', 'Asset', asset.id, originalAsset, await db.findById('assets', asset.id), req);

    res.json(updated);
  } catch (err) {
    console.error('[Transfer Manager Approve Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT reject transfer
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const transfer = await db.findById('transfers', id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });

    const asset = await db.findById('assets', transfer.assetId);
    const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset && asset.departmentId === req.user.departmentId;
    const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';
    if (!isDeptHeadOfAsset && !isPrivileged) return res.status(403).json({ message: 'Not authorized to reject this transfer.' });

    if (transfer.status === 'Reallocated' || transfer.status === 'Rejected') {
      return res.status(400).json({ message: `Cannot reject. Transfer is already "${transfer.status}".` });
    }

    const original = { ...transfer };
    const { updated } = await db.update('transfers', id, {
      status: 'Rejected',
      notes: `${transfer.notes ? transfer.notes + ' | ' : ''}Rejected: ${reason || 'No reason provided.'}`
    });

    await db.create('notifications', {
      userId: transfer.requestedByUserId,
      message: `Your transfer request for "${asset ? asset.name : 'Asset'}" was REJECTED: ${reason || 'No reason provided.'}`,
      type: 'Transfer Rejected', link: '/transfers', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Reject Transfer', 'Transfer', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Transfer Reject Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
