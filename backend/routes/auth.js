const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth, checkRole, SECRET_KEY } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Public departments list for signup (active only)
router.get('/departments-public', (req, res) => {
  const depts = db.read('departments')
    .filter(d => d.status === 'Active')
    .map(({ id, name, description }) => ({ id, name, description }));
  res.json(depts);
});

// Sign Up
router.post('/signup', (req, res) => {
  const { name, email, password, phone, departmentId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required fields.' });
  }

  // Check unique email
  const existingUser = db.findOne('users', { email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ message: 'An account with this email address already exists.' });
  }

  // Enforce Employee role and Active status by default
  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = db.create('users', {
    employeeId: `AF-EMP-${String(db.read('users').length + 1).padStart(3, '0')}`,
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    phone: phone || '',
    photo: '',
    departmentId: departmentId || '',
    role: 'Employee', // Strict rule: Employee default
    status: 'Active',  // Active upon registration
    joiningDate: new Date().toISOString().split('T')[0]
  });

  // Log activity
  logActivity('system', 'System', 'Signup', 'User', newUser.id, null, { email: newUser.email, name: newUser.name }, req);

  // Generate Token
  const token = jwt.sign({ id: newUser.id }, SECRET_KEY, { expiresIn: '7d' });

  // Remove password from response
  const { password: _, ...userWithoutPassword } = newUser;
  res.status(201).json({ user: userWithoutPassword, token });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = db.findOne('users', { email: email.toLowerCase() });
  if (!user) {
    return res.status(400).json({ message: 'Invalid email or password.' });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ message: 'Your account is deactivated. Please contact your system Administrator.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: 'Invalid email or password.' });
  }

  // Log login activity
  logActivity(user.id, user.name, 'Login', 'User', user.id, null, { action: 'logged_in' }, req);

  const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '7d' });

  const { password: _, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword, token });
});

// Get current profile
router.get('/profile', auth, (req, res) => {
  const { password: _, ...userWithoutPassword } = req.user;
  res.json(userWithoutPassword);
});

// Get all employees (directory)
router.get('/employees', auth, (req, res) => {
  const employees = db.read('users').map(({ password, ...user }) => user);
  res.json(employees);
});

// Admin promote employee role
router.put('/employees/:id/role', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ['Admin', 'Asset Manager', 'Department Head', 'Employee'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role assignment requested.' });
  }

  const employee = db.findById('users', id);
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  // Prevent self role removal to maintain at least one admin easily
  if (employee.id === req.user.id && role !== 'Admin') {
    return res.status(400).json({ message: 'You cannot revoke your own administrator role.' });
  }

  const original = { ...employee };
  const { updated } = db.update('users', id, { role });

  // Log activity
  logActivity(req.user.id, req.user.name, 'Promote', 'User', id, original.role, role, req);

  // Send a system notification to the promoted employee
  db.create('notifications', {
    userId: id,
    message: `Your role has been updated to "${role}" by the Administrator.`,
    type: 'Role Promotion',
    link: '/dashboard',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  const { password: _, ...employeeWithoutPassword } = updated;
  res.json(employeeWithoutPassword);
});

// Admin deactivate/reactivate employee
router.put('/employees/:id/status', auth, checkRole(['Admin']), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'Active' && status !== 'Inactive') {
    return res.status(400).json({ message: 'Status must be Active or Inactive.' });
  }

  const employee = db.findById('users', id);
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  if (employee.id === req.user.id) {
    return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  }

  const original = { ...employee };
  const { updated } = db.update('users', id, { status });

  // Log activity
  logActivity(req.user.id, req.user.name, status === 'Active' ? 'Reactivate' : 'Deactivate', 'User', id, original.status, status, req);

  const { password: _, ...employeeWithoutPassword } = updated;
  res.json(employeeWithoutPassword);
});

// Update employee profile (department assignment, phone number, etc.)
router.put('/employees/:id', auth, (req, res) => {
  const { id } = req.params;
  const { name, phone, departmentId, photo } = req.body;

  // Normal employees can only update themselves; Admins can update anyone
  if (req.user.role !== 'Admin' && req.user.id !== id) {
    return res.status(403).json({ message: 'Unauthorized profile update request.' });
  }

  const employee = db.findById('users', id);
  if (!employee) {
    return res.status(404).json({ message: 'Employee profile not found.' });
  }

  // Validate department if changing
  if (departmentId) {
    const dept = db.findById('departments', departmentId);
    if (!dept) {
      return res.status(400).json({ message: 'Invalid department assignment.' });
    }
    if (dept.status === 'Inactive') {
      return res.status(400).json({ message: 'Cannot assign employee to an inactive department.' });
    }
  }

  const original = { ...employee };
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (departmentId !== undefined) updateData.departmentId = departmentId;
  if (photo !== undefined) updateData.photo = photo;

  const { updated } = db.update('users', id, updateData);

  logActivity(req.user.id, req.user.name, 'Update Profile', 'User', id, original, updated, req);

  const { password: _, ...employeeWithoutPassword } = updated;
  res.json(employeeWithoutPassword);
});

module.exports = router;
