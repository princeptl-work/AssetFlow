const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// DEPARTMENT ROUTES (Admin Only for Mutation)
// ==========================================

// Get all departments
router.get('/departments', auth, (req, res) => {
  const depts = db.read('departments');
  res.json(depts);
});

// Create department (Admin only)
router.post('/departments', auth, checkRole(['Admin']), (req, res) => {
  const { name, managerId, parentId, description, status } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Department name is required.' });
  }

  // Prevent duplicates
  const existing = db.findOne('departments', { name });
  if (existing) {
    return res.status(400).json({ message: 'A department with this name already exists.' });
  }

  // Support Hierarchy: Validate Parent
  if (parentId) {
    const parent = db.findById('departments', parentId);
    if (!parent) {
      return res.status(400).json({ message: 'Parent department not found.' });
    }
  }

  // Validate Manager is Department Head
  if (managerId) {
    const mgr = db.findById('users', managerId);
    if (!mgr) {
      return res.status(400).json({ message: 'Selected Manager does not exist.' });
    }
    if (mgr.role !== 'Department Head') {
      return res.status(400).json({ message: 'Selected manager must hold the Department Head role.' });
    }
  }

  const newDept = db.create('departments', {
    name,
    managerId: managerId || '',
    parentId: parentId || '',
    description: description || '',
    status: status || 'Active'
  });

  logActivity(req.user.id, req.user.name, 'Create', 'Department', newDept.id, null, newDept, req);

  res.status(201).json(newDept);
});

// Update department (Admin only)
router.put('/departments/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const { name, managerId, parentId, description, status } = req.body;

  const dept = db.findById('departments', id);
  if (!dept) {
    return res.status(404).json({ message: 'Department not found.' });
  }

  // Prevent duplicates if renaming
  if (name && name !== dept.name) {
    const existing = db.findOne('departments', { name });
    if (existing) {
      return res.status(400).json({ message: 'A department with this name already exists.' });
    }
  }

  // Support Hierarchy: Prevent cycles (cannot set parent as itself or its own sub-department)
  if (parentId) {
    if (parentId === id) {
      return res.status(400).json({ message: 'A department cannot be its own parent.' });
    }
    // Simple cycle detection (1-level parent check, we can check deeper if necessary)
    const parent = db.findById('departments', parentId);
    if (!parent) {
      return res.status(400).json({ message: 'Parent department not found.' });
    }
    if (parent.parentId === id) {
      return res.status(400).json({ message: 'Hierarchy cycle detected: Selected parent is already a child.' });
    }
  }

  // Validate Manager is Department Head
  if (managerId) {
    const mgr = db.findById('users', managerId);
    if (!mgr) {
      return res.status(400).json({ message: 'Selected manager does not exist.' });
    }
    if (mgr.role !== 'Department Head' && mgr.role !== 'Admin') {
      // Allow Admin as well as fallbacks
      return res.status(400).json({ message: 'Selected manager must hold the Department Head or Admin role.' });
    }
  }

  const original = { ...dept };
  const { updated } = db.update('departments', id, {
    name: name !== undefined ? name : dept.name,
    managerId: managerId !== undefined ? managerId : dept.managerId,
    parentId: parentId !== undefined ? parentId : dept.parentId,
    description: description !== undefined ? description : dept.description,
    status: status !== undefined ? status : dept.status
  });

  logActivity(req.user.id, req.user.name, 'Update', 'Department', id, original, updated, req);

  res.json(updated);
});

// Delete department (Admin only)
router.delete('/departments/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const dept = db.findById('departments', id);
  if (!dept) {
    return res.status(404).json({ message: 'Department not found.' });
  }

  // Check if any employees are in this department
  const employees = db.find('users', { departmentId: id });
  if (employees.length > 0) {
    return res.status(400).json({ message: `Cannot delete department. ${employees.length} employee(s) are currently assigned to it.` });
  }

  // Check if any assets are allocated/registered to this department
  const assets = db.find('assets', { departmentId: id });
  if (assets.length > 0) {
    return res.status(400).json({ message: `Cannot delete department. ${assets.length} asset(s) are currently allocated/registered to it.` });
  }

  db.delete('departments', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Department', id, dept, null, req);

  res.json({ message: 'Department deleted successfully.' });
});

// ==========================================
// CATEGORY ROUTES (Admin Only for Mutation)
// ==========================================

// Get all categories
router.get('/categories', auth, (req, res) => {
  const cats = db.read('categories');
  res.json(cats);
});

// Create category
router.post('/categories', auth, checkRole(['Admin']), (req, res) => {
  const { name, warrantyPeriod, expectedLife, color, manufacturer, description, status } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  const existing = db.findOne('categories', { name });
  if (existing) {
    return res.status(400).json({ message: 'An asset category with this name already exists.' });
  }

  const newCat = db.create('categories', {
    name,
    warrantyPeriod: Number(warrantyPeriod) || 0,
    expectedLife: Number(expectedLife) || 0,
    color: color || '#875A7B',
    manufacturer: manufacturer || '',
    description: description || '',
    status: status || 'Active'
  });

  logActivity(req.user.id, req.user.name, 'Create', 'Category', newCat.id, null, newCat, req);

  res.status(201).json(newCat);
});

// Update category
router.put('/categories/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const { name, warrantyPeriod, expectedLife, color, manufacturer, description, status } = req.body;

  const cat = db.findById('categories', id);
  if (!cat) {
    return res.status(404).json({ message: 'Category not found.' });
  }

  if (name && name !== cat.name) {
    const existing = db.findOne('categories', { name });
    if (existing) {
      return res.status(400).json({ message: 'An asset category with this name already exists.' });
    }
  }

  const original = { ...cat };
  const { updated } = db.update('categories', id, {
    name: name !== undefined ? name : cat.name,
    warrantyPeriod: warrantyPeriod !== undefined ? Number(warrantyPeriod) : cat.warrantyPeriod,
    expectedLife: expectedLife !== undefined ? Number(expectedLife) : cat.expectedLife,
    color: color !== undefined ? color : cat.color,
    manufacturer: manufacturer !== undefined ? manufacturer : cat.manufacturer,
    description: description !== undefined ? description : cat.description,
    status: status !== undefined ? status : cat.status
  });

  logActivity(req.user.id, req.user.name, 'Update', 'Category', id, original, updated, req);

  res.json(updated);
});

// Delete category
router.delete('/categories/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const cat = db.findById('categories', id);
  if (!cat) {
    return res.status(404).json({ message: 'Category not found.' });
  }

  // Check if category is used by any assets
  const assets = db.find('assets', { categoryId: id });
  if (assets.length > 0) {
    return res.status(400).json({ message: `Cannot delete category. It is referenced by ${assets.length} registered asset(s).` });
  }

  db.delete('categories', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Category', id, cat, null, req);

  res.json({ message: 'Category deleted successfully.' });
});

module.exports = router;
