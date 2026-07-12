import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { Plus, Edit2, ShieldAlert, Award, PowerOff, CheckCircle } from 'lucide-react';

const OrgSetup = () => {
  const { token, showToast, user } = useAuth();
  const [activeTab, setActiveTab] = useState('departments');

  // Core Data States
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  
  const [editDeptId, setEditDeptId] = useState(null);
  const [editCatId, setEditCatId] = useState(null);

  // Form Fields
  const [deptForm, setDeptForm] = useState({ name: '', managerId: '', parentId: '', description: '', status: 'Active' });
  const [catForm, setCatForm] = useState({ name: '', warrantyPeriod: '', expectedLife: '', color: '#875A7B', manufacturer: '', description: '', status: 'Active' });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [deptRes, catRes, empRes] = await Promise.all([
        fetch('/api/organization/departments', { headers }),
        fetch('/api/organization/categories', { headers }),
        fetch('/api/auth/employees', { headers })
      ]);

      if (deptRes.ok) setDepartments(await deptRes.json());
      if (catRes.ok) setCategories(await catRes.json());
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

  // Restrict access
  if (user && user.role !== 'Admin') {
    return (
      <div className="content-wrapper">
        <div className="alert-box alert-box-danger">
          <ShieldAlert size={20} />
          <div>
            <strong>Access Denied:</strong> This administration setup module is restricted to system Administrators only.
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // DEPARTMENT HANDLERS
  // ==========================================
  const handleOpenDeptCreate = () => {
    setEditDeptId(null);
    setDeptForm({ name: '', managerId: '', parentId: '', description: '', status: 'Active' });
    setShowDeptModal(true);
  };

  const handleOpenDeptEdit = (dept) => {
    setEditDeptId(dept.id);
    setDeptForm({
      name: dept.name,
      managerId: dept.managerId || '',
      parentId: dept.parentId || '',
      description: dept.description || '',
      status: dept.status
    });
    setShowDeptModal(true);
  };

  const handleDeptSubmit = async (e) => {
    e.preventDefault();
    if (!deptForm.name) return;

    try {
      const url = editDeptId ? `/api/organization/departments/${editDeptId}` : '/api/organization/departments';
      const method = editDeptId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(deptForm)
      });
      const data = await res.json();

      if (res.ok) {
        showToast(editDeptId ? 'Department updated.' : 'Department created.', 'success');
        setShowDeptModal(false);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Action failed', 'error');
    }
  };

  const handleDeptDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this department?')) return;
    try {
      const res = await fetch(`/api/organization/departments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Department deleted successfully.', 'success');
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Deletion failed', 'error');
    }
  };

  // ==========================================
  // CATEGORY HANDLERS
  // ==========================================
  const handleOpenCatCreate = () => {
    setEditCatId(null);
    setCatForm({ name: '', warrantyPeriod: '', expectedLife: '', color: '#875A7B', manufacturer: '', description: '', status: 'Active' });
    setShowCatModal(true);
  };

  const handleOpenCatEdit = (cat) => {
    setEditCatId(cat.id);
    setCatForm({
      name: cat.name,
      warrantyPeriod: cat.warrantyPeriod || '',
      expectedLife: cat.expectedLife || '',
      color: cat.color || '#875A7B',
      manufacturer: cat.manufacturer || '',
      description: cat.description || '',
      status: cat.status
    });
    setShowCatModal(true);
  };

  const handleCatSubmit = async (e) => {
    e.preventDefault();
    if (!catForm.name) return;

    try {
      const url = editCatId ? `/api/organization/categories/${editCatId}` : '/api/organization/categories';
      const method = editCatId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(catForm)
      });
      const data = await res.json();

      if (res.ok) {
        showToast(editCatId ? 'Asset category updated.' : 'Category created.', 'success');
        setShowCatModal(false);
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Action failed', 'error');
    }
  };

  const handleCatDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      const res = await fetch(`/api/organization/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Category deleted.', 'success');
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Deletion failed', 'error');
    }
  };

  // ==========================================
  // EMPLOYEE / USER PROMOTIONS
  // ==========================================
  const handlePromoteRole = async (empId, newRole) => {
    try {
      const res = await fetch(`/api/auth/employees/${empId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Employee promoted to: ${newRole}`, 'success');
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Role promotion failed', 'error');
    }
  };

  const handleToggleActive = async (empId, currentStatus) => {
    const nextStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await fetch(`/api/auth/employees/${empId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`User status toggled to: ${nextStatus}`, 'success');
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Action failed', 'error');
    }
  };

  // ==========================================
  // GRID COLUMNS DEFINITIONS
  // ==========================================
  const deptCols = [
    { key: 'name', label: 'Department Name', render: (item) => <strong style={{ color: '#1E293B' }}>{item.name}</strong> },
    { 
      key: 'managerId', 
      label: 'Department Head', 
      render: (item) => {
        const head = employees.find(e => e.id === item.managerId);
        return head ? head.name : <span style={{ color: 'var(--text-light)' }}>Unassigned</span>;
      }
    },
    { 
      key: 'parentId', 
      label: 'Parent Unit', 
      render: (item) => {
        const parent = departments.find(d => d.id === item.parentId);
        return parent ? parent.name : <span style={{ color: 'var(--text-light)' }}>None (Root)</span>;
      }
    },
    { key: 'description', label: 'Description' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => (
        <span className={`badge ${item.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenDeptEdit(item)}>
            <Edit2 size={12} />
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDeptDelete(item.id)}>
            Delete
          </button>
        </div>
      )
    }
  ];

  const catCols = [
    { 
      key: 'name', 
      label: 'Category Name', 
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: item.color }} />
          <strong>{item.name}</strong>
        </div>
      ) 
    },
    { key: 'expectedLife', label: 'Expected Life (Yrs)', render: (item) => `${item.expectedLife} years` },
    { key: 'warrantyPeriod', label: 'Warranty (Mths)', render: (item) => `${item.warrantyPeriod} months` },
    { key: 'manufacturer', label: 'Preferred Manufacturer' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => (
        <span className={`badge ${item.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenCatEdit(item)}>
            <Edit2 size={12} />
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleCatDelete(item.id)}>
            Delete
          </button>
        </div>
      )
    }
  ];

  const empCols = [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Full Name', render: (item) => <strong>{item.name}</strong> },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { 
      key: 'departmentId', 
      label: 'Department', 
      render: (item) => {
        const d = departments.find(dept => dept.id === item.departmentId);
        return d ? d.name : <span style={{ color: 'var(--text-light)' }}>Unassigned</span>;
      }
    },
    { 
      key: 'role', 
      label: 'Role', 
      render: (item) => {
        let cls = 'badge-gray';
        if (item.role === 'Admin') cls = 'badge-danger';
        else if (item.role === 'Asset Manager') cls = 'badge-info';
        else if (item.role === 'Department Head') cls = 'badge-warning';
        return <span className={`badge ${cls}`}>{item.role}</span>;
      }
    },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => (
        <span className={`badge ${item.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Promotions / Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {item.role !== 'Admin' && (
            <select
              className="form-control"
              style={{ width: '130px', padding: '3px 8px', fontSize: '11px' }}
              value={item.role}
              onChange={(e) => handlePromoteRole(item.id, e.target.value)}
            >
              <option value="Employee">Employee</option>
              <option value="Department Head">Dept Head</option>
              <option value="Asset Manager">Asset Manager</option>
              <option value="Admin">Admin</option>
            </select>
          )}

          <button 
            className={`btn ${item.status === 'Active' ? 'btn-secondary' : 'btn-primary'} btn-sm`} 
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={() => handleToggleActive(item.id, item.status)}
          >
            {item.status === 'Active' ? <PowerOff size={11} /> : <CheckCircle size={11} />}
          </button>
        </div>
      )
    }
  ];

  if (loading && departments.length === 0) {
    return <div className="content-wrapper"><h2>Loading Org Data...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '26px' }}>Organization Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Configure structural departments, asset categories, and employee role directory</p>
      </div>

      {/* Tabs */}
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`} onClick={() => setActiveTab('departments')}>
          Departments
        </button>
        <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          Asset Categories
        </button>
        <button className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`} onClick={() => setActiveTab('employees')}>
          Employee Directory
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'departments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleOpenDeptCreate}>
              <Plus size={14} /> Add Department
            </button>
          </div>
          <Table
            columns={deptCols}
            data={departments}
            searchKey="name"
            searchPlaceholder="Search departments..."
            exportFilename="departments"
          />
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleOpenCatCreate}>
              <Plus size={14} /> Add Category
            </button>
          </div>
          <Table
            columns={catCols}
            data={categories}
            searchKey="name"
            searchPlaceholder="Search categories..."
            exportFilename="asset_categories"
          />
        </div>
      )}

      {activeTab === 'employees' && (
        <div>
          <Table
            columns={empCols}
            data={employees}
            searchKey="name"
            searchPlaceholder="Search employee directory..."
            exportFilename="employee_directory"
            filters={[
              {
                key: 'role',
                label: 'Roles',
                options: [
                  { value: 'Admin', label: 'Admin' },
                  { value: 'Asset Manager', label: 'Asset Manager' },
                  { value: 'Department Head', label: 'Department Head' },
                  { value: 'Employee', label: 'Employee' }
                ]
              },
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' }
                ]
              }
            ]}
          />
        </div>
      )}

      {/* ==========================================
          MODALS
      ========================================== */}

      {/* 1. Department Modal */}
      <Modal
        isOpen={showDeptModal}
        onClose={() => setShowDeptModal(false)}
        title={editDeptId ? 'Modify Department' : 'Create Department'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDeptModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDeptSubmit}>Save Department</button>
          </>
        }
      >
        <form onSubmit={handleDeptSubmit}>
          <div className="form-group">
            <label className="form-label">Department Name *</label>
            <input
              type="text" className="form-control" required
              value={deptForm.name} onChange={e => setDeptForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Department Head</label>
              <select
                className="form-control"
                value={deptForm.managerId} onChange={e => setDeptForm(prev => ({ ...prev, managerId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {employees.filter(emp => emp.role === 'Department Head' || emp.role === 'Admin').map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Parent Department</label>
              <select
                className="form-control"
                value={deptForm.parentId} onChange={e => setDeptForm(prev => ({ ...prev, parentId: e.target.value }))}
              >
                <option value="">None (Top-Level Root)</option>
                {departments.filter(d => d.id !== editDeptId).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-control"
              value={deptForm.status} onChange={e => setDeptForm(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control" rows="2"
              value={deptForm.description} onChange={e => setDeptForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      {/* 2. Category Modal */}
      <Modal
        isOpen={showCatModal}
        onClose={() => setShowCatModal(false)}
        title={editCatId ? 'Modify Category' : 'Create Category'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCatSubmit}>Save Category</button>
          </>
        }
      >
        <form onSubmit={handleCatSubmit}>
          <div className="form-group">
            <label className="form-label">Category Name *</label>
            <input
              type="text" className="form-control" required placeholder="e.g. Laptops"
              value={catForm.name} onChange={e => setCatForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Warranty Period (Months)</label>
              <input
                type="number" className="form-control" placeholder="e.g. 24"
                value={catForm.warrantyPeriod} onChange={e => setCatForm(prev => ({ ...prev, warrantyPeriod: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Life (Years)</label>
              <input
                type="number" className="form-control" placeholder="e.g. 5"
                value={catForm.expectedLife} onChange={e => setCatForm(prev => ({ ...prev, expectedLife: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Preferred Manufacturers</label>
              <input
                type="text" className="form-control" placeholder="e.g. Apple, Dell"
                value={catForm.manufacturer} onChange={e => setCatForm(prev => ({ ...prev, manufacturer: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Color Theme Tag</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="color" className="form-control" style={{ width: '48px', padding: '2px', height: '36px' }}
                  value={catForm.color} onChange={e => setCatForm(prev => ({ ...prev, color: e.target.value }))}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{catForm.color}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-control"
              value={catForm.status} onChange={e => setCatForm(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control" rows="2"
              value={catForm.description} onChange={e => setCatForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default OrgSetup;
