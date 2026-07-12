import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
  const { signup, token, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/dashboard');
    }
  }, [token, navigate]);

  useEffect(() => {
    fetch('/api/auth/departments-public')
      .then(res => res.ok ? res.json() : [])
      .then(data => setDepartments(data))
      .catch(() => setDepartments([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setIsSubmitting(true);
    const res = await signup(name, email, password, phone, departmentId);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className="auth-logo">
          <div className="logo-icon" style={{ width: '48px', height: '48px', fontSize: '24px', borderRadius: '8px' }}>AF</div>
        </div>

        <div className="auth-header">
          <h2 style={{ fontSize: '24px', margin: 0 }}>Register Profile</h2>
          <p className="auth-subtitle">Create a new Employee account</p>
        </div>

        <div className="alert-box alert-box-info" style={{ marginBottom: '20px' }}>
          <strong>Signup Rule:</strong> All new profiles are registered under the default <strong>Employee</strong> role. Higher roles (Admin, Manager, Dept Head) must be promoted manually by an existing Administrator.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Alexander Wright"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="name@organization.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-control"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {departments.length > 0 && (
            <div className="form-group">
              <label className="form-label">Department (Optional)</label>
              <select
                className="form-control"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Assign later by Admin</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px', fontSize: '15px', marginTop: '12px' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering Profile...' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Already have an employee profile?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'none' }}>
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
