import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart, PieChart, LineChart } from '../components/CustomCharts';
import { Download, AlertTriangle, HelpCircle, TrendingUp, Cpu } from 'lucide-react';

const Reports = () => {
  const { token, showToast } = useAuth();

  // Core Data States
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [deptFilter, setDeptFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, 30days, 90days, 1year

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [assetsRes, catRes, deptRes, bookRes, maintRes] = await Promise.all([
        fetch('/api/assets', { headers }),
        fetch('/api/organization/categories', { headers }),
        fetch('/api/organization/departments', { headers }),
        fetch('/api/bookings', { headers }),
        fetch('/api/maintenance', { headers })
      ]);

      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
      if (bookRes.ok) setBookings(await bookRes.json());
      if (maintRes.ok) setMaintenance(await maintRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // ==========================================
  // APPLY REPORT FILTERS
  // ==========================================
  const filteredAssets = assets.filter(a => {
    const matchesDept = deptFilter === 'all' || a.departmentId === deptFilter;
    const matchesCat = catFilter === 'all' || a.categoryId === catFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'all' && a.acquisitionDate) {
      const acqDate = new Date(a.acquisitionDate);
      const diffTime = new Date() - acqDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (dateFilter === '30days') matchesDate = diffDays <= 30;
      else if (dateFilter === '90days') matchesDate = diffDays <= 90;
      else if (dateFilter === '1year') matchesDate = diffDays <= 365;
    }

    return matchesDept && matchesCat && matchesDate;
  });

  // ==========================================
  // METRICS & ANALYSIS CALCULATIONS
  // ==========================================

  // 1. Idle Assets (Status is Available, but category is not Rooms/Testing Spaces)
  const idleAssets = filteredAssets.filter(a => {
    const catObj = categories.find(c => c.id === a.categoryId);
    const isRoom = catObj && catObj.name === 'Rooms';
    return a.status === 'Available' && !isRoom;
  });

  // 2. Assets Near Retirement (Age of asset exceeds expected life of its category)
  const retiredAssets = filteredAssets.filter(a => {
    const catObj = categories.find(c => c.id === a.categoryId);
    if (!catObj || !catObj.expectedLife || !a.acquisitionDate) return false;
    
    const acqYear = new Date(a.acquisitionDate).getFullYear();
    const currentYear = new Date().getFullYear();
    const age = currentYear - acqYear;
    
    // Retirement threshold: age is within 1 year or exceeds expectedLife
    return age >= (catObj.expectedLife - 1);
  });

  // 3. Assets Due Maintenance (Marked Damaged or in Maintenance, or past warranty)
  const dueMaintenance = filteredAssets.filter(a => {
    const isDamaged = a.condition === 'Damaged';
    const isMaint = a.status === 'Under Maintenance';
    
    let isWarrantyExpired = false;
    if (a.warrantyExpiry) {
      isWarrantyExpired = new Date(a.warrantyExpiry) < new Date();
    }
    
    return isDamaged || isMaint || isWarrantyExpired;
  });

  // 4. Busiest Shared Resources (Most Used)
  const resourceBookingCounts = bookings.reduce((acc, b) => {
    if (b.status !== 'Cancelled') {
      acc[b.resourceType] = (acc[b.resourceType] || 0) + 1;
    }
    return acc;
  }, {});

  const busiestResources = Object.keys(resourceBookingCounts).map(type => ({
    name: type,
    value: resourceBookingCounts[type]
  })).sort((a, b) => b.value - a.value);

  // 5. Asset Utilization Rate (Allocated vs Available)
  const totalInScope = filteredAssets.length || 1;
  const allocatedCount = filteredAssets.filter(a => a.status === 'Allocated').length;
  const utilizationRate = Math.round((allocatedCount / totalInScope) * 100);

  // Charts
  // A. Utilization Data
  const utilizationChartData = [
    { name: 'Allocated', value: allocatedCount, color: 'var(--primary)' },
    { name: 'Idle Available', value: filteredAssets.filter(a => a.status === 'Available').length, color: 'var(--success)' },
    { name: 'Other States', value: filteredAssets.filter(a => a.status !== 'Allocated' && a.status !== 'Available').length, color: 'var(--text-light)' }
  ];

  // B. Maintenance Frequency (Tickets per category)
  const maintCatCounts = maintenance.reduce((acc, ticket) => {
    const assetObj = assets.find(as => as.id === ticket.assetId);
    if (assetObj && assetObj.categoryName) {
      acc[assetObj.categoryName] = (acc[assetObj.categoryName] || 0) + 1;
    }
    return acc;
  }, {});

  const maintChartData = Object.keys(maintCatCounts).map(catName => ({
    name: catName,
    value: maintCatCounts[catName]
  }));

  // ==========================================
  // EXPORT METRICS DOWNLOAD
  // ==========================================
  const handleExportSummary = () => {
    const csvRows = [
      ["AssetFlow Enterprise Report Summary"],
      ["Date Generated", new Date().toLocaleString()],
      ["Scope Department Filter", deptFilter === 'all' ? 'All Units' : departments.find(d => d.id === deptFilter)?.name],
      ["Scope Category Filter", catFilter === 'all' ? 'All Categories' : categories.find(c => c.id === catFilter)?.name],
      ["Date Range Filter", dateFilter],
      [],
      ["KPI metric", "Value"],
      ["Total Assets in Scope", filteredAssets.length],
      ["Active Utilization Rate", `${utilizationRate}%`],
      ["Idle Assets Count", idleAssets.length],
      ["Near Retirement Count", retiredAssets.length],
      ["Due Maintenance Count", dueMaintenance.length],
      [],
      ["Discrepancy / Inactive Warranty Count", dueMaintenance.filter(a => a.condition === 'Damaged').length]
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AssetFlow_Executive_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && assets.length === 0) {
    return <div className="content-wrapper"><h2>Loading Report Summaries...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Executive Analytics & Reports</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Executive breakdowns of usage ratios, hardware lifespans, repair frequencies, and schedule metrics</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleExportSummary}>
          <Download size={14} /> Export Report Summary
        </button>
      </div>

      {/* FILTER CONTROL DECK */}
      <div className="card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '24px', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>DEPARTMENT</span>
          <select 
            className="form-control" style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }}
            value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>CATEGORY</span>
          <select 
            className="form-control" style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }}
            value={catFilter} onChange={e => setCatFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>ACQUISITION TIMEFRAME</span>
          <select 
            className="form-control" style={{ width: '180px', padding: '6px 10px', fontSize: '13px' }}
            value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          >
            <option value="all">All History</option>
            <option value="30days">Acquired: Last 30 Days</option>
            <option value="90days">Acquired: Last 90 Days</option>
            <option value="1year">Acquired: Last 1 Year</option>
          </select>
        </div>
      </div>

      {/* OVERVIEW STATS GRIDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="kpi-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Scope Allocation Rate</div>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{utilizationRate}%</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="kpi-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
            <Cpu size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Idle Warehoused Assets</div>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{idleAssets.length}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="kpi-icon" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Near Retirement Count</div>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{retiredAssets.length}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="kpi-icon" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Due Maintenance / Bad Warranty</div>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{dueMaintenance.length}</div>
          </div>
        </div>
      </div>

      {/* CHARTS */}
      <div className="charts-grid" style={{ marginBottom: '24px' }}>
        <div className="card chart-card">
          <h3 className="card-title">Scope Utilization Split</h3>
          <div className="chart-container">
            <PieChart data={utilizationChartData} />
          </div>
        </div>

        <div className="card chart-card">
          <h3 className="card-title">Maintenance Frequency by category</h3>
          <div className="chart-container">
            {maintChartData.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No maintenance incidents filed</span>
            ) : (
              <BarChart data={maintChartData} />
            )}
          </div>
        </div>
      </div>

      {/* COMPILATION LIST REPORTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        
        {/* REPORT A: IDLE ASSETS */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--success)' }}>Idle Warehoused Assets ({idleAssets.length})</h3>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {idleAssets.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px' }}>No idle devices in stock.</div>
            ) : (
              idleAssets.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyBetween: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{a.name} ({a.assetTag})</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loc: {a.location || 'Warehouse'} | Cond: {a.condition}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* REPORT B: ASSETS NEAR RETIREMENT */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--warning)' }}>Near Retirement ({retiredAssets.length})</h3>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {retiredAssets.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px' }}>No hardware near life expectancy.</div>
            ) : (
              retiredAssets.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyBetween: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{a.name} ({a.assetTag})</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Acquired: {a.acquisitionDate} | Status: {a.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* REPORT C: DUE MAINTENANCE */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--danger)' }}>Due Repair / Broken Warranty ({dueMaintenance.length})</h3>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dueMaintenance.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px' }}>All systems healthy.</div>
            ) : (
              dueMaintenance.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyBetween: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{a.name} ({a.assetTag})</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cond: {a.condition} | Status: {a.status} | Expired Warranty: {a.warrantyExpiry || 'N/A'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* REPORT D: BUSIEST SHARED RESOURCES */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--primary)' }}>Busiest Shared Resources</h3>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {busiestResources.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px' }}>No bookings data recorded.</div>
            ) : (
              busiestResources.map(r => (
                <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', alignItems: 'center' }}>
                  <strong>{r.name}</strong>
                  <span className="badge badge-info" style={{ fontWeight: 'bold' }}>{r.value} Bookings</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Reports;
