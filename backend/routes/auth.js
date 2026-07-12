const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth, checkRole, SECRET_KEY } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Public departments list for signup
router.get('/departments-public', async (req, res) => {
  try {
    const depts = (await db.read('departments'))
      .filter(d => d.status === 'Active')
      .map(({ id, name, description }) => ({ id, name, description }));
    res.json(depts);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Sign Up (Employee role only)
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, departmentId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required fields.' });
    }

    const existingUser = await db.findOne('users', { email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email address already exists.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const usersCount = (await db.read('users')).length;
    const newUser = await db.create('users', {
      employeeId: `AF-EMP-${String(usersCount + 1).padStart(3, '0')}`,
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      photo: '',
      departmentId: departmentId || '',
      role: 'Employee',
      status: 'Active',
      joiningDate: new Date().toISOString().split('T')[0]
    });

    logActivity('system', 'System', 'Signup', 'User', newUser.id, null, { email: newUser.email, name: newUser.name }, req);

    const token = jwt.sign({ id: newUser.id }, SECRET_KEY, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('[Signup Error]', err.message);
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await db.findOne('users', { email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'Invalid email or password.' });

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Your account is deactivated. Please contact your system Administrator.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password.' });

    logActivity(user.id, user.name, 'Login', 'User', user.id, null, { action: 'logged_in' }, req);

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('[Login Error]', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email address is required.' });

    const user = await db.findOne('users', { email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'No account found with this email address.' });

    const newHashedPassword = bcrypt.hashSync('temp123', 10);
    await db.update('users', user.id, { password: newHashedPassword });

    logActivity('system', 'System', 'Forgot Password', 'User', user.id, null, { email: user.email }, req);

    res.json({ message: 'Password has been reset to default mock credentials.', tempPassword: 'temp123' });
  } catch (err) {
    console.error('[Forgot Password Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Get current profile
router.get('/profile', auth, async (req, res) => {
  try {
    const { password: _, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Get all employees
router.get('/employees', auth, async (req, res) => {
  try {
    const employees = (await db.read('users')).map(({ password, ...user }) => user);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Admin promote employee role
router.put('/employees/:id/role', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['Admin', 'Asset Manager', 'Department Head', 'Employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role assignment requested.' });
    }

    const employee = await db.findById('users', id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    if (employee.id === req.user.id && role !== 'Admin') {
      return res.status(400).json({ message: 'You cannot revoke your own administrator role.' });
    }

    const original = { ...employee };
    const { updated } = await db.update('users', id, { role });

    logActivity(req.user.id, req.user.name, 'Promote', 'User', id, original.role, role, req);

    await db.create('notifications', {
      userId: id,
      message: `Your role has been updated to "${role}" by the Administrator.`,
      type: 'Role Promotion', link: '/dashboard', isRead: false,
      timestamp: new Date().toISOString()
    });

    const { password: _, ...employeeWithoutPassword } = updated;
    res.json(employeeWithoutPassword);
  } catch (err) {
    console.error('[Role Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Admin deactivate/reactivate employee
router.put('/employees/:id/status', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'Active' && status !== 'Inactive') {
      return res.status(400).json({ message: 'Status must be Active or Inactive.' });
    }

    const employee = await db.findById('users', id);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    if (employee.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    const original = { ...employee };
    const { updated } = await db.update('users', id, { status });
    logActivity(req.user.id, req.user.name, status === 'Active' ? 'Reactivate' : 'Deactivate', 'User', id, original.status, status, req);

    const { password: _, ...employeeWithoutPassword } = updated;
    res.json(employeeWithoutPassword);
  } catch (err) {
    console.error('[Status Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Update employee profile
router.put('/employees/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, departmentId, photo } = req.body;

    if (req.user.role !== 'Admin' && req.user.id !== id) {
      return res.status(403).json({ message: 'Unauthorized profile update request.' });
    }

    const employee = await db.findById('users', id);
    if (!employee) return res.status(404).json({ message: 'Employee profile not found.' });

    if (departmentId) {
      const dept = await db.findById('departments', departmentId);
      if (!dept) return res.status(400).json({ message: 'Invalid department assignment.' });
      if (dept.status === 'Inactive') return res.status(400).json({ message: 'Cannot assign employee to an inactive department.' });
    }

    const original = { ...employee };
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (photo !== undefined) updateData.photo = photo;

    const { updated } = await db.update('users', id, updateData);
    logActivity(req.user.id, req.user.name, 'Update Profile', 'User', id, original, updated, req);

    const { password: _, ...employeeWithoutPassword } = updated;
    res.json(employeeWithoutPassword);
  } catch (err) {
    console.error('[Profile Update Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
