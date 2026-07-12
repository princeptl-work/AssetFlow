import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import DetailsDrawer from '../components/DetailsDrawer';
import Modal from '../components/Modal';
import { Plus, ClipboardCheck, Lock, Award, ShieldAlert, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const Audits = () => {
  const { token, user, showToast } = useAuth();

  // Core Data States
  const [audits, setAudits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected Audit Details & Checklist Scopes
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [auditDetails, setAuditDetails] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Form Fields
  const [auditForm, setAuditForm] = useState({ name: '', departmentId: '', location: '', startDate: '', endDate: '', auditors: [], description: '' });
  const [verifyForm, setVerifyForm] = useState({ assetId: '', status: 'Verified', condition: 'Excellent', notes: '' });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [auditRes, deptRes, empRes] = await Promise.all([
        fetch('/api/audits', { headers }),
        fetch('/api/organization/departments', { headers }),
        fetch('/api/auth/employees', { headers })
      ]);

      if (auditRes.ok) setAudits(await auditRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
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

  const loadAuditDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/audits/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setAuditDetails(await res.json());
        setSelectedAuditId(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCreate = () => {
    setAuditForm({
      name: '',
      departmentId: '',
      location: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], // +7 days
      auditors: [],
      description: ''
    });
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (auditForm.auditors.length === 0) {
      showToast('Must assign at least one auditor.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(auditForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('New audit cycle scheduled.', 'success');
        setShowCreateModal(false);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Creation failed.', 'error');
    }
  };

  const handleOpenVerify = (asset) => {
    setVerifyForm({
      assetId: asset.id,
      status: asset.auditRecord?.status !== 'Unknown' ? asset.auditRecord.status : 'Verified',
      condition: asset.auditRecord?.condition || asset.condition,
      notes: asset.auditRecord?.notes || ''
    });
    setShowVerifyModal(true);
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/audits/${selectedAuditId}/verify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(verifyForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Asset verified and status saved.', 'success');
        setShowVerifyModal(false);
        loadAuditDetails(selectedAuditId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Verification failed.', 'error');
    }
  };

  const handleCloseAudit = async () => {
    if (!window.confirm('WARNING: Closing this audit cycle will LOCK all verification records, mark MISSING assets as "Lost", and write audit history permanently to scoped assets. Proceed?')) return;
    try {
      const res = await fetch(`/api/audits/${selectedAuditId}/close`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Audit cycle CLOSED and locked.', 'success');
        loadAuditDetails(selectedAuditId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Failed to close audit.', 'error');
    }
  };

  const handleAuditorCheckbox = (id, checked) => {
    if (checked) {
      setAuditForm(prev => ({ ...prev, auditors: [...prev.auditors, id] }));
    } else {
      setAuditForm(prev => ({ ...prev, auditors: prev.auditors.filter(a => a !== id) }));
    }
  };

  const getStatusClass = (status) => {
    return status === 'Completed' ? 'badge-success' : 'badge-warning';
  };

  // Columns definition
  const columns = [
    { key: 'name', label: 'Audit Cycle', render: (item) => <span onClick={() => loadAuditDetails(item.id)} style={{ color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}>{item.name}</span> },
    { key: 'departmentName', label: 'Scope Department' },
    { key: 'location', label: 'Scope Location', render: (item) => item.location || 'All Locations' },
    { key: 'auditorNames', label: 'Assigned Auditors', render: (item) => item.auditorNames.join(', ') },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'End Date' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => <span className={`badge ${getStatusClass(item.status)}`}>{item.status}</span> 
    }
  ];

  if (loading && audits.length === 0) {
    return <div className="content-wrapper"><h2>Loading Audit Cycles...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Audit Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Establish inventory counts, scan barcodes, check asset condition, and track discrepancies</p>
        </div>
        {user?.role === 'Admin' && (
          <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
            <Plus size={14} /> Schedule Cycle
          </button>
        )}
      </div>

      <Table
        columns={columns}
        data={audits}
        searchKey="name"
        searchPlaceholder="Search audit cycles..."
        exportFilename="audit_cycles"
      />

      {/* ==========================================
          DETAILS DRAWERS (SLIDE-OUT FROM RIGHT)
      ========================================== */}
      <DetailsDrawer
        isOpen={!!selectedAuditId && !!auditDetails}
        onClose={() => { setSelectedAuditId(null); setAuditDetails(null); }}
        title={`Audit checklist: ${auditDetails?.name}`}
      >
        {auditDetails && (
          <div>
            {/* Meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Scope Unit</span>
                <strong>{auditDetails.departmentName || 'All Departments'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Scope Location</span>
                <strong>{auditDetails.location || 'All Locations'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Cycle Period</span>
                <span>{auditDetails.startDate} to {auditDetails.endDate}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Cycle Status</span>
                <span className={`badge ${getStatusClass(auditDetails.status)}`}>{auditDetails.status}</span>
              </div>
            </div>

            {/* Admin Close Lock Action */}
            {auditDetails.status !== 'Completed' && user?.role === 'Admin' && (
              <div className="card" style={{ padding: '16px', marginBottom: '20px', border: '1px solid #FDE68A', backgroundColor: '#FFFBEB' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
                  <div>
                    <h5 style={{ margin: 0 }}>Close & Lock Audit Cycle</h5>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Locks records. Assets marked "Missing" transition to "Lost" status.
                    </p>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: '12px' }} onClick={handleCloseAudit}>
                  <Lock size={12} /> Lock Audit & Update Inventory
                </button>
              </div>
            )}

            {/* Scoped Assets Checklist Table */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>Assets Checklist ({auditDetails.assets?.length || 0})</h4>
                <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>Verified: {auditDetails.stats?.verified}</span>
                  <span>•</span>
                  <span>Missing: {auditDetails.stats?.missing}</span>
                  <span>•</span>
                  <span>Damaged: {auditDetails.stats?.damaged}</span>
                </div>
              </div>

              {auditDetails.assets?.length === 0 ? (
                <div className="empty-state" style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  No assets in this department or location.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="responsive-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ padding: '10px' }}>Tag</th>
                        <th style={{ padding: '10px' }}>Asset Name</th>
                        <th style={{ padding: '10px' }}>Verified Status</th>
                        <th style={{ padding: '10px' }}>Condition</th>
                        {auditDetails.status !== 'Completed' && <th style={{ padding: '10px' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {auditDetails.assets?.map((asset) => {
                        const rec = asset.auditRecord;
                        let textClass = 'badge-gray';
                        if (rec.status === 'Verified') textClass = 'badge-success';
                        else if (rec.status === 'Missing') textClass = 'badge-danger';
                        else if (rec.status === 'Damaged') textClass = 'badge-warning';

                        return (
                          <tr key={asset.id}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>{asset.assetTag}</td>
                            <td style={{ padding: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={asset.name}>
                              {asset.name}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span className={`badge ${textClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>{rec.status}</span>
                            </td>
                            <td style={{ padding: '10px' }}>{rec.condition || asset.condition}</td>
                            {auditDetails.status !== 'Completed' && (
                              <td style={{ padding: '10px' }}>
                                <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleOpenVerify(asset)}>
                                  Verify
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Discrepancy Report List */}
            {auditDetails.status === 'Completed' && (
              <div>
                <h4 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Audit Discrepancy Log</h4>
                {auditDetails.discrepancyReport?.length === 0 ? (
                  <div className="alert-box alert-box-info" style={{ fontSize: '12px' }}>
                    <strong>Discrepancy Check passed:</strong> All expected assets were verified and intact.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {auditDetails.discrepancyReport?.map((dis, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          padding: '10px 12px', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '8px',
                          fontSize: '12px',
                          backgroundColor: dis.auditedStatus === 'Missing' ? 'var(--danger-light)' : 'var(--warning-light)',
                          color: dis.auditedStatus === 'Missing' ? '#7F1D1D' : '#78350F'
                        }}
                      >
                        <strong>{dis.assetTag} - {dis.name}</strong>
                        <div>Expected State: {dis.expectedStatus} | Verified: {dis.auditedStatus} ({dis.auditedCondition})</div>
                        {dis.notes && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>Notes: {dis.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </DetailsDrawer>

      {/* ==========================================
          MODALS
      ========================================== */}

      {/* 1. Schedule Audit Cycle */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Schedule New Audit Cycle"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSubmit}>Schedule Audit</button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <div className="form-group">
            <label className="form-label">Audit Cycle Title *</label>
            <input
              type="text" className="form-control" required placeholder="e.g. Q3 IT Assets Audit"
              value={auditForm.name} onChange={e => setAuditForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Scope Department</label>
              <select
                className="form-control"
                value={auditForm.departmentId} onChange={e => setAuditForm(prev => ({ ...prev, departmentId: e.target.value }))}
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Scope Location</label>
              <input
                type="text" className="form-control" placeholder="e.g. London HQ"
                value={auditForm.location} onChange={e => setAuditForm(prev => ({ ...prev, location: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date" className="form-control" required
                value={auditForm.startDate} onChange={e => setAuditForm(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input
                type="date" className="form-control" required
                value={auditForm.endDate} onChange={e => setAuditForm(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Assign Auditors * (Choose at least one)</label>
            <div 
              style={{ 
                maxHeight: '120px', 
                overflowY: 'auto', 
                border: '1px solid var(--border-color)', 
                padding: '8px', 
                borderRadius: '6px' 
              }}
            >
              {employees.filter(emp => emp.status === 'Active' && emp.role !== 'Employee').map(emp => (
                <label 
                  key={emp.id} 
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={auditForm.auditors.includes(emp.id)}
                    onChange={(e) => handleAuditorCheckbox(emp.id, e.target.checked)}
                  />
                  {emp.name} ({emp.role})
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Scope/Auditing Instructions</label>
            <textarea
              className="form-control" rows="2" placeholder="e.g. Scan all laptop barcodes in floor 3."
              value={auditForm.description} onChange={e => setAuditForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* 2. Verify Scoped Asset Modal */}
      <Modal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        title="Verify Asset Integrity"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleVerifySubmit}>Save Verification</button>
          </>
        }
      >
        <form onSubmit={handleVerifySubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Verified Status *</label>
              <select
                className="form-control" required
                value={verifyForm.status} onChange={e => setVerifyForm(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="Verified">Verified (Asset present)</option>
                <option value="Missing">Missing (Asset not found)</option>
                <option value="Damaged">Damaged (Requires attention)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Recorded Condition *</label>
              <select
                className="form-control" required
                value={verifyForm.condition} onChange={e => setVerifyForm(prev => ({ ...prev, condition: e.target.value }))}
              >
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Auditor's Notes</label>
            <textarea
              className="form-control" rows="2" placeholder="e.g. Screen has minor scratches, otherwise intact."
              value={verifyForm.notes} onChange={e => setVerifyForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Audits;
