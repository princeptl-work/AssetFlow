const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Generate QR code and barcode strings from asset tag + serial
function generateCodes(tag, serial) {
  return {
    qrCode: `assetflow://asset/${tag}?sn=${serial || ''}`,
    barcode: `AF*${tag.replace('AF-', '')}*${serial || '0'}`
  };
}

// Lifecycle transition validation rules
const VALID_TRANSITIONS = {
  'Available':       ['Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired'],
  'Allocated':       ['Available', 'Lost'],
  'Reserved':        ['Allocated', 'Available'],
  'Under Maintenance': ['Available'],
  'Lost':            ['Available', 'Retired'],
  'Retired':         ['Disposed'],
  'Disposed':        []
};

function isValidTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = VALID_TRANSITIONS[fromState];
  return allowed ? allowed.includes(toState) : false;
}

// ==========================================
// GET ALL ASSETS (with role-scoping & filters)
// ==========================================
// Admin, Asset Manager: all assets
// Department Head: their dept assets + bookable assets
// Employee: their allocated assets + bookable assets
router.get('/', auth, (req, res) => {
  let assets = db.read('assets');

  if (req.user.role === 'Employee') {
    assets = assets.filter(a => a.allocatedToUserId === req.user.id || a.bookable === 'Yes');
  } else if (req.user.role === 'Department Head') {
    assets = assets.filter(a => a.departmentId === req.user.departmentId || a.bookable === 'Yes');
  }

  const { search, categoryId, departmentId, status, condition, location, bookable } = req.query;

  if (search) {
    const s = search.toLowerCase();
    assets = assets.filter(a =>
      (a.assetTag && a.assetTag.toLowerCase().includes(s)) ||
      (a.name && a.name.toLowerCase().includes(s)) ||
      (a.serialNumber && a.serialNumber.toLowerCase().includes(s)) ||
      (a.modelNumber && a.modelNumber.toLowerCase().includes(s)) ||
      (a.manufacturer && a.manufacturer.toLowerCase().includes(s))
    );
  }

  if (categoryId) assets = assets.filter(a => a.categoryId === categoryId);
  if (departmentId) assets = assets.filter(a => a.departmentId === departmentId);
  if (status) assets = assets.filter(a => a.status === status);
  if (condition) assets = assets.filter(a => a.condition === condition);
  if (location) assets = assets.filter(a => a.location && a.location.toLowerCase().includes(location.toLowerCase()));
  if (bookable) assets = assets.filter(a => a.bookable === bookable);

  // Enrich with related names
  const categories = db.read('categories');
  const departments = db.read('departments');
  const users = db.read('users');

  const joined = assets.map(asset => {
    const cat = categories.find(c => c.id === asset.categoryId);
    const dept = departments.find(d => d.id === asset.departmentId);
    let allocatedToName = '';
    if (asset.allocatedToUserId) {
      const u = users.find(user => user.id === asset.allocatedToUserId);
      if (u) allocatedToName = u.name;
    }
    return {
      ...asset,
      categoryName: cat ? cat.name : 'Unknown',
      departmentName: dept ? dept.name : 'Unassigned',
      allocatedToName
    };
  });

  res.json(joined);
});

// ==========================================
// GET SINGLE ASSET
// ==========================================
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id) || db.findOne('assets', { assetTag: id });
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Role-based scope check
  if (req.user.role === 'Employee' && asset.allocatedToUserId !== req.user.id && asset.bookable !== 'Yes') {
    return res.status(403).json({ message: 'Access denied. You can only view your own allocated assets or bookable resources.' });
  }
  if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId && asset.bookable !== 'Yes') {
    return res.status(403).json({ message: 'Access denied. You can only view assets in your department or bookable resources.' });
  }

  const categories = db.read('categories');
  const departments = db.read('departments');
  const users = db.read('users');

  const cat = categories.find(c => c.id === asset.categoryId);
  const dept = departments.find(d => d.id === asset.departmentId);
  let allocatedToUser = null;
  if (asset.allocatedToUserId) {
    const u = users.find(user => user.id === asset.allocatedToUserId);
    if (u) {
      const { password, ...uSafe } = u;
      allocatedToUser = uSafe;
    }
  }

  res.json({
    ...asset,
    category: cat || null,
    department: dept || null,
    allocatedTo: allocatedToUser
  });
});

