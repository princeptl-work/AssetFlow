import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import Table from '../components/Table';
import DetailsDrawer from '../components/DetailsDrawer';
import { ArrowRightLeft, CheckCircle, Ban, Clock } from 'lucide-react';

const Transfers = () => {
  const { token, user, showToast } = useAuth();
  const { fetchNotifications } = useNotifications();

  // Core Data States
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected Transfer Drawer
  const [selectedTransferId, setSelectedTransferId] = useState(null);
  const [transferDetails, setTransferDetails] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/transfers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTransfers(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const loadTransferDetails = (id) => {
    const item = transfers.find(t => t.id === id);
    if (item) {
      setTransferDetails(item);
      setSelectedTransferId(id);
      setRejectReason('');
    }
  };

  const handleApproveDept = async () => {
    try {
      const res = await fetch(`/api/transfers/${selectedTransferId}/approve-dept`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Department approval submitted successfully.', 'success');
        fetchNotifications();
        fetchData();
        setSelectedTransferId(null);
        setTransferDetails(null);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Department approval failed.', 'error');
    }
  };

  const handleApproveManager = async () => {
    try {
      const res = await fetch(`/api/transfers/${selectedTransferId}/approve-manager`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Transfer completed. Asset officially reallocated.', 'success');
        fetchNotifications();
        fetchData();
        setSelectedTransferId(null);
        setTransferDetails(null);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Final approval failed.', 'error');
    }
  };

  const handleReject = async () => {
    try {
      const res = await fetch(`/api/transfers/${selectedTransferId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reason: rejectReason })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Transfer request rejected.', 'success');
        fetchNotifications();
        fetchData();
        setSelectedTransferId(null);
        setTransferDetails(null);
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Rejection failed.', 'error');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Reallocated': return 'badge-success';
      case 'Dept Head Approved': return 'badge-info';
      case 'Rejected': return 'badge-danger';
      default: return 'badge-warning'; // Requested
    }
  };

  // Columns definition
  const columns = [
    { key: 'id', label: 'Req ID', render: (item) => <span onClick={() => loadTransferDetails(item.id)} style={{ color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}>{item.id.split('-')[0]}</span> },
    { key: 'assetTag', label: 'Asset Tag', render: (item) => <strong>{item.assetTag}</strong> },
    { key: 'assetName', label: 'Asset Name' },
    { key: 'requesterName', label: 'Requested By' },
    { key: 'targetUserName', label: 'Target Employee', render: (item) => item.targetUserName || <span style={{ color: 'var(--text-light)' }}>-</span> },
    { key: 'targetDepartmentName', label: 'Target Department', render: (item) => item.targetDepartmentName || <span style={{ color: 'var(--text-light)' }}>-</span> },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span> 
    },
    { key: 'requestDate', label: 'Date Filed', render: (item) => new Date(item.requestDate).toLocaleDateString() }
  ];

  if (loading && transfers.length === 0) {
    return <div className="content-wrapper"><h2>Loading Transfer Records...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '26px' }}>Asset Reallocation Transfers</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Track relocation workflows, approvals, and chain of custody changes across divisions</p>
      </div>

      <Table
        columns={columns}
        data={transfers}
        searchKey="assetTag"
        searchPlaceholder="Search asset tag..."
        exportFilename="asset_transfers"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['Requested', 'Dept Head Approved', 'Reallocated', 'Rejected'].map(s => ({ value: s, label: s }))
          }
        ]}
      />

      {/* ==========================================
          DETAILS DRAWERS (SLIDE-OUT FROM RIGHT)
      ========================================== */}
      <DetailsDrawer
        isOpen={!!selectedTransferId && !!transferDetails}
        onClose={() => { setSelectedTransferId(null); setTransferDetails(null); }}
        title={`Transfer order: ${transferDetails?.id.split('-')[0]}`}
      >
        {transferDetails && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Asset</span>
                <strong>{transferDetails.assetName} ({transferDetails.assetTag})</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Request Status</span>
                <span className={`badge ${getStatusBadgeClass(transferDetails.status)}`}>{transferDetails.status}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Requested By</span>
                <span>{transferDetails.requesterName}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Date Filed</span>
                <span>{new Date(transferDetails.requestDate).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Target Employee</span>
                <span>{transferDetails.targetUserName || 'Unassigned'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Target Division</span>
                <span>{transferDetails.targetDepartmentName || 'Unassigned'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Requester Notes</span>
              <p style={{ fontSize: '13px', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', margin: 0 }}>
                {transferDetails.notes || 'No notes provided.'}
              </p>
            </div>

            {/* Workflow Timeline */}
            <div style={{ marginBottom: '24px' }}>
              <h4>Approvals Timeline</h4>
              <div className="timeline" style={{ marginTop: '12px' }}>
                <div className="timeline-item">
                  <div className="timeline-marker Created" />
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span>Request Filed</span>
                      <span className="timeline-time">{new Date(transferDetails.requestDate).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>By: {transferDetails.requesterName}</div>
                  </div>
                </div>

                {transferDetails.deptHeadApprovalDate && (
                  <div className="timeline-item">
                    <div className="timeline-marker Transferred" />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span>Department Head Approval</span>
                        <span className="timeline-time">{new Date(transferDetails.deptHeadApprovalDate).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status: Released to Logistics</div>
                    </div>
                  </div>
                )}

                {transferDetails.assetManagerApprovalDate && (
                  <div className="timeline-item">
                    <div className="timeline-marker Returned" />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span>Final Manager Approval</span>
                        <span className="timeline-time">{new Date(transferDetails.assetManagerApprovalDate).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status: Reallocated</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions panel */}
            <div className="card" style={{ padding: '16px' }}>
              <h4>Relocation Approvals</h4>
              <div style={{ marginTop: '12px' }}>
                
                {/* 1. Requested -> Dept Head Approve (Dept Head or Admin) */}
                {transferDetails.status === 'Requested' && (user?.role === 'Admin' || user?.role === 'Department Head') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="alert-box alert-box-warning" style={{ margin: 0 }}>
                      <Clock size={18} />
                      <span>Pending Department Head authorization to release this asset.</span>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleApproveDept}>
                      <CheckCircle size={14} /> Authorize Release (Approve)
                    </button>
                  </div>
                )}

                {/* 2. Dept Head Approved -> Manager Final Approve (Asset Manager or Admin) */}
                {transferDetails.status === 'Dept Head Approved' && (user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="alert-box alert-box-info" style={{ margin: 0 }}>
                      <CheckCircle size={18} />
                      <span>Released by Department. Pending final Asset Manager allocation approval.</span>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleApproveManager}>
                      <CheckCircle size={14} /> Complete Transfer (Reallocate)
                    </button>
                  </div>
                )}

                {/* Direct Approve bypass for Admin if Requested */}
                {transferDetails.status === 'Requested' && user?.role === 'Admin' && (
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: '10px' }} onClick={handleApproveManager}>
                    Admin Bypass: Approve Reallocation
                  </button>
                )}

                {/* Rejection form (for any non-final state, based on credentials) */}
                {(transferDetails.status === 'Requested' || transferDetails.status === 'Dept Head Approved') && 
                 (user?.role === 'Admin' || user?.role === 'Asset Manager' || user?.role === 'Department Head') && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Rejection Reason *</label>
                      <input 
                        type="text" className="form-control" placeholder="e.g. Asset required for local project."
                        value={rejectReason} onChange={e => setRejectReason(e.target.value)} required
                      />
                    </div>
                    <button className="btn btn-danger btn-sm" style={{ width: '100%' }} onClick={handleReject} disabled={!rejectReason.trim()}>
                      <Ban size={14} /> Reject Transfer Request
                    </button>
                  </div>
                )}

                {/* Immutable states */}
                {transferDetails.status === 'Reallocated' && (
                  <div style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                    This asset transfer has been completed and reallocated.
                  </div>
                )}
                {transferDetails.status === 'Rejected' && (
                  <div style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                    This transfer request was rejected.
                  </div>
                )}

              </div>
            </div>

          </div>
        )}
      </DetailsDrawer>

    </div>
  );
};

export default Transfers;
