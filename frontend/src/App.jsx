import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import OrgSetup from './pages/OrgSetup';
import Logs from './pages/Logs';

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
          onQuickAction={() => {
            // Dashboard quick actions could also be fired globally.
            // For general shortcut, navigate to dashboard & trigger quick modals or open resources page.
            window.location.href = '/dashboard';
          }}
        />
        
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/audits" element={<Audits />} />
            
            {/* Admin only views */}
            <Route path="/organization" element={<OrgSetup />} />
            <Route path="/logs" element={<Logs />} />

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
