import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Bell, Search, Menu, Plus, User, AlertCircle, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = ({ setIsMobileOpen, onQuickAction }) => {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const searchRef = useRef(null);
  const notifyRef = useRef(null);

  // Close search/notifications on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
      if (notifyRef.current && !notifyRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle global search keystrokes
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.trim().length > 1) {
        try {
          const res = await fetch(`/api/logs/global-search?q=${encodeURIComponent(searchQuery)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('assetflow_token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data);
            setShowSearchResults(true);
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleResultClick = (result) => {
    setSearchQuery('');
    setShowSearchResults(false);
    navigate(result.link);
  };

  const getRoleClass = (role) => {
    switch (role) {
      case 'Admin': return 'role-badge admin';
      case 'Asset Manager': return 'role-badge manager';
      case 'Department Head': return 'role-badge head';
      default: return 'role-badge';
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <span className="org-name-badge">AssetFlow Corp</span>
        <button 
          className="collapse-btn" 
          onClick={() => setIsMobileOpen(prev => !prev)} 
          style={{ display: 'none', marginRight: '10px' }}
          id="mobile-hamburger"
        >
          <Menu size={20} />
        </button>

        {/* Global Search Bar */}
        <div className="search-input-wrapper" ref={searchRef} style={{ width: '100%' }}>
          <div className="nav-search-bar">
            <Search size={16} className="text-light" />
            <input 
              type="text" 
              placeholder="Search assets, employees, bookings, tickets..." 
              className="nav-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim().length > 1 && setShowSearchResults(true)}
            />
          </div>

          {showSearchResults && (
            <div 
              style={{
                position: 'absolute',
                top: '46px',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 110,
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
              {searchResults.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  No results found for "{searchQuery}"
                </div>
              ) : (
                searchResults.map((res) => (
                  <div 
                    key={`${res.type}-${res.id}`} 
                    onClick={() => handleResultClick(res)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B' }}>{res.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{res.subtitle}</div>
                    </div>
                    <span className={`role-badge`} style={{ fontSize: '9px', padding: '2px 6px' }}>{res.type}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #mobile-hamburger { display: flex !important; }
        }
      `}</style>

      <div className="nav-right">
        {/* Current Role Badge */}
        {user && <span className={getRoleClass(user.role)}>{user.role}</span>}

        {/* Notification Center */}
        <div className="icon-badge-container" ref={notifyRef} onClick={() => setShowNotifications(!showNotifications)}>
          <Bell size={20} />
          {unreadCount > 0 && <span className="badge-dot" />}

          {showNotifications && (
            <div 
              style={{
                position: 'absolute',
                top: '36px',
                right: '-10px',
                width: '320px',
                backgroundColor: 'white',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 110,
                overflow: 'hidden'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div 
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F8FAFC'
                }}
              >
                <span style={{ fontWeight: '600', fontSize: '14px', color: '#1E293B' }}>Notifications</span>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <AlertCircle size={24} style={{ margin: '0 auto 8px', color: 'var(--text-light)' }} />
                    No notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      onClick={() => {
                        markAsRead(notif.id);
                        setShowNotifications(false);
                        navigate(notif.link || '/dashboard');
                      }}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '10px',
                        backgroundColor: notif.isRead ? 'white' : 'rgba(135, 90, 123, 0.04)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = notif.isRead ? 'white' : 'rgba(135, 90, 123, 0.04)'}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', color: '#334155', fontWeight: notif.isRead ? '400' : '600' }}>
                          {notif.message}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '4px' }}>
                          {new Date(notif.timestamp).toLocaleString()}
                        </div>
                      </div>
                      {!notif.isRead && (
                        <span 
                          style={{
                            width: '6px',
                            height: '6px',
                            backgroundColor: 'var(--primary)',
                            borderRadius: '50%',
                            alignSelf: 'center'
                          }}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User profile dropdown widget */}
        {user && (
          <div className="user-profile-widget" onClick={() => navigate('/organization')}>
            <div className="avatar">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-dept">{user.employeeId}</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
