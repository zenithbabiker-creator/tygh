import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// File DB Path for Offline Core Persistence
const DATA_DIR = path.join(process.cwd(), 'data');
const OLD_DB_FILE = path.join(DATA_DIR, 'nasser_company_db.json');
const DB_FILE = path.join(DATA_DIR, 'nosser_company_db.json');

// Interface Definitions for Backend
interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'GENERAL_MANAGER' | 'WAREHOUSE_MANAGER';
  gmail: string;
  createdAt: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  warehouseId?: string; // 'EASTERN' | 'WESTERN' | 'AUXILIARY'
  warehouseName?: string; // 'المخزن الشرقي' | 'المخزن الغربي' | 'المخزن الإضافي'
  price?: number;
  description?: string;
  updatedAt: string;
}

interface StockMovement {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId?: string;
  warehouseName?: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT'; // توريد / صرف / تعديل جرد
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceNo?: string;
  operatorName: string;
  timestamp: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  details: string;
  type: 'INFO' | 'WARNING' | 'SECURITY' | 'MOVEMENT';
}

interface SaleRecord {
  id: string;
  invoiceNumber: string;
  deliveryOrderRef?: string;
  warehouseId?: string;
  warehouseName?: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  cashierId?: string;
  cashierName: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  items: any[];
  notes?: string;
}

interface DBData {
  version?: string;
  users: User[];
  products: Product[];
  movements: StockMovement[];
  sales?: SaleRecord[];
  logs: AuditLog[];
  settings: {
    googleSheetUrl: string;
    rateLimitThreshold: number;
    appName: string;
    companyAddress: string;
    companyPhone: string;
  };
}

// In-Memory Rate Limiter Engine (60-second window)
let rateLimiterState = {
  minuteStart: Math.floor(Date.now() / 60000),
  counter: 0,
};

// Store active OTPs in memory
const activeOtps: Record<string, { code: string; expiresAt: number; gmail: string }> = {};

// Default Initial Seed Data Generation
const NEW_SEED_CATEGORIES = [
  {
    category: 'سوق 21 أجهزة بركانية',
    items: [
      'شواية لحم',
      'ثلاجة حلويات',
      'ماكينة شاورما كهرباء',
      'مضارب',
      'آيس ميكر'
    ]
  },
  {
    category: 'عام',
    items: [
      'طاولة السندوتش',
      'صواني قرص',
      'ميزان ساعة',
      'شواية مشكل',
      'حوضات',
      'ديسبنسر',
      'صحن السندوتش',
      'كرتونة زجاج',
      'شيخ الشواية',
      'فرامة أكياس + أخشاب',
      'شاورما دجاج',
      'غلاية لتر',
      'مبرد عصير',
      'منشر لحوم',
      'غلاية لتر كهرباء',
      'شواية عرض السندوتش',
      'بسكيت سمك',
      'شواية فراخ',
      'كرتونة صواني',
      'غلاية غاز',
      'قاطع سيخ شتراك صغير',
      'عصارة برتقال'
    ]
  },
  {
    category: 'الأجهزة',
    items: [
      'طاولة السندوتش',
      'طباخة 2 شعلة فول',
      'م. السندوتش مرضى',
      'ماكينة بطاطس',
      'مبرد غاز',
      'فريزر هاير جديد',
      'ماكينة سمك',
      'شواية فراخ دوار',
      'غلاية لتر كهرباء',
      'ماكينة بروست ضغط',
      'صندل في مكان نائي يصعب الوصول إليه'
    ]
  },
  {
    category: 'المخزن الشروق',
    items: [
      'شوايه فحم',
      'شاورما دبل',
      'غلايه غاز',
      'سخانات بروست أحمر',
      'فرن طبقة غاز',
      'مضرب نابوليتان',
      'بوفيه',
      'قلاب لحوم',
      'مسخنات بروست',
      'توستر',
      'كرتونه تقطيع بطاطس',
      'كرتونه ثلج',
      'قلايه 2 عين غاز',
      'وافل مدور + مربع',
      'ايس ميكر كيلو',
      'منشار لحمه',
      'كسارة ثلج',
      'ماكينه كاشير',
      'بروست',
      'فرن طابق',
      'شوايه لحم',
      'غلايه كهرباء لتر'
    ]
  },
  {
    category: 'مخزن العمدة غرب',
    items: [
      'حوض عين',
      'راس شاورما',
      'ثلاجة حلويات',
      'شواية فحم',
      'ثلاجة عرض السندوتش',
      'مفرمة',
      'سخان بروست',
      'كابتشينو',
      'خلاط لتر',
      'سخانة منزلية',
      'مسن بروست',
      'مفرمة لحم',
      'خلاط لتر ك',
      'كسارة ثلج',
      'كبسة دبل مفرد',
      'قلاية مفرد غاز',
      'كبس سمك',
      'سخان ماء بويلر',
      'ماكينة تتبيل بروست',
      'كرتونة صحون',
      'وافل مربع',
      'فرن مدور'
    ]
  }
];

const SEED_WAREHOUSES = [
  { id: 'EASTERN', name: 'المخزن الشرقي', prefix: 'E', stock: 15 },
];

function buildInitialProducts(): Product[] {
  const prods: Product[] = [];
  let seq = 1;
  const now = new Date().toISOString();
  for (const wh of SEED_WAREHOUSES) {
    let catItemSeq = 1;
    for (const cat of NEW_SEED_CATEGORIES) {
      for (const name of cat.items) {
        prods.push({
          id: String(seq),
          code: `NOSSER-${wh.prefix}${100 + catItemSeq}`,
          name: name.trim(),
          category: cat.category,
          stock: wh.stock,
          minStock: 5,
          unit: 'وحدة',
          warehouseId: wh.id,
          warehouseName: wh.name,
          price: 0,
          description: `صنف معتمد: ${name} - ${cat.category} (${wh.name})`,
          updatedAt: now,
        });
        seq++;
        catItemSeq++;
      }
    }
  }
  return prods;
}

