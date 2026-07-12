import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, CalendarClock, PieChart } from 'lucide-react';

const Signup = () => {
  const { signup, token, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/dashboard');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setIsSubmitting(true);
    const res = await signup(name, email, password, phone, '');
    setIsSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Connecting to AssetFlow...</div>
      </div>
    );
  }

  return (
    <div className="auth-split-container">
      {/* Left Pane - Odoo Purple Brand Panel */}
      <div className="auth-sidebar-pane">
        <div className="auth-logo-row">
          <div className="auth-logo-box">AF</div>
          <span>AssetFlow</span>
        </div>

        <div style={{ margin: 'auto 0' }}>
          <h1 style={{ color: 'white', fontSize: '38px', lineHeight: '1.2', fontWeight: '700', marginBottom: '20px' }}>
            Enterprise asset lifecycle, simplified.
          </h1>
          <p style={{ fontSize: '16px', opacity: '0.85', lineHeight: '1.5', marginBottom: '30px' }}>
            Manage assets, allocations, bookings, maintenance, and audits across your organization — with role-based workflows built for modern teams.
          </p>

          <ul className="auth-bullets">
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', marginBottom: '16px' }}>
              <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
              <span>Full asset lifecycle & audit trail</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', marginBottom: '16px' }}>
              <CalendarClock size={18} style={{ color: 'var(--accent)' }} />
              <span>Conflict-aware allocations and bookings</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
              <PieChart size={18} style={{ color: 'var(--accent)' }} />
              <span>Role-based approvals and analytics</span>
            </li>
          </ul>
        </div>

        <div style={{ fontSize: '11px', opacity: 0.6 }}>
          © 2026 AssetFlow ERP Suite.
        </div>
      </div>

      {/* Right Pane - Form Card */}
      <div className="auth-main-pane">
        <div className="auth-panel-card" style={{ maxWidth: '440px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '6px', color: '#212529' }}>Welcome</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
            Create an employee account.
          </p>

          {/* Switcher Tabs */}
          <div className="auth-tabs">
            <div className="auth-tab" onClick={() => navigate('/login')}>Log in</div>
            <div className="auth-tab active">Sign up</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

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

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-control"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', borderRadius: '8px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering profile...' : 'Sign up'}
            </button>
          </form>

          <div 
            style={{ 
              marginTop: '20px', 
              padding: '12px', 
              borderRadius: '8px', 
              backgroundColor: '#FEF9E7', 
              border: '1px solid #FDE68A',
              fontSize: '11px',
              color: '#92400E',
              lineHeight: '1.4'
            }}
          >
            <strong>Default Role Assignment:</strong> Every new registration creates a profile with the <strong>Employee</strong> role. Admins must assign departments and promote roles manually in settings.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
