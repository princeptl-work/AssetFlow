import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { FileText, CheckCircle, XCircle, Clock, Plus, Search, FileSignature } from 'lucide-react';

const Requests = () => {
  const { token, user, showToast } = useAuth();
  const { fetchNotifications } = useNotifications();

  // Core Data States
  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // Modals States
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Form Field States
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newAssetId, setNewAssetId] = useState('');
  const [newReason, setNewReason] = useState('');

  // Approval/Rejection Form States
  const [allAssets, setAllAssets] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [reqRes, catRes, assetRes] = await Promise.all([
        fetch('/api/requests', { headers }),
        fetch('/api/organization/categories', { headers }),
        fetch('/api/assets', { headers })
      ]);

      if (reqRes.ok) setRequests(await reqRes.json());
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.filter(c => c.status === 'Active'));
      }
      if (assetRes.ok) setAllAssets(await assetRes.json());
    } catch (err) {
      console.error(err);
      showToast('Failed to load request data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Fetch Available Assets for the request's category
  const fetchAvailableAssetsForCategory = async (categoryId) => {
    try {
      const res = await fetch(`/api/assets?categoryId=${categoryId}&status=Available`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setAvailableAssets(await res.json());
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load available assets.', 'error');
    }
  };

  const handleOpenApprove = (reqItem) => {
    setSelectedRequest(reqItem);
    setSelectedAssetId(reqItem.assetId || '');
    setRemarks('');
    fetchAvailableAssetsForCategory(reqItem.categoryId);
    setShowApproveModal(true);
  };

  const handleOpenReject = (reqItem) => {
    setSelectedRequest(reqItem);
    setRemarks('');
    setShowRejectModal(true);
  };

  const handleCreateRequestSubmit = async (e) => {
    e.preventDefault();
    if (!newAssetId || !newReason) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ assetId: newAssetId, reason: newReason })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Asset request submitted successfully.', 'success');
        setShowRequestModal(false);
        setNewAssetId('');
        setNewReason('');
        fetchData();
      } else {
        showToast(data.message || 'Failed to submit request.', 'error');
      }
    } catch (err) {
      showToast('Network error while submitting request.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAssetId) {
      showToast('Please select an asset to allocate.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/requests/${selectedRequest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Approved', allocatedAssetId: selectedAssetId, remarks })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Request approved and asset allocated successfully.', 'success');
        setShowApproveModal(false);
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message || 'Approval failed.', 'error');
      }
    } catch (err) {
      showToast('Network error during approval.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!remarks) {
      showToast('Please enter rejection remarks.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/requests/${selectedRequest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Rejected', remarks })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Request rejected successfully.', 'success');
        setShowRejectModal(false);
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message || 'Rejection failed.', 'error');
      }
    } catch (err) {
      showToast('Network error during rejection.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Filters logic
  const filteredRequests = requests.filter(r => {
    const matchesSearch = 
      (r.requesterName && r.requesterName.toLowerCase().includes(search.toLowerCase())) ||
      (r.categoryName && r.categoryName.toLowerCase().includes(search.toLowerCase())) ||
      (r.reason && r.reason.toLowerCase().includes(search.toLowerCase()));
    
    if (filterStatus === 'All') return matchesSearch;
    return r.status === filterStatus && matchesSearch;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="status-badge status-available" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} /> Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="status-badge status-lost" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return (
          <span className="status-badge status-reserved" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> Pending
          </span>
        );
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1E293B' }}>Asset Requests</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            {user?.role === 'Employee' 
              ? 'Submit and track requests for equipment and assets.' 
              : 'Review and approve/allocate requested equipment for employees.'}
          </p>
        </div>

        {user?.role !== 'Admin' && (
          <button 
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setShowRequestModal(true)}
          >
            <Plus size={16} />
            <span>New Request</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '1px' }}>
          {['All', 'Pending', 'Approved', 'Rejected'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                fontSize: '14px',
                fontWeight: filterStatus === status ? '600' : '500',
                color: filterStatus === status ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: filterStatus === status ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {status}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search requests..."
            style={{ paddingLeft: '36px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Requests Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Loading asset requests...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          <FileText size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1E293B', marginBottom: '4px' }}>No requests found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No asset requests match your current filters.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--border-color)', color: '#64748B', fontWeight: '600' }}>
                <th style={{ padding: '14px 16px' }}>Request ID</th>
                {user?.role !== 'Employee' && <th style={{ padding: '14px 16px' }}>Employee</th>}
                <th style={{ padding: '14px 16px' }}>Requested Asset</th>
                <th style={{ padding: '14px 16px' }}>Reason</th>
                <th style={{ padding: '14px 16px' }}>Status</th>
                <th style={{ padding: '14px 16px' }}>Allocated Asset</th>
                <th style={{ padding: '14px 16px' }}>Date</th>
                {['Asset Manager', 'Department Head'].includes(user?.role) && <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}>
                  <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--primary)' }}>
                    {r.id.substring(0, 8)}
                  </td>
                  {user?.role !== 'Employee' && (
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '500', color: '#1E293B' }}>{r.requesterName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {r.requesterEmployeeId}</div>
                    </td>
                  )}
                  <td style={{ padding: '14px 16px', fontWeight: '500', color: '#1E293B' }}>
                    {r.requestedAssetName && r.requestedAssetName !== 'N/A' ? (
                      <div>
                        <span>{r.requestedAssetName}</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tag: {r.requestedAssetTag}</div>
                      </div>
                    ) : (
                      <span>{r.categoryName}</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                    {r.reason}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {getStatusBadge(r.status)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {r.allocatedAssetId ? (
                      <div>
                        <span style={{ fontWeight: '500', color: '#1E293B' }}>{r.assetName}</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tag: {r.assetTag}</div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  {['Asset Manager', 'Department Head'].includes(user?.role) && (
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {r.status === 'Pending' ? (
                        (user.role === 'Asset Manager' || (user.role === 'Department Head' && r.requesterDepartmentId === user.departmentId)) ? (
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => handleOpenApprove(r)}
                            >
                              Approve
                            </button>
                            <button 
                              className="btn btn-outline-danger btn-sm"
                              style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #EF4444', color: '#EF4444', background: 'none' }}
                              onClick={() => handleOpenReject(r)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Other Department</span>
                        )
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Processed</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Request Modal */}
      {showRequestModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '450px', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1E293B' }}>Request New Asset</h3>
            <form onSubmit={handleCreateRequestSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Select Available/Reserved Asset *</label>
                <select
                  className="form-control"
                  required
                  value={newAssetId}
                  onChange={(e) => setNewAssetId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                >
                  <option value="">Select Asset</option>
                  {allAssets
                    .filter(a => a.status === 'Available' || a.status === 'Reserved')
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.assetTag}) - {a.status}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Reason / Specifications *</label>
                <textarea
                  className="form-control"
                  rows="3"
                  required
                  placeholder="Specify why you need this asset and any required specifications..."
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowRequestModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve and Allocate Modal */}
      {showApproveModal && selectedRequest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '450px', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#1E293B' }}>Approve & Allocate Asset</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Select an available <strong>{selectedRequest.categoryName}</strong> asset to allocate to <strong>{selectedRequest.requesterName}</strong>.
            </p>
            <form onSubmit={handleApproveSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Available Assets *</label>
                <select
                  className="form-control"
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                >
                  <option value="">Select Asset</option>
                  {availableAssets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.assetTag || 'No Tag'}) - {a.location || 'No Location'}
                    </option>
                  ))}
                </select>
                {availableAssets.length === 0 && (
                  <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px' }}>
                    Warning: There are no 'Available' assets in this category. Create one first.
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Approval Remarks</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Add approval comments..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowApproveModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={actionLoading || availableAssets.length === 0}
                >
                  {actionLoading ? 'Approving...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '450px', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#1E293B' }}>Reject Asset Request</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              State the reason why you are rejecting this request from <strong>{selectedRequest.requesterName}</strong>.
            </p>
            <form onSubmit={handleRejectSubmit}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Rejection Reason *</label>
                <textarea
                  className="form-control"
                  rows="3"
                  required
                  placeholder="Describe the reason for rejection..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowRejectModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ backgroundColor: '#EF4444', borderColor: '#EF4444' }}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Rejecting...' : 'Reject Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Requests;
