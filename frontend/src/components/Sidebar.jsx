import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Package, 
  CalendarRange, 
  Wrench, 
  ArrowLeftRight, 
  ClipboardCheck, 
  Building2, 
  History,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Assets', path: '/assets', icon: Package, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Resource Bookings', path: '/bookings', icon: CalendarRange, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Maintenance', path: '/maintenance', icon: Wrench, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Asset Transfers', path: '/transfers', icon: ArrowLeftRight, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Audit Cycles', path: '/audits', icon: ClipboardCheck, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Reports & Analytics', path: '/reports', icon: BarChart3, roles: ['Admin', 'Asset Manager'] },
    { name: 'Organization Setup', path: '/organization', icon: Building2, roles: ['Admin'] },
    { name: 'Activity Logs', path: '/logs', icon: History, roles: ['Admin'] }
  ];

  const filteredItems = menuItems.filter(item => user && item.roles.includes(user.role));

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <Link to="/dashboard" className="logo-container" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">AF</div>
          <span className="logo-text" style={{ color: 'white' }}>AssetFlow</span>
        </Link>
        <button className="collapse-btn" onClick={toggleCollapse}>
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <ul className="sidebar-menu">
        {filteredItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <li key={item.name} className="menu-item">
              <Link 
                to={item.path} 
                className={`menu-link ${isActive ? 'active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
              >
                <IconComponent size={20} />
                <span>{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div style={{ padding: '16px 8px', borderTop: '1px solid #3F474F' }}>
        <button 
          onClick={logout} 
          className="menu-link" 
          style={{ 
            width: '100%', 
            background: 'none', 
            border: 'none', 
            cursor: 'pointer',
            textAlign: 'left',
            color: '#FF8A80'
          }}
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