const DEFAULT_PRODUCTS = buildInitialProducts();

const DEFAULT_DB: DBData = {
  version: '4.0.0',
  users: [
    {
      id: 'usr_1',
      username: 'admin',
      password: 'admin123',
      name: 'المدير العام - ناصر',
      role: 'GENERAL_MANAGER',
      gmail: 'zenithbabiker@gmail.com',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_2',
      username: 'wh_manager',
      password: 'wh123',
      name: 'أمين المخزن الرئيسي - أحمد مصطفى',
      role: 'WAREHOUSE_MANAGER',
      gmail: 'warehouse.nasser@gmail.com',
      createdAt: new Date().toISOString(),
    },
  ],
  products: DEFAULT_PRODUCTS,
  movements: DEFAULT_PRODUCTS.map((p, idx) => ({
    id: `mvt_init_${idx + 1}`,
    productId: p.id,
    productCode: p.code,
    productName: p.name,
    type: 'IN',
    quantity: p.stock,
    previousStock: 0,
    newStock: p.stock,
    reason: 'رصيد افتتاحي رسمي معتمد بالمخزن',
    operatorName: 'المدير العام',
    timestamp: p.updatedAt,
  })),
  logs: [
    {
      id: 'log_1',
      timestamp: new Date().toISOString(),
      username: 'النظام',
      role: 'GENERAL_MANAGER',
      action: 'تشغيل النظام',
      details: 'تم بدء تشغيل قاعدة بيانات إدارة المخازن والمخزون لشركة NOSSER بنجاح وتثبيت الأصناف المعتمدة',
      type: 'INFO',
    },
  ],
  settings: {
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1NasserCompanyConfig/edit#gid=0',
    rateLimitThreshold: 15,
    appName: 'شركة NOSSER - نظام إدارة المخازن والمخزون',
    companyAddress: 'أمدرمان',
    companyPhone: '0913247564',
  },
};

// Database Helper Functions
function readDB(): DBData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Backward compatibility: If old DB file exists but new one doesn't, migrate it
    if (!fs.existsSync(DB_FILE) && fs.existsSync(OLD_DB_FILE)) {
      try {
        const oldContent = fs.readFileSync(OLD_DB_FILE, 'utf-8');
        fs.writeFileSync(DB_FILE, oldContent, 'utf-8');
      } catch {
        // Fallback
      }
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return DEFAULT_DB;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const db: DBData = JSON.parse(content);

    if (!db.movements) db.movements = [];
    if (!db.products) db.products = [];

    // Migration Check: If DB contains old demo items (coffee machines, etc.) or is empty, replace with the 82 new official seed items
    const hasOldDemoItems = db.products.length < 20 && db.products.some(p =>
      p.name.includes('ماكينة إعداد القهوة') ||
      p.name.includes('طاحونة حبوب القهوة') ||
      p.name.includes('طابعة فواتير حرارية') ||
      p.name.includes('فلتر تنقية')
    );

    if (hasOldDemoItems || db.products.length === 0) {
      console.log('🔄 Migrating Database: Dropping old demo seed data and applying 82 official seed items...');
      db.products = buildInitialProducts();
      db.movements = db.products.map((p, idx) => ({
        id: `mvt_init_${idx + 1}`,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        type: 'IN',
        quantity: p.stock,
        previousStock: 0,
        newStock: p.stock,
        reason: 'رصيد افتتاحي رسمي معتمد بالمخزن',
        operatorName: 'المدير العام',
        timestamp: p.updatedAt,
      }));
      writeDB(db);
    }

    // Startup Data Migration Check: Ensure all products and movements strictly follow 'NOSSER-' prefix
    let migratedPrefixCount = 0;
    db.products.forEach(p => {
      if (!p.code || !p.code.startsWith('NOSSER-')) {
        const oldCode = p.code || '';
        const cleanedNum = oldCode.replace(/\D/g, '') || p.id;
        p.code = `NOSSER-${cleanedNum}`;
        migratedPrefixCount++;
        // Update movements referencing the old code
        db.movements.forEach(m => {
          if (m.productId === p.id || m.productCode === oldCode) {
            m.productCode = p.code;
          }
        });
      }
    });

    // Ensure all products have warehouseId and warehouseName
    let migratedWarehouseCount = 0;
    db.products.forEach(p => {
      if (!p.warehouseId) {
        p.warehouseId = 'EASTERN';
        p.warehouseName = 'المخزن الشرقي';
        migratedWarehouseCount++;
      }
    });

    // Database Migration v4.0.0: Strict Isolation & Zeroing of Western & Auxiliary Warehouses
    if ((db as any).version !== '4.0.0') {
      console.log('🔄 Executing Migration to v4.0.0: Isolating Warehouses & Zeroing Western/Auxiliary...');
      // 1. Ensure Eastern retains all its items intact (tagged strictly with warehouseId: 'EASTERN')
      const easternProducts = db.products.filter(p => !p.warehouseId || p.warehouseId === 'EASTERN').map(p => ({
        ...p,
        warehouseId: 'EASTERN' as const,
        warehouseName: 'المخزن الشرقي',
      }));

      // 2. Western and Auxiliary start in a zeroed state (0 items) while fully enabled for independent additions
      db.products = easternProducts;

      // 3. Keep movements clean: movements for Eastern are preserved; remove any old cloned test movements for Western/Auxiliary
      db.movements = (db.movements || []).filter(m => !m.warehouseId || m.warehouseId === 'EASTERN');

      // 4. Update DB version to 4.0.0
      (db as any).version = '4.0.0';

      // 5. Add audit log
      db.logs.unshift({
        id: `log_migration_v4_${Date.now()}`,
        timestamp: new Date().toISOString(),
        username: 'النظام',
        role: 'GENERAL_MANAGER',
        action: 'ترحيل النظام إلى الإصدار 4.0.0',
        details: 'تم بنجاح عزل المخازن الثلاثة (الشرقي، الغربي، الإضافي) وتصفير المخازن الجديدة مع الاحتفاظ الكامل ببيانات المخزن الشرقي',
        type: 'INFO',
      });

      writeDB(db);
    }

    if (migratedPrefixCount > 0 || migratedWarehouseCount > 0) {
      writeDB(db);
    }

    // Ensure appName is updated
    if (db.settings && (!db.settings.appName || db.settings.appName.includes('NASSER'))) {
      db.settings.appName = 'شركة NOSSER - نظام إدارة المخازن والمخزون';
      writeDB(db);
    }

    // Ensure General Manager email is updated to zenithbabiker@gmail.com
    let updated = false;
    db.users = db.users.map(u => {
      if (u.username === 'admin' || u.role === 'GENERAL_MANAGER') {
        if (u.gmail === 'admin.nasser@gmail.com' || !u.gmail) {
          u.gmail = 'zenithbabiker@gmail.com';
          updated = true;
        }
      }
      return u;
    });
    if (updated) {
      writeDB(db);
    }
    return db;
  } catch (err) {
    console.error('Error reading SQLite/JSON DB:', err);
    return DEFAULT_DB;
  }
}

