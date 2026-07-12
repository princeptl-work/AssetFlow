# AssetFlow

**AssetFlow** is an enterprise-grade Asset & Resource Management ERP built with the MERN stack. It helps organizations digitally manage physical assets, employee allocations, maintenance workflows, resource bookings, audit cycles, notifications, analytics, and organization-wide asset tracking.

Inspired by Odoo's professional UX with a purple/white enterprise theme.

## Features

- **Authentication** — Login, signup (Employee-only), JWT session persistence, logout
- **Role-Based Access Control** — Admin, Asset Manager, Department Head, Employee
- **Organization Setup** — Departments (hierarchy), asset categories, employee directory
- **Asset Lifecycle** — Registration, allocation, returns, transfers, state transitions
- **Shared Resource Booking** — Calendar with overlap prevention
- **Maintenance Management** — Full approval workflow with technician assignment
- **Audit Cycles** — Verification, discrepancy reports, record locking
- **Reports & Analytics** — Charts, filters, CSV/Excel/PDF export
- **Notifications & Activity Logs** — Real-time alerts and full audit trail
- **Global Search** — Instant search across assets, employees, bookings, and more

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, React Router, Lucide |
| Backend  | Node.js, Express                    |
| Database | JSON file store (modular, portable) |
| Auth     | JWT + bcrypt                        |

## Quick Start

### Prerequisites

- Node.js 18+

### Installation

```bash
# Install all dependencies
npm run install:all
```

### Development

Run backend and frontend in separate terminals:

```bash
# Terminal 1 — Backend API (port 5000)
npm run dev:backend

# Terminal 2 — Frontend (port 3000)
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Accounts

| Role             | Email                    | Password      |
|------------------|--------------------------|---------------|
| Admin            | admin@assetflow.com      | admin123      |
| Asset Manager    | manager@assetflow.com    | manager123    |
| Department Head  | head@assetflow.com       | head123       |
| Employee         | employee@assetflow.com   | employee123   |

## Project Structure

```
AssetFlow/
├── backend/
│   ├── routes/          # Modular API routes
│   ├── data/            # JSON database files (auto-created)
│   ├── db.js            # Database client + seed data
│   ├── authMiddleware.js
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/  # Reusable UI (Table, Modal, Charts, etc.)
│       ├── context/     # Auth & Notification providers
│       └── pages/       # Feature modules
└── package.json
```

## API Endpoints

| Module        | Base Path              |
|---------------|------------------------|
| Auth          | `/api/auth`            |
| Organization  | `/api/organization`    |
| Assets        | `/api/assets`          |
| Transfers     | `/api/transfers`       |
| Bookings      | `/api/bookings`        |
| Maintenance   | `/api/maintenance`     |
| Audits        | `/api/audits`          |
| Notifications | `/api/notifications`   |
| Activity Logs | `/api/logs`            |
| Analytics     | `/api/analytics`       |

## Production Build

```bash
npm run build:frontend
NODE_ENV=production npm run start:backend
```

The backend serves the built frontend from `frontend/dist` when `NODE_ENV=production`.

## License

MIT
