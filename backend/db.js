const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');

const COLLECTIONS = [
  'users', 'departments', 'categories', 'assets',
  'bookings', 'maintenance', 'audits', 'notifications', 'logs', 'transfers'
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
  transfers: ['id', 'assetId', 'requestedByUserId', 'targetUserId', 'targetDepartmentId', 'status', 'deptHeadApproverId', 'assetManagerApproverId', 'notes', 'requestDate', 'deptHeadApprovalDate', 'assetManagerApprovalDate', 'createdAt', 'updatedAt']
};

const JSONB_FIELDS = new Set(['history', 'auditors', 'details', 'discrepancyReport', 'images', 'documents', 'timeline']);
const INT_FIELDS = new Set(['warrantyPeriod', 'expectedLife']);
const FLOAT_FIELDS = new Set(['acquisitionCost', 'cost']);
const BOOL_FIELDS = new Set(['isRead']);

const TABLE_SCHEMAS = {
  users: `CREATE TABLE IF NOT EXISTS "users" (
    "id" VARCHAR(255) PRIMARY KEY, "employeeId" VARCHAR(255), "name" VARCHAR(255),
    "email" VARCHAR(255) UNIQUE, "password" VARCHAR(255), "phone" VARCHAR(255),
    "photo" TEXT, "departmentId" VARCHAR(255), "role" VARCHAR(255), "status" VARCHAR(255),
    "joiningDate" VARCHAR(255), "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  departments: `CREATE TABLE IF NOT EXISTS "departments" (
    "id" VARCHAR(255) PRIMARY KEY, "name" VARCHAR(255), "managerId" VARCHAR(255),
    "parentId" VARCHAR(255), "description" TEXT, "status" VARCHAR(255),
    "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  categories: `CREATE TABLE IF NOT EXISTS "categories" (
    "id" VARCHAR(255) PRIMARY KEY, "name" VARCHAR(255), "warrantyPeriod" INTEGER,
    "expectedLife" INTEGER, "color" VARCHAR(255), "manufacturer" VARCHAR(255),
    "description" TEXT, "status" VARCHAR(255), "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  assets: `CREATE TABLE IF NOT EXISTS "assets" (
    "id" VARCHAR(255) PRIMARY KEY, "name" VARCHAR(255), "categoryId" VARCHAR(255),
    "serialNumber" VARCHAR(255), "modelNumber" VARCHAR(255), "manufacturer" VARCHAR(255),
    "acquisitionDate" VARCHAR(255), "acquisitionCost" NUMERIC, "location" VARCHAR(255),
    "departmentId" VARCHAR(255), "condition" VARCHAR(255), "status" VARCHAR(255),
    "warrantyExpiry" VARCHAR(255), "bookable" VARCHAR(255), "remarks" TEXT,
    "allocatedToUserId" VARCHAR(255), "allocatedDate" VARCHAR(255),
    "expectedReturnDate" VARCHAR(255), "assetTag" VARCHAR(255), "qrCode" TEXT,
    "barcode" TEXT, "history" JSONB, "photo" TEXT, "documents" JSONB,
    "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  bookings: `CREATE TABLE IF NOT EXISTS "bookings" (
    "id" VARCHAR(255) PRIMARY KEY, "resourceType" VARCHAR(255), "assetId" VARCHAR(255),
    "userId" VARCHAR(255), "purpose" TEXT, "startTime" VARCHAR(255), "endTime" VARCHAR(255),
    "status" VARCHAR(255), "departmentId" VARCHAR(255), "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  maintenance: `CREATE TABLE IF NOT EXISTS "maintenance" (
    "id" VARCHAR(255) PRIMARY KEY, "assetId" VARCHAR(255), "raisedByUserId" VARCHAR(255),
    "issue" VARCHAR(255), "priority" VARCHAR(255), "description" TEXT, "status" VARCHAR(255),
    "technicianId" VARCHAR(255), "images" JSONB, "documents" JSONB, "timeline" JSONB,
    "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  audits: `CREATE TABLE IF NOT EXISTS "audits" (
    "id" VARCHAR(255) PRIMARY KEY, "name" VARCHAR(255), "departmentId" VARCHAR(255),
    "location" VARCHAR(255), "startDate" VARCHAR(255), "endDate" VARCHAR(255),
    "auditors" JSONB, "description" TEXT, "status" VARCHAR(255), "details" JSONB,
    "discrepancyReport" JSONB, "closedAt" VARCHAR(255), "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`,
  notifications: `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" VARCHAR(255) PRIMARY KEY, "userId" VARCHAR(255), "message" TEXT,
    "type" VARCHAR(255), "link" VARCHAR(255), "isRead" BOOLEAN, "timestamp" VARCHAR(255))`,
  logs: `CREATE TABLE IF NOT EXISTS "logs" (
    "id" VARCHAR(255) PRIMARY KEY, "userId" VARCHAR(255), "userName" VARCHAR(255),
    "action" VARCHAR(255), "entity" VARCHAR(255), "entityId" VARCHAR(255),
    "previousValue" TEXT, "newValue" TEXT, "ip" VARCHAR(255), "timestamp" VARCHAR(255))`,
  transfers: `CREATE TABLE IF NOT EXISTS "transfers" (
    "id" VARCHAR(255) PRIMARY KEY, "assetId" VARCHAR(255), "requestedByUserId" VARCHAR(255),
    "targetUserId" VARCHAR(255), "targetDepartmentId" VARCHAR(255), "status" VARCHAR(255),
    "deptHeadApproverId" VARCHAR(255), "assetManagerApproverId" VARCHAR(255),
    "notes" TEXT, "requestDate" VARCHAR(255), "deptHeadApprovalDate" VARCHAR(255),
    "assetManagerApprovalDate" VARCHAR(255), "createdAt" VARCHAR(255), "updatedAt" VARCHAR(255))`
};

// ==========================================
// PostgreSQL Connection Pool
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[PG Pool Error]', err.message);
});

