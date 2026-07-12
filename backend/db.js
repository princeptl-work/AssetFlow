const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

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

// Initialize empty local files if they don't exist
COLLECTIONS.forEach(col => {
  const filePath = path.join(DATA_DIR, `${col}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
});

// MongoDB Connection State
let mongoClient = null;
let mongoDb = null;
let mongoConnected = false;

// Connect to MongoDB if MONGO_URI is set
if (process.env.MONGO_URI) {
  console.log(`Attempting to connect to MongoDB: ${process.env.MONGO_URI.split('@').pop()}`);
  MongoClient.connect(process.env.MONGO_URI)
    .then(client => {
      mongoClient = client;
      mongoDb = client.db();
      mongoConnected = true;
      console.log('==================================================');
      console.log('  SUCCESS: Connected to MongoDB database!');
      console.log('  Mirroring data collections in real-time.');
      console.log('==================================================');
      
      // Pull data from MongoDB on startup to restore local state
      syncFromMongo();
    })
    .catch(err => {
      console.error('==================================================');
      console.error('  ERROR: Failed to connect to MongoDB.');
      console.error('  Falling back to local JSON database.');
      console.error(err.message);
      console.error('==================================================');
    });
}

// Pull collections from MongoDB to JSON files
async function syncFromMongo() {
  for (const col of COLLECTIONS) {
    try {
      const collection = mongoDb.collection(col);
      const data = await collection.find({}).toArray();
      
      // Strip MongoDB internal object IDs before caching locally
      const cleanData = data.map(({ _id, ...rest }) => rest);
      
      if (cleanData.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, `${col}.json`), JSON.stringify(cleanData, null, 2));
        console.log(`Sync: Loaded ${cleanData.length} records for collection "${col}" from MongoDB.`);
      } else {
        // If MongoDB is empty, seed it with the current local database state
        const localData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${col}.json`), 'utf8'));
        if (localData.length > 0) {
          await collection.insertMany(localData);
          console.log(`Sync: Seeded MongoDB collection "${col}" with ${localData.length} local records.`);
        }
      }
    } catch (err) {
      console.error(`Sync Error for collection "${col}":`, err);
    }
  }
}

// Database client
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
      
      // Mirror writes to MongoDB asynchronously in the background
      if (mongoConnected && mongoDb) {
        const col = mongoDb.collection(collection);
        col.deleteMany({})
          .then(() => {
            if (data.length > 0) {
              return col.insertMany(data);
            }
          })
          .catch(err => {
            console.error(`Failed to mirror write for "${collection}" to MongoDB:`, err);
          });
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
