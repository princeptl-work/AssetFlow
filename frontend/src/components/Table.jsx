import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ArrowUpDown, ChevronLeft, ChevronRight, Download, EyeOff, Eye } from 'lucide-react';

const Table = ({
  columns = [],
  data = [],
  searchKey = '',
  searchPlaceholder = 'Search records...',
  bulkActions = [],
  filters = [],
  exportFilename = 'export'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [activeFilters, setActiveFilters] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(
    columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {})
  );
  const [showColMenu, setShowColMenu] = useState(false);

  // Reset page when queries change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (key, value) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1);
  };

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Visibility toggle
  const toggleColumnVisibility = (key) => {
    setVisibleColumns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Process data (filter -> search -> sort)
  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Apply drop-down filters
    Object.keys(activeFilters).forEach(key => {
      const val = activeFilters[key];
      if (val && val !== 'all') {
        result = result.filter(item => {
          // support nested fields
          if (key.includes('.')) {
            const parts = key.split('.');
            let curr = item;
            for (let part of parts) {
              curr = curr ? curr[part] : null;
            }
            return String(curr) === val;
          }
          return String(item[key]) === val;
        });
      }
    });

    // 2. Apply text search
    if (searchQuery.trim() !== '' && searchKey) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const val = item[searchKey];
        return val ? String(val).toLowerCase().includes(q) : false;
      });
    }

    // 3. Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (aVal === undefined) aVal = '';
        if (bVal === undefined) bVal = '';

        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          return sortConfig.direction === 'asc'
            ? aVal - bVal
            : bVal - aVal;
        }
      });
    }

    return result;
  }, [data, searchQuery, searchKey, activeFilters, sortConfig]);

  // Pagination bounds
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedData.slice(start, start + itemsPerPage);
  }, [processedData, currentPage, itemsPerPage]);

  const totalPages = Math.max(Math.ceil(processedData.length / itemsPerPage), 1);

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = paginatedData.map(item => item.id);
      setSelectedIds(ids);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  // Export visible data to CSV format
  const exportToCSV = () => {
    const activeCols = columns.filter(col => visibleColumns[col.key]);
    const headers = activeCols.map(col => `"${col.label.replace(/"/g, '""')}"`).join(',');
    
    const rows = processedData.map(item => {
      return activeCols.map(col => {
        let val = '';
        if (col.renderText) {
          val = col.renderText(item);
        } else if (item[col.key] !== undefined) {
          val = String(item[col.key]);
        }
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${exportFilename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="table-container">
      {/* Top Header Controls */}
      <div className="table-header-bar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search bar */}
          {searchKey && (
            <div className="search-input-wrapper">
              <Search size={14} className="table-search-icon" />
              <input
                type="text"
                className="table-search"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
          )}

          {/* Filters */}
          {filters.map(f => (
            <select
              key={f.key}
              className="form-control"
              style={{ width: '150px', padding: '6px 12px', fontSize: '13px' }}
              value={activeFilters[f.key] || 'all'}
              onChange={(e) => handleFilterChange(f.key, e.target.value)}
            >
              <option value="all">All {f.label}</option>
              {f.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}
        </div>

        <div className="table-actions">
          {/* Column Visibility Selector */}
          <div style={{ position: 'relative' }}>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowColMenu(!showColMenu)}
            >
              <Eye size={14} />
              Columns
            </button>
            {showColMenu && (
              <div 
                style={{
                  position: 'absolute',
                  top: '32px',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 80,
                  padding: '8px',
                  width: '180px'
                }}
              >
                {columns.map(col => (
                  <label 
                    key={col.key}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '4px 8px', 
                      fontSize: '12px',
                      cursor: 'pointer' 
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.key]}
                      onChange={() => toggleColumnVisibility(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* CSV Export */}
          <button className="btn btn-secondary btn-sm" onClick={exportToCSV}>
            <Download size={14} />
            Export
          </button>

          {/* Bulk Actions */}
          {selectedIds.length > 0 && bulkActions.map(action => (
            <button
              key={action.label}
              className="btn btn-danger btn-sm"
              onClick={() => {
                action.onClick(selectedIds);
                setSelectedIds([]);
              }}
            >
              {action.label} ({selectedIds.length})
            </button>
          ))}
        </div>
      </div>

      {/* Grid Table */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className="responsive-table">
          <thead>
            <tr>
              {/* Checkbox column */}
              {bulkActions.length > 0 && (
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={paginatedData.length > 0 && selectedIds.length === paginatedData.length}
                  />
                </th>
              )}
              {columns.filter(col => visibleColumns[col.key]).map(col => (
                <th
                  key={col.key}
                  className="sortable"
                  onClick={() => handleSort(col.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {col.label}
                    <ArrowUpDown size={12} style={{ color: sortConfig.key === col.key ? 'var(--primary)' : 'var(--text-light)' }} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td 
                  colSpan={columns.filter(col => visibleColumns[col.key]).length + (bulkActions.length > 0 ? 1 : 0)} 
                  style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}
                >
                  No records match the current criteria.
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr key={item.id} className={isSelected ? 'selected' : ''}>
                    {bulkActions.length > 0 && (
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectOne(item.id, e.target.checked)}
                        />
                      </td>
                    )}
                    {columns.filter(col => visibleColumns[col.key]).map(col => (
                      <td key={col.key}>
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div 
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: '#F8FAFC',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Show</span>
          <select 
            className="form-control" 
            style={{ width: '64px', padding: '2px 4px', fontSize: '12px' }}
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>entries of {processedData.length} total</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            style={{ padding: '4px 8px' }}
          >
            <ChevronLeft size={14} />
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            style={{ padding: '4px 8px' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Table;
