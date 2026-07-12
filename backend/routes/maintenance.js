const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// ==========================================
// GET ALL MAINTENANCE TICKETS
// Admin, Asset Manager: all tickets
// Department Head: tickets for assets in their department
// Employee: tickets they raised
// ==========================================
router.get('/', auth, (req, res) => {
  const tickets = db.read('maintenance') || [];
  const users = db.read('users');
  const assets = db.read('assets');

  let filtered = tickets;

  if (req.user.role === 'Employee') {
    filtered = tickets.filter(t => t.raisedByUserId === req.user.id);
  } else if (req.user.role === 'Department Head') {
    filtered = tickets.filter(t => {
      const asset = assets.find(a => a.id === t.assetId);
      return asset && asset.departmentId === req.user.departmentId;
    });
  }

  const joined = filtered.map(t => {
    const asset = assets.find(a => a.id === t.assetId);
    const requester = users.find(u => u.id === t.raisedByUserId);
    const tech = t.technicianId ? users.find(u => u.id === t.technicianId) : null;
    return {
      ...t,
      assetName: asset ? asset.name : 'Unknown Asset',
      assetTag: asset ? asset.assetTag : 'N/A',
      requesterName: requester ? requester.name : 'Unknown Employee',
      technicianName: tech ? tech.name : 'Unassigned'
    };
  });

  res.json(joined);
});

// ==========================================
// GET SINGLE MAINTENANCE TICKET
// ==========================================
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  const asset = db.findById('assets', ticket.assetId);

  if (req.user.role === 'Employee' && ticket.raisedByUserId !== req.user.id) {
    return res.status(403).json({ message: 'Access denied. You can only view your own maintenance requests.' });
  }
  if (req.user.role === 'Department Head' && (!asset || asset.departmentId !== req.user.departmentId)) {
    return res.status(403).json({ message: 'Access denied. You can only view maintenance requests for your department assets.' });
  }

  const users = db.read('users');
  const requester = users.find(u => u.id === ticket.raisedByUserId);
  const tech = ticket.technicianId ? users.find(u => u.id === ticket.technicianId) : null;

  res.json({
    ...ticket,
    asset: asset || null,
    requester: requester ? { id: requester.id, name: requester.name, email: requester.email } : null,
    technician: tech ? { id: tech.id, name: tech.name } : null
  });
});

// ==========================================
// RAISE MAINTENANCE REQUEST
// Any authenticated user (Employee, Dept Head, Asset Manager, Admin)
// Schema: maintenance — assetId, raisedByUserId, issue, priority, description, status,
//   technicianId, images, documents, timeline, createdAt(auto), updatedAt(auto)
// ==========================================
router.post('/', auth, (req, res) => {
  const { assetId, issue, priority, description, images, documents } = req.body;

  if (req.user.role === 'Admin') {
    return res.status(403).json({ message: 'Administrators cannot raise maintenance tickets.' });
  }

  if (!assetId || !issue || !priority) {
    return res.status(400).json({ message: 'Asset, issue summary, and priority are required.' });
  }

  const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ message: `Priority must be one of: ${validPriorities.join(', ')}` });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Employees can only raise requests for assets allocated to them
  if (req.user.role === 'Employee' && asset.allocatedToUserId !== req.user.id) {
    return res.status(403).json({ message: 'You can only raise maintenance requests for assets allocated to you.' });
  }

  // Department Heads can raise for assets in their department
  if (req.user.role === 'Department Head' && asset.departmentId !== req.user.departmentId) {
    return res.status(403).json({ message: 'You can only raise maintenance requests for assets in your department.' });
  }

  // Schema: maintenance
  const ticket = db.create('maintenance', {
    assetId,
    raisedByUserId: req.user.id,
    issue,
    priority,
    description: description || '',
    status: 'Pending',
    technicianId: '',
    images: Array.isArray(images) ? images : [],
    documents: Array.isArray(documents) ? documents : [],
    timeline: [
      {
        status: 'Pending',
        timestamp: new Date().toISOString(),
        notes: `Ticket created by ${req.user.name}`
      }
    ]
  });

  // Notify Asset Managers and Admins
  const users = db.read('users');
  users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin').forEach(mgr => {
    db.create('notifications', {
      userId: mgr.id,
      message: `New maintenance request for asset "${asset.name}" (${asset.assetTag}) — Priority: ${priority}.`,
      type: 'Maintenance Raised',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Raise Maintenance', 'Maintenance', ticket.id, null, ticket, req);

  res.status(201).json(ticket);
});

