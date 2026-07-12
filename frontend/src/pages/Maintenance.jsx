import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import DetailsDrawer from '../components/DetailsDrawer';
import Modal from '../components/Modal';
import { Plus, Wrench, Clock, CheckCircle, Ban, UserCheck, AlertTriangle } from 'lucide-react';

const Maintenance = () => {
  const { token, user, showToast } = useAuth();

  // Core Data States
  const [tickets, setTickets] = useState([]);
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected Ticket Drawer
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetails, setTicketDetails] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form Fields
  const [ticketForm, setTicketForm] = useState({ assetId: '', issue: '', priority: 'Medium', description: '' });
  const [assignForm, setAssignForm] = useState({ technicianId: '', notes: '' });
  const [actionNotes, setActionNotes] = useState('');

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [maintRes, assetRes, empRes] = await Promise.all([
        fetch('/api/maintenance', { headers }),
        fetch('/api/assets', { headers }),
        fetch('/api/auth/employees', { headers })
      ]);

      if (maintRes.ok) setTickets(await maintRes.json());
      if (assetRes.ok) setAssets(await assetRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const loadTicketDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTicketDetails(data);
        setSelectedTicketId(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(ticketForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Maintenance request filed.', 'success');
        setShowCreateModal(false);
        setTicketForm({ assetId: '', issue: '', priority: 'Medium', description: '' });
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Action failed.', 'error');
    }
  };

  // Workflow Approval Mutators
  const handleApproveReject = async (action) => {
    try {
      const res = await fetch(`/api/maintenance/${selectedTicketId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action, notes: actionNotes })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(action === 'Approve' ? 'Ticket approved. Asset status: Under Maintenance.' : 'Ticket rejected.', 'success');
        setActionNotes('');
        loadTicketDetails(selectedTicketId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Approval action failed.', 'error');
    }
  };

  const handleOpenAssign = () => {
    setAssignForm({ technicianId: '', notes: '' });
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/maintenance/${selectedTicketId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(assignForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Technician assigned successfully.', 'success');
        setShowAssignModal(false);
        loadTicketDetails(selectedTicketId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Assignment failed.', 'error');
    }
  };

  const handleStartWork = async () => {
    try {
      const res = await fetch(`/api/maintenance/${selectedTicketId}/start`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Work started. Ticket set to In Progress.', 'success');
        loadTicketDetails(selectedTicketId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Failed to start work.', 'error');
    }
  };

  const handleResolveWork = async () => {
    try {
      const res = await fetch(`/api/maintenance/${selectedTicketId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ notes: actionNotes })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Ticket marked Resolved. Asset returned to Available.', 'success');
        setActionNotes('');
        loadTicketDetails(selectedTicketId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Resolution failed.', 'error');
    }
  };

  const handleCloseTicket = async () => {
    try {
      const res = await fetch(`/api/maintenance/${selectedTicketId}/close`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ notes: actionNotes })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Maintenance ticket CLOSED.', 'success');
        setActionNotes('');
        loadTicketDetails(selectedTicketId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Close ticket failed.', 'error');
    }
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'Critical': return 'badge-danger';
      case 'High': return 'badge-warning';
      case 'Medium': return 'badge-info';
      default: return 'badge-gray';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Closed': return 'badge-success';
      case 'Resolved': return 'badge-success';
      case 'In Progress': return 'badge-info';
      case 'Approved': return 'badge-warning';
      case 'Technician Assigned': return 'badge-warning';
      case 'Rejected': return 'badge-danger';
      default: return 'badge-gray'; // Pending
    }
  };

  // Columns definition
  const columns = [
    { key: 'id', label: 'Ticket ID', render: (item) => <span onClick={() => loadTicketDetails(item.id)} style={{ color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}>{item.id.split('-')[0]}</span> },
    { key: 'assetTag', label: 'Asset Tag', render: (item) => <strong>{item.assetTag}</strong> },
    { key: 'assetName', label: 'Asset Name' },
    { key: 'issue', label: 'Issue Summary' },
    { key: 'requesterName', label: 'Raised By' },
    { 
      key: 'priority', 
      label: 'Priority', 
      render: (item) => <span className={`badge ${getPriorityBadgeClass(item.priority)}`}>{item.priority}</span> 
    },
    { key: 'technicianName', label: 'Assigned Tech', render: (item) => item.technicianName || <span style={{ color: 'var(--text-light)' }}>Unassigned</span> },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span> 
    },
    { key: 'createdAt', label: 'Date Filed', render: (item) => new Date(item.createdAt).toLocaleDateString() }
  ];

  if (loading && tickets.length === 0) {
    return <div className="content-wrapper"><h2>Loading Maintenance Tickets...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Maintenance Work Orders</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Track facility work orders, hardware repairs, vehicle checkups, and calibrations</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} /> File Request
        </button>
      </div>

      <Table
        columns={columns}
        data={tickets}
        searchKey="issue"
        searchPlaceholder="Search issue description..."
        exportFilename="maintenance_records"
        filters={[
          {
            key: 'priority',
            label: 'Priority',
            options: ['Low', 'Medium', 'High', 'Critical'].map(p => ({ value: p, label: p }))
          },
          {
            key: 'status',
            label: 'Status',
            options: ['Pending', 'Approved', 'Technician Assigned', 'In Progress', 'Resolved', 'Closed', 'Rejected'].map(s => ({ value: s, label: s }))
          }
        ]}
      />

      {/* ==========================================
          DETAILS DRAWERS (SLIDE-OUT FROM RIGHT)
      ========================================== */}
      <DetailsDrawer
        isOpen={!!selectedTicketId && !!ticketDetails}
        onClose={() => { setSelectedTicketId(null); setTicketDetails(null); }}
        title={`Maintenance order: ${ticketDetails?.id.split('-')[0]}`}
      >
        {ticketDetails && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Linked Asset</span>
                <strong>{ticketDetails.asset?.name} ({ticketDetails.asset?.assetTag})</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Ticket Status</span>
                <span className={`badge ${getStatusBadgeClass(ticketDetails.status)}`}>{ticketDetails.status}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Issue Summary</span>
                <span>{ticketDetails.issue}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Priority</span>
                <span className={`badge ${getPriorityBadgeClass(ticketDetails.priority)}`}>{ticketDetails.priority}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Raised By</span>
                <span>{ticketDetails.requester?.name}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Assigned Technician</span>
                <span>{ticketDetails.technician?.name || <span style={{ color: 'var(--text-light)' }}>Unassigned</span>}</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Issue Description</span>
              <p style={{ fontSize: '13px', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', margin: 0 }}>
                {ticketDetails.description || 'No extended description provided.'}
              </p>
            </div>

            {/* Action panel based on role & state */}
            <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
              <h4>Workflow Actions</h4>
              
              <div style={{ marginTop: '12px' }}>
                {/* 1. Pending -> Approve/Reject (Manager Only) */}
                {ticketDetails.status === 'Pending' && (user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Workflow Remarks (Approval/Rejection Notes)</label>
                      <input 
                        type="text" className="form-control" placeholder="e.g. Approved. Assigning local tech."
                        value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleApproveReject('Approve')}>
                        <CheckCircle size={14} /> Approve Request
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleApproveReject('Reject')}>
                        <Ban size={14} /> Reject Request
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Approved / Assigned -> Assign/Change Technician (Manager Only) */}
                {(ticketDetails.status === 'Approved' || ticketDetails.status === 'Technician Assigned') && (user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <div className="alert-box alert-box-info" style={{ margin: 0 }}>
                      <AlertTriangle size={18} />
                      <span>Request approved. Assign a qualified technician to start repairs.</span>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleOpenAssign}>
                      <UserCheck size={14} /> Assign Technician
                    </button>
                  </div>
                )}

                {/* 3. Assigned -> Start Work (Assigned Tech or Manager) */}
                {ticketDetails.status === 'Technician Assigned' && (ticketDetails.technicianId === user?.id || user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={handleStartWork}>
                    Start Maintenance Work
                  </button>
                )}

                {/* 4. In Progress -> Resolve Work (Assigned Tech or Manager) */}
                {ticketDetails.status === 'In Progress' && (ticketDetails.technicianId === user?.id || user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Resolution Summary / Actions Taken *</label>
                      <input 
                        type="text" className="form-control" required placeholder="e.g. Swapped battery pack. Device fully functional."
                        value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                      />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={handleResolveWork}>
                      Mark Resolved (Releases Asset as Available)
                    </button>
                  </div>
                )}

                {/* 5. Resolved -> Close (Requester or Manager) */}
                {ticketDetails.status === 'Resolved' && (ticketDetails.raisedByUserId === user?.id || user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Closure Confirmation Notes</label>
                      <input 
                        type="text" className="form-control" placeholder="e.g. Verified. Laptop is back in service."
                        value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                      />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={handleCloseTicket}>
                      Close Work Order
                    </button>
                  </div>
                )}

                {/* Non-mutable helper */}
                {(ticketDetails.status === 'Closed' || ticketDetails.status === 'Rejected') && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                    This work order ticket is closed. No further workflow steps are available.
                  </div>
                )}
              </div>
            </div>

            {/* Ticket Progression Timeline */}
            <div>
              <h4>Work Order History Log</h4>
              <div className="timeline" style={{ marginTop: '10px' }}>
                {ticketDetails.timeline && ticketDetails.timeline.map((log, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className={`timeline-marker ${log.status}`} />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span>Status Set: <strong>{log.status}</strong></span>
                        <span className="timeline-time">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      {log.notes && <div className="timeline-notes" style={{ fontStyle: 'italic' }}>{log.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </DetailsDrawer>

      {/* ==========================================
          MODALS
      ========================================== */}

      {/* 1. Create Maintenance Ticket */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="File Maintenance Request"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSubmit}>Submit Ticket</button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Select Damaged Asset *</label>
              <select
                className="form-control" required
                value={ticketForm.assetId} onChange={e => setTicketForm(prev => ({ ...prev, assetId: e.target.value }))}
              >
                <option value="">Select Asset</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.assetTag}) - Status: {a.status}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority Level *</label>
              <select
                className="form-control" required
                value={ticketForm.priority} onChange={e => setTicketForm(prev => ({ ...prev, priority: e.target.value }))}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Issue Summary *</label>
            <input
              type="text" className="form-control" required placeholder="e.g. Screen flickering or broken wheel"
              value={ticketForm.issue} onChange={e => setTicketForm(prev => ({ ...prev, issue: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Elaborate Damage Details</label>
            <textarea
              className="form-control" rows="3" placeholder="Provide extra description about symptoms..."
              value={ticketForm.description} onChange={e => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* 2. Assign Technician Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Technician"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssignSubmit}>Confirm Assignment</button>
          </>
        }
      >
        <form onSubmit={handleAssignSubmit}>
          <div className="form-group">
            <label className="form-label">Select Employee (Technician)</label>
            <select
              className="form-control" required
              value={assignForm.technicianId} onChange={e => setAssignForm(prev => ({ ...prev, technicianId: e.target.value }))}
            >
              <option value="">Choose technician...</option>
              {employees.filter(emp => emp.status === 'Active').map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Instructional Notes</label>
            <textarea
              className="form-control" rows="2" placeholder="Tasks to perform or safety notes..."
              value={assignForm.notes} onChange={e => setAssignForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Maintenance;