// ==========================================
// Serialization helpers
// ==========================================
function serializeVal(col, val) {
  if (val === undefined || val === null) return null;
  if (JSONB_FIELDS.has(col)) return typeof val === 'string' ? val : JSON.stringify(val);
  if (INT_FIELDS.has(col)) return (val !== '' && val !== null) ? parseInt(val, 10) : null;
  if (FLOAT_FIELDS.has(col)) return (val !== '' && val !== null) ? parseFloat(val) : null;
  if (BOOL_FIELDS.has(col)) return !!val;
  return val !== null && val !== undefined ? String(val) : null;
}

function deserializeRow(table, row) {
  const cols = TABLE_COLUMNS[table];
  const obj = {};
  for (const col of cols) {
    const val = row[col] !== undefined ? row[col] : null;
    if (JSONB_FIELDS.has(col)) {
      if (val === null || val === undefined) {
        if (['history', 'auditors', 'discrepancyReport', 'images', 'documents', 'timeline'].includes(col)) obj[col] = [];
        else if (col === 'details') obj[col] = {};
        else obj[col] = null;
      } else if (typeof val === 'string') {
        try { obj[col] = JSON.parse(val); } catch (e) { obj[col] = val; }
      } else {
        obj[col] = val;
      }
    } else if (INT_FIELDS.has(col)) {
      obj[col] = (val !== null && val !== undefined) ? parseInt(val, 10) : null;
    } else if (FLOAT_FIELDS.has(col)) {
      obj[col] = (val !== null && val !== undefined) ? parseFloat(val) : null;
    } else if (BOOL_FIELDS.has(col)) {
      obj[col] = val !== null && val !== undefined ? !!val : false;
    } else {
      obj[col] = val !== null && val !== undefined ? String(val) : '';
    }
  }
  return obj;
}

