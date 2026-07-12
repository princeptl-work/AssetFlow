const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Load environment variables
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const COLLECTIONS = [
  'users',
  'departments',
  'categories',
  'assets',
  'bookings',
  'maintenance',
  'audits',
  'notifications',
  'logs',
  'transfers',
  'requests'
];

const TABLE_COLUMNS = {
  users: ['id', 'employeeId', 'name', 'email', 'password', 'phone', 'photo', 'departmentId', 'role', 'status', 'joiningDate', 'createdAt', 'updatedAt'],
  departments: ['id', 'name', 'managerId', 'parentId', 'description', 'status', 'createdAt', 'updatedAt'],
  categories: ['id', 'name', 'warrantyPeriod', 'expectedLife', 'color', 'manufacturer', 'description', 'status', 'createdAt', 'updatedAt'],
  assets: ['id', 'name', 'categoryId', 'serialNumber', 'modelNumber', 'manufacturer', 'acquisitionDate', 'acquisitionCost', 'location', 'departmentId', 'condition', 'status', 'warrantyExpiry', 'bookable', 'remarks', 'allocatedToUserId', 'allocatedDate', 'expectedReturnDate', 'assetTag', 'qrCode', 'barcode', 'history', 'photo', 'documents', 'createdAt', 'updatedAt'],
  bookings: ['id', 'resourceType', 'assetId', 'userId', 'purpose', 'startTime', 'endTime', 'status', 'departmentId', 'createdAt', 'updatedAt'],
  maintenance: ['id', 'assetId', 'raisedByUserId', 'issue', 'priority', 'description', 'status', 'technicianId', 'images', 'documents', 'timeline', 'createdAt', 'updatedAt'],
  audits: ['id', 'name', 'departmentId', 'location', 'startDate', 'endDate', 'auditors', 'description', 'status', 'details', 'discrepancyReport', 'closedAt', 'createdAt', 'updatedAt'],
  notifications: ['id', 'userId', 'message', 'type', 'link', 'isRead', 'timestamp'],
  logs: ['id', 'userId', 'userName', 'action', 'entity', 'entityId', 'previousValue', 'newValue', 'ip', 'timestamp'],
  transfers: ['id', 'assetId', 'requestedByUserId', 'targetUserId', 'targetDepartmentId', 'status', 'deptHeadApproverId', 'assetManagerApproverId', 'notes', 'requestDate', 'deptHeadApprovalDate', 'assetManagerApprovalDate', 'createdAt', 'updatedAt'],
  requests: ['id', 'userId', 'categoryId', 'reason', 'status', 'allocatedAssetId', 'remarks', 'createdAt', 'updatedAt']
};

