import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, CalendarClock, PieChart, Shield } from 'lucide-react';

const Login = () => {
  const { login, token, loading, showToast } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/dashboard');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    const res = await login(email, password);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (res.ok) {
        console.log('DEBUG_OTP:', data.otp);
        showToast(data.message || 'OTP has been generated and sent.', 'success');
        setForgotStep(2);
      } else {
        showToast(data.message || 'Failed to send OTP.', 'error');
      }
    } catch (err) {
      showToast('Network error during reset request.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!forgotOtp) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('OTP verified successfully. Please enter your new password.', 'success');
        setForgotStep(3);
      } else {
        showToast(data.message || 'Incorrect OTP.', 'error');
      }
    } catch (err) {
      showToast('Network error during OTP verification.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Password reset successfully. You can now log in.', 'success');
        handleCancelForgot();
      } else {
        showToast(data.message || 'Failed to reset password.', 'error');
      }
    } catch (err) {
      showToast('Network error during password reset.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancelForgot = () => {
    setShowForgotModal(false);
    setForgotEmail('');
    setForgotStep(1);
    setForgotOtp('');
    setNewPassword('');
    setConfirmPassword('');
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
        <div className="auth-panel-card">
          <h2 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '6px', color: '#212529' }}>Welcome</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
            Sign in to your AssetFlow workspace.
          </p>

          {/* Switcher Tabs */}
          <div className="auth-tabs">
            <div className="auth-tab active">Log in</div>
            <div className="auth-tab" onClick={() => navigate('/signup')}>Sign up</div>
          </div>

          <form onSubmit={handleSubmit}>
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

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-16px', marginBottom: '20px' }}>
              <button 
                type="button" 
                onClick={() => setShowForgotModal(true)} 
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', borderRadius: '8px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Log in'}
            </button>
          </form>

          {/* Admin Seed Credentials Help Box */}
          <div
            style={{
              marginTop: '24px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: '#F8F9FA',
              border: '1px dashed var(--border-color)',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}
          >
            <strong style={{ color: 'var(--primary)' }}>Default Seed Logins:</strong>
            <div style={{ marginTop: '4px' }}>• Admin: <code>admin@assetflow.com</code> / <code>admin123</code></div>
            <div>• Asset Mgr: <code>manager@assetflow.com</code> / <code>manager123</code></div>
            <div>• Dept Head: <code>head@assetflow.com</code> / <code>head123</code></div>
            <div>• Employee: <code>employee@assetflow.com</code> / <code>employee123</code></div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}>
            {forgotStep === 1 && (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#212529' }}>Forgot Password?</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                  Enter your email address and we will send a 6-digit verification code (OTP) to your email ID.
                </p>
                <form onSubmit={handleSendOtp}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Email Address</label>
                    <input 
                      type="email" 
                      className="form-control" 
                      required 
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={handleCancelForgot}
                      disabled={isResetting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={isResetting}
                    >
                      {isResetting ? 'Sending...' : 'Send OTP'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#212529' }}>Enter Verification OTP</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                  A 6-digit OTP has been sent to <strong>{forgotEmail}</strong>. Enter it below to proceed.
                </p>
                <form onSubmit={handleVerifyOtp}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Verification OTP</label>
                    <input 
                      type="text" 
                      maxLength="6"
                      className="form-control" 
                      required 
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      placeholder="e.g. 123456"
                      style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: 'bold' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={handleCancelForgot}
                      disabled={isResetting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={isResetting}
                    >
                      {isResetting ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#212529' }}>Set New Password</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                  OTP verified successfully! Create a new secure password for your account.
                </p>
                <form onSubmit={handleResetPassword}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">New Password</label>
                    <input 
                      type="password" 
                      className="form-control" 
                      required 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Confirm New Password</label>
                    <input 
                      type="password" 
                      className="form-control" 
                      required 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={handleCancelForgot}
                      disabled={isResetting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={isResetting}
                    >
                      {isResetting ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