// ==========================================
// REGISTER NEW ASSET — Admin, Asset Manager
// Schema: assets — name, categoryId, serialNumber, modelNumber, manufacturer, acquisitionDate,
//   acquisitionCost, location, departmentId, condition, status, warrantyExpiry, bookable,
//   remarks, allocatedToUserId, allocatedDate, expectedReturnDate, assetTag, qrCode, barcode,
//   history, photo, documents, createdAt(auto), updatedAt(auto)
// ==========================================
router.post('/', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const {
    name, categoryId, serialNumber, modelNumber, manufacturer,
    acquisitionDate, acquisitionCost, location, departmentId,
    condition, warrantyExpiry, bookable, remarks, photo, documents
  } = req.body;

  if (!name || !categoryId || !condition) {
    return res.status(400).json({ message: 'Name, Category, and Condition are required fields.' });
  }

  // Validate condition enum
  const validConditions = ['Excellent', 'Good', 'Fair', 'Damaged'];
  if (!validConditions.includes(condition)) {
    return res.status(400).json({ message: `Condition must be one of: ${validConditions.join(', ')}` });
  }

  // Serial number uniqueness
  if (serialNumber && serialNumber.trim()) {
    const existingSerial = db.findOne('assets', { serialNumber: serialNumber.trim() });
    if (existingSerial) {
      return res.status(400).json({ message: `An asset with Serial Number "${serialNumber}" already exists.` });
    }
  }

  // Acquisition date not in future
  if (acquisitionDate && new Date(acquisitionDate) > new Date()) {
    return res.status(400).json({ message: 'Acquisition date cannot be in the future.' });
  }

  // Validate category
  const cat = db.findById('categories', categoryId);
  if (!cat) {
    return res.status(400).json({ message: 'Category not found.' });
  }

  // Validate department
  if (departmentId && departmentId !== '') {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Department not found.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot assign asset to an inactive department.' });
    }
  }

  // Auto-generate asset tag: AF-XXXX (sequential, based on total count + 1)
  const allAssets = db.read('assets');
  const tagNum = allAssets.length + 1;
  const assetTag = `AF-${String(tagNum).padStart(4, '0')}`;
  const codes = generateCodes(assetTag, serialNumber);

  const newAsset = db.create('assets', {
    name,
    categoryId,
    serialNumber: serialNumber ? serialNumber.trim() : '',
    modelNumber: modelNumber || '',
    manufacturer: manufacturer || '',
    acquisitionDate: acquisitionDate || new Date().toISOString().split('T')[0],
    acquisitionCost: acquisitionCost !== undefined ? Number(acquisitionCost) : 0,
    location: location || '',
    departmentId: departmentId || '',
    condition,
    status: 'Available',
    warrantyExpiry: warrantyExpiry || '',
    bookable: bookable === 'Yes' ? 'Yes' : 'No',
    remarks: remarks || '',
    allocatedToUserId: '',
    allocatedDate: '',
    expectedReturnDate: '',
    assetTag,
    qrCode: codes.qrCode,
    barcode: codes.barcode,
    photo: photo || '',
    documents: Array.isArray(documents) ? documents : (documents ? [documents] : []),
    history: [
      {
        id: `HIST-${Date.now()}`,
        eventType: 'Created',
        date: new Date().toISOString(),
        user: req.user.name,
        userId: req.user.id,
        notes: 'Initial registration in AssetFlow system.'
      }
    ]
  });

  logActivity(req.user.id, req.user.name, 'Create', 'Asset', newAsset.id, null, newAsset, req);

  res.status(201).json(newAsset);
});

