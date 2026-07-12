import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { PieChart, BarChart, LineChart } from '../components/CustomCharts';
import Modal from '../components/Modal';
import { 
  FolderPlus, 
  UserCheck, 
  CalendarPlus, 
  Wrench,
  Package,
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { user, token, showToast } = useAuth();
  const { fetchNotifications } = useNotifications();
  const navigate = useNavigate();

  // Dashboard Data State
  const [assets, setAssets] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Quick Action Modal States
  const [activeModal, setActiveModal] = useState(null); // 'register' | 'allocate' | 'book' | 'maintenance'

  // Dropdown options
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Form Fields State
  const [assetForm, setAssetForm] = useState({ name: '', categoryId: '', serialNumber: '', modelNumber: '', manufacturer: '', condition: 'Excellent', location: '', bookable: 'No', remarks: '', photo: '', documents: '' });
  const [allocateForm, setAllocateForm] = useState({ assetId: '', employeeId: '', departmentId: '', expectedReturnDate: '', notes: '' });
  const [conflictDetails, setConflictDetails] = useState(null);
  const [bookingForm, setBookingForm] = useState({ resourceType: 'Meeting Room', assetId: '', purpose: '', startTime: '', endTime: '' });
  const [maintenanceForm, setMaintenanceForm] = useState({ assetId: '', issue: '', priority: 'Medium', description: '' });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [assetsRes, bookingsRes, maintRes, transRes, logsRes, catsRes, deptsRes, empsRes] = await Promise.all([
        fetch('/api/assets', { headers }),
        fetch('/api/bookings', { headers }),
        fetch('/api/maintenance', { headers }),
        fetch('/api/transfers', { headers }),
        fetch('/api/logs', { headers }).then(r => r.ok ? r.json() : []), // Handle admin logs restriction
        fetch('/api/organization/categories', { headers }),
        fetch('/api/organization/departments', { headers }),
        fetch('/api/auth/employees', { headers })
      ]);

      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (bookingsRes.ok) setBookings(await bookingsRes.json());
      if (maintRes.ok) setMaintenance(await maintRes.json());
      if (transRes.ok) setTransfers(await transRes.json());
      if (Array.isArray(logsRes)) setLogs(logsRes);
      if (catsRes.ok) setCategories(await catsRes.json());
      if (deptsRes.ok) setDepartments(await deptsRes.json());
      if (empsRes.ok) setEmployees(await empsRes.json());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Dashboard Aggregates & KPIs
  const totalAssets = assets.length;
  const availableAssets = assets.filter(a => a.status === 'Available').length;
  const allocatedAssets = assets.filter(a => a.status === 'Allocated').length;
  const maintAssets = assets.filter(a => a.status === 'Under Maintenance').length;
  const activeBookings = bookings.filter(b => b.status === 'Upcoming' || b.status === 'Ongoing').length;
  const pendingTransfersCount = transfers.filter(t => t.status === 'Requested' || t.status === 'Dept Head Approved').length;

  const todayStr = new Date().toISOString().split('T')[0];
  const overdueReturns = assets.filter(a => {
    return a.status === 'Allocated' && a.expectedReturnDate && a.expectedReturnDate < todayStr;
  });

  const upcomingReturns = assets.filter(a => {
    if (a.status !== 'Allocated' || !a.expectedReturnDate || a.expectedReturnDate < todayStr) return false;
    const diffTime = new Date(a.expectedReturnDate) - new Date(todayStr);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });

  // Chart Data Calculations
  // 1. Status Distribution
  const statusCounts = assets.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const statusColors = {
    'Available': '#10B981', 'Allocated': '#875A7B', 'Reserved': '#F59E0B', 
    'Under Maintenance': '#EF4444', 'Lost': '#6B7280', 'Retired': '#475569', 'Disposed': '#1E293B'
  };
  const statusChartData = Object.keys(statusCounts).map(status => ({
    name: status,
    value: statusCounts[status],
    color: statusColors[status] || '#94A3B8'
  }));

  // 2. Department-wise Allocation
  const deptAllocCounts = assets.reduce((acc, a) => {
    if (a.status === 'Allocated' && a.departmentName) {
      acc[a.departmentName] = (acc[a.departmentName] || 0) + 1;
    }
    return acc;
  }, {});
  const deptChartData = Object.keys(deptAllocCounts).map(dept => ({
    name: dept,
    value: deptAllocCounts[dept]
  })).slice(0, 6); // Top 6

  // 3. Category Distribution
  const catCounts = assets.reduce((acc, a) => {
    if (a.categoryName) {
      acc[a.categoryName] = (acc[a.categoryName] || 0) + 1;
    }
    return acc;
  }, {});
  const catChartData = Object.keys(catCounts).map(catName => {
    const catObj = categories.find(c => c.name === catName);
    return {
      name: catName,
      value: catCounts[catName],
      color: catObj ? catObj.color : '#875A7B'
    };
  }).slice(0, 6);

  // 4. Maintenance / Booking trends (Mock last 5 days summaries easily from logs/records)
  const last5Days = [...Array(5)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i));
    return d.toISOString().split('T')[0];
  });

  const maintenanceTrend = last5Days.map(date => {
    const count = maintenance.filter(t => t.createdAt && t.createdAt.split('T')[0] === date).length;
    return { name: date.slice(5), value: count };
  });

  const bookingTrend = last5Days.map(date => {
    const count = bookings.filter(b => b.createdAt && b.createdAt.split('T')[0] === date).length;
    return { name: date.slice(5), value: count };
  });

  // Recent Approvals pending for current user role
  const pendingApprovals = [];
  if (user) {
    if (user.role === 'Admin' || user.role === 'Asset Manager') {
      transfers.filter(t => t.status === 'Requested' || t.status === 'Dept Head Approved').forEach(t => {
        pendingApprovals.push({ id: t.id, type: 'Transfer', title: `Asset Transfer - ${t.assetTag}`, desc: `Req by: ${t.requesterName} -> Target: ${t.targetUserName}`, link: '/transfers' });
      });
      maintenance.filter(m => m.status === 'Pending').forEach(m => {
        pendingApprovals.push({ id: m.id, type: 'Maintenance', title: `Maintenance Approval`, desc: `${m.assetTag} - ${m.issue} (${m.priority})`, link: '/maintenance' });
      });
    } else if (user.role === 'Department Head') {
      // Pending transfers from their own department assets
      transfers.filter(t => t.status === 'Requested').forEach(t => {
        const assetObj = assets.find(a => a.id === t.assetId);
        if (assetObj && assetObj.departmentId === user.departmentId) {
          pendingApprovals.push({ id: t.id, type: 'Transfer', title: `Dept Transfer Approve`, desc: `Approve release of ${t.assetTag}`, link: '/transfers' });
        }
      });
    }
  }

  // Quick Action submissions
  const handleRegisterAsset = async (e) => {
    e.preventDefault();
    const formattedDocs = assetForm.documents 
      ? assetForm.documents.split(',').map(d => d.trim()).filter(Boolean) 
      : [];

    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...assetForm,
          documents: formattedDocs
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Asset registered successfully: ${data.assetTag}`, 'success');
        setActiveModal(null);
        setAssetForm({ name: '', categoryId: '', serialNumber: '', modelNumber: '', manufacturer: '', condition: 'Excellent', location: '', bookable: 'No', remarks: '', photo: '', documents: '' });
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Error registering asset', 'error');
    }
  };

  const handleAllocateAsset = async (e) => {
    e.preventDefault();
    const { assetId, employeeId, departmentId, expectedReturnDate, notes } = allocateForm;
    if (!assetId) return;

    try {
      const res = await fetch(`/api/assets/${assetId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ employeeId, departmentId, expectedReturnDate, notes })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Asset allocated successfully.', 'success');
        setActiveModal(null);
        setConflictDetails(null);
        setAllocateForm({ assetId: '', employeeId: '', departmentId: '', expectedReturnDate: '', notes: '' });
        fetchData();
      } else {
        if (res.status === 400 && data.allocationDetails) {
          setConflictDetails(data.allocationDetails);
        }
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Allocation failed', 'error');
    }
  };

  const handleBookResource = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(bookingForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Resource booking confirmed!', 'success');
        setActiveModal(null);
        setBookingForm({ resourceType: 'Meeting Room', assetId: '', purpose: '', startTime: '', endTime: '' });
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Booking failed', 'error');
    }
  };

  const handleRaiseMaintenance = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(maintenanceForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Maintenance request ticket raised.', 'success');
        setActiveModal(null);
        setMaintenanceForm({ assetId: '', issue: '', priority: 'Medium', description: '' });
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Failed to raise request', 'error');
    }
  };

  if (loading && assets.length === 0) {
    return (
      <div className="content-wrapper">
        <h2>Loading Enterprise Dashboard...</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '24px' }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: '100px' }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Enterprise Workspace</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Overview of physical asset allocations, audits, and resource scheduling</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchData}>Refresh Data</button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Package size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Total Assets</span>
            <span className="kpi-value">{totalAssets}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
            <Package size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Available</span>
            <span className="kpi-value">{availableAssets}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(135, 90, 123, 0.1)', color: 'var(--primary)' }}>
            <UserCheck size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Allocated</span>
            <span className="kpi-value">{allocatedAssets}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
            <Wrench size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">In Maintenance</span>
            <span className="kpi-value">{maintAssets}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
            <CalendarPlus size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Active Bookings</span>
            <span className="kpi-value">{activeBookings}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
            <ArrowRightLeft size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Pending Transfers</span>
            <span className="kpi-value">{pendingTransfersCount}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>
            <ClipboardList size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label">Upcoming Returns</span>
            <span className="kpi-value">{upcomingReturns.length}</span>
          </div>
        </div>

        <div className="kpi-card" style={{ border: overdueReturns.length > 0 ? '1px solid var(--danger)' : '1px solid var(--border-color)' }}>
          <div className="kpi-icon" style={{ backgroundColor: overdueReturns.length > 0 ? 'var(--danger-light)' : '#F1F5F9', color: overdueReturns.length > 0 ? 'var(--danger)' : '#475569' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="kpi-data">
            <span className="kpi-label" style={{ color: overdueReturns.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>Overdue Returns</span>
            <span className="kpi-value" style={{ color: overdueReturns.length > 0 ? 'var(--danger)' : '#1E293B' }}>{overdueReturns.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px' }}>Operational Quick Actions</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {(user?.role === 'Admin' || user?.role === 'Asset Manager') && (
            <button className="btn btn-primary" onClick={() => setActiveModal('register')}>
              <FolderPlus size={16} /> Register Asset
            </button>
          )}
          {user?.role === 'Asset Manager' && (
            <button className="btn btn-secondary" onClick={() => setActiveModal('allocate')}>
              <UserCheck size={16} /> Allocate Asset
            </button>
          )}
          {user?.role !== 'Admin' && (
            <button className="btn btn-secondary" onClick={() => setActiveModal('book')}>
              <CalendarPlus size={16} /> Book Resource
            </button>
          )}
          {user?.role !== 'Admin' && (
            <button className="btn btn-secondary" onClick={() => setActiveModal('maintenance')}>
              <Wrench size={16} /> Request Maintenance
            </button>
          )}
        </div>
      </div>

      {/* Interactive Charts Panel */}
      <div className="charts-grid">
        <div className="card chart-card">
          <h3 className="card-title">Asset Status Distribution</h3>
          <div className="chart-container">
            <PieChart data={statusChartData} />
          </div>
        </div>

        <div className="card chart-card">
          <h3 className="card-title">Department Allocation</h3>
          <div className="chart-container">
            {deptChartData.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No allocations recorded yet</span>
            ) : (
              <BarChart data={deptChartData} />
            )}
          </div>
        </div>

        <div className="card chart-card">
          <h3 className="card-title">Asset Category Distribution</h3>
          <div className="chart-container">
            <PieChart data={catChartData} />
          </div>
        </div>

        <div className="card chart-card">
          <h3 className="card-title">Maintenance Volume</h3>
          <div className="chart-container">
            <LineChart data={maintenanceTrend} />
          </div>
        </div>

        <div className="card chart-card">
          <h3 className="card-title">Bookings Trend</h3>
          <div className="chart-container">
            <LineChart data={bookingTrend} />
          </div>
        </div>
      </div>

      {/* Bottom widgets grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        
        {/* Pending Approvals Widget */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="card-title">Pending Approvals</h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendingApprovals.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <span style={{ fontSize: '13px' }}>All caught up! No approvals pending.</span>
              </div>
            ) : (
              pendingApprovals.slice(0, 5).map((app) => (
                <div 
                  key={`${app.type}-${app.id}`} 
                  onClick={() => navigate(app.link)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div>
                    <span className="badge badge-info" style={{ fontSize: '9px', padding: '2px 6px', marginBottom: '4px' }}>{app.type}</span>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B' }}>{app.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{app.desc}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-light)' }} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Overdue / Upcoming Returns */}
        <div className="card">
          <h3 className="card-title">Return Calendar Alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {overdueReturns.length === 0 && upcomingReturns.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <span style={{ fontSize: '13px' }}>No returns expected in the near term.</span>
              </div>
            ) : (
              <>
                {overdueReturns.slice(0, 3).map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyBetween: 'space-between', border: '1px solid var(--danger)', backgroundColor: 'var(--danger-light)', padding: '10px 14px', borderRadius: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger)' }}>OVERDUE: {a.name} ({a.assetTag})</div>
                      <div style={{ fontSize: '11px', color: '#7F1D1D' }}>Allocated to: {a.allocatedToName || 'Employee'} | Expected: {a.expectedReturnDate}</div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => navigate('/assets')}>Return</button>
                  </div>
                ))}
                {upcomingReturns.slice(0, 3).map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyBetween: 'space-between', border: '1px solid var(--warning)', backgroundColor: 'var(--warning-light)', padding: '10px 14px', borderRadius: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--warning)' }}>Returns soon: {a.name} ({a.assetTag})</div>
                      <div style={{ fontSize: '11px', color: '#78350F' }}>Allocated to: {a.allocatedToName || 'Employee'} | Expected: {a.expectedReturnDate}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/assets')}>Return</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Recent Activities Widget */}
        {user?.role === 'Admin' && (
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3 className="card-title">Recent Administrative Logs</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 5).map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: '600' }}>{l.userName}</td>
                      <td>
                        <span className="badge badge-gray" style={{ fontSize: '10px', padding: '2px 6px' }}>{l.action}</span>
                      </td>
                      <td>{l.entity}: {l.entityId}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{new Date(l.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          QUICK ACTION MODALS
      ========================================== */}

      {/* Modal 1: Register Asset */}
      <Modal 
        isOpen={activeModal === 'register'} 
        onClose={() => setActiveModal(null)}
        title="Quick Register Asset"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRegisterAsset}>Save Asset</button>
          </>
        }
      >
        <form onSubmit={handleRegisterAsset}>
          <div className="form-group">
            <label className="form-label">Asset Name *</label>
            <input 
              type="text" className="form-control" required
              value={assetForm.name} onChange={e => setAssetForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select 
                className="form-control" required
                value={assetForm.categoryId} onChange={e => setAssetForm(prev => ({ ...prev, categoryId: e.target.value }))}
              >
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Condition *</label>
              <select 
                className="form-control" required
                value={assetForm.condition} onChange={e => setAssetForm(prev => ({ ...prev, condition: e.target.value }))}
              >
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Serial Number</label>
              <input 
                type="text" className="form-control" 
                value={assetForm.serialNumber} onChange={e => setAssetForm(prev => ({ ...prev, serialNumber: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model Number</label>
              <input 
                type="text" className="form-control"
                value={assetForm.modelNumber} onChange={e => setAssetForm(prev => ({ ...prev, modelNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Manufacturer</label>
              <input 
                type="text" className="form-control"
                value={assetForm.manufacturer} onChange={e => setAssetForm(prev => ({ ...prev, manufacturer: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bookable Shared Resource?</label>
              <select 
                className="form-control"
                value={assetForm.bookable} onChange={e => setAssetForm(prev => ({ ...prev, bookable: e.target.value }))}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Photo URL</label>
            <input 
              type="text" className="form-control" placeholder="https://example.com/photo.jpg"
              value={assetForm.photo} onChange={e => setAssetForm(prev => ({ ...prev, photo: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Document Links (comma-separated URLs)</label>
            <input 
              type="text" className="form-control" placeholder="https://link1.pdf, https://link2.pdf"
              value={assetForm.documents} onChange={e => setAssetForm(prev => ({ ...prev, documents: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* Modal 2: Allocate Asset */}
      <Modal
        isOpen={activeModal === 'allocate'}
        onClose={() => { setActiveModal(null); setConflictDetails(null); }}
        title="Quick Allocate Asset"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setActiveModal(null); setConflictDetails(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAllocateAsset}>Allocate</button>
          </>
        }
      >
        <form onSubmit={handleAllocateAsset}>
          {conflictDetails && (
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', marginBottom: '12px', fontSize: '12px' }}>
              <strong>Double Allocation Conflict:</strong>
              <div style={{ marginTop: '4px' }}>
                Currently held by {conflictDetails.employeeName || 'Department'} ({conflictDetails.departmentName || 'N/A'}) since {conflictDetails.allocationDate}.
              </div>
              <div style={{ marginTop: '8px' }}>
                Please navigate to the <strong>Transfers</strong> screen or the <strong>Assets</strong> detail drawer to request a transfer for this asset.
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Select Asset *</label>
            <select
              className="form-control" required
              value={allocateForm.assetId} onChange={e => setAllocateForm(prev => ({ ...prev, assetId: e.target.value }))}
            >
              <option value="">Select Asset (Available/Reserved)</option>
              {assets.filter(a => a.status === 'Available' || a.status === 'Reserved').map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Allocate to Employee</label>
              <select
                className="form-control"
                value={allocateForm.employeeId} onChange={e => setAllocateForm(prev => ({ ...prev, employeeId: e.target.value }))}
              >
                <option value="">Select Employee</option>
                {employees.filter(emp => emp.status === 'Active').map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Allocate to Department</label>
              <select
                className="form-control"
                value={allocateForm.departmentId} onChange={e => setAllocateForm(prev => ({ ...prev, departmentId: e.target.value }))}
              >
                <option value="">Select Department</option>
                {departments.filter(d => d.status === 'Active').map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Expected Return Date</label>
            <input
              type="date" className="form-control"
              value={allocateForm.expectedReturnDate} onChange={e => setAllocateForm(prev => ({ ...prev, expectedReturnDate: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Allocation Notes</label>
            <textarea
              className="form-control" rows="2"
              value={allocateForm.notes} onChange={e => setAllocateForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* Modal 3: Book Resource */}
      <Modal
        isOpen={activeModal === 'book'}
        onClose={() => setActiveModal(null)}
        title="Quick Book Resource"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleBookResource}>Book Resource</button>
          </>
        }
      >
        <form onSubmit={handleBookResource}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Resource Type *</label>
              <select
                className="form-control" required
                value={bookingForm.resourceType} onChange={e => setBookingForm(prev => ({ ...prev, resourceType: e.target.value }))}
              >
                <option value="Meeting Room">Meeting Room</option>
                <option value="Conference Room">Conference Room</option>
                <option value="Vehicle">Vehicle</option>
                <option value="Projector">Projector</option>
                <option value="Lab">Testing Lab</option>
                <option value="Equipment">Equipment</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Target Asset (Optional)</label>
              <select
                className="form-control"
                value={bookingForm.assetId} onChange={e => setBookingForm(prev => ({ ...prev, assetId: e.target.value }))}
              >
                <option value="">Select Specific Asset (If Bookable)</option>
                {assets.filter(a => a.bookable === 'Yes' && a.status === 'Available').map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Purpose of Booking *</label>
            <input
              type="text" className="form-control" required placeholder="e.g. Weekly Operations Sync"
              value={bookingForm.purpose} onChange={e => setBookingForm(prev => ({ ...prev, purpose: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Time *</label>
              <input
                type="datetime-local" className="form-control" required
                value={bookingForm.startTime} onChange={e => setBookingForm(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Time *</label>
              <input
                type="datetime-local" className="form-control" required
                value={bookingForm.endTime} onChange={e => setBookingForm(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Raise Maintenance */}
      <Modal
        isOpen={activeModal === 'maintenance'}
        onClose={() => setActiveModal(null)}
        title="Raise Maintenance Ticket"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRaiseMaintenance}>File Ticket</button>
          </>
        }
      >
        <form onSubmit={handleRaiseMaintenance}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Select Asset *</label>
              <select
                className="form-control" required
                value={maintenanceForm.assetId} onChange={e => setMaintenanceForm(prev => ({ ...prev, assetId: e.target.value }))}
              >
                <option value="">Select Asset</option>
                {/* Employees can request for any asset, typically their own, let's load all */}
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.assetTag}) - Status: {a.status}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority *</label>
              <select
                className="form-control" required
                value={maintenanceForm.priority} onChange={e => setMaintenanceForm(prev => ({ ...prev, priority: e.target.value }))}
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
              type="text" className="form-control" required placeholder="e.g. Battery not holding charge"
              value={maintenanceForm.issue} onChange={e => setMaintenanceForm(prev => ({ ...prev, issue: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Detailed Description</label>
            <textarea
              className="form-control" rows="3" placeholder="Explain the symptoms or damage..."
              value={maintenanceForm.description} onChange={e => setMaintenanceForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Dashboard;