// ==========================================
// Core async db API — all methods hit Supabase directly
// ==========================================
const db = {

  async read(collection) {
    const res = await pool.query(`SELECT * FROM "${collection}"`);
    return res.rows.map(row => deserializeRow(collection, row));
  },

  async find(collection, query = {}) {
    const keys = Object.keys(query);
    if (keys.length === 0) return this.read(collection);
    const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
    const vals = keys.map(k => query[k]);
    const res = await pool.query(`SELECT * FROM "${collection}" WHERE ${where}`, vals);
    return res.rows.map(row => deserializeRow(collection, row));
  },

  async findOne(collection, query = {}) {
    const rows = await this.find(collection, query);
    return rows[0] || null;
  },

  async findById(collection, id) {
    const res = await pool.query(`SELECT * FROM "${collection}" WHERE "id" = $1`, [id]);
    if (res.rows.length === 0) return null;
    return deserializeRow(collection, res.rows[0]);
  },

  async create(collection, data) {
    const cols = TABLE_COLUMNS[collection];
    let id;
    if (data.id) {
      id = data.id;
    } else if (collection === 'users') {
      const r = await pool.query(`SELECT COUNT(*) FROM "users"`);
      id = `USR${String(parseInt(r.rows[0].count, 10) + 1).padStart(4, '0')}`;
    } else if (collection === 'assets') {
      const r = await pool.query(`SELECT COUNT(*) FROM "assets"`);
      id = `AF-${String(parseInt(r.rows[0].count, 10) + 1).padStart(4, '0')}`;
    } else {
      id = `${collection.slice(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    const now = new Date().toISOString();
    const fullData = { id, ...data, createdAt: data.createdAt || now };
    const insertCols = cols.filter(c => fullData[c] !== undefined);
    const vals = insertCols.map(c => serializeVal(c, fullData[c]));
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
    const colsStr = insertCols.map(c => `"${c}"`).join(', ');

    const res = await pool.query(
      `INSERT INTO "${collection}" (${colsStr}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return deserializeRow(collection, res.rows[0]);
  },

  async update(collection, id, data) {
    const cols = TABLE_COLUMNS[collection];
    const now = new Date().toISOString();
    const updateData = { ...data, updatedAt: now };
    const updateCols = Object.keys(updateData).filter(k => cols.includes(k) && k !== 'id');
    if (updateCols.length === 0) return null;

    const original = await this.findById(collection, id);
    const sets = updateCols.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const vals = [...updateCols.map(k => serializeVal(k, updateData[k])), id];

    const res = await pool.query(
      `UPDATE "${collection}" SET ${sets} WHERE "id" = $${updateCols.length + 1} RETURNING *`,
      vals
    );
    if (res.rows.length === 0) return null;
    return { updated: deserializeRow(collection, res.rows[0]), original };
  },

  async delete(collection, id) {
    const res = await pool.query(`DELETE FROM "${collection}" WHERE "id" = $1 RETURNING *`, [id]);
    if (res.rows.length === 0) return null;
    return deserializeRow(collection, res.rows[0]);
  },

  async deleteMany(collection, query = {}) {
    const keys = Object.keys(query);
    if (keys.length === 0) return 0;
    const where = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');
    const vals = keys.map(k => query[k]);
    const res = await pool.query(`DELETE FROM "${collection}" WHERE ${where}`, vals);
    return res.rowCount;
  },

  async query(sql, params = []) {
    const res = await pool.query(sql, params);
    return res.rows;
  }
};

// ==========================================
// Seed from JSON files (one-time, if table is empty)
// ==========================================
async function seedTableFromJson(collection) {
  const filePath = path.join(DATA_DIR, `${collection}.json`);
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(data) || data.length === 0) return;
  console.log(`[PG Seed] Seeding "${collection}" with ${data.length} records from JSON...`);
  for (const item of data) {
    try {
      await db.create(collection, item);
    } catch (err) {
      if (!err.message.includes('duplicate key')) {
        console.error(`[PG Seed Error] "${collection}" id=${item.id}:`, err.message);
      }
    }
  }
  console.log(`[PG Seed] Done: "${collection}".`);
}

// ==========================================
// DB Init: connect → create tables → seed if empty
// ==========================================
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('==================================================');
    console.log('  SUCCESS: Connected to Supabase PostgreSQL!');
    console.log('  Verifying tables...');
    console.log('==================================================');
    for (const col of COLLECTIONS) {
      await client.query(TABLE_SCHEMAS[col]);
    }
    console.log('[PG] All tables ready.');
    client.release();

    for (const col of COLLECTIONS) {
      const r = await pool.query(`SELECT COUNT(*) FROM "${col}"`);
      const count = parseInt(r.rows[0].count, 10);
      if (count === 0) {
        await seedTableFromJson(col);
      } else {
        console.log(`[PG] "${col}" has ${count} records — skipping seed.`);
      }
    }
    console.log('==================================================');
    console.log('  All data served from Supabase PostgreSQL.');
    console.log('==================================================');
    await checkOverdueAllocations();
  } catch (err) {
    client.release();
    console.error('[PG Init Error]:', err.message);
  }
}

// ==========================================
// Overdue return alerts
// ==========================================
async function checkOverdueAllocations() {
  try {
    const assets = await db.read('assets');
    const today = new Date().toISOString().split('T')[0];
    const notifications = await db.read('notifications');
    const users = await db.read('users');

    const overdue = assets.filter(a =>
      a.status === 'Allocated' && a.expectedReturnDate && a.expectedReturnDate < today
    );

    let count = 0;
    for (const asset of overdue) {
      if (!asset.allocatedToUserId) continue;
      const exists = notifications.some(n =>
        n.userId === asset.allocatedToUserId &&
        n.type === 'Overdue Return Alert' &&
        n.message.includes(asset.assetTag)
      );
      if (!exists) {
        const holder = users.find(u => u.id === asset.allocatedToUserId);
        const holderName = holder ? holder.name : 'Employee';
        await db.create('notifications', {
          userId: asset.allocatedToUserId,
          message: `Asset "${asset.name}" (${asset.assetTag}) is overdue since ${asset.expectedReturnDate}. Please return it.`,
          type: 'Overdue Return Alert', link: '/assets', isRead: false,
          timestamp: new Date().toISOString()
        });
        const admins = users.filter(u => u.role === 'Admin' || u.role === 'Asset Manager');
        for (const mgr of admins) {
          await db.create('notifications', {
            userId: mgr.id,
            message: `Overdue Return: "${asset.name}" (${asset.assetTag}) held by ${holderName} was due ${asset.expectedReturnDate}.`,
            type: 'Overdue Return Alert', link: '/assets', isRead: false,
            timestamp: new Date().toISOString()
          });
        }
        count++;
      }
    }
    if (count > 0) console.log(`[PG] ${count} overdue return alerts created.`);
  } catch (err) {
    console.error('[Overdue Check Error]:', err.message);
  }
}

initDatabase();

module.exports = db;
