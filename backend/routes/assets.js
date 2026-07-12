const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Generate Barcode / QR Code strings
function generateCodes(tag, serial) {
  return {
    qrCode: `assetflow://asset/${tag}?sn=${serial || ''}`,
    barcode: `AF*${tag.replace('AF-', '')}*${serial || '0'}`
  };
}

// Lifecycle transition state validation rules
const VALID_TRANSITIONS = {
  'Available': ['Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired'],
  'Allocated': ['Available', 'Lost'],
  'Reserved': ['Allocated', 'Available'],
  'Under Maintenance': ['Available'],
  'Lost': ['Available', 'Retired'], // Available indicates 'Recovered'
  'Retired': ['Disposed'],
  'Disposed': [] // Terminal state
};

function isValidTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = VALID_TRANSITIONS[fromState];
  return allowed ? allowed.includes(toState) : false;
}

// Get all assets (with advanced filtering, search, and sorting)
router.get('/', auth, (req, res) => {
  let assets = db.read('assets');

  // Search by Tag, Name, Serial Number, QR, Brand/Manufacturer
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

  // Filters
  if (categoryId) assets = assets.filter(a => a.categoryId === categoryId);
  if (departmentId) assets = assets.filter(a => a.departmentId === departmentId);
  if (status) assets = assets.filter(a => a.status === status);
  if (condition) assets = assets.filter(a => a.condition === condition);
  if (location) assets = assets.filter(a => a.location && a.location.toLowerCase().includes(location.toLowerCase()));
  if (bookable) assets = assets.filter(a => a.bookable === bookable);

  // Attach joins for Category and Department name for grid display
  const categories = db.read('categories');
  const departments = db.read('departments');
  const users = db.read('users');

  const joinedAssets = assets.map(asset => {
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

  res.json(joinedAssets);
});

// Get individual asset by ID/Tag
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id) || db.findOne('assets', { assetTag: id });
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Add relations
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

// Register new asset
router.post('/', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const {
    name, categoryId, serialNumber, modelNumber, manufacturer,
    acquisitionDate, acquisitionCost, location, departmentId,
    condition, warrantyExpiry, bookable, remarks
  } = req.body;

  if (!name || !categoryId || !condition) {
    return res.status(400).json({ message: 'Name, Category, and Condition are required fields.' });
  }

  // Validate serial number uniqueness if provided
  if (serialNumber) {
    const existingSerial = db.findOne('assets', { serialNumber });
    if (existingSerial) {
      return res.status(400).json({ message: `An asset with Serial Number ${serialNumber} already exists.` });
    }
  }

  // Validate acquisition date is not in future
  if (acquisitionDate && new Date(acquisitionDate) > new Date()) {
    return res.status(400).json({ message: 'Acquisition date cannot be in the future.' });
  }

  // Verify category exists
  const cat = db.findById('categories', categoryId);
  if (!cat) {
    return res.status(400).json({ message: 'Category not found.' });
  }

  // Verify department if provided
  if (departmentId) {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Department not found.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot assign assets to an inactive department.' });
    }
  }

  // Auto-generate tag (AF-XXXX)
  const tagCount = db.read('assets').length + 1;
  const assetTag = `AF-${String(tagCount).padStart(4, '0')}`;
  const codes = generateCodes(assetTag, serialNumber);

  const newAsset = db.create('assets', {
    assetTag,
    name,
    categoryId,
    serialNumber: serialNumber || '',
    modelNumber: modelNumber || '',
    manufacturer: manufacturer || '',
    acquisitionDate: acquisitionDate || new Date().toISOString().split('T')[0],
    acquisitionCost: Number(acquisitionCost) || 0,
    location: location || '',
    departmentId: departmentId || '',
    condition, // Excellent, Good, Fair, Damaged
    status: 'Available', // Available initially
    warrantyExpiry: warrantyExpiry || '',
    bookable: bookable || 'No',
    remarks: remarks || '',
    qrCode: codes.qrCode,
    barcode: codes.barcode,
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

// Update asset details
router.put('/:id', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const {
    name, categoryId, serialNumber, modelNumber, manufacturer,
    acquisitionDate, acquisitionCost, location, departmentId,
    condition, status, warrantyExpiry, bookable, remarks
  } = req.body;

  // Validate state transitions
  if (status && status !== asset.status) {
    if (!isValidTransition(asset.status, status)) {
      return res.status(400).json({
        message: `Invalid state transition: Cannot change status from "${asset.status}" to "${status}".`
      });
    }
  }

  // Validate serial number uniqueness
  if (serialNumber && serialNumber !== asset.serialNumber) {
    const existingSerial = db.findOne('assets', { serialNumber });
    if (existingSerial) {
      return res.status(400).json({ message: `An asset with Serial Number ${serialNumber} already exists.` });
    }
  }

  // Verify department
  if (departmentId && departmentId !== asset.departmentId) {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Department not found.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot assign asset to an inactive department.' });
    }
  }

  const original = { ...asset };
  
  // Keep history
  const history = [...(asset.history || [])];
  if (status && status !== asset.status) {
    history.push({
      id: `HIST-${Date.now()}`,
      eventType: status,
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Asset status transitioned from "${asset.status}" to "${status}".`
    });
  }

  // Update codes if serialNumber changes
  const codes = serialNumber !== asset.serialNumber ? generateCodes(asset.assetTag, serialNumber) : {};

  const { updated } = db.update('assets', id, {
    name: name !== undefined ? name : asset.name,
    categoryId: categoryId !== undefined ? categoryId : asset.categoryId,
    serialNumber: serialNumber !== undefined ? serialNumber : asset.serialNumber,
    modelNumber: modelNumber !== undefined ? modelNumber : asset.modelNumber,
    manufacturer: manufacturer !== undefined ? manufacturer : asset.manufacturer,
    acquisitionDate: acquisitionDate !== undefined ? acquisitionDate : asset.acquisitionDate,
    acquisitionCost: acquisitionCost !== undefined ? Number(acquisitionCost) : asset.acquisitionCost,
    location: location !== undefined ? location : asset.location,
    departmentId: departmentId !== undefined ? departmentId : asset.departmentId,
    condition: condition !== undefined ? condition : asset.condition,
    status: status !== undefined ? status : asset.status,
    warrantyExpiry: warrantyExpiry !== undefined ? warrantyExpiry : asset.warrantyExpiry,
    bookable: bookable !== undefined ? bookable : asset.bookable,
    remarks: remarks !== undefined ? remarks : asset.remarks,
    history,
    ...codes
  });

  logActivity(req.user.id, req.user.name, 'Update', 'Asset', id, original, updated, req);

  res.json(updated);
});

// Allocate Asset
router.post('/:id/allocate', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { employeeId, departmentId, expectedReturnDate, notes } = req.body;

  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Validation: Already allocated
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

  // Check state eligibility (must be Available or Reserved)
  if (asset.status !== 'Available' && asset.status !== 'Reserved') {
    return res.status(400).json({ message: `Cannot allocate asset in status "${asset.status}".` });
  }

  let employee = null;
  if (employeeId) {
    employee = db.findById('users', employeeId);
    if (!employee) {
      return res.status(400).json({ message: 'Target Employee does not exist.' });
    }
    if (employee.status !== 'Active') {
      return res.status(400).json({ message: 'Cannot allocate asset to an inactive employee.' });
    }
  }

  let dept = null;
  if (departmentId) {
    dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Target Department does not exist.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot allocate asset to an inactive department.' });
    }
  }

  if (!employee && !dept) {
    return res.status(400).json({ message: 'Must specify either an Employee or a Department for allocation.' });
  }

  const original = { ...asset };
  const history = [...(asset.history || [])];

  const allocDate = new Date().toISOString().split('T')[0];
  const notesText = notes || 'Allocated via Asset Manager.';

  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Allocated',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Allocated to ${employee ? employee.name : `Dept: ${dept.name}`}. Expected Return: ${expectedReturnDate || 'None'}. Notes: ${notesText}`
  });

  const updateData = {
    status: 'Allocated',
    allocatedToUserId: employee ? employee.id : '',
    departmentId: employee ? (employee.departmentId || departmentId || '') : (departmentId || ''),
    allocatedDate: allocDate,
    expectedReturnDate: expectedReturnDate || '',
    history
  };

  const { updated } = db.update('assets', id, updateData);

  // Send Notification to Employee
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

// Return Asset
router.post('/:id/return', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { condition, notes } = req.body;

  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  if (asset.status !== 'Allocated' && asset.status !== 'Lost') {
    return res.status(400).json({ message: `Cannot return asset in status "${asset.status}".` });
  }

  const original = { ...asset };
  const history = [...(asset.history || [])];
  
  const returnNotes = notes || 'Returned to warehouse.';
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Returned',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Returned condition: ${condition || asset.condition}. Notes: ${returnNotes}`
  });

  // Notify the employee who returned it
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

// Delete Asset (Admin only)
router.delete('/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const asset = db.findById('assets', id);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Prevent deleting allocated assets directly
  if (asset.status === 'Allocated') {
    return res.status(400).json({ message: 'Cannot delete an asset that is currently allocated. Please process a return first.' });
  }

  db.delete('assets', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Asset', id, asset, null, req);

  res.json({ message: 'Asset deleted successfully.' });
});

// Admin Bulk Delete Assets
router.post('/bulk-delete', auth, checkRole(['Admin']), (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Valid asset ids array is required.' });
  }

  const assets = db.read('assets');
  const targetAssets = assets.filter(a => ids.includes(a.id));

  // Check if any is allocated
  const allocated = targetAssets.filter(a => a.status === 'Allocated');
  if (allocated.length > 0) {
    return res.status(400).json({
      message: `Bulk delete aborted. ${allocated.length} of the selected assets are currently allocated. Return them first.`
    });
  }

  let deletedCount = 0;
  targetAssets.forEach(a => {
    db.delete('assets', a.id);
    logActivity(req.user.id, req.user.name, 'Bulk Delete', 'Asset', a.id, a, null, req);
    deletedCount++;
  });

  res.json({ message: `Successfully deleted ${deletedCount} assets.` });
});

router.isValidTransition = isValidTransition;
module.exports = router;

