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
  'transfers'
];

const TABLE_COLUMNS = {
  users: ['id', 'employeeId', 'name', 'email', 'password', 'phone', 'photo', 'departmentId', 'role', 'status', 'joiningDate', 'createdAt', 'updatedAt'],
  departments: ['id', 'name', 'managerId', 'parentId', 'description', 'status', 'createdAt', 'updatedAt'],
  categories: ['id', 'name', 'warrantyPeriod', 'expectedLife', 'color', 'manufacturer', 'description', 'status', 'createdAt', 'updatedAt'],
  assets: ['id', 'name', 'categoryId', 'serialNumber', 'modelNumber', 'manufacturer', 'acquisitionDate', 'acquisitionCost', 'location', 'departmentId', 'condition', 'status', 'warrantyExpiry', 'bookable', 'remarks', 'allocatedToUserId', 'allocatedDate', 'expectedReturnDate', 'assetTag', 'qrCode', 'barcode', 'history', 'createdAt', 'updatedAt'],
  bookings: ['id', 'assetId', 'userId', 'startDate', 'endDate', 'purpose', 'status', 'approvedBy', 'createdAt', 'updatedAt'],
  maintenance: ['id', 'assetId', 'type', 'description', 'cost', 'startDate', 'endDate', 'performedBy', 'notes', 'status', 'createdAt', 'updatedAt'],
  audits: ['id', 'title', 'description', 'status', 'startDate', 'endDate', 'auditorId', 'results', 'createdAt', 'updatedAt'],
  notifications: ['id', 'userId', 'message', 'type', 'link', 'isRead', 'timestamp'],
  logs: ['id', 'userId', 'userName', 'action', 'targetType', 'targetId', 'previousValue', 'newValue', 'timestamp', 'ipAddress', 'userAgent'],
  transfers: ['id', 'assetId', 'sourceDepartmentId', 'targetDepartmentId', 'targetUserId', 'requestedById', 'deptHeadApproverId', 'status', 'remarks', 'createdAt', 'updatedAt']
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
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  bookings: `
    CREATE TABLE IF NOT EXISTS "bookings" (
      "id" VARCHAR(255) PRIMARY KEY,
      "assetId" VARCHAR(255),
      "userId" VARCHAR(255),
      "startDate" VARCHAR(255),
      "endDate" VARCHAR(255),
      "purpose" TEXT,
      "status" VARCHAR(255),
      "approvedBy" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  maintenance: `
    CREATE TABLE IF NOT EXISTS "maintenance" (
      "id" VARCHAR(255) PRIMARY KEY,
      "assetId" VARCHAR(255),
      "type" VARCHAR(255),
      "description" TEXT,
      "cost" NUMERIC,
      "startDate" VARCHAR(255),
      "endDate" VARCHAR(255),
      "performedBy" VARCHAR(255),
      "notes" TEXT,
      "status" VARCHAR(255),
      "createdAt" VARCHAR(255),
      "updatedAt" VARCHAR(255)
    )
  `,
  audits: `
    CREATE TABLE IF NOT EXISTS "audits" (
      "id" VARCHAR(255) PRIMARY KEY,
      "title" VARCHAR(255),
      "description" TEXT,
      "status" VARCHAR(255),
      "startDate" VARCHAR(255),
      "endDate" VARCHAR(255),
      "auditorId" VARCHAR(255),
      "results" JSONB,
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
      "targetType" VARCHAR(255),
      "targetId" VARCHAR(255),
      "previousValue" JSONB,
      "newValue" JSONB,
      "timestamp" VARCHAR(255),
      "ipAddress" VARCHAR(255),
      "userAgent" TEXT
    )
  `,
  transfers: `
    CREATE TABLE IF NOT EXISTS "transfers" (
      "id" VARCHAR(255) PRIMARY KEY,
      "assetId" VARCHAR(255),
      "sourceDepartmentId" VARCHAR(255),
      "targetDepartmentId" VARCHAR(255),
      "targetUserId" VARCHAR(255),
      "requestedById" VARCHAR(255),
      "deptHeadApproverId" VARCHAR(255),
      "status" VARCHAR(255),
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
        console.log('[PG] Verified database table structures.');
        
        // Release client back to pool before calling sync
        client.release();
        
        // Sync tables
        await syncFromPostgres();
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
            if (col === 'history' || col === 'results' || col === 'previousValue' || col === 'newValue') {
              val = val ? JSON.stringify(val) : null;
            } else if (col === 'warrantyPeriod' || col === 'expectedLife') {
              val = val !== undefined && val !== null ? parseInt(val, 10) : null;
            } else if (col === 'acquisitionCost' || col === 'cost') {
              val = val !== undefined && val !== null ? parseFloat(val) : null;
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

// Pull collections from PostgreSQL to JSON files, or seed PostgreSQL if empty
async function syncFromPostgres() {
  for (const col of COLLECTIONS) {
    try {
      const res = await pgPool.query(`SELECT * FROM "${col}"`);
      const data = res.rows.map(row => {
        const cleanItem = {};
        const cols = TABLE_COLUMNS[col];
        for (const c of cols) {
          let val = row[c] !== undefined ? row[c] : row[c.toLowerCase()];
          // Parse types back to JS if needed
          if (c === 'history' || c === 'results' || c === 'previousValue' || c === 'newValue') {
            if (val) {
              if (typeof val === 'string') {
                try { cleanItem[c] = JSON.parse(val); } catch(e) { cleanItem[c] = val; }
              } else {
                cleanItem[c] = val;
              }
            } else {
              cleanItem[c] = null;
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
        console.log(`[PG Sync] Loaded ${data.length} records for "${col}" from PostgreSQL.`);
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
  }
}

// Database client wrapper
const db = {
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
      employeeId: 'AF-EMP-001',
      name: 'System Administrator',
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