// ==========================================
// APPROVE / REJECT TICKET — Admin, Asset Manager
// On Approve: asset status -> Under Maintenance
// On Reject: ticket status -> Rejected
// ==========================================
router.put('/:id/approve', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body;

  if (!action || !['Approve', 'Reject'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "Approve" or "Reject".' });
  }

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  if (ticket.status !== 'Pending') {
    return res.status(400).json({ message: `Cannot evaluate ticket in status "${ticket.status}". Only Pending tickets can be approved/rejected.` });
  }

  const asset = db.findById('assets', ticket.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Associated asset not found.' });
  }

  const originalTicket = { ...ticket };
  const originalAsset = { ...asset };
  const timeline = [...(ticket.timeline || [])];

  if (action === 'Approve') {
    timeline.push({
      status: 'Approved',
      timestamp: new Date().toISOString(),
      notes: notes || `Approved by ${req.user.name}`
    });

    // Schema: maintenance — status, timeline
    db.update('maintenance', id, { status: 'Approved', timeline });

    // Schema: assets — status, history
    const history = [...(asset.history || [])];
    history.push({
      id: `HIST-${Date.now()}`,
      eventType: 'Under Maintenance',
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Maintenance approved. Ticket ID: ${id}`
    });
    db.update('assets', asset.id, { status: 'Under Maintenance', history });

    // Schema: notifications
    db.create('notifications', {
      userId: ticket.raisedByUserId,
      message: `Your maintenance request for asset "${asset.name}" has been APPROVED and is now Under Maintenance.`,
      type: 'Maintenance Approved',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Approve Maintenance', 'Maintenance', id, originalTicket, db.findById('maintenance', id), req);
    logActivity(req.user.id, req.user.name, 'Set Under Maintenance', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

    return res.json({ message: 'Maintenance request approved. Asset set to Under Maintenance.' });
  } else {
    timeline.push({
      status: 'Rejected',
      timestamp: new Date().toISOString(),
      notes: notes || `Rejected by ${req.user.name}`
    });

    // Schema: maintenance — status, timeline
    const { updated } = db.update('maintenance', id, { status: 'Rejected', timeline });

    // Schema: notifications
    db.create('notifications', {
      userId: ticket.raisedByUserId,
      message: `Your maintenance request for asset "${asset.name}" has been REJECTED. ${notes || 'No reason provided.'}`,
      type: 'Maintenance Rejected',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Reject Maintenance', 'Maintenance', id, originalTicket, updated, req);

    return res.json({ message: 'Maintenance request rejected.' });
  }
});

// ==========================================
// ASSIGN TECHNICIAN — Admin, Asset Manager
// Schema: maintenance — status, technicianId, timeline
// ==========================================
router.put('/:id/assign', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { technicianId, notes } = req.body;

  if (!technicianId) {
    return res.status(400).json({ message: 'Technician ID is required.' });
  }

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  if (ticket.status !== 'Approved' && ticket.status !== 'Technician Assigned') {
    return res.status(400).json({ message: `Cannot assign technician. Ticket must be Approved first (current: "${ticket.status}").` });
  }

  const technician = db.findById('users', technicianId);
  if (!technician) {
    return res.status(400).json({ message: 'Technician not found.' });
  }
  if (technician.status !== 'Active') {
    return res.status(400).json({ message: 'Cannot assign an inactive user as technician.' });
  }

  const original = { ...ticket };
  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Technician Assigned',
    timestamp: new Date().toISOString(),
    notes: `Technician "${technician.name}" assigned. ${notes || ''}`
  });

  // Schema: maintenance — status, technicianId, timeline
  const { updated } = db.update('maintenance', id, {
    status: 'Technician Assigned',
    technicianId,
    timeline
  });

  // Schema: notifications
  const targetAsset = db.findById('assets', ticket.assetId);
  db.create('notifications', {
    userId: technician.id,
    message: `You have been assigned to maintenance ticket "${ticket.issue}" (Asset: ${targetAsset ? targetAsset.assetTag : 'N/A'}).`,
    type: 'Maintenance Assigned',
    link: '/maintenance',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Assign Technician', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// START MAINTENANCE WORK — Assigned technician, Admin, Asset Manager
// Schema: maintenance — status, timeline
// ==========================================
router.put('/:id/start', auth, (req, res) => {
  const { id } = req.params;
  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  const isAssignedTech = ticket.technicianId === req.user.id;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isAssignedTech && !isPrivileged) {
    return res.status(403).json({ message: 'You are not assigned to this ticket.' });
  }

  if (ticket.status !== 'Technician Assigned' && ticket.status !== 'Approved') {
    return res.status(400).json({ message: `Cannot start maintenance from status "${ticket.status}".` });
  }

  const original = { ...ticket };
  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'In Progress',
    timestamp: new Date().toISOString(),
    notes: `Work started by ${req.user.name}.`
  });

  // Schema: maintenance — status, timeline
  const { updated } = db.update('maintenance', id, { status: 'In Progress', timeline });

  logActivity(req.user.id, req.user.name, 'Start Maintenance', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

// ==========================================
// RESOLVE MAINTENANCE — Assigned technician, Admin, Asset Manager
// On Resolve: asset status -> Available
// Schema: maintenance — status, timeline | assets — status, history
// ==========================================
router.put('/:id/resolve', auth, (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  const isAssignedTech = ticket.technicianId === req.user.id;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isAssignedTech && !isPrivileged) {
    return res.status(403).json({ message: 'You are not authorized to resolve this ticket.' });
  }

  if (ticket.status !== 'In Progress') {
    return res.status(400).json({ message: `Cannot resolve ticket. Work must be In Progress first (current: "${ticket.status}").` });
  }

  const asset = db.findById('assets', ticket.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Associated asset not found.' });
  }

  const originalTicket = { ...ticket };
  const originalAsset = { ...asset };

  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Resolved',
    timestamp: new Date().toISOString(),
    notes: notes || 'Maintenance resolved successfully.'
  });

  // Schema: maintenance — status, timeline
  db.update('maintenance', id, { status: 'Resolved', timeline });

  // Schema: assets — status, history
  const history = [...(asset.history || [])];
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Available',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Maintenance resolved. Asset returned to Available. Ticket ID: ${id}. ${notes || ''}`
  });
  db.update('assets', asset.id, { status: 'Available', history });

  // Schema: notifications
  db.create('notifications', {
    userId: ticket.raisedByUserId,
    message: `Maintenance on asset "${asset.name}" (${asset.assetTag}) has been resolved. Asset is now Available.`,
    type: 'Maintenance Completed',
    link: '/maintenance',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Resolve Maintenance', 'Maintenance', id, originalTicket, db.findById('maintenance', id), req);
  logActivity(req.user.id, req.user.name, 'Resolve Asset Maintenance', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

  res.json({ message: 'Maintenance resolved. Asset returned to Available.' });
});

// ==========================================
// CLOSE TICKET — Requester, Admin, Asset Manager
// Schema: maintenance — status, timeline
// ==========================================
router.put('/:id/close', auth, (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  const isOwner = ticket.raisedByUserId === req.user.id;
  const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';

  if (!isOwner && !isPrivileged) {
    return res.status(403).json({ message: 'Only the ticket requester or asset managers can close this ticket.' });
  }

  if (ticket.status !== 'Resolved') {
    return res.status(400).json({ message: `Cannot close ticket. It must be Resolved first (current: "${ticket.status}").` });
  }

  const original = { ...ticket };
  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Closed',
    timestamp: new Date().toISOString(),
    notes: notes || 'Ticket closed.'
  });

  // Schema: maintenance — status, timeline
  const { updated } = db.update('maintenance', id, { status: 'Closed', timeline });

  logActivity(req.user.id, req.user.name, 'Close Maintenance Ticket', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

module.exports = router;