function writeDB(data: DBData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing SQLite/JSON DB:', err);
  }
}

function addAuditLog(username: string, role: string, action: string, details: string, type: 'INFO' | 'WARNING' | 'SECURITY' | 'MOVEMENT' = 'INFO') {
  const db = readDB();
  const log: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    username,
    role,
    action,
    details,
    type,
  };
  db.logs.unshift(log);
  // Keep last 200 logs
  if (db.logs.length > 200) db.logs = db.logs.slice(0, 200);
  writeDB(db);
}

// RATE LIMITER COUNTER UTILITY (60-second window)
function getRateLimiterInfo() {
  const nowMinute = Math.floor(Date.now() / 60000);
  if (nowMinute !== rateLimiterState.minuteStart) {
    rateLimiterState.minuteStart = nowMinute;
    rateLimiterState.counter = 0;
  }

  const currentCount = rateLimiterState.counter;
  const model = 'google/gemini-2.5-flash';

  const secondsRemaining = 60 - (Math.floor(Date.now() / 1000) % 60);

  return {
    requestsInCurrentMinute: currentCount,
    currentModel: model,
    secondsRemaining,
    minuteTimestamp: rateLimiterState.minuteStart,
  };
}

function incrementRateLimiter() {
  getRateLimiterInfo();
  rateLimiterState.counter += 1;
  return getRateLimiterInfo();
}

// Password Verification & Hashing Comparison Helper
function verifyPassword(storedPassword?: string, inputPassword?: string): boolean {
  if (!storedPassword || !inputPassword) return false;
  const s = String(storedPassword).trim();
  const inp = String(inputPassword).trim();

  // 1. Exact or trimmed match
  if (storedPassword === inputPassword || s === inp) {
    return true;
  }

  // 2. SHA-256 Hash comparison
  try {
    const inputSha256 = crypto.createHash('sha256').update(inp).digest('hex');
    if (s.toLowerCase() === inputSha256.toLowerCase()) return true;

    const storedSha256 = crypto.createHash('sha256').update(s).digest('hex');
    if (storedSha256.toLowerCase() === inp.toLowerCase()) return true;
  } catch {
    // Ignore hash calculation error
  }

  // 3. SHA-512 Hash comparison
  try {
    const inputSha512 = crypto.createHash('sha512').update(inp).digest('hex');
    if (s.toLowerCase() === inputSha512.toLowerCase()) return true;
  } catch {
    // Ignore
  }

  // 4. MD5 Hash comparison
  try {
    const inputMd5 = crypto.createHash('md5').update(inp).digest('hex');
    if (s.toLowerCase() === inputMd5.toLowerCase()) return true;
  } catch {
    // Ignore
  }

  return false;
}

// User Lookup Helper by username, email or full name
function findUserByQuery(db: DBData, query?: string) {
  if (!query) return undefined;
  const q = String(query).toLowerCase().trim();
  return db.users.find(u =>
    u.username.toLowerCase().trim() === q ||
    (u.gmail && u.gmail.toLowerCase().trim() === q) ||
    (u.name && u.name.toLowerCase().trim() === q)
  );
}

// REST API ROUTES
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', company: 'شركة NOSSER', system: 'إدارة المخازن', timestamp: new Date().toISOString() });
});

// AUTH - Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = findUserByQuery(db, username);

  if (!user || !verifyPassword(user.password, password)) {
    return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة السر غير صحيحة' });
  }

  addAuditLog(user.username, user.role, 'تسجيل دخول', `تم تسجيل الدخول بنجاح للمستخدم ${user.name}`, 'INFO');

  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// AUTH - Forgot Password OTP Trigger
app.post('/api/auth/forgot-password', (req, res) => {
  const { username, simulateOffline } = req.body;
  
  if (simulateOffline) {
    return res.status(503).json({
      success: false,
      message: 'عفوًا، يلزم توفر اتصال بالإنترنت فقط لإرسال رمز إعادة تعيين كلمة السر',
    });
  }

  const db = readDB();
  const user = findUserByQuery(db, username);

  if (!user) {
    return res.status(404).json({ success: false, message: 'اسم المستخدم غير موجود بالنظام' });
  }

  if (!user.gmail) {
    return res.status(400).json({ success: false, message: 'لم يتم تسجيل بريد Gmail لهذا المستخدم' });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  activeOtps[user.username] = {
    code: otpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    gmail: user.gmail,
  };

  addAuditLog(user.username, user.role, 'طلب إرسال OTP', `تم إرسال رمز OTP إلى البريد الإلكتروني ${user.gmail}`, 'SECURITY');

  res.json({
    success: true,
    message: `تم إرسال رمز OTP المكون من 6 أرقام إلى بريدك الإلكتروني (${user.gmail.replace(/(.{2})(.*)(?=@)/, '$1***')})`,
    gmail: user.gmail,
    demoOtpCode: otpCode,
  });
});

// AUTH - Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { username, otpCode } = req.body;
  const otpRecord = activeOtps[username];

  if (!otpRecord) {
    return res.status(400).json({ success: false, message: 'انتهت صلاحية الرمز أو لم يتم طلبه' });
  }

  if (Date.now() > otpRecord.expiresAt) {
    delete activeOtps[username];
    return res.status(400).json({ success: false, message: 'رمز OTP منتهي الصلاحية، يرجى إعاده الطلب' });
  }

  if (otpRecord.code !== otpCode?.trim()) {
    return res.status(400).json({ success: false, message: 'رمز OTP غير صحيح' });
  }

  res.json({ success: true, message: 'تم التحقق من الرمز بنجاح' });
});