// ==========================================
// UPDATE ASSET DETAILS — Admin, Asset Manager
// ==========================================
router.put('/:id', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const {
    name, categoryId, serialNumber, modelNumber, manufacturer,
    acquisitionDate, acquisitionCost, location, departmentId,
    condition, status, warrantyExpiry, bookable, remarks,
    photo, documents
  } = req.body;

  // Validate condition enum if provided
  if (condition !== undefined) {
    const validConditions = ['Excellent', 'Good', 'Fair', 'Damaged'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ message: `Condition must be one of: ${validConditions.join(', ')}` });
    }
  }

  // Validate state transition
  if (status !== undefined && status !== asset.status) {
    if (!isValidTransition(asset.status, status)) {
      return res.status(400).json({
        message: `Invalid state transition: Cannot change status from "${asset.status}" to "${status}".`
      });
    }
  }

  // Serial uniqueness check
  if (serialNumber !== undefined && serialNumber !== asset.serialNumber) {
    const existingSerial = db.findOne('assets', { serialNumber });
    if (existingSerial) {
      return res.status(400).json({ message: `An asset with Serial Number "${serialNumber}" already exists.` });
    }
  }

  // Validate department
  if (departmentId !== undefined && departmentId !== '' && departmentId !== asset.departmentId) {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Department not found.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot assign asset to an inactive department.' });
    }
  }

  const original = { ...asset };

  // Append lifecycle event to history if status changes
  const history = [...(asset.history || [])];
  if (status !== undefined && status !== asset.status) {
    history.push({
      id: `HIST-${Date.now()}`,
      eventType: status,
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Status transitioned from "${asset.status}" to "${status}".`
    });
  }

  // Regenerate codes if serial number changes
  const codes = (serialNumber !== undefined && serialNumber !== asset.serialNumber)
    ? generateCodes(asset.assetTag, serialNumber)
    : {};

  // Build update — only schema fields
  const updateData = { history, ...codes };
  if (name !== undefined) updateData.name = name;
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
  if (modelNumber !== undefined) updateData.modelNumber = modelNumber;
  if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
  if (acquisitionDate !== undefined) updateData.acquisitionDate = acquisitionDate;
  if (acquisitionCost !== undefined) updateData.acquisitionCost = Number(acquisitionCost);
  if (location !== undefined) updateData.location = location;
  if (departmentId !== undefined) updateData.departmentId = departmentId;
  if (condition !== undefined) updateData.condition = condition;
  if (status !== undefined) updateData.status = status;
  if (warrantyExpiry !== undefined) updateData.warrantyExpiry = warrantyExpiry;
  if (bookable !== undefined) updateData.bookable = bookable === 'Yes' ? 'Yes' : 'No';
  if (remarks !== undefined) updateData.remarks = remarks;
  if (photo !== undefined) updateData.photo = photo;
  if (documents !== undefined) updateData.documents = Array.isArray(documents) ? documents : (documents ? [documents] : []);

  const { updated } = db.update('assets', id, updateData);

  logActivity(req.user.id, req.user.name, 'Update', 'Asset', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// ALLOCATE ASSET — Admin, Asset Manager
// Sets: status='Allocated', allocatedToUserId, allocatedDate, expectedReturnDate, departmentId, history
// ==========================================
router.post('/:id/allocate', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { employeeId, departmentId, expectedReturnDate, notes } = req.body;

  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Block double allocation — show who holds it
  if (asset.status === 'Allocated') {
    let allocatedName = 'Unknown User';
    let allocatedDeptName = 'Unassigned';
    if (asset.allocatedToUserId) {
      const u = db.findById('users', asset.allocatedToUserId);
      if (u) allocatedName = u.name;
    }
    if (asset.departmentId) {
      const d = db.findById('departments', asset.departmentId);
      if (d) allocatedDeptName = d.name;
    }
    return res.status(400).json({
      message: 'Double allocation blocked: This asset is currently allocated.',
      allocationDetails: {
        employeeName: allocatedName,
        departmentName: allocatedDeptName,
        allocationDate: asset.allocatedDate || 'N/A'
      }
    });
  }

  // Only Available or Reserved can be allocated
  if (asset.status !== 'Available' && asset.status !== 'Reserved') {
    return res.status(400).json({ message: `Cannot allocate asset with status "${asset.status}".` });
  }

  if (!employeeId && !departmentId) {
    return res.status(400).json({ message: 'Must specify either an Employee or a Department for allocation.' });
  }

  let employee = null;
  if (employeeId) {
    employee = db.findById('users', employeeId);
    if (!employee) {
      return res.status(400).json({ message: 'Target employee does not exist.' });
    }
    if (employee.status !== 'Active') {
      return res.status(400).json({ message: 'Cannot allocate asset to an inactive employee.' });
    }
  }

  let dept = null;
  if (departmentId) {
    dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Target department does not exist.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot allocate asset to an inactive department.' });
    }
  }

  const original = { ...asset };
  const allocDate = new Date().toISOString().split('T')[0];
  const notesText = notes || 'Allocated via Asset Manager.';

  const history = [...(asset.history || [])];
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Allocated',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Allocated to ${employee ? employee.name : `Dept: ${dept.name}`}. Expected Return: ${expectedReturnDate || 'None'}. Notes: ${notesText}`
  });

  // Schema fields: status, allocatedToUserId, allocatedDate, expectedReturnDate, departmentId, history
  const updateData = {
    status: 'Allocated',
    allocatedToUserId: employee ? employee.id : '',
    departmentId: employee ? (employee.departmentId || departmentId || asset.departmentId || '') : (departmentId || asset.departmentId || ''),
    allocatedDate: allocDate,
    expectedReturnDate: expectedReturnDate || '',
    history
  };

  const { updated } = db.update('assets', id, updateData);

  // Notify assigned employee
  if (employee) {
    db.create('notifications', {
      userId: employee.id,
      message: `Asset "${asset.name}" (${asset.assetTag}) has been allocated to you. Expected return: ${expectedReturnDate || 'N/A'}.`,
      type: 'Asset Assigned',
      link: '/assets',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  }

  logActivity(req.user.id, req.user.name, 'Allocate', 'Asset', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// REQUEST RETURN ASSET — Any authenticated user (subject to authorization)
// Sets: status='Return Pending', history
// ==========================================
router.post('/:id/request-return', auth, (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (asset.status !== 'Allocated') {
    return res.status(400).json({ message: 'Only currently allocated assets can be requested for return.' });
  }

  // Authorization: must be the holder, the department head of the holding dept, Admin, or Asset Manager
  const isHolder = asset.allocatedToUserId === req.user.id;
  const isDeptHeadOfAsset = req.user.role === 'Department Head' && asset.departmentId === req.user.departmentId;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isHolder && !isDeptHeadOfAsset && !isPrivileged) {
    return res.status(403).json({ message: 'You can only request returns for assets allocated to you or your department.' });
  }

  const original = { ...asset };
  const history = [...(asset.history || [])];
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Return Requested',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Return initiated by ${req.user.name}. Notes: ${notes || 'No remarks provided.'}`
  });

  const { updated } = db.update('assets', id, {
    status: 'Return Pending',
    history
  });

  // Notify all Asset Managers
  const managers = (db.read('users') || []).filter(u => u.role === 'Asset Manager');
  managers.forEach(mgr => {
    db.create('notifications', {
      userId: mgr.id,
      message: `Return request submitted for asset "${asset.name}" (${asset.assetTag}) by ${req.user.name}.`,
      type: 'Asset Return Requested',
      link: '/assets',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Request Return', 'Asset', id, original, updated, req);

  res.json({ message: 'Return request submitted successfully.', asset: updated });
});

// ==========================================
// APPROVE RETURN (CHECK-IN) — Asset Manager only (Admin cannot approve)
// Sets: status='Available', allocatedToUserId='', allocatedDate='', expectedReturnDate='', condition, history
// ==========================================
router.post('/:id/return', auth, checkRole(['Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { condition, notes } = req.body;

  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (asset.status !== 'Allocated' && asset.status !== 'Return Pending' && asset.status !== 'Lost') {
    return res.status(400).json({ message: `Cannot return asset with status "${asset.status}". Only Allocated, Return Pending, or Lost assets can be returned.` });
  }

  const validConditions = ['Excellent', 'Good', 'Fair', 'Damaged'];
  if (condition && !validConditions.includes(condition)) {
    return res.status(400).json({ message: `Condition must be one of: ${validConditions.join(', ')}` });
  }

  const original = { ...asset };
  const returnNotes = notes || 'Returned to inventory.';

  const history = [...(asset.history || [])];
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Returned',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Returned. Condition: ${condition || asset.condition}. Notes: ${returnNotes}`
  });

  // Notify the returning employee
  if (asset.allocatedToUserId) {
    db.create('notifications', {
      userId: asset.allocatedToUserId,
      message: `Asset "${asset.name}" (${asset.assetTag}) return has been processed. Thank you.`,
      type: 'Return Processed',
      link: '/assets',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  }

  // Schema fields cleared on return
  const updateData = {
    status: 'Available',
    allocatedToUserId: '',
    allocatedDate: '',
    expectedReturnDate: '',
    condition: condition || asset.condition,
    history
  };

  const { updated } = db.update('assets', id, updateData);

  logActivity(req.user.id, req.user.name, 'Return', 'Asset', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// DELETE ASSET — Admin only
// ==========================================
router.delete('/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (asset.status === 'Allocated') {
    return res.status(400).json({ message: 'Cannot delete an allocated asset. Process a return first.' });
  }

  db.delete('assets', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Asset', id, asset, null, req);

  res.json({ message: 'Asset deleted successfully.' });
});

// ==========================================
// BULK DELETE — Admin only
// ==========================================
router.post('/bulk-delete', auth, checkRole(['Admin']), (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Valid asset IDs array is required.' });
  }

  const assets = db.read('assets');
  const targets = assets.filter(a => ids.includes(a.id));

  const allocated = targets.filter(a => a.status === 'Allocated');
  if (allocated.length > 0) {
    return res.status(400).json({
      message: `Bulk delete aborted. ${allocated.length} selected asset(s) are currently allocated. Return them first.`
    });
  }

  let deletedCount = 0;
  targets.forEach(a => {
    db.delete('assets', a.id);
    logActivity(req.user.id, req.user.name, 'Bulk Delete', 'Asset', a.id, a, null, req);
    deletedCount++;
  });

  res.json({ message: `Successfully deleted ${deletedCount} asset(s).` });
});

router.isValidTransition = isValidTransition;
module.exports = router;
