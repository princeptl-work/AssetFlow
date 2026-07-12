import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { CalendarRange, Plus, Clock, Info, AlertTriangle, CalendarDays } from 'lucide-react';

const Bookings = () => {
  const { token, user, showToast } = useAuth();
  const { fetchNotifications } = useNotifications();

  // Core Data States
  const [bookings, setBookings] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calendar States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState(true); // true = Calendar grid, false = Table list

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Selected Booking Details
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Form Fields
  const [bookingForm, setBookingForm] = useState({ resourceType: 'Meeting Room', assetId: '', purpose: '', startTime: '', endTime: '' });
  const [rescheduleForm, setRescheduleForm] = useState({ startTime: '', endTime: '', purpose: '' });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [bookRes, assetRes] = await Promise.all([
        fetch('/api/bookings', { headers }),
        fetch('/api/assets', { headers })
      ]);

      if (bookRes.ok) setBookings(await bookRes.json());
      if (assetRes.ok) setAssets(await assetRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleOpenBooking = () => {
    setBookingForm({
      resourceType: 'Meeting Room',
      assetId: '',
      purpose: '',
      startTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16), // +1 hour from now
      endTime: new Date(Date.now() + 7200000).toISOString().slice(0, 16)  // +2 hours from now
    });
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(bookingForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Resource reservation confirmed successfully.', 'success');
        setShowCreateModal(false);
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Booking action failed.', 'error');
    }
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Booking cancelled.', 'success');
        setShowDetailModal(false);
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Cancellation failed.', 'error');
    }
  };

  const handleOpenReschedule = (booking) => {
    setSelectedBooking(booking);
    setRescheduleForm({
      startTime: booking.startTime.slice(0, 16),
      endTime: booking.endTime.slice(0, 16),
      purpose: booking.purpose
    });
    setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/reschedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(rescheduleForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Booking rescheduled successfully.', 'success');
        setShowRescheduleModal(false);
        setShowDetailModal(false);
        fetchNotifications();
        fetchData();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      showToast('Reschedule action failed.', 'error');
    }
  };

  const handleCellClick = (booking) => {
    setSelectedBooking(booking);
    setShowDetailModal(true);
  };

  // ==========================================
  // RENDER MONTHLY CALENDAR GRID
  // ==========================================
  const renderCalendarCells = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayIndex = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

    // Number of days in the month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Number of days in previous month
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    // Previous Month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      cells.push({ date, currentMonth: false, dayNum: day });
    }

    // Current Month days
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      cells.push({ date, currentMonth: true, dayNum: i });
    }

    // Next Month padding days to complete grid
    const remainingCells = 42 - cells.length; // standard 6-row grid
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(year, month + 1, i);
      cells.push({ date, currentMonth: false, dayNum: i });
    }

    return cells.map((cell, idx) => {
      const dateStr = cell.date.toISOString().split('T')[0];
      
      // Match bookings for this specific date
      const cellBookings = bookings.filter(b => {
        if (b.status === 'Cancelled') return false;
        const bStart = b.startTime.split('T')[0];
        const bEnd = b.endTime.split('T')[0];
        return dateStr >= bStart && dateStr <= bEnd;
      });

      return (
        <div 
          key={idx} 
          className={`calendar-cell ${!cell.currentMonth ? 'different-month' : ''}`}
        >
          <span className="calendar-cell-num">{cell.dayNum}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%', overflowY: 'auto' }}>
            {cellBookings.slice(0, 3).map((b) => (
              <div 
                key={b.id} 
                className={`calendar-booking-pill ${b.status}`}
                onClick={(e) => { e.stopPropagation(); handleCellClick(b); }}
                title={`${b.resourceType}: ${b.purpose}`}
              >
                {b.resourceType.split(' ')[0]}: {b.purpose}
              </div>
            ))}
            {cellBookings.length > 3 && (
              <div style={{ fontSize: '9px', color: 'var(--text-light)', fontWeight: 'bold', paddingLeft: '4px' }}>
                +{cellBookings.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  // Change Month Navigators
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const getMonthName = (date) => {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Columns definition for Table view mode
  const columns = [
    { key: 'resourceType', label: 'Resource Block', render: (item) => <strong>{item.resourceType}</strong> },
    { key: 'assetName', label: 'Registered Asset', render: (item) => item.assetName ? `${item.assetName} (${item.assetTag})` : <span style={{ color: 'var(--text-light)' }}>General</span> },
    { key: 'purpose', label: 'Purpose of Booking' },
    { key: 'bookedByName', label: 'Booked By' },
    { key: 'departmentName', label: 'Department / Unit' },
    { key: 'startTime', label: 'Start Time', render: (item) => new Date(item.startTime).toLocaleString() },
    { key: 'endTime', label: 'End Time', render: (item) => new Date(item.endTime).toLocaleString() },
    { 
      key: 'status', 
      label: 'Status', 
      render: (item) => {
        let cls = 'badge-success';
        if (item.status === 'Cancelled') cls = 'badge-danger';
        else if (item.status === 'Upcoming') cls = 'badge-warning';
        else if (item.status === 'Ongoing') cls = 'badge-info';
        return <span className={`badge ${cls}`}>{item.status}</span>;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => {
        const isOwner = item.userId === user?.id;
        const isPrivileged = user?.role === 'Admin' || user?.role === 'Asset Manager';
        const isMutable = item.status === 'Upcoming' || item.status === 'Ongoing';

        if (!isMutable) return <span style={{ color: 'var(--text-light)' }}>-</span>;

        return (
          <div style={{ display: 'flex', gap: '8px' }}>
            {(isOwner || isPrivileged) && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenReschedule(item)}>
                  Reschedule
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleCancelBooking(item.id)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        );
      }
    }
  ];

  if (loading && bookings.length === 0) {
    return <div className="content-wrapper"><h2>Loading Bookings...</h2></div>;
  }

  return (
    <div className="content-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Shared Resource Scheduler</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Reserve conference rooms, shuttle vehicles, testing labs, and projection gear</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setCalendarMode(!calendarMode)}>
            {calendarMode ? 'List Grid View' : 'Calendar View'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleOpenBooking}>
            <Plus size={14} /> Book Resource
          </button>
        </div>
      </div>

      {/* CALENDAR SCHEDULER VIEW */}
      {calendarMode ? (
        <div className="calendar-view">
          <div className="calendar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CalendarDays size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', margin: 0 }}>{getMonthName(currentDate)}</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={prevMonth}>Previous</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date())}>Today</button>
              <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Next</button>
            </div>
          </div>
          
          <div className="calendar-days-grid">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
              <div key={day} className="calendar-day-label">{day}</div>
            ))}
          </div>

          <div className="calendar-cells-grid">
            {renderCalendarCells()}
          </div>
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <Table
          columns={columns}
          data={bookings}
          searchKey="purpose"
          searchPlaceholder="Search booking purpose..."
          exportFilename="resource_bookings"
          filters={[
            {
              key: 'resourceType',
              label: 'Resource',
              options: [
                { value: 'Meeting Room', label: 'Meeting Room' },
                { value: 'Conference Room', label: 'Conference Room' },
                { value: 'Vehicle', label: 'Vehicle' },
                { value: 'Projector', label: 'Projector' },
                { value: 'Lab', label: 'Lab' },
                { value: 'Equipment', label: 'Equipment' }
              ]
            },
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'Upcoming', label: 'Upcoming' },
                { value: 'Ongoing', label: 'Ongoing' },
                { value: 'Completed', label: 'Completed' },
                { value: 'Cancelled', label: 'Cancelled' }
              ]
            }
          ]}
        />
      )}

      {/* ==========================================
          MODALS
      ========================================== */}

      {/* 1. Create Booking Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Schedule Resource Booking"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSubmit}>Book Resource</button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Resource Type *</label>
              <select
                className="form-control" required
                value={bookingForm.resourceType} onChange={e => setBookingForm(prev => ({ ...prev, resourceType: e.target.value }))}
              >
                <option value="Meeting Room">Meeting Room</option>
                <option value="Conference Room">Conference Room</option>
                <option value="Vehicle">Vehicle</option>
                <option value="Projector">Projector</option>
                <option value="Lab">Testing Lab</option>
                <option value="Equipment">Equipment</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Link Bookable Asset (Optional)</label>
              <select
                className="form-control"
                value={bookingForm.assetId} onChange={e => setBookingForm(prev => ({ ...prev, assetId: e.target.value }))}
              >
                <option value="">Choose Asset (If required)</option>
                {assets.filter(a => a.bookable === 'Yes' && a.status === 'Available').map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Purpose of Reservation *</label>
            <input
              type="text" className="form-control" required placeholder="e.g. Sprint Planning Session"
              value={bookingForm.purpose} onChange={e => setBookingForm(prev => ({ ...prev, purpose: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Time *</label>
              <input
                type="datetime-local" className="form-control" required
                value={bookingForm.startTime} onChange={e => setBookingForm(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Time *</label>
              <input
                type="datetime-local" className="form-control" required
                value={bookingForm.endTime} onChange={e => setBookingForm(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* 2. Detail Modal (Triggered from Calendar Cell Click) */}
      <Modal
        isOpen={showDetailModal && !!selectedBooking}
        onClose={() => setShowDetailModal(false)}
        title={`${selectedBooking?.resourceType} Booking`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
            {selectedBooking && (selectedBooking.userId === user?.id || user?.role === 'Admin' || user?.role === 'Asset Manager' || user?.role === 'Department Head') && (
              <>
                <button className="btn btn-secondary" onClick={() => handleOpenReschedule(selectedBooking)}>Reschedule</button>
                <button className="btn btn-danger" onClick={() => handleCancelBooking(selectedBooking.id)}>Cancel Reservation</button>
              </>
            )}
          </>
        }
      >
        {selectedBooking && (
          <div>
            <div className="alert-box alert-box-info" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Info size={16} />
              <div>
                <strong>Reservation active:</strong> status is <span style={{ textTransform: 'capitalize' }}>{selectedBooking.status}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Purpose</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{selectedBooking.purpose}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reserved By</span>
                <div style={{ fontSize: '13px' }}>{selectedBooking.bookedByName} ({selectedBooking.departmentName || 'No Department'})</div>
              </div>
              <div style={{ display: 'flex', justifyBetween: 'space-between', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Start Time</span>
                  <div style={{ fontSize: '13px' }}><Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{new Date(selectedBooking.startTime).toLocaleString()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>End Time</span>
                  <div style={{ fontSize: '13px' }}><Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{new Date(selectedBooking.endTime).toLocaleString()}</div>
                </div>
              </div>
              {selectedBooking.assetId && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Linked Asset</span>
                  <div style={{ fontSize: '13px' }}>{selectedBooking.assetName || 'Linked Asset'} ({selectedBooking.assetId})</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 3. Reschedule Modal */}
      <Modal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        title="Reschedule Booking"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowRescheduleModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRescheduleSubmit}>Save Schedule</button>
          </>
        }
      >
        <form onSubmit={handleRescheduleSubmit}>
          <div className="form-group">
            <label className="form-label">Purpose of Booking</label>
            <input
              type="text" className="form-control" required
              value={rescheduleForm.purpose} onChange={e => setRescheduleForm(prev => ({ ...prev, purpose: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">New Start Time</label>
              <input
                type="datetime-local" className="form-control" required
                value={rescheduleForm.startTime} onChange={e => setRescheduleForm(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">New End Time</label>
              <input
                type="datetime-local" className="form-control" required
                value={rescheduleForm.endTime} onChange={e => setRescheduleForm(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Bookings;