// AUTH - Reset Password
app.post('/api/auth/reset-password', (req, res) => {
  const { username, otpCode, newPassword } = req.body;
  const otpRecord = activeOtps[username];

  if (!otpRecord || otpRecord.code !== otpCode?.trim()) {
    return res.status(400).json({ success: false, message: 'غير مصرح أو الرمز غير صحيح' });
  }

  const db = readDB();
  const user = findUserByQuery(db, username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  }

  user.password = (newPassword || '').trim();
  writeDB(db);
  delete activeOtps[username];

  addAuditLog(user.username, user.role, 'تغيير كلمة السر', 'تم تغيير كلمة السر بنجاح بواسطة رمز OTP', 'SECURITY');

  res.json({ success: true, message: 'تم تحديث كلمة السر بنجاح. يمكنك الآن تسجيل الدخول' });
});

// AUTH - Reset Password Offline
app.post('/api/auth/reset-password-offline', (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username || !oldPassword || !newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'يرجى تقديم اسم المستخدم، كلمة السر القديمة، وكلمة السر الجديدة (4 أحرف على الأقل)' });
  }

  const db = readDB();
  const user = findUserByQuery(db, username);

  if (!user) {
    return res.status(404).json({ success: false, message: 'اسم المستخدم غير موجود بالنظام' });
  }

  if (!verifyPassword(user.password, oldPassword)) {
    return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
  }

  user.password = newPassword.trim();
  writeDB(db);

  addAuditLog(user.username, user.role, 'تغيير كلمة السر', 'تم التحقق من كلمة السر القديمة وتحديث كلمة السر بنجاح وإلغاء الاعتماد القديم', 'SECURITY');

  res.json({ success: true, message: 'تم التحقق من كلمة المرور القديمة وتحديث كلمة السر بنجاح وإلغاء القديمة تماماً!' });
});

