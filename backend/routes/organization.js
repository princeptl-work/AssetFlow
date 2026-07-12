const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// DEPARTMENT ROUTES (Admin Only for Mutations)
// ==========================================

// Get all departments — all authenticated roles can read
router.get('/departments', auth, (req, res) => {
  const depts = db.read('departments');

  const users = db.read('users');
  const enriched = depts.map(d => {
    const manager = d.managerId ? users.find(u => u.id === d.managerId) : null;
    const parent = d.parentId ? depts.find(p => p.id === d.parentId) : null;
    return {
      ...d,
      managerName: manager ? manager.name : '',
      parentName: parent ? parent.name : ''
    };
  });

  res.json(enriched);
});

// Create department — Admin only
// Schema: departments — name, managerId, parentId, description, status, createdAt(auto), updatedAt(auto)
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

  // Validate parent
  if (parentId && parentId !== '') {
    const parent = db.findById('departments', parentId);
    if (!parent) {
      return res.status(400).json({ message: 'Parent department not found.' });
    }
  }

  // Validate manager — must be a Department Head role
  if (managerId && managerId !== '') {
    const mgr = db.findById('users', managerId);
    if (!mgr) {
      return res.status(400).json({ message: 'Selected manager does not exist.' });
    }
    if (mgr.role !== 'Department Head' && mgr.role !== 'Admin') {
      return res.status(400).json({ message: 'Selected manager must hold the Department Head or Admin role.' });
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

// Update department — Admin only
router.put('/departments/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const { name, managerId, parentId, description, status } = req.body;

  const dept = db.findById('departments', id);
  if (!dept) {
    return res.status(404).json({ message: 'Department not found.' });
  }

  // Prevent duplicate name
  if (name && name !== dept.name) {
    const existing = db.findOne('departments', { name });
    if (existing) {
      return res.status(400).json({ message: 'A department with this name already exists.' });
    }
  }

  // Prevent self-parent or cycle
  if (parentId && parentId !== '') {
    if (parentId === id) {
      return res.status(400).json({ message: 'A department cannot be its own parent.' });
    }
    const parent = db.findById('departments', parentId);
    if (!parent) {
      return res.status(400).json({ message: 'Parent department not found.' });
    }
    if (parent.parentId === id) {
      return res.status(400).json({ message: 'Hierarchy cycle detected: selected parent is already a child of this department.' });
    }
  }

  // Validate manager
  if (managerId && managerId !== '') {
    const mgr = db.findById('users', managerId);
    if (!mgr) {
      return res.status(400).json({ message: 'Selected manager does not exist.' });
    }
    if (mgr.role !== 'Department Head' && mgr.role !== 'Admin') {
      return res.status(400).json({ message: 'Selected manager must hold the Department Head or Admin role.' });
    }
  }

  const original = { ...dept };

  // Only update fields that are in the schema
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (managerId !== undefined) updateData.managerId = managerId;
  if (parentId !== undefined) updateData.parentId = parentId;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;

  const { updated } = db.update('departments', id, updateData);

  logActivity(req.user.id, req.user.name, 'Update', 'Department', id, original, updated, req);

  res.json(updated);
});

// Delete department — Admin only
router.delete('/departments/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const dept = db.findById('departments', id);
  if (!dept) {
    return res.status(404).json({ message: 'Department not found.' });
  }

  // Block if employees are assigned
  const employees = db.find('users', { departmentId: id });
  if (employees.length > 0) {
    return res.status(400).json({ message: `Cannot delete department. ${employees.length} employee(s) are still assigned to it.` });
  }

  // Block if assets are assigned
  const assets = db.find('assets', { departmentId: id });
  if (assets.length > 0) {
    return res.status(400).json({ message: `Cannot delete department. ${assets.length} asset(s) are still assigned to it.` });
  }

  db.delete('departments', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Department', id, dept, null, req);

  res.json({ message: 'Department deleted successfully.' });
});

// ==========================================
// CATEGORY ROUTES (Admin Only for Mutations)
// ==========================================

// Get all categories — all authenticated roles
router.get('/categories', auth, (req, res) => {
  const cats = db.read('categories');
  res.json(cats);
});

// Create category — Admin only
// Schema: categories — name, warrantyPeriod, expectedLife, color, manufacturer, description, status, createdAt(auto), updatedAt(auto)
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
    warrantyPeriod: warrantyPeriod !== undefined ? Number(warrantyPeriod) : 0,
    expectedLife: expectedLife !== undefined ? Number(expectedLife) : 0,
    color: color || '#875A7B',
    manufacturer: manufacturer || '',
    description: description || '',
    status: status || 'Active'
  });

  logActivity(req.user.id, req.user.name, 'Create', 'Category', newCat.id, null, newCat, req);

  res.status(201).json(newCat);
});

// Update category — Admin only
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

  // Only update schema fields
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (warrantyPeriod !== undefined) updateData.warrantyPeriod = Number(warrantyPeriod);
  if (expectedLife !== undefined) updateData.expectedLife = Number(expectedLife);
  if (color !== undefined) updateData.color = color;
  if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;

  const { updated } = db.update('categories', id, updateData);

  logActivity(req.user.id, req.user.name, 'Update', 'Category', id, original, updated, req);

  res.json(updated);
});

// Delete category — Admin only
router.delete('/categories/:id', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const cat = db.findById('categories', id);
  if (!cat) {
    return res.status(404).json({ message: 'Category not found.' });
  }

  const assets = db.find('assets', { categoryId: id });
  if (assets.length > 0) {
    return res.status(400).json({ message: `Cannot delete category. It is referenced by ${assets.length} registered asset(s).` });
  }

  db.delete('categories', id);
  logActivity(req.user.id, req.user.name, 'Delete', 'Category', id, cat, null, req);

  res.json({ message: 'Category deleted successfully.' });
});

module.exports = router;
