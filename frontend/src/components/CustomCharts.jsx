import React, { useState } from 'react';

// ==========================================
// DOUGHNUT / PIE CHART COMPONENT
// ==========================================
export const PieChart = ({ data = [], title }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  let accumulatedAngle = 0;
  const radius = 50;
  const cx = 80;
  const cy = 80;
  const strokeWidth = 16;
  const innerRadius = radius - strokeWidth;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '160px', height: '160px' }}>
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={radius - strokeWidth/2} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
          ) : (
            data.map((item, index) => {
              const percentage = item.value / total;
              const angle = percentage * 360;
              const startAngle = accumulatedAngle;
              const endAngle = accumulatedAngle + angle;
              accumulatedAngle = endAngle;

              // Convert polar to cartesian coordinates
              const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
                const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
                return {
                  x: centerX + r * Math.cos(angleInRadians),
                  y: centerY + r * Math.sin(angleInRadians)
                };
              };

              const rMid = radius - strokeWidth/2;
              const start = polarToCartesian(cx, cy, rMid, endAngle);
              const end = polarToCartesian(cx, cy, rMid, startAngle);
              const largeArcFlag = angle > 180 ? 1 : 0;
              
              // Arc path
              const d = [
                "M", start.x, start.y,
                "A", rMid, rMid, 0, largeArcFlag, 0, end.x, end.y
              ].join(" ");

              const isHovered = hoveredIndex === index;

              return (
                <path
                  key={item.name}
                  d={d}
                  fill="none"
                  stroke={item.color || '#875A7B'}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  style={{
                    cursor: 'pointer',
                    transition: 'stroke-width 0.2s, opacity 0.2s',
                    opacity: hoveredIndex !== null && !isHovered ? 0.6 : 1
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })
          )}
        </svg>

        {/* Center Text for Doughnut Chart */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}
        >
          {hoveredIndex !== null && data[hoveredIndex] ? (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                {data[hoveredIndex].name}
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B' }}>
                {data[hoveredIndex].value}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500' }}>
                TOTAL
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#1E293B', fontFamily: 'var(--font-display)' }}>
                {total}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          marginTop: '16px',
          width: '100%',
          fontSize: '11px',
          fontWeight: '550'
        }}
      >
        {data.map((item, index) => (
          <div 
            key={item.name} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              opacity: hoveredIndex !== null && hoveredIndex !== index ? 0.5 : 1,
              transition: 'opacity 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
            <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}: {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// BAR CHART COMPONENT
// ==========================================
export const BarChart = ({ data = [], height = 160 }) => {
  const [hoveredBar, setHoveredBar] = useState(null);
  
  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  const chartHeight = height - 30; // Leave space for labels
  const barPadding = 12;

  return (
    <div style={{ width: '100%', height: `${height}px`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: `${barPadding}px`, position: 'relative', borderBottom: '1px solid var(--border-color)' }}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxVal) * chartHeight;
          const isHovered = hoveredBar === index;

          return (
            <div 
              key={item.name} 
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                position: 'relative'
              }}
              onMouseEnter={() => setHoveredBar(index)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div 
                  style={{
                    position: 'absolute',
                    bottom: `${barHeight + 10}px`,
                    backgroundColor: '#1E293B',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '600',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {item.value}
                </div>
              )}

              {/* Bar Fill */}
              <div 
                style={{
                  width: '100%',
                  height: `${barHeight}px`,
                  backgroundColor: isHovered ? 'var(--primary-hover)' : 'var(--primary)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease-out, background-color 0.2s',
                  opacity: hoveredBar !== null && !isHovered ? 0.7 : 1
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X Axis Labels */}
      <div style={{ display: 'flex', gap: `${barPadding}px`, height: '24px', alignItems: 'center' }}>
        {data.map((item, index) => (
          <div 
            key={item.name} 
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '10px',
              fontWeight: '600',
              color: hoveredBar === index ? 'var(--primary)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// LINE CHART COMPONENT
// ==========================================
export const LineChart = ({ data = [], height = 160 }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  
  const width = 500;
  const chartHeight = height - 40;
  const paddingX = 40;
  const paddingY = 20;

  const points = data.map((item, index) => {
    const x = paddingX + (index / (data.length - 1 || 1)) * (width - paddingX * 2);
    const y = paddingY + chartHeight - (item.value / maxVal) * (chartHeight - paddingY);
    return { x, y, val: item.value, label: item.name };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // For gradient fill area
  const areaD = points.length > 0 ? [
    ...points,
    { x: points[points.length - 1].x, y: height - 20 },
    { x: points[0].x, y: height - 20 }
  ].reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '') + ' Z' : '';

  return (
    <div style={{ width: '100%', height: `${height}px`, display: 'flex', flexDirection: 'column' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.5, 1].map((r, i) => {
          const y = paddingY + chartHeight - r * (chartHeight - paddingY);
          return (
            <line 
              key={i} 
              x1={paddingX} 
              y1={y} 
              x2={width - paddingX} 
              y2={y} 
              stroke="#F1F5F9" 
              strokeWidth="1.5" 
            />
          );
        })}

        {/* Gradient fill */}
        {areaD && <path d={areaD} fill="url(#lineGrad)" />}

        {/* Line Path */}
        {pathD && (
          <path 
            d={pathD} 
            fill="none" 
            stroke="var(--primary)" 
            strokeWidth="3" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Points & Interactive Dots */}
        {points.map((p, index) => {
          const isHovered = hoveredPoint === index;

          return (
            <g key={index}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 6 : 4}
                fill="white"
                stroke="var(--primary)"
                strokeWidth={isHovered ? 3 : 2}
                style={{ cursor: 'pointer', transition: 'r 0.15s, stroke-width 0.15s' }}
                onMouseEnter={() => setHoveredPoint(index)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              
              {/* Tooltip on dot hover */}
              {isHovered && (
                <g>
                  <rect
                    x={p.x - 25}
                    y={p.y - 30}
                    width="50"
                    height="20"
                    rx="4"
                    fill="#1E293B"
                  />
                  <text
                    x={p.x}
                    y={p.y - 17}
                    fill="white"
                    fontSize="9"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {p.val}
                  </text>
                </g>
              )}

              {/* Axis Label */}
              <text
                x={p.x}
                y={height - 5}
                fill="var(--text-muted)"
                fontSize="8"
                fontWeight="600"
                textAnchor="middle"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