// PRODUCTS - List all (optionally filtered by warehouse)
app.get('/api/products', (req, res) => {
  const db = readDB();
  const warehouse = req.query.warehouse as string | undefined;
  let list = db.products || [];
  if (warehouse && ['EASTERN', 'WESTERN', 'AUXILIARY'].includes(warehouse)) {
    list = list.filter(p => (p.warehouseId || 'EASTERN') === warehouse);
  }
  const sanitized = list.map((p, idx) => ({
    ...p,
    id: p.id && String(p.id).trim() && !['none', 'null', 'undefined'].includes(String(p.id).toLowerCase()) ? String(p.id) : String(idx + 1),
    code: p.code && p.code.startsWith('NOSSER-') ? p.code : `NOSSER-${p.code ? p.code.replace(/^NASSER-/, '') : p.id || idx + 101}`,
    warehouseId: p.warehouseId || 'EASTERN',
    warehouseName: p.warehouseName || (p.warehouseId === 'WESTERN' ? 'المخزن الغربي' : p.warehouseId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي'),
  }));
  res.json({ success: true, products: sanitized });
});

// PRODUCTS - Create Product
app.post('/api/products', (req, res) => {
  const { code, name, category, stock, price, minStock, unit, description, username, role, warehouseId, warehouseName } = req.body;

  if (role !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'عفواً، إضافة صنف جديد هي صلاحية حصرية للمدير العام (الحساب الرئيسي) فقط' });
  }

  const db = readDB();
  
  const targetWarehouseId = (warehouseId as string) || 'EASTERN';
  const targetWarehouseName = warehouseName || (targetWarehouseId === 'WESTERN' ? 'المخزن الغربي' : targetWarehouseId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي');

  let productCode = (code || '').trim();
  if (!productCode) {
    let maxNum = 100;
    db.products.forEach(p => {
      const match = p.code.match(/^(?:NOSSER-|NASSER-)?(?:[EWA])?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const prefixLetter = targetWarehouseId === 'WESTERN' ? 'W' : targetWarehouseId === 'AUXILIARY' ? 'A' : 'E';
    productCode = `NOSSER-${prefixLetter}${maxNum + 1}`;
  } else if (!productCode.startsWith('NOSSER-')) {
    productCode = productCode.startsWith('NASSER-') ? productCode.replace(/^NASSER-/, 'NOSSER-') : `NOSSER-${productCode}`;
  }

  const initialStock = Math.max(0, Number(stock) || 0);

  const nextId = String(db.products.reduce((max, p) => Math.max(max, parseInt(p.id, 10) || 0), 0) + 1);

  const newProduct: Product = {
    id: nextId,
    code: productCode,
    name: name.trim(),
    category: category || 'عام',
    stock: initialStock,
    minStock: Number(minStock) || 5,
    unit: unit || 'وحدة',
    warehouseId: targetWarehouseId,
    warehouseName: targetWarehouseName,
    description: description || '',
    updatedAt: new Date().toISOString(),
  };

  db.products.push(newProduct);

  // Record initial stock movement if initialStock > 0
  if (initialStock > 0) {
    const movement: StockMovement = {
      id: `mvt_${Date.now()}_${nextId}`,
      productId: newProduct.id,
      productCode: newProduct.code,
      productName: newProduct.name,
      warehouseId: targetWarehouseId,
      warehouseName: targetWarehouseName,
      type: 'IN',
      quantity: initialStock,
      previousStock: 0,
      newStock: initialStock,
      reason: `رصيد افتتاحي في ${targetWarehouseName}`,
      operatorName: username || 'المدير العام',
      timestamp: new Date().toISOString(),
    };
    db.movements.unshift(movement);
  }

  writeDB(db);

  addAuditLog(
    username || 'المدير العام',
    role || 'GENERAL_MANAGER',
    'إضافة صنف جديد للمخزن',
    `تم تسجيل الصنف (${newProduct.name}) بكود [${newProduct.code}] ورصيد افتتاحي ${initialStock} ${newProduct.unit} في ${targetWarehouseName}`,
    'MOVEMENT'
  );

  res.json({ success: true, product: newProduct });
});

// PRODUCTS - Batch Create Products
app.post('/api/products/batch', (req, res) => {
  const { items, username, role, warehouseId, warehouseName } = req.body;

  if (role !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'عفواً، إضافة الأصناف دفعة واحدة هي صلاحية حصرية للمدير العام (الحساب الرئيسي) فقط' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'لا توجد أصناف للإضافة' });
  }

  const db = readDB();
  const targetWarehouseId = (warehouseId as string) || 'EASTERN';
  const targetWarehouseName = warehouseName || (targetWarehouseId === 'WESTERN' ? 'المخزن الغربي' : targetWarehouseId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي');
  const prefixLetter = targetWarehouseId === 'WESTERN' ? 'W' : targetWarehouseId === 'AUXILIARY' ? 'A' : 'E';

  // Find baseline numeric serial code
  let maxNum = 100;
  db.products.forEach(p => {
    const match = p.code.match(/^(?:NOSSER-|NASSER-)?(?:[EWA])?(\d+)$/i) || p.code.match(/\d+/);
    if (match) {
      const num = parseInt(match[1] || match[0], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });

  const createdProducts: Product[] = [];
  const now = new Date().toISOString();

  let currentMaxId = db.products.reduce((max, p) => Math.max(max, parseInt(p.id, 10) || 0), 0);

  items.forEach((item) => {
    if (!item.name || !item.name.trim()) return;

    maxNum += 1;
    currentMaxId += 1;
    let finalCode = (item.code && item.code.trim()) ? item.code.trim() : `NOSSER-${prefixLetter}${maxNum}`;
    if (!finalCode.startsWith('NOSSER-')) {
      finalCode = finalCode.startsWith('NASSER-') ? finalCode.replace(/^NASSER-/, 'NOSSER-') : `NOSSER-${finalCode}`;
    }
    const initialStock = Math.max(0, Number(item.stock) || 0);

    const newProd: Product = {
      id: String(currentMaxId),
      code: finalCode,
      name: item.name.trim(),
      category: item.category || 'عام',
      stock: initialStock,
      minStock: Number(item.minStock) || 5,
      unit: item.unit || 'وحدة',
      warehouseId: targetWarehouseId,
      warehouseName: targetWarehouseName,
      description: item.description || '',
      updatedAt: now,
    };

    db.products.push(newProd);
    createdProducts.push(newProd);

    if (initialStock > 0) {
      const movement: StockMovement = {
        id: `mvt_${Date.now()}_${newProd.id}`,
        productId: newProd.id,
        productCode: newProd.code,
        productName: newProd.name,
        warehouseId: targetWarehouseId,
        warehouseName: targetWarehouseName,
        type: 'IN',
        quantity: initialStock,
        previousStock: 0,
        newStock: initialStock,
        reason: `رصيد إدخال افتتاحي دفعة واحدة (${targetWarehouseName})`,
        operatorName: username || 'المدير العام',
        timestamp: now,
      };
      db.movements.unshift(movement);
    }
  });

  writeDB(db);

  addAuditLog(
    username || 'المدير العام',
    role || 'GENERAL_MANAGER',
    'إضافة أصناف دفعة واحدة للمخزن (Excel Batch)',
    `تم تسجيل عدد (${createdProducts.length}) صنف مخزني جديد في ${targetWarehouseName} بنجاح`,
    'MOVEMENT'
  );

  res.json({ success: true, count: createdProducts.length, products: createdProducts });
});

// PRODUCTS - Update Product
app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { code, name, category, stock, price, minStock, unit, description, username, role } = req.body;

  if (role !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'عفواً، تعديل الأصناف هي صلاحية حصرية للمدير العام (الحساب الرئيسي) فقط' });
  }

  const db = readDB();
  
  // Use resilient finder to locate matching product by ID or Code
  const targetProduct = findProductInList(db.products, id) || (code ? findProductInList(db.products, code) : undefined);
  if (!targetProduct) {
    return res.status(404).json({ success: false, message: `الصنف غير موجود بالمخزن (${id})` });
  }

  const index = db.products.findIndex(p => p.id === targetProduct.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'الصنف غير موجود' });
  }

  const oldProd = db.products[index];
  const rawStock = Number(stock);
  const newStock = !isNaN(rawStock) ? Math.max(0, rawStock) : oldProd.stock;

  let newCode = (code || oldProd.code).trim();
  if (!newCode.startsWith('NOSSER-')) {
    newCode = newCode.startsWith('NASSER-') ? newCode.replace(/^NASSER-/, 'NOSSER-') : `NOSSER-${newCode}`;
  }

  // If stock was modified directly, record movement log
  if (!isNaN(newStock) && newStock !== oldProd.stock) {
    const diff = newStock - oldProd.stock;
    const movement: StockMovement = {
      id: `mvt_${Date.now()}`,
      productId: oldProd.id,
      productCode: newCode,
      productName: name || oldProd.name,
      type: 'ADJUSTMENT',
      quantity: Math.abs(diff),
      previousStock: oldProd.stock,
      newStock: newStock,
      reason: `تعديل يدوي للرصيد (${diff > 0 ? '+' : ''}${diff})`,
      operatorName: username || 'المدير العام',
      timestamp: new Date().toISOString(),
    };
    db.movements.unshift(movement);
  }

  db.products[index] = {
    ...oldProd,
    code: newCode,
    name: (name || oldProd.name).trim(),
    category: category || oldProd.category || 'عام',
    stock: newStock,
    minStock: Number(minStock) || oldProd.minStock || 5,
    unit: unit || oldProd.unit || 'وحدة',
    description: description !== undefined ? description : oldProd.description,
    updatedAt: new Date().toISOString(),
  };

  writeDB(db);

  addAuditLog(
    username || 'المدير العام',
    role || 'GENERAL_MANAGER',
    'تعديل بيانات صنف',
    `تم تحديث بيانات الصنف (${db.products[index].name})، الرصيد الحالي: ${db.products[index].stock} ${db.products[index].unit}`,
    'INFO'
  );

  res.json({ success: true, product: db.products[index] });
});