const TABLE_SCHEMAS = {
  users: `
    CREATE TABLE IF NOT EXISTS "users" (
      "id" VARCHAR(255) PRIMARY KEY,
      "employeeId" VARCHAR(255),
      "name" VARCHAR(255),
      "email" VARCHAR(255) UNIQUE,
      "password" VARCHAR(255),
      "phone" VARCHAR(255),
      "photo" TEXT,
      "departmentId" VARCHAR(255),
      "role" VARCHAR(255),
      "status" VARCHAR(255),
      "joiningDate" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  departments: `
    CREATE TABLE IF NOT EXISTS "departments" (
      "id" VARCHAR(255) PRIMARY KEY,
      "name" VARCHAR(255),
      "managerId" VARCHAR(255),
      "parentId" VARCHAR(255),
      "description" TEXT,
      "status" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  categories: `
    CREATE TABLE IF NOT EXISTS "categories" (
      "id" VARCHAR(255) PRIMARY KEY,
      "name" VARCHAR(255),
      "warrantyPeriod" INTEGER,
      "expectedLife" INTEGER,
      "color" VARCHAR(255),
      "manufacturer" VARCHAR(255),
      "description" TEXT,
      "status" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  assets: `
    CREATE TABLE IF NOT EXISTS "assets" (
      "id" VARCHAR(255) PRIMARY KEY,
      "name" VARCHAR(255),
      "categoryId" VARCHAR(255),
      "serialNumber" VARCHAR(255),
      "modelNumber" VARCHAR(255),
      "manufacturer" VARCHAR(255),
      "acquisitionDate" VARCHAR(255),
      "acquisitionCost" NUMERIC,
      "location" VARCHAR(255),
      "departmentId" VARCHAR(255),
      "condition" VARCHAR(255),
      "status" VARCHAR(255),
      "warrantyExpiry" VARCHAR(255),
      "bookable" VARCHAR(255),
      "remarks" TEXT,
      "allocatedToUserId" VARCHAR(255),
      "allocatedDate" VARCHAR(255),
      "expectedReturnDate" VARCHAR(255),
      "assetTag" VARCHAR(255),
      "qrCode" TEXT,
      "barcode" TEXT,
      "history" JSONB,
      "photo" TEXT,
      "documents" JSONB,
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  bookings: `
    CREATE TABLE IF NOT EXISTS "bookings" (
      "id" VARCHAR(255) PRIMARY KEY,
      "resourceType" VARCHAR(255),
      "assetId" VARCHAR(255),
      "userId" VARCHAR(255),
      "purpose" TEXT,
      "startTime" VARCHAR(255),
      "endTime" VARCHAR(255),
      "status" VARCHAR(255),
      "departmentId" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  maintenance: `
    CREATE TABLE IF NOT EXISTS "maintenance" (
      "id" VARCHAR(255) PRIMARY KEY,
      "assetId" VARCHAR(255),
      "raisedByUserId" VARCHAR(255),
      "issue" VARCHAR(255),
      "priority" VARCHAR(255),
      "description" TEXT,
      "status" VARCHAR(255),
      "technicianId" VARCHAR(255),
      "images" JSONB,
      "documents" JSONB,
      "timeline" JSONB,
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  audits: `
    CREATE TABLE IF NOT EXISTS "audits" (
      "id" VARCHAR(255) PRIMARY KEY,
      "name" VARCHAR(255),
      "departmentId" VARCHAR(255),
      "location" VARCHAR(255),
      "startDate" VARCHAR(255),
      "endDate" VARCHAR(255),
      "auditors" JSONB,
      "description" TEXT,
      "status" VARCHAR(255),
      "details" JSONB,
      "discrepancyReport" JSONB,
      "closedAt" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  notifications: `
    CREATE TABLE IF NOT EXISTS "notifications" (
      "id" VARCHAR(255) PRIMARY KEY,
      "userId" VARCHAR(255),
      "message" TEXT,
      "type" VARCHAR(255),
      "link" VARCHAR(255),
      "isRead" BOOLEAN,
      "timestamp" VARCHAR(255)
    )
  `,
  logs: `
    CREATE TABLE IF NOT EXISTS "logs" (
      "id" VARCHAR(255) PRIMARY KEY,
      "userId" VARCHAR(255),
      "userName" VARCHAR(255),
      "action" VARCHAR(255),
      "entity" VARCHAR(255),
      "entityId" VARCHAR(255),
      "previousValue" TEXT,
      "newValue" TEXT,
      "ip" VARCHAR(255),
      "timestamp" VARCHAR(255)
    )
  `,
  transfers: `
    CREATE TABLE IF NOT EXISTS "transfers" (
      "id" VARCHAR(255) PRIMARY KEY,
      "assetId" VARCHAR(255),
      "requestedByUserId" VARCHAR(255),
      "targetUserId" VARCHAR(255),
      "targetDepartmentId" VARCHAR(255),
      "status" VARCHAR(255),
      "deptHeadApproverId" VARCHAR(255),
      "assetManagerApproverId" VARCHAR(255),
      "notes" TEXT,
      "requestDate" VARCHAR(255),
      "deptHeadApprovalDate" VARCHAR(255),
      "assetManagerApprovalDate" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  requests: `
    CREATE TABLE IF NOT EXISTS "requests" (
      "id" VARCHAR(255) PRIMARY KEY,
      "userId" VARCHAR(255),
      "categoryId" VARCHAR(255),
      "reason" TEXT,
      "status" VARCHAR(255),
      "allocatedAssetId" VARCHAR(255),
      "remarks" TEXT,
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `
};

// Initialize empty local JSON files if they don't exist
COLLECTIONS.forEach(col => {
  const filePath = path.join(DATA_DIR, `${col}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
});

let pgPool = null;
let pgConnected = false;

// Connect to PostgreSQL if DATABASE_URL is set
if (process.env.DATABASE_URL) {
  console.log(`[PG] Attempting to connect to PostgreSQL...`);
  
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Test connection & run table creation & sync
  pgPool.connect()
    .then(async (client) => {
      pgConnected = true;
      console.log('==================================================');
      console.log('  SUCCESS: Connected to Supabase PostgreSQL!');
      console.log('  Synchronizing data tables with local cache...');
      console.log('==================================================');
      
      try {
        // Create tables if they do not exist
        for (const col of COLLECTIONS) {
          await client.query(TABLE_SCHEMAS[col]);
        }

        // Automatic Column Migration: Ensure all columns in TABLE_COLUMNS exist in PostgreSQL
        for (const tableName of COLLECTIONS) {
          for (const columnName of TABLE_COLUMNS[tableName]) {
            const checkCol = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name=$1 AND column_name=$2
            `, [tableName, columnName]);

            if (checkCol.rows.length === 0) {
              console.log(`[PG Migration] Adding missing column "${columnName}" to table "${tableName}"...`);
              let colType = 'VARCHAR(255)';
              if (['description', 'remarks', 'purpose', 'reason', 'discrepancyReport', 'issue', 'notes'].includes(columnName)) {
                colType = 'TEXT';
              } else if (['history', 'documents', 'timeline', 'details'].includes(columnName)) {
                colType = 'JSONB';
              } else if (columnName === 'acquisitionCost') {
                colType = 'NUMERIC';
              } else if (columnName === 'warrantyPeriod' || columnName === 'expectedLife') {
                colType = 'INTEGER';
              } else if (columnName === 'isRead') {
                colType = 'BOOLEAN';
              }
              await client.query(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${colType}`);
            }
          }
        }
        console.log('[PG] Verified database table structures and applied any pending column migrations.');
        
        // Release client back to pool before calling sync
        client.release();
        
        // Sync tables
        await syncFromPostgres();

        // Run overdue allocations checker
        await checkOverdueAllocations();
      } catch (schemaErr) {
        client.release();
        console.error('[PG Schema Initialization Error]:', schemaErr);
      }
    })
    .catch(err => {
      console.error('==================================================');
      console.error('  ERROR: Failed to connect to PostgreSQL.');
      console.error('  Falling back to local JSON database.');
      console.error(err.message);
      console.error('==================================================');
    });
}

// Asynchronously mirror all records in the array to the PostgreSQL table
async function mirrorToPostgres(table, data) {
  if (!pgConnected || !pgPool) return;
  
  try {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      // Truncate table with cascade
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
      
      if (data.length > 0) {
        const cols = TABLE_COLUMNS[table];
        const valuesPlaceholder = [];
        const flatValues = [];
        let valIdx = 1;

        for (const item of data) {
          const rowPlaceholders = [];
          for (const col of cols) {
            let val = item[col];
            // Format value appropriately
            if (col === 'history' || col === 'results' || col === 'previousValue' || col === 'newValue' || col === 'auditors' || col === 'details' || col === 'discrepancyReport' || col === 'images' || col === 'documents' || col === 'timeline') {
              val = val ? JSON.stringify(val) : null;
            } else if (col === 'warrantyPeriod' || col === 'expectedLife') {
              val = val !== undefined && val !== null && val !== '' ? parseInt(val, 10) : null;
            } else if (col === 'acquisitionCost' || col === 'cost') {
              val = val !== undefined && val !== null && val !== '' ? parseFloat(val) : null;
            } else if (col === 'isRead') {
              val = val !== undefined && val !== null ? !!val : null;
            } else {
              val = val !== undefined && val !== null ? String(val) : null;
            }
            flatValues.push(val);
            rowPlaceholders.push(`$${valIdx++}`);
          }
          valuesPlaceholder.push(`(${rowPlaceholders.join(', ')})`);
        }

        const colsQuoted = cols.map(c => `"${c}"`).join(', ');
        const insertQuery = `INSERT INTO "${table}" (${colsQuoted}) VALUES ${valuesPlaceholder.join(', ')}`;
        await client.query(insertQuery, flatValues);
      }
      await client.query('COMMIT');
      console.log(`[PG Mirror] Mirrored ${data.length} records to table "${table}" successfully.`);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`[PG Mirror Error] Failed to mirror write for "${table}":`, err);
  }
}

let activeSyncPromise = null;
let lastSyncTime = 0;
const SYNC_THROTTLE_MS = 1000; // 1 second throttle

// Pull collections from PostgreSQL to JSON files in parallel, or seed PostgreSQL if empty
async function syncFromPostgres(force = false) {
  if (!pgConnected || !pgPool) return;

  const now = Date.now();
  if (!force && (now - lastSyncTime < SYNC_THROTTLE_MS)) {
    return activeSyncPromise; // Return existing sync promise if within throttle period
  }

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      await Promise.all(COLLECTIONS.map(async (col) => {
        try {
          const res = await pgPool.query(`SELECT * FROM "${col}"`);
          const data = res.rows.map(row => {
            const cleanItem = {};
            const cols = TABLE_COLUMNS[col];
            for (const c of cols) {
              let val = row[c] !== undefined ? row[c] : row[c.toLowerCase()];
              // Parse types back to JS if needed
              if (c === 'history' || c === 'results' || c === 'previousValue' || c === 'newValue' || c === 'auditors' || c === 'details' || c === 'discrepancyReport' || c === 'images' || c === 'documents' || c === 'timeline') {
                if (val) {
                  if (typeof val === 'string') {
                    try { cleanItem[c] = JSON.parse(val); } catch(e) { cleanItem[c] = val; }
                  } else {
                    cleanItem[c] = val;
                  }
                } else {
                  if (c === 'history' || c === 'auditors' || c === 'discrepancyReport' || c === 'images' || c === 'documents' || c === 'timeline') {
                    cleanItem[c] = [];
                  } else if (c === 'details') {
                    cleanItem[c] = {};
                  } else {
                    cleanItem[c] = null;
                  }
                }
              } else if (c === 'warrantyPeriod' || c === 'expectedLife') {
                cleanItem[c] = val !== null && val !== undefined ? parseInt(val, 10) : null;
              } else if (c === 'acquisitionCost' || c === 'cost') {
                cleanItem[c] = val !== null && val !== undefined ? parseFloat(val) : null;
              } else if (c === 'isRead') {
                cleanItem[c] = val !== null && val !== undefined ? !!val : null;
              } else {
                cleanItem[c] = val !== null && val !== undefined ? String(val) : '';
              }
            }
            return cleanItem;
          });

          if (data.length > 0) {
            fs.writeFileSync(path.join(DATA_DIR, `${col}.json`), JSON.stringify(data, null, 2));
          } else {
            // If PostgreSQL is empty, seed it with the current local database state
            const localData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${col}.json`), 'utf8'));
            if (localData.length > 0) {
              console.log(`[PG Sync] Seeding PostgreSQL table "${col}" with ${localData.length} local records...`);
              await mirrorToPostgres(col, localData);
            }
          }
        } catch (err) {
          console.error(`[PG Sync Error] Failed to sync collection "${col}":`, err);
        }
      }));
      lastSyncTime = Date.now();
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

