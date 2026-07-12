import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

// Components & Pages
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
import Reports from './pages/Reports';
import OrgSetup from './pages/OrgSetup';
import Logs from './pages/Logs';
import Requests from './pages/Requests';

// Route Guard Component
const ProtectedRoute = ({ element, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  if (!allowedRoles.includes(user.role)) {
    return (
      <div style={{ padding: '24px', margin: '24px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>403 - Access Denied</h2>
        <p style={{ fontSize: '14px' }}>You do not have the required permissions to view this page.</p>
      </div>
    );
  }
  
  return element;
};

// Inner Shell Component to wrap authenticated layouts
const AppLayout = () => {
  const { user, token, loading } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Initializing AssetFlow ERP...</div>
      </div>
    );
  }

  // Auth Guard: Direct to login if not authenticated
  if (!token || !user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Authenticated Workspace Shell
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
        />
        
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} allowedRoles={['Admin', 'Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/assets" element={<ProtectedRoute element={<Assets />} allowedRoles={['Admin', 'Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/requests" element={<ProtectedRoute element={<Requests />} allowedRoles={['Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/bookings" element={<ProtectedRoute element={<Bookings />} allowedRoles={['Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/maintenance" element={<ProtectedRoute element={<Maintenance />} allowedRoles={['Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/transfers" element={<ProtectedRoute element={<Transfers />} allowedRoles={['Asset Manager', 'Department Head', 'Employee']} />} />
            
            <Route path="/audits" element={<ProtectedRoute element={<Audits />} allowedRoles={['Admin', 'Asset Manager', 'Department Head', 'Employee']} />} />
            <Route path="/reports" element={<ProtectedRoute element={<Reports />} allowedRoles={['Admin', 'Asset Manager', 'Department Head']} />} />
            <Route path="/organization" element={<ProtectedRoute element={<OrgSetup />} allowedRoles={['Admin']} />} />
            <Route path="/logs" element={<ProtectedRoute element={<Logs />} allowedRoles={['Admin']} />} />

            {/* Fallbacks */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// Global App Container
const App = () => {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <AppLayout />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