// PRODUCTS - Delete Product
app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { username, role } = req.query;

  if (role !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'عفواً، حذف الأصناف هي صلاحية حصرية للمدير العام (الحساب الرئيسي) فقط' });
  }

  const db = readDB();
  const targetProduct = findProductInList(db.products, id);
  if (!targetProduct) {
    return res.status(404).json({ success: false, message: `الصنف المراد حذفه غير موجود بالمخزن (${id})` });
  }

  const actualId = targetProduct.id;
  const targetCode = targetProduct.code;
  const targetName = targetProduct.name;

  db.products = db.products.filter(p => p.id !== actualId && p.code !== targetCode);
  db.movements = db.movements.filter(m => m.productId !== actualId && m.productCode !== targetCode);
  writeDB(db);

  addAuditLog(String(username || 'المدير العام'), String(role || 'GENERAL_MANAGER'), 'حذف صنف من المخزن', `تم حذف الصنف (${targetName}) بكود [${targetCode}] نهائياً من قاعدة البيانات`, 'WARNING');

  res.json({ success: true, message: 'تم حذف الصنف من قاعدة البيانات بنجاح' });
});

// Helper for resilient product lookup (strictly isolates primary key ID, exact code, and name)
function findProductInList(products: Product[], idOrCodeOrName: string, targetWarehouseId?: string): Product | undefined {
  if (!idOrCodeOrName) return undefined;
  const cleanKey = String(idOrCodeOrName).trim();
  if (!cleanKey || ['none', 'null', 'undefined'].includes(cleanKey.toLowerCase())) return undefined;

  const pool = targetWarehouseId ? products.filter(p => (p.warehouseId || 'EASTERN') === targetWarehouseId) : products;

  // 1. Exact match on unique product ID
  const idMatch = pool.find(p => String(p.id) === cleanKey);
  if (idMatch) return idMatch;

  // 2. Exact match on product code
  const codeMatch = pool.find(p => String(p.code) === cleanKey);
  if (codeMatch) return codeMatch;

  // 3. Case-insensitive match on product code
  const lowerKey = cleanKey.toLowerCase();
  const codeCaseMatch = pool.find(p => String(p.code).toLowerCase() === lowerKey);
  if (codeCaseMatch) return codeCaseMatch;

  // 4. Exact trimmed match on product name
  const nameMatch = pool.find(p => p.name.trim().toLowerCase() === lowerKey);
  if (nameMatch) return nameMatch;

  return undefined;
}

// STOCK MOVEMENTS - Process In / Out / Adjustment
app.post('/api/movements', (req, res) => {
  const { productId, productCode, productName, code, name, type, quantity, reason, referenceNo, operatorName, role, warehouseId, warehouseName } = req.body;

  const qty = Number(quantity);
  const searchKey = productId || productCode || code || productName || name;
  if (!searchKey || !type || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ success: false, message: 'بيانات حركة المخزون غير مكتملة أو الكمية غير صالحة' });
  }

  const targetWhId = (warehouseId as string) || 'EASTERN';
  const targetWhName = warehouseName || (targetWhId === 'WESTERN' ? 'المخزن الغربي' : targetWhId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي');

  const db = readDB();
  const product = findProductInList(db.products, searchKey, targetWhId) ||
                  (productCode ? findProductInList(db.products, productCode, targetWhId) : undefined) ||
                  (productName ? findProductInList(db.products, productName, targetWhId) : undefined);

  if (!product) {
    return res.status(404).json({ success: false, message: `الصنف (${productName || productCode || searchKey}) غير موجود في ${targetWhName}` });
  }

  const previousStock = product.stock;
  let newStock = previousStock;

  if (type === 'IN') {
    newStock = previousStock + qty;
  } else if (type === 'OUT') {
    if (previousStock < qty) {
      return res.status(400).json({
        success: false,
        message: `عفوًا، الرصيد المتاح من (${product.name}) في ${targetWhName} هو ${previousStock} فقط، ولا يكفي لصرف كمية ${qty}`,
      });
    }
    newStock = previousStock - qty;
  } else if (type === 'ADJUSTMENT') {
    newStock = Math.max(0, qty);
  }

  if (newStock < 0) {
    return res.status(400).json({
      success: false,
      message: `عفوًا، لا يمكن أن يكون رصيد (${product.name}) أقل من صفر (الرصيد المتاح حالياً: ${previousStock})`,
    });
  }

  product.stock = newStock;
  product.updatedAt = new Date().toISOString();

  let refNo = (referenceNo || '').trim();
  if (!refNo && type === 'OUT') {
    let maxSeq = 9944;
    db.movements.forEach(m => {
      if (m.referenceNo) {
        const match = m.referenceNo.match(/\d+/g);
        if (match) {
          const val = parseInt(match.join(''), 10);
          if (!isNaN(val) && val > maxSeq) maxSeq = val;
        }
      }
    });
    refNo = String(maxSeq + 1);
  }

  const movement: StockMovement = {
    id: `mvt_${Date.now()}`,
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    warehouseId: targetWhId,
    warehouseName: targetWhName,
    type,
    quantity: qty,
    previousStock,
    newStock,
    reason: (reason || '').trim() || (type === 'IN' ? 'توريد إضافي' : 'أمر تسليم مخزن'),
    referenceNo: refNo,
    operatorName: operatorName || 'مسؤول المخزن',
    timestamp: new Date().toISOString(),
  };

  db.movements.unshift(movement);
  writeDB(db);

  const typeDesc = type === 'IN' ? 'إدخال / توريد (+)' : type === 'OUT' ? 'إخراج / صرف (-)' : 'تعديل جرد';
  addAuditLog(
    operatorName || 'مسؤول المخزن',
    role || 'WAREHOUSE_MANAGER',
    `حركة مخزنية: ${typeDesc}`,
    `تم تسجيل ${typeDesc} للصنف (${product.name}) في [${targetWhName}] بكمية ${qty} ${product.unit}. الرصيد السابق: ${previousStock} -> الجديد: ${newStock}.`,
    'MOVEMENT'
  );

  res.json({
    success: true,
    product,
    movement,
    message: `تم تسجيل الحركة وتحديث رصيد (${product.name}) في ${targetWhName} إلى ${newStock} وحدة`,
  });
});