// Check for overdue allocations and generate notifications
async function checkOverdueAllocations() {
  try {
    const assets = db.read('assets');
    const todayStr = new Date().toISOString().split('T')[0];
    const notifications = db.read('notifications');
    const users = db.read('users');

    const overdueAssets = assets.filter(a => 
      a.status === 'Allocated' && 
      a.expectedReturnDate && 
      a.expectedReturnDate < todayStr
    );

    let createdCount = 0;

    for (const asset of overdueAssets) {
      const targetUserId = asset.allocatedToUserId;
      if (!targetUserId) continue;

      // Check if alert already exists for this asset
      const alertExists = notifications.some(n => 
        n.userId === targetUserId && 
        n.type === 'Overdue Return Alert' && 
        n.message.includes(asset.assetTag)
      );

      if (!alertExists) {
        const holder = users.find(u => u.id === targetUserId);
        const holderName = holder ? holder.name : 'Employee';
        const msg = `Asset "${asset.name}" (${asset.assetTag}) allocated to you is overdue since ${asset.expectedReturnDate}. Please return it.`;
        
        // Notify the holding employee
        db.create('notifications', {
          userId: targetUserId,
          message: msg,
          type: 'Overdue Return Alert',
          link: '/assets',
          isRead: false,
          timestamp: new Date().toISOString()
        });

        // Notify Admins and Asset Managers
        const adminsAndManagers = users.filter(u => u.role === 'Admin' || u.role === 'Asset Manager');
        adminsAndManagers.forEach(mgr => {
          db.create('notifications', {
            userId: mgr.id,
            message: `Overdue Return Alert: Asset "${asset.name}" (${asset.assetTag}) held by ${holderName} was expected back on ${asset.expectedReturnDate}.`,
            type: 'Overdue Return Alert',
            link: '/assets',
            isRead: false,
            timestamp: new Date().toISOString()
          });
        });

        createdCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`[PG Overdue Check] Generated ${createdCount} new Overdue Return Alert notifications.`);
    }
  } catch (err) {
    console.error('Error running checkOverdueAllocations:', err);
  }
}

