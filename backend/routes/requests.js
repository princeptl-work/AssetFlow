const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// GET ALL ASSET REQUESTS
// Admin, Asset Manager: sees all requests
// Department Head: sees requests from users in their department
// Employee: sees only their own requests
// ==========================================
router.get('/', auth, (req, res) => {
  const requests = db.read('requests') || [];
  const users = db.read('users') || [];
  const categories = db.read('categories') || [];
  const assets = db.read('assets') || [];

  let filtered = requests;

  if (req.user.role === 'Employee') {
    filtered = requests.filter(r => r.userId === req.user.id);
  } else if (req.user.role === 'Department Head') {
    filtered = requests.filter(r => {
      const requester = users.find(u => u.id === r.userId);
      return requester && requester.departmentId === req.user.departmentId;
    });
  }

  // Join requester info, category name, and asset tag/name
  const joined = filtered.map(r => {
    const requester = users.find(u => u.id === r.userId);
    const category = categories.find(c => c.id === r.categoryId);
    const asset = r.allocatedAssetId ? assets.find(a => a.id === r.allocatedAssetId) : null;
    const requestedAsset = r.assetId ? assets.find(a => a.id === r.assetId) : null;

    return {
      ...r,
      requesterName: requester ? requester.name : 'Unknown User',
      requesterEmployeeId: requester ? requester.employeeId : 'N/A',
      requesterDepartmentId: requester ? requester.departmentId : 'N/A',
      categoryName: category ? category.name : 'Unknown Category',
      assetName: asset ? asset.name : 'N/A',
      assetTag: asset ? asset.assetTag : 'N/A',
      requestedAssetName: requestedAsset ? requestedAsset.name : 'N/A',
      requestedAssetTag: requestedAsset ? requestedAsset.assetTag : 'N/A'
    };
  });

  // Sort by newest first
  joined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(joined);
});

// ==========================================
// CREATE ASSET REQUEST
// Any authenticated user can submit a request
// ==========================================
router.post('/', auth, (req, res) => {
  const { assetId, reason } = req.body;

  if (req.user.role === 'Admin') {
    return res.status(403).json({ message: 'Administrators cannot submit asset requests.' });
  }

  if (!assetId || !reason) {
    return res.status(400).json({ message: 'Asset ID and reason are required.' });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (asset.status !== 'Available' && asset.status !== 'Reserved') {
    return res.status(400).json({ message: 'Asset is not available or reserved for request.' });
  }

  const newRequest = db.create('requests', {
    userId: req.user.id,
    categoryId: asset.categoryId,
    assetId: asset.id,
    reason,
    status: 'Pending',
    allocatedAssetId: '',
    remarks: ''
  });

  logActivity(req.user.id, req.user.name, 'Submit Request', 'Request', newRequest.id, null, newRequest, req);

  // Notify Admin/Asset Manager of new request
  const adminsAndManagers = (db.read('users') || []).filter(u => u.role === 'Admin' || u.role === 'Asset Manager');
  adminsAndManagers.forEach(admin => {
    db.create('notifications', {
      userId: admin.id,
      message: `${req.user.name} submitted a new request for a ${category.name} asset.`,
      type: 'Asset Request Submitted',
      link: '/requests',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  res.status(201).json(newRequest);
});

// ==========================================
// PROCESS ASSET REQUEST (Approve/Reject/Fulfill)
// Only Admins or Asset Managers can process requests
// ==========================================
router.put('/:id', auth, checkRole(['Asset Manager', 'Department Head']), (req, res) => {
  const { id } = req.params;
  const { status, allocatedAssetId, remarks } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status. Status must be Approved or Rejected.' });
  }

  const request = db.findById('requests', id);
  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  if (request.status !== 'Pending') {
    return res.status(400).json({ message: `This request has already been ${request.status.toLowerCase()}.` });
  }

  const requester = db.findById('users', request.userId);
  if (!requester) {
    return res.status(404).json({ message: 'Requesting employee user profile not found.' });
  }

  // Department Head check: must be in the same department as the requester
  if (req.user.role === 'Department Head' && requester.departmentId !== req.user.departmentId) {
    return res.status(403).json({ message: 'You can only approve requests from employees in your department.' });
  }

  const category = db.findById('categories', request.categoryId);
  const categoryName = category ? category.name : 'Asset';

  const originalRequest = { ...request };

  if (status === 'Approved') {
    if (!allocatedAssetId) {
      return res.status(400).json({ message: 'Asset allocation is required to approve the request.' });
    }

    const asset = db.findById('assets', allocatedAssetId);
    if (!asset) {
      return res.status(404).json({ message: 'Selected asset not found.' });
    }

    if (asset.status !== 'Available' && asset.status !== 'Reserved') {
      return res.status(400).json({ message: `Cannot allocate this asset. It is currently in "${asset.status}" status.` });
    }

    if (asset.categoryId !== request.categoryId) {
      return res.status(400).json({ message: 'The allocated asset category does not match the requested category.' });
    }

    const originalAsset = { ...asset };

    // Update asset details to reflect allocation
    const history = [...(asset.history || [])];
    history.push({
      id: `HIST-${Date.now()}`,
      eventType: 'Allocated',
      date: new Date().toISOString(),
      user: requester.name,
      userId: requester.id,
      notes: `Asset allocated via request approval ID: ${request.id}. Remarks: ${remarks || ''}`
    });

    db.update('assets', asset.id, {
      status: 'Allocated',
      allocatedToUserId: requester.id,
      allocatedDate: new Date().toISOString().split('T')[0],
      departmentId: requester.departmentId || asset.departmentId,
      history
    });

    // Update request details
    const updatedRequest = db.update('requests', id, {
      status: 'Approved',
      allocatedAssetId: asset.id,
      remarks: remarks || 'Request approved and asset allocated.'
    });

    // Notify requester
    db.create('notifications', {
      userId: requester.id,
      message: `Your request for a ${categoryName} has been approved. Asset "${asset.name}" (${asset.assetTag}) has been allocated to you.`,
      type: 'Asset Request Approved',
      link: '/assets',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Approve Request', 'Request', id, originalRequest, updatedRequest, req);
    logActivity(req.user.id, req.user.name, 'Allocate Asset', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

    return res.json({ message: 'Request approved successfully and asset allocated.', request: updatedRequest });

  } else if (status === 'Rejected') {
    const updatedRequest = db.update('requests', id, {
      status: 'Rejected',
      remarks: remarks || 'Request was rejected.'
    });

    // Notify requester
    db.create('notifications', {
      userId: requester.id,
      message: `Your request for a ${categoryName} has been rejected. Remarks: ${remarks || 'No remarks provided.'}`,
      type: 'Asset Request Rejected',
      link: '/requests',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Reject Request', 'Request', id, originalRequest, updatedRequest, req);

    return res.json({ message: 'Request rejected.', request: updatedRequest });
  }
});

module.exports = router;
