const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth, checkRole } = require('../authMiddleware');
const { logActivity } = require('../logger');

// GET all maintenance tickets
router.get('/', auth, async (req, res) => {
  try {
    const tickets = await db.read('maintenance');
    const users = await db.read('users');
    const assets = await db.read('assets');

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
      return { ...t, assetName: asset ? asset.name : 'Unknown Asset', assetTag: asset ? asset.assetTag : 'N/A', requesterName: requester ? requester.name : 'Unknown', technicianName: tech ? tech.name : 'Unassigned' };
    });

    res.json(joined);
  } catch (err) {
    console.error('[Maintenance GET Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET single ticket
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found.' });

    const asset = await db.findById('assets', ticket.assetId);
    if (req.user.role === 'Employee' && ticket.raisedByUserId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (req.user.role === 'Department Head' && (!asset || asset.departmentId !== req.user.departmentId)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const users = await db.read('users');
    const requester = users.find(u => u.id === ticket.raisedByUserId);
    const tech = ticket.technicianId ? users.find(u => u.id === ticket.technicianId) : null;

    res.json({ ...ticket, asset, requester: requester ? { id: requester.id, name: requester.name, email: requester.email } : null, technician: tech ? { id: tech.id, name: tech.name } : null });
  } catch (err) {
    console.error('[Maintenance GET Single Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST raise maintenance request
router.post('/', auth, async (req, res) => {
  try {
    const { assetId, issue, priority, description, images, documents } = req.body;
    if (!assetId || !issue || !priority) return res.status(400).json({ message: 'Asset, Issue, and Priority are required.' });

    const asset = await db.findById('assets', assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    const ticket = await db.create('maintenance', {
      assetId, raisedByUserId: req.user.id, issue, priority,
      description: description || '', status: 'Pending', technicianId: '',
      images: images || [], documents: documents || [],
      timeline: [{ status: 'Pending', timestamp: new Date().toISOString(), notes: `Ticket created by ${req.user.name}` }]
    });

    const users = await db.read('users');
    const managers = users.filter(u => u.role === 'Asset Manager' || u.role === 'Admin');
    for (const mgr of managers) {
      await db.create('notifications', {
        userId: mgr.id,
        message: `New maintenance request for "${asset.name}" (${asset.assetTag}) — Priority: ${priority}.`,
        type: 'Maintenance Raised', link: '/maintenance', isRead: false, timestamp: new Date().toISOString()
      });
    }

    logActivity(req.user.id, req.user.name, 'Raise Maintenance', 'Maintenance', ticket.id, null, ticket, req);
    res.status(201).json(ticket);
  } catch (err) {
    console.error('[Maintenance Create Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT approve/reject
router.put('/:id/approve', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found.' });
    if (ticket.status !== 'Pending') return res.status(400).json({ message: `Cannot evaluate ticket in status "${ticket.status}".` });

    const asset = await db.findById('assets', ticket.assetId);
    if (!asset) return res.status(404).json({ message: 'Associated asset not found.' });

    const originalTicket = { ...ticket };
    const originalAsset = { ...asset };
    const timeline = [...(ticket.timeline || [])];

    if (action === 'Approve') {
      timeline.push({ status: 'Approved', timestamp: new Date().toISOString(), notes: notes || `Approved by ${req.user.name}` });
      await db.update('maintenance', id, { status: 'Approved', timeline });

      const history = [...(asset.history || [])];
      history.push({ id: `HIST-${Date.now()}`, eventType: 'Maintenance', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Ticket approved. Ticket ID: ${id}` });
      await db.update('assets', asset.id, { status: 'Under Maintenance', history });

      await db.create('notifications', {
        userId: ticket.raisedByUserId,
        message: `Your maintenance request for "${asset.name}" has been APPROVED.`,
        type: 'Maintenance Approved', link: '/maintenance', isRead: false, timestamp: new Date().toISOString()
      });

      logActivity(req.user.id, req.user.name, 'Approve Maintenance', 'Maintenance', id, originalTicket, await db.findById('maintenance', id), req);
      logActivity(req.user.id, req.user.name, 'Set Under Maintenance', 'Asset', asset.id, originalAsset, await db.findById('assets', asset.id), req);

      res.json({ message: 'Maintenance request approved. Asset set to Under Maintenance.' });
    } else {
      timeline.push({ status: 'Rejected', timestamp: new Date().toISOString(), notes: notes || `Rejected by ${req.user.name}` });
      const { updated } = await db.update('maintenance', id, { status: 'Rejected', timeline });

      await db.create('notifications', {
        userId: ticket.raisedByUserId,
        message: `Your maintenance request for "${asset.name}" has been REJECTED: ${notes || 'No reason provided.'}`,
        type: 'Maintenance Rejected', link: '/maintenance', isRead: false, timestamp: new Date().toISOString()
      });

      logActivity(req.user.id, req.user.name, 'Reject Maintenance', 'Maintenance', id, originalTicket, updated, req);
      res.json({ message: 'Maintenance request rejected.' });
    }
  } catch (err) {
    console.error('[Maintenance Approve Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT assign technician
router.put('/:id/assign', auth, checkRole(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { technicianId, notes } = req.body;

    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    if (ticket.status !== 'Approved' && ticket.status !== 'Technician Assigned') {
      return res.status(400).json({ message: `Cannot assign technician in status "${ticket.status}".` });
    }

    const technician = await db.findById('users', technicianId);
    if (!technician) return res.status(400).json({ message: 'Technician not found.' });

    const original = { ...ticket };
    const timeline = [...(ticket.timeline || [])];
    timeline.push({ status: 'Technician Assigned', timestamp: new Date().toISOString(), notes: `Technician "${technician.name}" assigned. Notes: ${notes || 'None'}` });

    const { updated } = await db.update('maintenance', id, { status: 'Technician Assigned', technicianId, timeline });

    const asset = await db.findById('assets', ticket.assetId);
    await db.create('notifications', {
      userId: technician.id,
      message: `You have been assigned to maintenance ticket "${ticket.issue}" (Asset: ${asset ? asset.assetTag : 'N/A'}).`,
      type: 'Maintenance Assigned', link: '/maintenance', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Assign Technician', 'Maintenance', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Maintenance Assign Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT start maintenance
router.put('/:id/start', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    const isAssignedTech = ticket.technicianId === req.user.id;
    const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';
    if (!isAssignedTech && !isPrivileged) return res.status(403).json({ message: 'You are not assigned to this ticket.' });

    if (ticket.status !== 'Technician Assigned' && ticket.status !== 'Approved') {
      return res.status(400).json({ message: `Cannot start maintenance from status "${ticket.status}".` });
    }

    const original = { ...ticket };
    const timeline = [...(ticket.timeline || [])];
    timeline.push({ status: 'In Progress', timestamp: new Date().toISOString(), notes: `Work started by ${req.user.name}.` });

    const { updated } = await db.update('maintenance', id, { status: 'In Progress', timeline });
    logActivity(req.user.id, req.user.name, 'Start Maintenance', 'Maintenance', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Maintenance Start Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT resolve maintenance
router.put('/:id/resolve', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    const isAssignedTech = ticket.technicianId === req.user.id;
    const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';
    if (!isAssignedTech && !isPrivileged) return res.status(403).json({ message: 'Not authorized to resolve this ticket.' });
    if (ticket.status !== 'In Progress') return res.status(400).json({ message: 'Cannot resolve: Work has not started.' });

    const asset = await db.findById('assets', ticket.assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found.' });

    const originalTicket = { ...ticket };
    const originalAsset = { ...asset };
    const timeline = [...(ticket.timeline || [])];
    timeline.push({ status: 'Resolved', timestamp: new Date().toISOString(), notes: notes || 'Resolved successfully.' });

    await db.update('maintenance', id, { status: 'Resolved', timeline });

    const history = [...(asset.history || [])];
    history.push({ id: `HIST-${Date.now()}`, eventType: 'Available', date: new Date().toISOString(), user: req.user.name, userId: req.user.id, notes: `Maintenance resolved. Ticket ID: ${id}` });
    await db.update('assets', asset.id, { status: 'Available', history });

    await db.create('notifications', {
      userId: ticket.raisedByUserId,
      message: `Maintenance completed for "${asset.name}". Asset status: Available.`,
      type: 'Maintenance Completed', link: '/maintenance', isRead: false, timestamp: new Date().toISOString()
    });

    logActivity(req.user.id, req.user.name, 'Resolve Maintenance', 'Maintenance', id, originalTicket, await db.findById('maintenance', id), req);
    logActivity(req.user.id, req.user.name, 'Resolve Asset Maintenance', 'Asset', asset.id, originalAsset, await db.findById('assets', asset.id), req);

    res.json({ message: 'Maintenance resolved. Asset returned to Available.' });
  } catch (err) {
    console.error('[Maintenance Resolve Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT close ticket
router.put('/:id/close', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const ticket = await db.findById('maintenance', id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    const isOwner = ticket.raisedByUserId === req.user.id;
    const isPrivileged = req.user.role === 'Admin' || req.user.role === 'Asset Manager';
    if (!isOwner && !isPrivileged) return res.status(403).json({ message: 'Only the ticket requester or asset managers can close this ticket.' });
    if (ticket.status !== 'Resolved') return res.status(400).json({ message: 'Ticket must be resolved before closing.' });

    const original = { ...ticket };
    const timeline = [...(ticket.timeline || [])];
    timeline.push({ status: 'Closed', timestamp: new Date().toISOString(), notes: notes || 'Closed by user.' });

    const { updated } = await db.update('maintenance', id, { status: 'Closed', timeline });
    logActivity(req.user.id, req.user.name, 'Close Maintenance Ticket', 'Maintenance', id, original, updated, req);
    res.json(updated);
  } catch (err) {
    console.error('[Maintenance Close Error]', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
