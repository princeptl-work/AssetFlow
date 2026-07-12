const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// Get all maintenance tickets
router.get('/', auth, (req, res) => {
  const tickets = db.read('maintenance') || [];
  const users = db.read('users');
  const assets = db.read('assets');

  const joined = tickets.map(t => {
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

// Get single maintenance details
router.get('/:id', auth, (req, res) => {
  const { id } = req.params;
  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  const users = db.read('users');
  const asset = db.findById('assets', ticket.assetId);
  const requester = users.find(u => u.id === ticket.raisedByUserId);
  const tech = ticket.technicianId ? users.find(u => u.id === ticket.technicianId) : null;

  res.json({
    ...ticket,
    asset,
    requester: requester ? { id: requester.id, name: requester.name, email: requester.email } : null,
    technician: tech ? { id: tech.id, name: tech.name } : null
  });
});

// Raise request (Employee/Any)
router.post('/', auth, (req, res) => {
  const { assetId, issue, priority, description, images, documents } = req.body;

  if (!assetId || !issue || !priority) {
    return res.status(400).json({ message: 'Asset, Issue summary, and Priority are required.' });
  }

  const asset = db.findById('assets', assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  // Creating ticket
  const ticket = db.create('maintenance', {
    assetId,
    raisedByUserId: req.user.id,
    issue,
    priority, // Low, Medium, High, Critical
    description: description || '',
    status: 'Pending', // Pending, Approved, Technician Assigned, In Progress, Resolved, Closed, Rejected
    technicianId: '',
    images: images || [],
    documents: documents || [],
    timeline: [
      {
        status: 'Pending',
        timestamp: new Date().toISOString(),
        notes: `Ticket created by ${req.user.name}`
      }
    ]
  });

  // Notify Asset Managers
  const users = db.read('users');
  const managers = users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin');
  managers.forEach(mgr => {
    db.create('notifications', {
      userId: mgr.id,
      message: `New maintenance request raised for asset "${asset.name}" (${asset.assetTag}) - Priority: ${priority}.`,
      type: 'Maintenance Raised',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });
  });

  logActivity(req.user.id, req.user.name, 'Raise Maintenance', 'Maintenance', ticket.id, null, ticket, req);

  res.status(201).json(ticket);
});

// Approve / Reject Request (Asset Manager / Admin)
router.put('/:id/approve', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body; // action: 'Approve' or 'Reject'

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  if (ticket.status !== 'Pending') {
    return res.status(400).json({ message: `Cannot evaluate ticket in status "${ticket.status}".` });
  }

  const asset = db.findById('assets', ticket.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Associated asset not found.' });
  }

  const originalTicket = { ...ticket };
  const originalAsset = { ...asset };

  const timeline = [...(ticket.timeline || [])];

  if (action === 'Approve') {
    // Update ticket
    timeline.push({
      status: 'Approved',
      timestamp: new Date().toISOString(),
      notes: notes || `Approved by ${req.user.name}`
    });

    db.update('maintenance', id, {
      status: 'Approved',
      timeline
    });

    // Sync Asset Status: Change to Under Maintenance
    const history = [...(asset.history || [])];
    history.push({
      id: `HIST-${Date.now()}`,
      eventType: 'Maintenance',
      date: new Date().toISOString(),
      user: req.user.name,
      userId: req.user.id,
      notes: `Ticket approved. Transferred to Under Maintenance. Ticket ID: ${id}`
    });

    db.update('assets', asset.id, {
      status: 'Under Maintenance',
      history
    });

    // Notify requester
    db.create('notifications', {
      userId: ticket.raisedByUserId,
      message: `Your maintenance request for asset "${asset.name}" has been APPROVED.`,
      type: 'Maintenance Approved',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Approve Maintenance', 'Maintenance', id, originalTicket, db.findById('maintenance', id), req);
    logActivity(req.user.id, req.user.name, 'Set Under Maintenance', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

    res.json({ message: 'Maintenance request approved. Asset status set to Under Maintenance.' });
  } else {
    // Reject Ticket
    timeline.push({
      status: 'Rejected',
      timestamp: new Date().toISOString(),
      notes: notes || `Rejected by ${req.user.name}`
    });

    const { updated } = db.update('maintenance', id, {
      status: 'Rejected',
      timeline
    });

    // Notify requester
    db.create('notifications', {
      userId: ticket.raisedByUserId,
      message: `Your maintenance request for asset "${asset.name}" has been REJECTED: ${notes || 'No reason provided.'}`,
      type: 'Maintenance Rejected',
      link: '/maintenance',
      isRead: false,
      timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Reject Maintenance', 'Maintenance', id, originalTicket, updated, req);

    res.json({ message: 'Maintenance request rejected.' });
  }
});

// Assign Technician (Asset Manager / Admin)
router.put('/:id/assign', auth, checkRole(['Admin', 'Asset Manager']), (req, res) => {
  const { id } = req.params;
  const { technicianId, notes } = req.body;

  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  // Must be approved first
  if (ticket.status !== 'Approved' && ticket.status !== 'Technician Assigned') {
    return res.status(400).json({ message: `Cannot assign technician in status "${ticket.status}".` });
  }

  const technician = db.findById('users', technicianId);
  if (!technician) {
    return res.status(400).json({ message: 'Technician not found.' });
  }

  const original = { ...ticket };
  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Technician Assigned',
    timestamp: new Date().toISOString(),
    notes: `Technician "${technician.name}" assigned. Notes: ${notes || 'None'}`
  });

  const { updated } = db.update('maintenance', id, {
    status: 'Technician Assigned',
    technicianId,
    timeline
  });

  // Notify technician
  db.create('notifications', {
    userId: technician.id,
    message: `You have been assigned to maintenance ticket "${ticket.issue}" (Asset Tag: ${db.findById('assets', ticket.assetId).assetTag}).`,
    type: 'Maintenance Assigned',
    link: '/maintenance',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Assign Technician', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

// Start maintenance (Technician or Manager)
router.put('/:id/start', auth, (req, res) => {
  const { id } = req.params;
  const ticket = db.findById('maintenance', id);
  if (!ticket) {
    return res.status(404).json({ message: 'Maintenance ticket not found.' });
  }

  // Ensure authorized (assigned tech or Asset Manager/Admin)
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

  const { updated } = db.update('maintenance', id, {
    status: 'In Progress',
    timeline
  });

  logActivity(req.user.id, req.user.name, 'Start Maintenance', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

// Resolve Maintenance (Technician or Manager)
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
    return res.status(400).json({ message: 'Cannot resolve ticket: Work has not started.' });
  }

  const asset = db.findById('assets', ticket.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const originalTicket = { ...ticket };
  const originalAsset = { ...asset };

  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Resolved',
    timestamp: new Date().toISOString(),
    notes: notes || 'Resolved successfully.'
  });

  // Update ticket
  db.update('maintenance', id, {
    status: 'Resolved',
    timeline
  });

  // Automatically update asset to Available
  const history = [...(asset.history || [])];
  history.push({
    id: `HIST-${Date.now()}`,
    eventType: 'Available',
    date: new Date().toISOString(),
    user: req.user.name,
    userId: req.user.id,
    notes: `Maintenance resolved. Returned to warehouse as Available. Ticket ID: ${id}`
  });

  db.update('assets', asset.id, {
    status: 'Available',
    history
  });

  // Notify requester
  db.create('notifications', {
    userId: ticket.raisedByUserId,
    message: `Maintenance completed for asset "${asset.name}". Verified status: Available.`,
    type: 'Maintenance Completed',
    link: '/maintenance',
    isRead: false,
    timestamp: new Date().toISOString()
  });

  logActivity(req.user.id, req.user.name, 'Resolve Maintenance', 'Maintenance', id, originalTicket, db.findById('maintenance', id), req);
  logActivity(req.user.id, req.user.name, 'Resolve Asset Maintenance', 'Asset', asset.id, originalAsset, db.findById('assets', asset.id), req);

  res.json({ message: 'Maintenance resolved. Asset returned to Available.' });
});

// Close Ticket (Requester, Manager, Admin)
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
    return res.status(400).json({ message: 'Cannot close ticket. It must be resolved first.' });
  }

  const original = { ...ticket };
  const timeline = [...(ticket.timeline || [])];
  timeline.push({
    status: 'Closed',
    timestamp: new Date().toISOString(),
    notes: notes || 'Closed by user.'
  });

  const { updated } = db.update('maintenance', id, {
    status: 'Closed',
    timeline
  });

  logActivity(req.user.id, req.user.name, 'Close Maintenance Ticket', 'Maintenance', id, original, updated, req);

  res.json(updated);
});

module.exports = router;
