const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

function generateCodes(tag, serial) {
  return {
    qrCode: `assetflow://asset/${tag}?sn=${serial || ''}`,
    barcode: `AF*${tag.replace('AF-', '')}*${serial || '0'}`
  };
}

const VALID_TRANSITIONS = {
  'Available': ['Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired'],
  'Allocated': ['Available', 'Lost'],
  'Reserved': ['Allocated', 'Available'],
  'Under Maintenance': ['Available'],
  'Lost': ['Available', 'Retired'],
  'Retired': ['Disposed'],
  'Disposed': []
};

function isValidTransition(from, to) {
  if (from === to) return true;
  return VALID_TRANSITIONS[from] ? VALID_TRANSITIONS[from].includes(to) : false;
}

// GET all assets (with role scoping + filters)
router.get('/', auth, async (req, res) => {
  try {
    let assets = await db.read('assets');

    if (req.user.role === 'Employee') {
      assets = assets.filter(a => a.allocatedToUserId === req.user.id);
    } else if (req.user.role === 'Department Head') {
      assets = assets.filter(a => a.departmentId === req.user.departmentId);
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

    const categories = await db.read('categories');
    const departments = await db.read('departments');
    const users = await db.read('users');

    const joined = assets.map(asset => {
      const cat = categories.find(c => c.id === asset.categoryId);
      const dept = departments.find(d => d.id === asset.departmentId);
      let allocatedToName = '';
      if (asset.allocatedToUserId) {
        const u = users.find(u => u.id === asset.allocatedToUserId);
        if (u) allocatedToName = u.name;
      }
      return { ...asset, categoryName: cat ? cat.name : 'Unknown', departmentName: dept ? dept.name : 'Unassigned', allocatedToName };
    });

    res.json(joined);
  } catch (err) {
    console.error('[Assets GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET single asset
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await db.findById('assets', id) || await db.findOne('assets', { assetTag: id });
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    if (req.user.role === 'Employee' && asset.allocatedToUserId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const categories = await db.read('categories');
    const departments = await db.read('departments');
    const users = await db.read('users');

    const cat = categories.find(c => c.id === asset.categoryId);
    const dept = departments.find(d => d.id === asset.departmentId);
    let allocatedToUser = null;
    if (asset.allocatedToUserId) {
      const u = users.find(u => u.id === asset.allocatedToUserId);
      if (u) { const { password, ...uSafe } = u; allocatedToUser = uSafe; }
    }

    res.json({ ...asset, category: cat || null, department: dept || null, allocatedTo: allocatedToUser });
  } catch (err) {
    console.error('[Asset GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Register new asset
router.post('/', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { name, categoryId, serialNumber, modelNumber, manufacturer, acquisitionDate, acquisitionCost, location, departmentId, condition, warrantyExpiry, bookable, remarks, photo, documents } = req.body;

    if (!name || !categoryId || !condition) {
      return res.status(400).json({ message: 'Name, Category, and Condition are required fields.' });
    }

    if (serialNumber) {
      const existingSerial = await db.findOne('assets', { serialNumber });
      if (existingSerial) return res.status(400).json({ message: `An asset with Serial Number ${serialNumber} already exists.` });
    }

    if (acquisitionDate && new Date(acquisitionDate) > new Date()) {
      return res.status(400).json({ message: 'Acquisition date cannot be in the future.' });
    }

    const cat = await db.findById('categories', categoryId);
    if (!cat) return res.status(400).json({ message: 'Category not found.' });

    if (departmentId) {
      const dept = await db.findById('departments', departmentId);
      if (!dept) return res.status(400).json({ message: 'Department not found.' });
      if (dept.status === 'Inactive') return res.status(400).json({ message: 'Cannot assign assets to an inactive department.' });
    }

    const assetCount = (await db.read('assets')).length;
    const assetTag = `AF-${String(assetCount + 1).padStart(4, '0')}`;
    const codes = generateCodes(assetTag, serialNumber);

    const newAsset = await db.create('assets', {
      assetTag, name, categoryId,
      serialNumber: serialNumber || '', modelNumber: modelNumber || '', manufacturer: manufacturer || '',
      acquisitionDate: acquisitionDate || new Date().toISOString().split('T')[0],
      acquisitionCost: Number(acquisitionCost) || 0,
      location: location || '', departmentId: departmentId || '',
      condition, status: 'Available',
      warrantyExpiry: warrantyExpiry || '', bookable: bookable || 'No', remarks: remarks || '',
      qrCode: codes.qrCode, barcode: codes.barcode,
      photo: photo || '', documents: documents || [],
      history: [{ id: `HIST-${Date.now()}`, eventType: 'Created', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: 'Initial registration in AssetFlow system.' }]
    });

    logActivity(req.user.id, req.user.name, 'Create', 'Asset', newAsset.id, null, newAsset, req);
    res.status(201).json(newAsset);
  } catch (err) {
    console.error('[Asset Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Update asset
router.put('/:id', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await db.findById('assets', id);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    const { name, categoryId, serialNumber, modelNumber, manufacturer, acquisitionDate, acquisitionCost, location, departmentId, condition, status, warrantyExpiry, bookable, remarks, photo, documents } = req.body;

    if (status && status !== asset.status && !isValidTransition(asset.status, status)) {
      return res.status(400).json({ message: `Invalid state transition: "${asset.status}" → "${status}".` });
    }

    if (serialNumber && serialNumber !== asset.serialNumber) {
      const existingSerial = await db.findOne('assets', { serialNumber });
      if (existingSerial) return res.status(400).json({ message: `An asset with Serial Number ${serialNumber} already exists.` });
    }

    if (departmentId && departmentId !== asset.departmentId) {
      const dept = await db.findById('departments', departmentId);
      if (!dept) return res.status(400).json({ message: 'Department not found.' });
      if (dept.status === 'Inactive') return res.status(400).json({ message: 'Cannot assign asset to an inactive department.' });
    }

    const original = { ...asset };
    const history = [...(asset.history || [])];
    if (status && status !== asset.status) {
      history.push({ id: `HIST-${Date.now()}`, eventType: status, date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Status changed from "${asset.status}" to "${status}".` });
    }

    const codes = serialNumber !== asset.serialNumber ? generateCodes(asset.assetTag, serialNumber) : {};

    const { updated } = await db.update('assets', id, {
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
      photo: photo !== undefined ? photo : asset.photo,
      documents: documents !== undefined ? documents : asset.documents,
      history, ...codes
    });

    logActivity(req.user.id, req.user.name, 'Update', 'Asset', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Asset Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Allocate asset
router.post('/:id/allocate', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, departmentId, expectedReturnDate, notes } = req.body;

    const asset = await db.findById('assets', id);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    if (asset.status === 'Allocated') {
      let allocatedName = 'Unknown User';
      let allocatedDeptName = 'Unassigned';
      if (asset.allocatedToUserId) {
        const u = await db.findById('users', asset.allocatedToUserId);
        if (u) allocatedName = u.name;
      }
      if (asset.departmentId) {
        const d = await db.findById('departments', asset.departmentId);
        if (d) allocatedDeptName = d.name;
      }
      return res.status(400).json({
        message: 'Double allocation blocked: This asset is currently allocated.',
        allocationDetails: { employeeName: allocatedName, departmentName: allocatedDeptName, allocationDate: asset.allocatedDate || 'N/A' }
      });
    }

    if (asset.status !== 'Available' && asset.status !== 'Reserved') {
      return res.status(400).json({ message: `Cannot allocate asset in status "${asset.status}".` });
    }

    let employee = null;
    if (employeeId) {
      employee = await db.findById('users', employeeId);
      if (!employee) return res.status(400).json({ message: 'Target Employee does not exist.' });
      if (employee.status !== 'Active') return res.status(400).json({ message: 'Cannot allocate to an inactive employee.' });
    }

    let dept = null;
    if (departmentId) {
      dept = await db.findById('departments', departmentId);
      if (!dept) return res.status(400).json({ message: 'Target Department does not exist.' });
      if (dept.status === 'Inactive') return res.status(400).json({ message: 'Cannot allocate to an inactive department.' });
    }

    if (!employee && !dept) return res.status(400).json({ message: 'Must specify either an Employee or a Department.' });

    const original = { ...asset };
    const history = [...(asset.history || [])];
    const allocDate = new Date().toISOString().split('T')[0];
    const notesText = notes || 'Allocated via Asset Manager.';

    history.push({
      id: `HIST-${Date.now()}`, eventType: 'Allocated', date: new Date().toISOString(),
      user: req.user.name, userId: req.user.id,
      notes: `Allocated to ${employee ? employee.name : `Dept: ${dept.name}`}. Expected Return: ${expectedReturnDate || 'None'}. Notes: ${notesText}`
    });

    const { updated } = await db.update('assets', id, {
      status: 'Allocated',
      allocatedToUserId: employee ? employee.id : '',
      departmentId: employee ? (employee.departmentId || departmentId || '') : (departmentId || ''),
      allocatedDate: allocDate,
      expectedReturnDate: expectedReturnDate || '',
      history
    });

    if (employee) {
      await db.create('notifications', {
        userId: employee.id,
        message: `Asset "${asset.name}" (${asset.assetTag}) has been allocated to you. Expected return: ${expectedReturnDate || 'N/A'}.`,
        type: 'Asset Assigned', link: '/assets', isRead: false, timestamp: new Date().toISOString()
      });
    }

    logActivity(req.user.id, req.user.name, 'Allocate', 'Asset', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Asset Allocate Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Return asset
router.post('/:id/return', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { condition, notes } = req.body;

    const asset = await db.findById('assets', id);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    if (asset.status !== 'Allocated' && asset.status !== 'Lost') {
      return res.status(400).json({ message: `Cannot return asset in status "${asset.status}".` });
    }

    const original = { ...asset };
    const history = [...(asset.history || [])];
    history.push({
      id: `HIST-${Date.now()}`, eventType: 'Returned', date: new Date().toISOString(),
      user: req.user.name, userId: req.user.id,
      notes: `Returned condition: ${condition || asset.condition}. Notes: ${notes || 'Returned to warehouse.'}`
    });

    if (asset.allocatedToUserId) {
      await db.create('notifications', {
        userId: asset.allocatedToUserId,
        message: `Asset "${asset.name}" (${asset.assetTag}) return has been processed. Thank you.`,
        type: 'Return Processed', link: '/assets', isRead: false, timestamp: new Date().toISOString()
      });
    }

    const { updated } = await db.update('assets', id, {
      status: 'Available', allocatedToUserId: '', allocatedDate: '',
      expectedReturnDate: '', condition: condition || asset.condition, history
    });

    logActivity(req.user.id, req.user.name, 'Return', 'Asset', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Asset Return Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Delete asset (Admin only)
router.delete('/:id', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await db.findById('assets', id);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    if (asset.status === 'Allocated') {
      return res.status(400).json({ message: 'Cannot delete an allocated asset. Process a return first.' });
    }

    await db.delete('assets', id);
    logActivity(req.user.id, req.user.name, 'Delete', 'Asset', id, asset, null, req);
    res.json({ message: 'Asset deleted successfully.' });
  } catch (err) {
    console.error('[Asset Delete Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Bulk delete (Admin only)
router.post('/bulk-delete', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Valid asset ids array is required.' });
    }

    const assets = await db.read('assets');
    const targets = assets.filter(a => ids.includes(a.id));
    const allocated = targets.filter(a => a.status === 'Allocated');
    if (allocated.length > 0) {
      return res.status(400).json({ message: `Bulk delete aborted. ${allocated.length} asset(s) are currently allocated.` });
    }

    let deletedCount = 0;
    for (const a of targets) {
      await db.delete('assets', a.id);
      logActivity(req.user.id, req.user.name, 'Bulk Delete', 'Asset', a.id, a, null, req);
      deletedCount++;
    }

    res.json({ message: `Successfully deleted ${deletedCount} assets.` });
  } catch (err) {
    console.error('[Bulk Delete Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.isValidTransition = isValidTransition;
module.exports = router;
