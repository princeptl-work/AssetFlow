import React from 'react';
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
  LogOut,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const getMenuName = (baseName) => {
    if (!user) return baseName;
    if (baseName === 'Assets') {
      if (user.role === 'Employee') return 'My Assets';
      if (user.role === 'Department Head') return 'Department Assets';
      return 'Assets';
    }
    if (baseName === 'Resource Bookings') {
      if (user.role === 'Employee') return 'My Bookings';
      return 'Bookings';
    }
    if (baseName === 'Maintenance') {
      if (user.role === 'Employee') return 'My Maintenance';
      if (user.role === 'Department Head') return 'Dept Maintenance';
      return 'Maintenance';
    }
    if (baseName === 'Asset Requests') {
      if (user.role === 'Employee') return 'Request Asset';
      return 'Asset Requests';
    }
    if (baseName === 'Asset Transfers') {
      if (user.role === 'Employee') return 'My Transfers';
      if (user.role === 'Department Head') return 'Approvals';
      return 'Asset Transfers';
    }
    if (baseName === 'Reports') {
      if (user.role === 'Department Head') return 'Department Reports';
      return 'Reports';
    }
    return baseName;
  };

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Assets', path: '/assets', icon: Package, roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Asset Requests', path: '/requests', icon: FileText, roles: ['Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Resource Bookings', path: '/bookings', icon: CalendarRange, roles: ['Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Maintenance', path: '/maintenance', icon: Wrench, roles: ['Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Asset Transfers', path: '/transfers', icon: ArrowLeftRight, roles: ['Asset Manager', 'Department Head', 'Employee'] },
    { name: 'Audit Cycles', path: '/audits', icon: ClipboardCheck, roles: ['Admin', 'Asset Manager'] },
    { name: 'Reports', path: '/reports', icon: TrendingUp, roles: ['Admin', 'Asset Manager', 'Department Head'] },
    { name: 'Organization Setup', path: '/organization', icon: Building2, roles: ['Admin'] },
    { name: 'Activity Logs', path: '/logs', icon: History, roles: ['Admin'] }
  ];

  const filteredItems = menuItems.filter(item => user && item.roles.includes(user.role));

  // Initials for avatar
  const getInitials = (name) => {
    if (!name) return 'EP';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <Link to="/dashboard" className="logo-container" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">AF</div>
          {!isCollapsed && (
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#212529', lineHeight: '1.2' }}>AssetFlow</div>
              <div className="logo-subtext">ERP Suite</div>
            </div>
          )}
        </Link>
        <button
          className="collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ padding: '4px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Menu */}
      <ul className="sidebar-menu">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          const displayName = getMenuName(item.name);

          return (
            <li key={item.name} className="menu-item">
              <Link
                to={item.path}
                className={`menu-link ${isActive ? 'active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon size={18} />
                {!isCollapsed && <span>{displayName}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Sidebar Footer User Widget (Screenshot 2) */}
      {user && (
        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <div className="sidebar-avatar">
              {getInitials(user.name)}
            </div>
            {!isCollapsed && (
              <div className="sidebar-profile-info">
                <span className="sidebar-username">{user.name}</span>
                <span className="sidebar-role">{user.role}</span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button className="logout-btn" onClick={logout} title="Log Out">
              <LogOut size={16} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
