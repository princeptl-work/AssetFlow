const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// DEPARTMENT ROUTES
// ==========================================

router.get('/departments', auth, async (req, res) => {
  try {
    const depts = await db.read('departments');
    res.json(depts);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/departments', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { name, managerId, parentId, description, status } = req.body;
    if (!name) return res.status(400).json({ message: 'Department name is required.' });

    const existing = await db.findOne('departments', { name });
    if (existing) return res.status(400).json({ message: 'A department with this name already exists.' });

    if (parentId) {
      const parent = await db.findById('departments', parentId);
      if (!parent) return res.status(400).json({ message: 'Parent department not found.' });
    }

    if (managerId) {
      const mgr = await db.findById('users', managerId);
      if (!mgr) return res.status(400).json({ message: 'Selected Manager does not exist.' });
      if (mgr.role !== 'Department Head') return res.status(400).json({ message: 'Selected manager must hold the Department Head role.' });
    }

    const newDept = await db.create('departments', {
      name,
      managerId: managerId || '',
      parentId: parentId || '',
      description: description || '',
      status: status || 'Active'
    });

    logActivity(req.user.id, req.user.name, 'Create', 'Department', newDept.id, null, newDept, req);
    res.status(201).json(newDept);
  } catch (err) {
    console.error('[Dept Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/departments/:id', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, managerId, parentId, description, status } = req.body;

    const dept = await db.findById('departments', id);
    if (!dept) return res.status(404).json({ message: 'Department not found.' });

    if (name && name !== dept.name) {
      const existing = await db.findOne('departments', { name });
      if (existing) return res.status(400).json({ message: 'A department with this name already exists.' });
    }

    if (parentId) {
      if (parentId === id) return res.status(400).json({ message: 'A department cannot be its own parent.' });
      const parent = await db.findById('departments', parentId);
      if (!parent) return res.status(400).json({ message: 'Parent department not found.' });
      if (parent.parentId === id) return res.status(400).json({ message: 'Hierarchy cycle detected.' });
    }

    if (managerId) {
      const mgr = await db.findById('users', managerId);
      if (!mgr) return res.status(400).json({ message: 'Selected manager does not exist.' });
      if (mgr.role !== 'Department Head' && mgr.role !== 'Admin') {
        return res.status(400).json({ message: 'Selected manager must hold the Department Head or Admin role.' });
      }
    }

    const original = { ...dept };
    const { updated } = await db.update('departments', id, {
      name: name !== undefined ? name : dept.name,
      managerId: managerId !== undefined ? managerId : dept.managerId,
      parentId: parentId !== undefined ? parentId : dept.parentId,
      description: description !== undefined ? description : dept.description,
      status: status !== undefined ? status : dept.status
    });

    logActivity(req.user.id, req.user.name, 'Update', 'Department', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Dept Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/departments/:id', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const dept = await db.findById('departments', id);
    if (!dept) return res.status(404).json({ message: 'Department not found.' });

    const employees = await db.find('users', { departmentId: id });
    if (employees.length > 0) {
      return res.status(400).json({ message: `Cannot delete department. ${employees.length} employee(s) are currently assigned to it.` });
    }

    const assets = await db.find('assets', { departmentId: id });
    if (assets.length > 0) {
      return res.status(400).json({ message: `Cannot delete department. ${assets.length} asset(s) are currently allocated/registered to it.` });
    }

    await db.delete('departments', id);
    logActivity(req.user.id, req.user.name, 'Delete', 'Department', id, dept, null, req);
    res.json({ message: 'Department deleted successfully.' });
  } catch (err) {
    console.error('[Dept Delete Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ==========================================
// CATEGORY ROUTES
// ==========================================

router.get('/categories', auth, async (req, res) => {
  try {
    const cats = await db.read('categories');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/categories', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { name, warrantyPeriod, expectedLife, color, manufacturer, description, status } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });

    const existing = await db.findOne('categories', { name });
    if (existing) return res.status(400).json({ message: 'An asset category with this name already exists.' });

    const newCat = await db.create('categories', {
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
  } catch (err) {
    console.error('[Category Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/categories/:id', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, warrantyPeriod, expectedLife, color, manufacturer, description, status } = req.body;

    const cat = await db.findById('categories', id);
    if (!cat) return res.status(404).json({ message: 'Category not found.' });

    if (name && name !== cat.name) {
      const existing = await db.findOne('categories', { name });
      if (existing) return res.status(400).json({ message: 'An asset category with this name already exists.' });
    }

    const original = { ...cat };
    const { updated } = await db.update('categories', id, {
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
  } catch (err) {
    console.error('[Category Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/categories/:id', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const cat = await db.findById('categories', id);
    if (!cat) return res.status(404).json({ message: 'Category not found.' });

    const assets = await db.find('assets', { categoryId: id });
    if (assets.length > 0) {
      return res.status(400).json({ message: `Cannot delete category. It is referenced by ${assets.length} registered asset(s).` });
    }

    await db.delete('categories', id);
    logActivity(req.user.id, req.user.name, 'Delete', 'Category', id, cat, null, req);
    res.json({ message: 'Category deleted successfully.' });
  } catch (err) {
    console.error('[Category Delete Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
