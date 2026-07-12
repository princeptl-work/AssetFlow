import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import { ShieldAlert, ArrowRight, Terminal } from 'lucide-react';

const Logs = () => {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error('Failed to load system logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  if (user && user.role !== 'Admin') {
    return (
      <div className="content-wrapper">
        <div className="alert-box alert-box-danger">
          <ShieldAlert size={20} />
          <div>
            <strong>Access Denied:</strong> Only system Administrators are authorized to view administrative system logs.
          </div>
        </div>
      </div>
    );
  }

  // Prettify previous and new values for grid rendering
  const renderLogValues = (val) => {
    if (!val) return <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>None</span>;
    
    // Check if it's JSON
    if (val.startsWith('{') || val.startsWith('[')) {
      try {
        const parsed = JSON.parse(val);
        // If it's a simple flat object
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return (
            <div style={{ fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-all', backgroundColor: '#F1F5F9', padding: '6px', borderRadius: '4px', maxWidth: '280px', fontFamily: 'monospace' }}>
              {Object.keys(parsed).map(k => (
                <div key={k}>{k}: {String(parsed[k])}</div>
              ))}
            </div>
          );
        }
      } catch (err) {
        // fallback to normal text
      }
    }
    return <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{val}</span>;
  };

  const columns = [
    { key: 'timestamp', label: 'Timestamp', render: (item) => new Date(item.timestamp).toLocaleString() },
    { key: 'userName', label: 'User Actor', render: (item) => <strong>{item.userName}</strong> },
    { 
      key: 'action', 
      label: 'Action', 
      render: (item) => (
        <span className="badge badge-gray" style={{ fontSize: '11px', padding: '3px 8px' }}>
          {item.action}
        </span>
      ) 
    },
    { key: 'entity', label: 'Target Entity' },
    { key: 'entityId', label: 'Entity ID', render: (item) => <span style={{ fontFamily: 'monospace' }}>{item.entityId}</span> },
    { key: 'previousValue', label: 'Previous Value State', render: (item) => renderLogValues(item.previousValue) },
    { key: 'newValue', label: 'New Value State', render: (item) => renderLogValues(item.newValue) },
    { key: 'ip', label: 'IP Address', render: (item) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.ip}</span> }
  ];

  if (loading && logs.length === 0) {
    return <div className="content-wrapper"><h2>Loading System Logs...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>System Audit Trails</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Chronological database modifications and administrative operations log</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
          Refresh Audit Trail
        </button>
      </div>

      <Table
        columns={columns}
        data={logs}
        searchKey="userName"
        searchPlaceholder="Search actor user..."
        exportFilename="system_activity_logs"
        filters={[
          {
            key: 'entity',
            label: 'Entity',
            options: ['User', 'Asset', 'Department', 'Category', 'Booking', 'Maintenance', 'Audit', 'Transfer'].map(e => ({ value: e, label: e }))
          },
          {
            key: 'action',
            label: 'Actions',
            options: ['Signup', 'Login', 'Create', 'Update', 'Delete', 'Allocate', 'Return', 'Promote', 'Deactivate', 'Approve', 'Reject', 'Close'].map(a => ({ value: a, label: a }))
          }
        ]}
      />
    </div>
  );
};

export default Logs;