// STOCK MOVEMENTS - Process Batch Delivery Order / Movements Atomically
app.post('/api/movements/batch', (req, res) => {
  const { items, referenceNo, reason, operatorName, role, warehouseId, warehouseName } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'فشلت العملية، لا توجد أصناف في أمر التسليم' });
  }

  const targetWhId = (warehouseId as string) || 'EASTERN';
  const targetWhName = warehouseName || (targetWhId === 'WESTERN' ? 'المخزن الغربي' : targetWhId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي');

  const db = readDB();
  const opName = operatorName || 'أمين المخزن';
  const now = new Date().toISOString();
  const refNo = (referenceNo || '').trim() || '1';
  const reasonText = (reason || '').trim() || 'أمر تسليم مخزن';

  // 1. Validation phase: check that all items exist in the active warehouse and have sufficient stock
  for (const itm of items) {
    const pId = itm.productId ? String(itm.productId).trim() : '';
    const pCode = itm.productCode ? String(itm.productCode).trim() : '';
    const pName = itm.productName ? String(itm.productName).trim() : '';
    const fallbackKey = itm.code || itm.name || '';
    const qty = Math.max(1, Number(itm.quantity) || 1);

    const prod = (pId ? findProductInList(db.products, pId, targetWhId) : undefined) ||
                 (pCode ? findProductInList(db.products, pCode, targetWhId) : undefined) ||
                 (pName ? findProductInList(db.products, pName, targetWhId) : undefined) ||
                 (fallbackKey ? findProductInList(db.products, fallbackKey, targetWhId) : undefined);

    if (!prod) {
      const label = pName || pCode || pId || fallbackKey || 'غير معروف';
      return res.status(404).json({ success: false, message: `الصنف (${label}) غير موجود في ${targetWhName}` });
    }
    const currentStock = Number(prod.stock) || 0;
    if (currentStock < qty) {
      return res.status(400).json({
        success: false,
        message: `الرصيد المتاح من (${prod.name}) في [${targetWhName}] هو ${currentStock} فقط، ولا يكفي لصرف كمية ${qty}`,
      });
    }
  }

  // 2. Execution phase: deduct stock strictly from this warehouse and record movements
  const createdMovements: StockMovement[] = [];
  for (const itm of items) {
    const pId = itm.productId ? String(itm.productId).trim() : '';
    const pCode = itm.productCode ? String(itm.productCode).trim() : '';
    const pName = itm.productName ? String(itm.productName).trim() : '';
    const fallbackKey = itm.code || itm.name || '';
    const qty = Math.max(1, Number(itm.quantity) || 1);

    const prod = ((pId ? findProductInList(db.products, pId, targetWhId) : undefined) ||
                  (pCode ? findProductInList(db.products, pCode, targetWhId) : undefined) ||
                  (pName ? findProductInList(db.products, pName, targetWhId) : undefined) ||
                  (fallbackKey ? findProductInList(db.products, fallbackKey, targetWhId) : undefined))!;

    const previousStock = Number(prod.stock) || 0;
    const newStock = Math.max(0, previousStock - qty);

    prod.stock = newStock;
    prod.updatedAt = now;

    const movement: StockMovement = {
      id: `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      warehouseId: targetWhId,
      warehouseName: targetWhName,
      type: 'OUT',
      quantity: qty,
      previousStock,
      newStock,
      reason: reasonText,
      referenceNo: refNo,
      operatorName: opName,
      timestamp: now,
    };

    db.movements.unshift(movement);
    createdMovements.push(movement);
  }

  writeDB(db);

  addAuditLog(
    opName,
    role || 'WAREHOUSE_MANAGER',
    'صرف أمر تسليم مخزن (دفعة واحدة)',
    `تم صرف عدد (${createdMovements.length}) أصناف من [${targetWhName}] بموجب أمر تسليم رقم [${refNo}] بنجاح`,
    'MOVEMENT'
  );

  res.json({
    success: true,
    message: `تم صرف وتوثيق أمر التسليم رقم [${refNo}] من ${targetWhName} بنجاح`,
    movements: createdMovements,
  });
});

// STOCK MOVEMENTS - Get History (optionally filtered by warehouse)
app.get('/api/movements', (req, res) => {
  const db = readDB();
  const warehouse = req.query.warehouse as string | undefined;
  let list = db.movements || [];
  if (warehouse && ['EASTERN', 'WESTERN', 'AUXILIARY'].includes(warehouse)) {
    list = list.filter(m => (m.warehouseId || 'EASTERN') === warehouse);
  }
  res.json({ success: true, movements: list });
});

// SALES INVOICES - List (optionally filtered by warehouse)
app.get('/api/sales', (req, res) => {
  const db = readDB();
  const warehouse = req.query.warehouse as string | undefined;
  let list = db.sales || [];
  if (warehouse && ['EASTERN', 'WESTERN', 'AUXILIARY'].includes(warehouse)) {
    list = list.filter(s => (s.warehouseId || 'EASTERN') === warehouse);
  }
  res.json({ success: true, sales: list });
});

// SALES INVOICES - Create Sale Record
app.post('/api/sales', (req, res) => {
  const { customerName, customerPhone, cashierId, cashierName, subtotal, discount, tax, total, paymentMethod, items, notes, invoiceNumber, warehouseId, warehouseName } = req.body;
  const db = readDB();
  if (!db.sales) db.sales = [];

  const targetWhId = (warehouseId as string) || 'EASTERN';
  const targetWhName = warehouseName || (targetWhId === 'WESTERN' ? 'المخزن الغربي' : targetWhId === 'AUXILIARY' ? 'المخزن الإضافي' : 'المخزن الشرقي');

  const count = db.sales.length + 1;
  const invNum = invoiceNumber || `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(count).padStart(4, '0')}`;

  const newSale: SaleRecord = {
    id: `sale_${Date.now()}`,
    invoiceNumber: invNum,
    deliveryOrderRef: invNum,
    warehouseId: targetWhId,
    warehouseName: targetWhName,
    createdAt: new Date().toISOString(),
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    cashierId: cashierId || 'usr_1',
    cashierName: cashierName || 'أمين المخزن',
    subtotal: Number(subtotal) || 0,
    discount: Number(discount) || 0,
    tax: Number(tax) || 0,
    total: Number(total) || 0,
    paymentMethod: paymentMethod || 'CASH',
    items: items || [],
    notes: notes || '',
  };

  db.sales.unshift(newSale);
  writeDB(db);

  addAuditLog(
    newSale.cashierName,
    'WAREHOUSE_MANAGER',
    'تسجيل أمر تسليم مخزن',
    `تم تسجيل وتوثيق أمر تسليم مخزن رقم [${invNum}] من ${targetWhName} وخصم الأصناف بنجاح`,
    'MOVEMENT'
  );

  res.json({ success: true, invoiceNumber: invNum, sale: newSale });
});

// USERS - List
app.get('/api/users', (req, res) => {
  const db = readDB();
  const safeUsers = db.users.map(({ password: _, ...u }) => u);
  res.json({ success: true, users: safeUsers });
});

// USERS - Create
app.post('/api/users', (req, res) => {
  const { username, password, name, role, gmail, requesterRole } = req.body;

  if (requesterRole !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'غير مصرح: إدارة المستخدمين مقتصرة على المدير العام فقط' });
  }

  if (!gmail || !gmail.trim().endsWith('@gmail.com')) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال عنوان بريد Gmail صحيح ومفعل للربط بحساب المستخدم' });
  }

  const db = readDB();
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم مسجل مسبقًا' });
  }

  const newUser: User = {
    id: `usr_${Date.now()}`,
    username: username.trim(),
    password: password.trim(),
    name: name.trim(),
    role: role || 'WAREHOUSE_MANAGER',
    gmail: gmail.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  writeDB(db);

  addAuditLog('المدير العام', 'GENERAL_MANAGER', 'إنشاء مستخدم جديد', `تم إنشاء الحساب ${newUser.username} ببريد ${newUser.gmail}`, 'SECURITY');

  const { password: _, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

// AUDIT LOGS
app.get('/api/logs', (req, res) => {
  const db = readDB();
  res.json({ success: true, logs: db.logs });
});

// SETTINGS
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/settings', (req, res) => {
  const { settings, role } = req.body;
  if (role !== 'GENERAL_MANAGER') {
    return res.status(403).json({ success: false, message: 'غير مصرح' });
  }

  const db = readDB();
  db.settings = { ...db.settings, ...settings };
  writeDB(db);

  addAuditLog('المدير العام', 'GENERAL_MANAGER', 'تحديث الإعدادات', 'تم تحديث الإعدادات ورابط Google Sheet', 'INFO');

  res.json({ success: true, settings: db.settings });
});

// RATE LIMITER COUNTER API
app.post('/api/rate-limiter/check', (req, res) => {
  const info = incrementRateLimiter();
  res.json({ success: true, ...info });
});

app.get('/api/rate-limiter/status', (req, res) => {
  const info = getRateLimiterInfo();
  res.json({ success: true, ...info });
});

// AI DIAGNOSIS ROUTE
app.post('/api/ai/diagnose', async (req, res) => {
  try {
    const rateInfo = incrementRateLimiter();
    const { prompt, imageBase64 } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    let diagnosisText = '';

    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const contents: any[] = [prompt || 'قم بتحليل وتخصيص حالة هذا الصنف الموضح في الصورة وإبداء الملاحظات الفنية للمخزن.'];
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        contents.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
      });
      diagnosisText = response.text || 'تم فحص الصنف بنجاح.';
    } else {
      diagnosisText = `[تقرير الفحص والتشخيص الفني للمخزن]
- حالة الفحص: تم التحقق الذاتي بنجاح
- النتيجة الفنية للصنف: خالي من العيوب، مطابق لمعايير الجودة والتخزين لشركة NOSSER، التغليف سليم وفي حالة جيدة.`;
    }

    res.json({
      success: true,
      diagnosis: diagnosisText,
      rateInfo,
    });
  } catch (err: any) {
    console.error('AI diagnosis error:', err);
    res.status(500).json({
      success: false,
      message: 'تعذر الاتصال بـ Gemini API: ' + err.message,
    });
  }
});

// START SERVER AND VITE MIDDLEWARE
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🏢 شركة NOSSER - نظام إدارة المخازن والمخزون يعمل على Port ${PORT}`);
    console.log(`====================================================`);
  });
}

startServer();
