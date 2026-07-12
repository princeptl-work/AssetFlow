const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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
  'transfers',
  'bookings',
  'maintenance',
  'audits',
  'notifications',
  'logs'
];

// Initialize collections
COLLECTIONS.forEach(col => {
  const filePath = path.join(DATA_DIR, `${col}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
});

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
  // 1. Seed Departments
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

  // 2. Seed Admin User
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

    // Also seed a default Asset Manager
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

    // Seed a Department Head
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

    // Update Operations Department managerId to point to John Doe
    if (deptOps && deptHead) {
      db.update('departments', deptOps.id, { managerId: deptHead.id });
    }

    // Seed a standard Employee
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

  // 3. Seed Categories
  const categories = db.read('categories');
  if (categories.length === 0) {
    db.create('categories', {
      name: 'Electronics',
      warrantyPeriod: 24, // months
      expectedLife: 4, // years
      color: '#4F46E5', // indigo
      manufacturer: 'Apple/Dell/HP',
      description: 'Laptops, desktops, monitors, keyboards, mice, and other peripherals.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Furniture',
      warrantyPeriod: 12,
      expectedLife: 10,
      color: '#D97706', // amber
      manufacturer: 'Herman Miller/Ikea',
      description: 'Office chairs, standing desks, conference tables, cabinets.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Vehicles',
      warrantyPeriod: 36,
      expectedLife: 8,
      color: '#059669', // emerald
      manufacturer: 'Tesla/Toyota',
      description: 'Company cars, vans, shuttle buses.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Machinery',
      warrantyPeriod: 12,
      expectedLife: 12,
      color: '#DC2626', // red
      manufacturer: 'Caterpillar/Siemens',
      description: 'Heavy machinery, tools, and industrial assets.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Rooms',
      warrantyPeriod: 0,
      expectedLife: 50,
      color: '#7C3AED', // violet
      manufacturer: 'N/A',
      description: 'Meeting rooms, conference rooms, testing labs, and training halls.',
      status: 'Active'
    });
    db.create('categories', {
      name: 'Equipment',
      warrantyPeriod: 12,
      expectedLife: 5,
      color: '#2563EB', // blue
      manufacturer: 'Epson/Logitech',
      description: 'Projectors, speakers, whiteboards, video systems.',
      status: 'Active'
    });
  }

  // 4. Seed Sample Assets for demo dashboard
  const assets = db.read('assets');
  if (assets.length === 0) {
    const cats = db.read('categories');
    const catElectronics = cats.find(c => c.name === 'Electronics');
    const catFurniture = cats.find(c => c.name === 'Furniture');
    const catVehicles = cats.find(c => c.name === 'Vehicles');
    const catEquipment = cats.find(c => c.name === 'Equipment');
    const catRooms = cats.find(c => c.name === 'Rooms');

    const usersList = db.read('users');
    const employee = usersList.find(u => u.email === 'employee@assetflow.com');
    const manager = usersList.find(u => u.email === 'manager@assetflow.com');

    const sampleAssets = [
      {
        name: 'MacBook Pro 16"',
        categoryId: catElectronics ? catElectronics.id : '',
        serialNumber: 'MBP-2026-001',
        modelNumber: 'M3 Max',
        manufacturer: 'Apple',
        acquisitionDate: '2025-06-15',
        acquisitionCost: 3499,
        location: 'HQ - Floor 3',
        departmentId: deptIt ? deptIt.id : '',
        condition: 'Excellent',
        status: 'Allocated',
        warrantyExpiry: '2027-06-15',
        bookable: 'No',
        remarks: 'Primary developer workstation',
        allocatedToUserId: employee ? employee.id : '',
        allocatedDate: '2026-01-10',
        expectedReturnDate: '2026-12-31'
      },
      {
        name: 'Dell UltraSharp Monitor 27"',
        categoryId: catElectronics ? catElectronics.id : '',
        serialNumber: 'DELL-MON-042',
        modelNumber: 'U2723QE',
        manufacturer: 'Dell',
        acquisitionDate: '2025-08-01',
        acquisitionCost: 649,
        location: 'HQ - Floor 3',
        departmentId: deptIt ? deptIt.id : '',
        condition: 'Good',
        status: 'Available',
        warrantyExpiry: '2027-08-01',
        bookable: 'No',
        remarks: 'Spare monitor pool'
      },
      {
        name: 'Herman Miller Aeron Chair',
        categoryId: catFurniture ? catFurniture.id : '',
        serialNumber: 'HM-AERON-118',
        modelNumber: 'Size B',
        manufacturer: 'Herman Miller',
        acquisitionDate: '2024-03-20',
        acquisitionCost: 1395,
        location: 'HQ - Floor 2',
        departmentId: deptOps ? deptOps.id : '',
        condition: 'Good',
        status: 'Allocated',
        warrantyExpiry: '2025-03-20',
        bookable: 'No',
        remarks: 'Ergonomic seating',
        allocatedToUserId: employee ? employee.id : '',
        allocatedDate: '2025-04-01',
        expectedReturnDate: '2026-07-01'
      },
      {
        name: 'Tesla Model 3 Fleet Car',
        categoryId: catVehicles ? catVehicles.id : '',
        serialNumber: 'TESLA-M3-007',
        modelNumber: 'Long Range',
        manufacturer: 'Tesla',
        acquisitionDate: '2025-01-15',
        acquisitionCost: 48000,
        location: 'Parking Lot A',
        departmentId: deptOps ? deptOps.id : '',
        condition: 'Excellent',
        status: 'Available',
        warrantyExpiry: '2028-01-15',
        bookable: 'Yes',
        remarks: 'Company fleet vehicle'
      },
      {
        name: 'Epson Projector Pro',
        categoryId: catEquipment ? catEquipment.id : '',
        serialNumber: 'EPS-PROJ-003',
        modelNumber: 'PowerLite L610U',
        manufacturer: 'Epson',
        acquisitionDate: '2025-05-10',
        acquisitionCost: 2200,
        location: 'Conference Room B',
        departmentId: deptIt ? deptIt.id : '',
        condition: 'Good',
        status: 'Available',
        warrantyExpiry: '2026-05-10',
        bookable: 'Yes',
        remarks: '4K conference projector'
      },
      {
        name: 'Conference Room Alpha',
        categoryId: catRooms ? catRooms.id : '',
        serialNumber: 'ROOM-ALPHA-01',
        modelNumber: 'N/A',
        manufacturer: 'N/A',
        acquisitionDate: '2020-01-01',
        acquisitionCost: 0,
        location: 'HQ - Floor 1',
        departmentId: deptOps ? deptOps.id : '',
        condition: 'Good',
        status: 'Available',
        warrantyExpiry: '',
        bookable: 'Yes',
        remarks: '12-person meeting room with video conferencing'
      },
      {
        name: 'HP LaserJet Enterprise',
        categoryId: catElectronics ? catElectronics.id : '',
        serialNumber: 'HP-LJ-992',
        modelNumber: 'M607dn',
        manufacturer: 'HP',
        acquisitionDate: '2024-11-01',
        acquisitionCost: 899,
        location: 'HQ - Floor 2',
        departmentId: deptOps ? deptOps.id : '',
        condition: 'Fair',
        status: 'Under Maintenance',
        warrantyExpiry: '2025-11-01',
        bookable: 'No',
        remarks: 'Paper jam issues reported'
      },
      {
        name: 'Standing Desk Pro',
        categoryId: catFurniture ? catFurniture.id : '',
        serialNumber: 'SD-PRO-055',
        modelNumber: 'Electric Dual Motor',
        manufacturer: 'FlexiSpot',
        acquisitionDate: '2025-02-28',
        acquisitionCost: 599,
        location: 'HQ - Floor 3',
        departmentId: deptIt ? deptIt.id : '',
        condition: 'Excellent',
        status: 'Available',
        warrantyExpiry: '2026-02-28',
        bookable: 'No',
        remarks: 'Height-adjustable desk'
      }
    ];

    sampleAssets.forEach((assetData, idx) => {
      const tagCount = idx + 1;
      const assetTag = `AF-${String(tagCount).padStart(4, '0')}`;
      const codes = {
        qrCode: `assetflow://asset/${assetTag}?sn=${assetData.serialNumber || ''}`,
        barcode: `AF*${assetTag.replace('AF-', '')}*${assetData.serialNumber || '0'}`
      };

      db.create('assets', {
        ...assetData,
        assetTag,
        qrCode: codes.qrCode,
        barcode: codes.barcode,
        history: [
          {
            id: `HIST-SEED-${idx}`,
            eventType: 'Created',
            date: new Date().toISOString(),
            user: 'System Administrator',
            userId: 'system',
            notes: 'Seeded demo asset during system initialization.'
          }
        ]
      });
    });
  }
}

seedDatabase();

module.exports = db;