// Database client wrapper
const db = {
  // Sync wrapper
  syncFromPostgres,

  // Read all from a collection
  read(collection) {
    const filePath = path.join(DATA_DIR, `${collection}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`Error reading collection ${collection}:`, err);
      return [];
    }
  },

  // Write all to a collection
  write(collection, data) {
    const filePath = path.join(DATA_DIR, `${collection}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      // Mirror writes to PostgreSQL asynchronously in the background
      if (pgConnected && pgPool) {
        mirrorToPostgres(collection, data);
      }
      return true;
    } catch (err) {
      console.error(`Error writing collection ${collection}:`, err);
      return false;
    }
  },

  // Find items
  find(collection, query = {}) {
    const items = this.read(collection);
    return items.filter(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
  },

  // Find single item
  findOne(collection, query = {}) {
    const items = this.read(collection);
    return items.find(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
  },

  // Find by ID
  findById(collection, id) {
    const items = this.read(collection);
    return items.find(item => item.id === id);
  },

  // Create new item
  create(collection, data) {
    const items = this.read(collection);
    
    // Generate id
    let id;
    if (collection === 'users') {
      const count = items.length + 1;
      id = `USR${String(count).padStart(4, '0')}`;
    } else if (collection === 'assets') {
      const count = items.length + 1;
      id = `AF-${String(count).padStart(4, '0')}`;
    } else {
      id = `${collection.slice(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    const newItem = { id, ...data, createdAt: new Date().toISOString() };
    items.push(newItem);
    this.write(collection, items);
    return newItem;
  },

  // Update item
  update(collection, id, data) {
    const items = this.read(collection);
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    const original = items[index];
    const updatedItem = { ...original, ...data, updatedAt: new Date().toISOString() };
    items[index] = updatedItem;
    this.write(collection, items);
    return { updated: updatedItem, original };
  },

  // Delete item
  delete(collection, id) {
    const items = this.read(collection);
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return false;

    const deletedItem = items.splice(index, 1)[0];
    this.write(collection, items);
    return deletedItem;
  },

  // Delete many items matching a query
  deleteMany(collection, query = {}) {
    const items = this.read(collection);
    const remaining = items.filter(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return true;
      }
      return false;
    });
    this.write(collection, remaining);
    return items.length - remaining.length;
  }
};

// Seed baseline data if empty
function seedDatabase() {
  const departments = db.read('departments');
  let deptIt, deptOps;
  if (departments.length === 0) {
    deptIt = db.create('departments', {
      name: 'IT Department',
      managerId: '',
      parentId: '',
      description: 'Enterprise information technology infrastructure and services.',
      status: 'Active'
    });
    deptOps = db.create('departments', {
      name: 'Operations Department',
      managerId: '',
      parentId: '',
      description: 'Physical facilities, fleet management, and logistics.',
      status: 'Active'
    });
    db.create('departments', {
      name: 'Human Resources',
      managerId: '',
      parentId: '',
      description: 'Talent management, employee directory, and support.',
      status: 'Active'
    });
    db.create('departments', {
      name: 'Finance & Accounts',
      managerId: '',
      parentId: '',
      description: 'Asset accounting, budgets, and reporting.',
      status: 'Active'
    });
  } else {
    deptIt = departments.find(d => d.name === 'IT Department');
    deptOps = departments.find(d => d.name === 'Operations Department');
  }

  const users = db.read('users');
  if (users.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const adminUser = db.create('users', {
      employeeId: 'EMP-001',
      name: 'Admin',
      email: 'admin@assetflow.com',
      password: hashedPassword,
      phone: '+1 (555) 019-2834',
      photo: '',
      departmentId: deptIt ? deptIt.id : '',
      role: 'Admin',
      status: 'Active',
      joiningDate: '2026-01-01'
    });

    const managerPassword = bcrypt.hashSync('manager123', 10);
    const assetManager = db.create('users', {
      employeeId: 'AF-EMP-002',
      name: 'Sarah Connor',
      email: 'manager@assetflow.com',
      password: managerPassword,
      phone: '+1 (555) 019-5832',
      photo: '',
      departmentId: deptIt ? deptIt.id : '',
      role: 'Asset Manager',
      status: 'Active',
      joiningDate: '2026-02-15'
    });

    const headPassword = bcrypt.hashSync('head123', 10);
    const deptHead = db.create('users', {
      employeeId: 'AF-EMP-003',
      name: 'John Doe',
      email: 'head@assetflow.com',
      password: headPassword,
      phone: '+1 (555) 019-4952',
      photo: '',
      departmentId: deptOps ? deptOps.id : '',
      role: 'Department Head',
      status: 'Active',
      joiningDate: '2026-03-01'
    });

    if (deptOps && deptHead) {
      db.update('departments', deptOps.id, { managerId: deptHead.id });
    }

    const employeePassword = bcrypt.hashSync('employee123', 10);
    db.create('users', {
      employeeId: 'AF-EMP-004',
      name: 'Marcus Wright',
      email: 'employee@assetflow.com',
      password: employeePassword,
      phone: '+1 (555) 019-9238',
      photo: '',
      departmentId: deptOps ? deptOps.id : '',
      role: 'Employee',
      status: 'Active',
      joiningDate: '2026-04-10'
    });
  }

  const categories = db.read('categories');
  if (categories.length === 0) {
    db.create('categories', {
      name: 'Electronics',
      warrantyPeriod: 24,
      expectedLife: 4,
      color: '#4F46E5',
      manufacturer: 'Apple/Dell/HP',
      description: 'Laptops, desktops, monitors, keyboards, mice, and other peripherals.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Furniture',
      warrantyPeriod: 12,
      expectedLife: 10,
      color: '#D97706',
      manufacturer: 'Herman Miller/Ikea',
      description: 'Office chairs, standing desks, conference tables, cabinets.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Vehicles',
      warrantyPeriod: 36,
      expectedLife: 8,
      color: '#059669',
      manufacturer: 'Tesla/Toyota',
      description: 'Company cars, vans, shuttle buses.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Machinery',
      warrantyPeriod: 12,
      expectedLife: 12,
      color: '#DC2626',
      manufacturer: 'Caterpillar/Siemens',
      description: 'Heavy machinery, tools, and industrial assets.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Rooms',
      warrantyPeriod: 0,
      expectedLife: 50,
      color: '#7C3AED',
      manufacturer: 'N/A',
      description: 'Meeting rooms, conference rooms, testing labs, and training halls.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Equipment',
      warrantyPeriod: 12,
      expectedLife: 5,
      color: '#2563EB',
      manufacturer: 'Epson/Logitech',
      description: 'Projectors, speakers, whiteboards, video systems.',
      status: 'Active'
    });
  }
}

seedDatabase();

module.exports = db;
