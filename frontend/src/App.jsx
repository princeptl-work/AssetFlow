import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Bookings from './pages/Bookings';
import Maintenance from './pages/Maintenance';
import Transfers from './pages/Transfers';
import Audits from './pages/Audits';
import OrgSetup from './pages/OrgSetup';
import Reports from './pages/Reports';
import Logs from './pages/Logs';

const ALL_ROLES = ['Admin', 'Asset Manager', 'Department Head', 'Employee'];

const ProtectedRoute = ({ children, roles = ALL_ROLES }) => {
  const { user, loading, token } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Loading AssetFlow workspace...</div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="content-wrapper">
        <div className="alert-box alert-box-danger">
          <strong>Access Denied:</strong> Your role ({user.role}) does not have permission to view this module.
        </div>
      </div>
    );
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppLayout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="app-container">
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />
      <div className={`main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <Navbar
          setIsMobileOpen={setIsMobileOpen}
          onQuickAction={() => navigate('/dashboard')}
        />
        <main>{children}</main>
      </div>
      {isMobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

const AuthenticatedRoutes = () => (
  <AppLayout>
    <Routes>
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/assets" element={<ProtectedRoute><Assets /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
      <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
      <Route path="/transfers" element={<ProtectedRoute><Transfers /></ProtectedRoute>} />
      <Route path="/audits" element={<ProtectedRoute><Audits /></ProtectedRoute>} />
      <Route path="/organization" element={<ProtectedRoute roles={['Admin']}><OrgSetup /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute roles={['Admin', 'Asset Manager']}><Reports /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute roles={['Admin']}><Logs /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </AppLayout>
);

const AppRoutes = () => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Initializing AssetFlow...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
      <Route
        path="/*"
        element={token ? <AuthenticatedRoutes /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
