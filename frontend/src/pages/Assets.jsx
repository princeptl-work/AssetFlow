import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import DetailsDrawer from '../components/DetailsDrawer';
import Modal from '../components/Modal';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  MapPin, 
  AlertCircle, 
  ArrowRightLeft, 
  History, 
  Wrench, 
  CheckSquare,
  QrCode,
  QrCode as Barcode,
  RotateCcw,
  UserCheck
} from 'lucide-react';

// A simple simulated barcode renderer using SVG
const SVGBarcode = ({ value }) => {
  const linePattern = [1, 3, 1, 1, 3, 2, 1, 3, 1, 2, 3, 1, 1, 2, 3, 1, 1, 3, 2, 1, 1, 2, 3];
  return (
    <div style={{ textAlign: 'center', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
      <svg width="150" height="40">
        {linePattern.map((width, idx) => (
          <rect 
            key={idx} 
            x={idx * 6} 
            y="0" 
            width={width * 1.5} 
            height="40" 
            fill={idx % 2 === 0 ? '#1E293B' : 'transparent'} 
          />
        ))}
      </svg>
      <div style={{ fontSize: '10px', fontFamily: 'monospace', letterSpacing: '2px', marginTop: '4px', color: 'var(--text-muted)' }}>{value}</div>
    </div>
  );
};

// A simple simulated QR code renderer using SVG grid boxes
const SVGQRCode = ({ value }) => {
  return (
    <div style={{ textAlign: 'center', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="64" height="64" viewBox="0 0 10 10">
        {/* Draw a simulated QR code matrix */}
        <rect x="0" y="0" width="3" height="3" fill="#1E293B" />
        <rect x="1" y="1" width="1" height="1" fill="white" />
        <rect x="7" y="0" width="3" height="3" fill="#1E293B" />
        <rect x="8" y="1" width="1" height="1" fill="white" />
        <rect x="0" y="7" width="3" height="3" fill="#1E293B" />
        <rect x="1" y="8" width="1" height="1" fill="white" />
        {/* Random dots */}
        <rect x="4" y="1" width="1" height="1" fill="#1E293B" />
        <rect x="5" y="2" width="2" height="1" fill="#1E293B" />
        <rect x="3" y="4" width="1" height="2" fill="#1E293B" />
        <rect x="5" y="5" width="2" height="2" fill="#1E293B" />
        <rect x="8" y="4" width="1" height="1" fill="#1E293B" />
        <rect x="1" y="5" width="2" height="1" fill="#1E293B" />
        <rect x="9" y="8" width="1" height="1" fill="#1E293B" />
      </svg>
      <div style={{ fontSize: '9px', marginTop: '6px', color: 'var(--text-muted)' }}>Scan Tag</div>
    </div>
  );
};

const getAssetImage = (asset) => {
  if (!asset) return '';
  if (asset.photo && asset.photo !== '') return asset.photo;

  const name = (asset.name || '').toLowerCase();
  const cat = (asset.category?.name || asset.categoryName || '').toLowerCase();

  if (name.includes('monitor') || name.includes('screen') || name.includes('dell')) {
    return 'http://localhost:5000/images/dell-moniter.jpg';
  }
  if (name.includes('printer') || name.includes('hp') || name.includes('epson')) {
    return 'http://localhost:5000/images/hp-printer.jpg';
  }
  if (name.includes('macbook') || name.includes('laptop') || name.includes('computer') || name.includes('thinkpad')) {
    return 'http://localhost:5000/images/laptop.jpg';
  }
  if (name.includes('projector') || cat.includes('equipment') || cat.includes('rooms')) {
    return 'http://localhost:5000/images/projector.webp';
  }
  
  return 'http://localhost:5000/images/laptop.jpg';
};

const Assets = () => {
  const { token, user, showToast } = useAuth();
  
  // Data States
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected Asset Detail Drawer
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [assetDetails, setAssetDetails] = useState(null);
  const [detailTab, setDetailTab] = useState('timeline');
  const [assetForm, setAssetForm] = useState({ name: '', categoryId: '', serialNumber: '', modelNumber: '', manufacturer: '', acquisitionDate: '', acquisitionCost: '', location: '', departmentId: '', condition: 'Excellent', bookable: 'No', remarks: '', photo: '', documents: '' });
  const [allocateForm, setAllocateForm] = useState({ employeeId: '', departmentId: '', expectedReturnDate: '', notes: '' });
  const [returnForm, setReturnForm] = useState({ condition: 'Excellent', notes: '' });
  const [transferForm, setTransferForm] = useState({ targetUserId: '', targetDepartmentId: '', notes: '' });

  // Mutating Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Conflict Double-Allocation Warn
  const [conflictDetails, setConflictDetails] = useState(null);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [assetsRes, catRes, deptRes, empRes] = await Promise.all([
        fetch('/api/assets', { headers }),
        fetch('/api/organization/categories', { headers }),
        fetch('/api/organization/departments', { headers }),
        fetch('/api/auth/employees', { headers })
      ]);

      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (catRes.ok) setCategories(await catRes.json());
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

  // Load selected asset details inside Drawer
  const loadAssetDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/assets/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAssetDetails(data);
        setSelectedAssetId(id);
        setReturnForm({ condition: data.condition, notes: '' });
      }
    } catch (err) {
      console.error('Failed to load asset details:', err);
    }
  };

  // Check state eligibility for transitions in badge UI
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Available': return 'badge-success';
      case 'Allocated': return 'badge-gray';
      case 'Reserved': return 'badge-warning';
      case 'Return Pending': return 'badge-warning';
      case 'Under Maintenance': return 'badge-danger';
      case 'Lost': return 'badge-danger';
      case 'Retired': return 'badge-gray';
      default: return 'badge-gray';
    }
  };

  // ==========================================
  // REGISTER ASSET
  // ==========================================
  const handleOpenCreate = () => {
    setAssetForm({
      name: '',
      categoryId: categories[0]?.id || '',
      serialNumber: '',
      modelNumber: '',
      manufacturer: '',
      acquisitionDate: new Date().toISOString().split('T')[0],
      acquisitionCost: '',
      location: '',
      departmentId: '',
      condition: 'Excellent',
      bookable: 'No',
      remarks: '',
      photo: '',
      documents: ''
    });
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!assetForm.name || !assetForm.categoryId) return;

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
        showToast(`Asset ${data.assetTag} registered successfully.`, 'success');
        setShowCreateModal(false);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Registration failed.', 'error');
    }
  };

  // ==========================================
  // EDIT ASSET
  // ==========================================
  const handleOpenEdit = () => {
    if (!assetDetails) return;
    setAssetForm({
      name: assetDetails.name,
      categoryId: assetDetails.categoryId,
      serialNumber: assetDetails.serialNumber || '',
      modelNumber: assetDetails.modelNumber || '',
      manufacturer: assetDetails.manufacturer || '',
      acquisitionDate: assetDetails.acquisitionDate || '',
      acquisitionCost: assetDetails.acquisitionCost || '',
      location: assetDetails.location || '',
      departmentId: assetDetails.departmentId || '',
      condition: assetDetails.condition,
      bookable: assetDetails.bookable || 'No',
      remarks: assetDetails.remarks || '',
      photo: assetDetails.photo || '',
      documents: assetDetails.documents ? (Array.isArray(assetDetails.documents) ? assetDetails.documents.join(', ') : String(assetDetails.documents)) : ''
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const formattedDocs = assetForm.documents 
      ? assetForm.documents.split(',').map(d => d.trim()).filter(Boolean) 
      : [];

    try {
      const res = await fetch(`/api/assets/${selectedAssetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ...assetForm,
          documents: formattedDocs
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Asset profile updated.', 'success');
        setShowEditModal(false);
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Failed to update asset.', 'error');
    }
  };

  // ==========================================
  // ALLOCATION, RETURN & TRANSFERS
  // ==========================================
  const handleAllocate = async (e) => {
    e.preventDefault();
    if (!allocateForm.employeeId && !allocateForm.departmentId) {
      showToast('Must select either an Employee or a Department.', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/assets/${selectedAssetId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(allocateForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Asset allocated successfully.', 'success');
        setAllocateForm({ employeeId: '', departmentId: '', expectedReturnDate: '', notes: '' });
        setConflictDetails(null);
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        if (res.status === 400 && data.allocationDetails) {
          setConflictDetails(data.allocationDetails);
        }
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Allocation failed.', 'error');
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/assets/${selectedAssetId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(returnForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Return checked in and recorded.', 'success');
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Return checkin failed.', 'error');
    }
  };

  const handleRequestReturn = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/assets/${selectedAssetId}/request-return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ notes: returnForm.notes })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Return request submitted successfully.', 'success');
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Failed to submit return request.', 'error');
    }
  };

  const handleTransferRequest = async (e) => {
    e.preventDefault();
    if (!transferForm.targetUserId && !transferForm.targetDepartmentId) {
      showToast('Must select target employee or department.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          assetId: selectedAssetId,
          targetUserId: transferForm.targetUserId,
          targetDepartmentId: transferForm.targetDepartmentId,
          notes: transferForm.notes
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Transfer request filed successfully.', 'success');
        setTransferForm({ targetUserId: '', targetDepartmentId: '', notes: '' });
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Transfer filing failed.', 'error');
    }
  };

  // State Transition bypass shortcut (Admin only)
  const handleAdminStatusOverride = async (newStatus) => {
    if (!window.confirm(`Admin Action: Move asset to status "${newStatus}"?`)) return;
    try {
      const res = await fetch(`/api/assets/${selectedAssetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Status updated to ${newStatus}.`, 'success');
        loadAssetDetails(selectedAssetId);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Status override failed.', 'error');
    }
  };

  // ==========================================
  // BULK DELETION (Admin Only)
  // ==========================================
  const handleBulkDelete = async (ids) => {
    if (!window.confirm(`Are you sure you want to permanently delete the selected ${ids.length} asset(s)?`)) return;
    try {
      const res = await fetch('/api/assets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Bulk delete failed.', 'error');
    }
  };

  // Columns definition
  const columns = [
    { key: 'assetTag', label: 'Tag ID', render: (item) => <span onClick={() => loadAssetDetails(item.id)} style={{ color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}>{item.assetTag}</span> },
    { key: 'name', label: 'Asset Name', render: (item) => <strong>{item.name}</strong> },
    { key: 'categoryName', label: 'Category' },
    { key: 'serialNumber', label: 'Serial Number' },
    { key: 'location', label: 'Location' },
    { key: 'departmentName', label: 'Department / Unit' },
    { 
      key: 'condition', 
      label: 'Condition', 
      render: (item) => (
        <span className={`badge ${item.condition === 'Excellent' || item.condition === 'Good' ? 'badge-success' : item.condition === 'Fair' ? 'badge-warning' : 'badge-danger'}`}>
          {item.condition}
        </span>
      )
    },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => (
        <span className={`badge ${getStatusBadgeClass(item.status)}`}>
          {item.status}
        </span>
      )
    },
    { key: 'allocatedToName', label: 'Allocated To', render: (item) => item.allocatedToName || <span style={{ color: 'var(--text-light)' }}>-</span> }
  ];

  const filterOpts = [
    {
      key: 'categoryId',
      label: 'Categories',
      options: categories.map(c => ({ value: c.id, label: c.name }))
    },
    {
      key: 'status',
      label: 'Statuses',
      options: ['Available', 'Allocated', 'Return Pending', 'Reserved', 'Under Maintenance', 'Lost', 'Retired', 'Disposed'].map(s => ({ value: s, label: s }))
    },
    {
      key: 'condition',
      label: 'Conditions',
      options: ['Excellent', 'Good', 'Fair', 'Damaged'].map(c => ({ value: c, label: c }))
    }
  ];

  if (loading && assets.length === 0) {
    return <div className="content-wrapper"><h2>Loading Asset Database...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Asset Inventory</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Manage full lifecycle of hardware, software, spaces, and company vehicles</p>
        </div>
        {(user?.role === 'Admin' || user?.role === 'Asset Manager') && (
          <button className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
            <Plus size={14} /> Register Asset
          </button>
        )}
      </div>

      {/* Main Grid Directory */}
      <Table
        columns={columns}
        data={assets}
        searchKey="name"
        searchPlaceholder="Search asset name, tags, serial..."
        filters={filterOpts}
        bulkActions={user?.role === 'Admin' ? [{ label: 'Delete Selected', onClick: handleBulkDelete }] : []}
        exportFilename="asset_inventory"
      />

      {/* ==========================================
          DETAILS DRAWERS (SLIDE-OUT FROM RIGHT)
      ========================================== */}
      <DetailsDrawer
        isOpen={!!selectedAssetId && !!assetDetails}
        onClose={() => { setSelectedAssetId(null); setAssetDetails(null); }}
        title={`${assetDetails?.name} [${assetDetails?.assetTag}]`}
      >
        {assetDetails && (
          <div>
            {/* Asset Photo */}
            {assetDetails.photo && (
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <img 
                  src={assetDetails.photo} 
                  alt={assetDetails.name} 
                  style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                />
              </div>
            )}
            {/* General details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Category</span>
                <strong style={{ fontSize: '13px' }}>{assetDetails.category?.name || 'Uncategorized'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Status badge</span>
                <span className={`badge ${getStatusBadgeClass(assetDetails.status)}`} style={{ fontSize: '11px' }}>{assetDetails.status}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Serial Number</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{assetDetails.serialNumber || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Model Number</span>
                <span style={{ fontSize: '12px' }}>{assetDetails.modelNumber || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Manufacturer</span>
                <span style={{ fontSize: '12px' }}>{assetDetails.manufacturer || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Location</span>
                <span style={{ fontSize: '12px' }}><MapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{assetDetails.location || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Acquisition Date</span>
                <span style={{ fontSize: '12px' }}><Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{assetDetails.acquisitionDate || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Acquisition Cost</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>${Number(assetDetails.acquisitionCost).toLocaleString()}</span>
              </div>
            </div>

            {/* Document attachments list */}
            {assetDetails.documents && assetDetails.documents.length > 0 && (
              <div style={{ marginBottom: '24px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Documents & Attachments</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assetDetails.documents.map((doc, idx) => (
                    <a 
                      key={idx} 
                      href={doc} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      📄 Document Link #{idx + 1} ({doc.length > 35 ? doc.substring(0, 35) + '...' : doc})
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Simulated Barcodes & QR & Image */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <SVGBarcode value={assetDetails.assetTag} />
                <SVGQRCode value={assetDetails.assetTag} />
              </div>
              <div style={{ width: '120px', height: '120px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img 
                  src={getAssetImage(assetDetails)} 
                  alt={assetDetails.name} 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            </div>

            {/* Current allocation block */}
            {assetDetails.status === 'Allocated' && assetDetails.allocatedTo && (
              <div className="alert-box alert-box-info" style={{ marginBottom: '24px' }}>
                <UserCheck size={18} />
                <div>
                  <strong>Currently allocated to:</strong>
                  <div style={{ fontSize: '13px', marginTop: '2px' }}>
                    {assetDetails.allocatedTo.name} ({assetDetails.department?.name || 'No Department'})
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                    Assigned on: {assetDetails.allocatedDate} | Expected Return: {assetDetails.expectedReturnDate || 'No Limit'}
                  </div>
                </div>
              </div>
            )}

            {/* Drawer Tabs */}
            <div className="tab-container" style={{ marginBottom: '16px' }}>
              <button className={`tab-btn ${detailTab === 'timeline' ? 'active' : ''}`} onClick={() => setDetailTab('timeline')}>
                <History size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Lifecycle Timeline
              </button>
              <button className={`tab-btn ${detailTab === 'actions' ? 'active' : ''}`} onClick={() => setDetailTab('actions')}>
                Workflows / Actions
              </button>
            </div>

            {/* TAB CONTENT: TIMELINE */}
            {detailTab === 'timeline' && (
              <div className="timeline-wrapper">
                <h4>Asset Event History</h4>
                <div className="timeline">
                  {assetDetails.history && assetDetails.history.map((h, i) => (
                    <div key={h.id || i} className="timeline-item">
                      <div className={`timeline-marker ${h.eventType}`} />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span style={{ fontWeight: 'bold' }}>{h.eventType}</span>
                          <span className="timeline-time">{new Date(h.date).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>By: {h.user}</div>
                        {h.notes && <div className="timeline-notes">{h.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: ACTIONS (WORKFLOW FORMS) */}
            {detailTab === 'actions' && (
              <div>
                {/* Admin/Manager Edit profile option */}
                {(user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: '20px' }} onClick={handleOpenEdit}>
                    Modify Asset Profile
                  </button>
                )}

                {/* State-driven actions */}
                
                {/* ACTION 1: ALLOCATE (Available -> Allocated) */}
                {(assetDetails.status === 'Available' || assetDetails.status === 'Reserved') && (user?.role === 'Admin' || user?.role === 'Asset Manager') && (
                  <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                    <h4>Allocate Asset</h4>
                    {conflictDetails && (
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', marginTop: '10px', fontSize: '12px' }}>
                        <strong>Double Allocation Conflict:</strong>
                        <div style={{ marginTop: '4px' }}>
                          Currently held by {conflictDetails.employeeName || 'Department'} ({conflictDetails.departmentName || 'N/A'}) since {conflictDetails.allocationDate}.
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-danger btn-sm" 
                          style={{ marginTop: '8px', width: '100%', padding: '6px' }}
                          onClick={() => {
                            setTransferForm({
                              targetUserId: '',
                              targetDepartmentId: conflictDetails.departmentId || '',
                              notes: `Transfer requested due to double allocation conflict. Asset currently held by ${conflictDetails.employeeName || 'Department'}.`
                            });
                            setConflictDetails(null);
                            setDetailTab('actions');
                            showToast('Transfer request form initiated below.', 'info');
                          }}
                        >
                          Request Reallocation Transfer Instead
                        </button>
                      </div>
                    )}
                    <form onSubmit={handleAllocate} style={{ marginTop: '10px' }}>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Employee</label>
                          <select 
                            className="form-control" value={allocateForm.employeeId} 
                            onChange={e => setAllocateForm(prev => ({ ...prev, employeeId: e.target.value }))}
                          >
                            <option value="">Choose Employee</option>
                            {employees.filter(emp => emp.status === 'Active').map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Department</label>
                          <select 
                            className="form-control" value={allocateForm.departmentId} 
                            onChange={e => setAllocateForm(prev => ({ ...prev, departmentId: e.target.value }))}
                          >
                            <option value="">Choose Department</option>
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
                          value={allocateForm.expectedReturnDate} 
                          onChange={e => setAllocateForm(prev => ({ ...prev, expectedReturnDate: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Allocation Notes</label>
                        <textarea 
                          className="form-control" rows="2"
                          value={allocateForm.notes} 
                          onChange={e => setAllocateForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <button className="btn btn-primary btn-sm" style={{ width: '100%' }}>Process Allocation</button>
                    </form>
                  </div>
                )}

                {/* ACTION 2: INITIATE RETURN (Employee / Holder request) */}
                {assetDetails.status === 'Allocated' && (assetDetails.allocatedToUserId === user?.id || user?.role === 'Employee') && (
                  <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                    <h4>Initiate Asset Return</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      Request to check this asset back into inventory.
                    </p>
                    <form onSubmit={handleRequestReturn}>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <textarea 
                          className="form-control" rows="2"
                          placeholder="Provide return reason or remarks (optional)..."
                          value={returnForm.notes} onChange={e => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Initiate Return</button>
                    </form>
                  </div>
                )}

                {/* ACTION 2.5: APPROVE RETURN / CHECK-IN (Asset Manager only) */}
                {(assetDetails.status === 'Allocated' || assetDetails.status === 'Return Pending' || assetDetails.status === 'Lost') && user?.role === 'Asset Manager' && (
                  <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                    <h4>Check-in Return</h4>
                    {assetDetails.status === 'Return Pending' && (
                      <div style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px', fontWeight: '500' }}>
                        Notice: Employee has requested to return this asset.
                      </div>
                    )}
                    <form onSubmit={handleReturn} style={{ marginTop: '10px' }}>
                      <div className="form-group">
                        <label className="form-label">Return Condition *</label>
                        <select 
                          className="form-control" required
                          value={returnForm.condition} onChange={e => setReturnForm(prev => ({ ...prev, condition: e.target.value }))}
                        >
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Damaged">Damaged (Will need Maintenance)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Condition Notes / Remarks</label>
                        <textarea 
                          className="form-control" rows="2"
                          value={returnForm.notes} onChange={e => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <button className="btn btn-primary btn-sm" style={{ width: '100%' }}>Confirm Return Checkin</button>
                    </form>
                  </div>
                )}

                {/* ACTION 3: REQUEST TRANSFER */}
                {assetDetails.status === 'Allocated' && user?.role !== 'Admin' && (
                  <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                    <h4>Request Reallocation Transfer</h4>
                    <form onSubmit={handleTransferRequest} style={{ marginTop: '10px' }}>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Transfer Target Employee</label>
                          <select 
                            className="form-control" value={transferForm.targetUserId} 
                            onChange={e => setTransferForm(prev => ({ ...prev, targetUserId: e.target.value }))}
                          >
                            <option value="">Select Employee</option>
                            {employees.filter(emp => emp.id !== assetDetails.allocatedToUserId && emp.status === 'Active').map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Target Department</label>
                          <select 
                            className="form-control" value={transferForm.targetDepartmentId} 
                            onChange={e => setTransferForm(prev => ({ ...prev, targetDepartmentId: e.target.value }))}
                          >
                            <option value="">Select Department</option>
                            {departments.filter(d => d.status === 'Active').map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Reason for Transfer</label>
                        <textarea 
                          className="form-control" rows="2" placeholder="Explain relocation reason..."
                          value={transferForm.notes} onChange={e => setTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <button className="btn btn-secondary btn-sm" style={{ width: '100%', color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        File Transfer Request
                      </button>
                    </form>
                  </div>
                )}

                {/* ADMIN LIFECYCLE OVERRIDES (E.G. RETIRE / RECOVER) */}
                {user?.role === 'Admin' && (
                  <div className="card" style={{ padding: '16px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ color: 'var(--primary)' }}>State Transitions Override</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                      {assetDetails.status === 'Lost' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAdminStatusOverride('Available')}>
                          <RotateCcw size={12} /> Recover Asset
                        </button>
                      )}
                      {assetDetails.status === 'Available' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAdminStatusOverride('Lost')}>
                          Report Lost
                        </button>
                      )}
                      {assetDetails.status === 'Available' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAdminStatusOverride('Retired')}>
                          Retire Asset
                        </button>
                      )}
                      {assetDetails.status === 'Retired' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleAdminStatusOverride('Disposed')}>
                          Mark Disposed
                        </button>
                      )}
                    </div>
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
      
      {/* 1. Register Asset Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Register New Asset"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSubmit}>Register Asset</button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Acquisition Date</label>
              <input 
                type="date" className="form-control"
                value={assetForm.acquisitionDate} onChange={e => setAssetForm(prev => ({ ...prev, acquisitionDate: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Acquisition Cost ($)</label>
              <input 
                type="number" className="form-control" placeholder="0.00"
                value={assetForm.acquisitionCost} onChange={e => setAssetForm(prev => ({ ...prev, acquisitionCost: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Initial Location</label>
            <input 
              type="text" className="form-control" placeholder="e.g. Server Room 4, Head Office"
              value={assetForm.location} onChange={e => setAssetForm(prev => ({ ...prev, location: e.target.value }))}
            />
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
          <div className="form-group">
            <label className="form-label">Asset Remarks / Internal Notes</label>
            <textarea 
              className="form-control" rows="2"
              value={assetForm.remarks} onChange={e => setAssetForm(prev => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* 2. Modify Asset Details Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Modify Asset Profile"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEditSubmit}>Save Modifications</button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label className="form-label">Asset Name</label>
            <input 
              type="text" className="form-control" required
              value={assetForm.name} onChange={e => setAssetForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select 
                className="form-control" required
                value={assetForm.categoryId} onChange={e => setAssetForm(prev => ({ ...prev, categoryId: e.target.value }))}
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Condition</label>
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Acquisition Date</label>
              <input 
                type="date" className="form-control"
                value={assetForm.acquisitionDate} onChange={e => setAssetForm(prev => ({ ...prev, acquisitionDate: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Acquisition Cost ($)</label>
              <input 
                type="number" className="form-control"
                value={assetForm.acquisitionCost} onChange={e => setAssetForm(prev => ({ ...prev, acquisitionCost: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input 
              type="text" className="form-control"
              value={assetForm.location} onChange={e => setAssetForm(prev => ({ ...prev, location: e.target.value }))}
            />
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
          <div className="form-group">
            <label className="form-label">Asset Remarks / Internal Notes</label>
            <textarea 
              className="form-control" rows="2"
              value={assetForm.remarks} onChange={e => setAssetForm(prev => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Assets;
export { SVGBarcode, SVGQRCode };
