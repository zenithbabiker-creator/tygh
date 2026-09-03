/**
 * Standalone Native Python PySide6 Launcher Generator for شركة NASSER Desktop (.exe)
 * Uses pure PySide6 QWebEngineView + PySide6.QtPrintSupport (QPrinter, QPrintDialog)
 * with SQLite LocalAppData/Portable engine for 100% offline native Windows execution and native direct printing.
 * Zero external browser/app dependencies.
 */

export function generatePySideScript(): string {
  return `"""
====================================================================
شركة NASSER - نظام إدارة المخازن والمبيعات وإصدار الفواتير
تطبيق سطح المكتب الاحترافي لشركة ناصر (PySide6 Native Desktop App)
- حل جذري لمشكلة ERR_EMPTY_RESPONSE و 127.0.0.1 عبر معالجة sys.stderr وخادم ThreadingHTTPServer متزامن
- حل مشكلة المسارات والشاشة البيضاء عبر sys._MEIPASS و get_resource_path
- قاعدة بيانات SQLite ديناميكية دائمة تحفظ البيانات أوفلاين مدى الحياة في AppData
- معالجة تامة لأخطاء Database Lock عبر Thread Locks & SQLite WAL & busy_timeout
- دعم مسار /api/movements/batch و /api/sales لتسجيل الفواتير في عملية ذرية واحدة
- طباعة داخلية أصلية 100% عبر PySide6.QtPrintSupport (QPrinter, QPrintDialog)
- التقاط فوري لاختصار لوحة المفاتيح (Ctrl + P) لطباعة الفاتورة مباشرة
====================================================================
"""

import sys
import os
import time
import json
import re
import sqlite3
import threading
import socket
import http.server
import socketserver
import urllib.parse
import mimetypes

# حماية تامة ضد أخطاء NoneType في وضع --noconsole في بيئة ويندوز (حل مشكلة ERR_EMPTY_RESPONSE)
class SafeNullWriter:
    def write(self, *args, **kwargs): pass
    def writelines(self, *args, **kwargs): pass
    def flush(self, *args, **kwargs): pass
    def isatty(self): return False
    def fileno(self): return -1

if sys.stdout is None:
    sys.stdout = SafeNullWriter()
if sys.stderr is None:
    sys.stderr = SafeNullWriter()

# تسجيل أنواع MIME الصريحة لملفات الويب لضمان عدم تعذر تحميل الأصول
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/x-icon', '.ico')
mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('font/woff', '.woff')

# قفل خيوط عام لضمان التزامن وحماية قاعدة البيانات من أي تضارب (Database Lock Fix)
DB_LOCK = threading.RLock()

# --- 1. RESOURCE PATH RESOLVER FOR PYINSTALLER (Fix White Screen) ---
def get_resource_path(relative_path):
    """
    تحديد المسار الدقيق لملفات الواجهة (HTML/JS/CSS/Assets) المدمجة
    سواء كان التطبيق يعمل في بيئة التطوير أو مجمّعاً داخل ملف .exe مستقل بواسطة PyInstaller.
    """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

def get_dist_path():
    """تحديد مجلد dist المجمّع بدقة تامة"""
    # 1. البحث داخل _MEIPASS (عند التشغيل من ملف EXE مجمّع بـ --add-data "dist;dist")
    meipass_dist = get_resource_path("dist")
    if os.path.exists(os.path.join(meipass_dist, "index.html")):
        return meipass_dist
        
    # 2. البحث المباشر في جذر _MEIPASS (إذا تم تضمين محتويات dist مباشرة)
    if hasattr(sys, '_MEIPASS') and os.path.exists(os.path.join(sys._MEIPASS, "index.html")):
        return sys._MEIPASS

    # 3. البحث بجانب ملف السكريبت أو ملف الـ EXE وفي مجلد _internal الخاص بـ PyInstaller
    current_script_or_exe = sys.executable if getattr(sys, 'frozen', False) else (globals().get('__file__') or sys.executable or os.path.abspath('.'))
    exe_dir = os.path.dirname(os.path.abspath(current_script_or_exe))
    candidates = [
        os.path.join(exe_dir, "_internal", "dist"),
        os.path.join(exe_dir, "_internal"),
        os.path.join(exe_dir, "dist"),
        exe_dir,
        os.path.abspath("dist"),
        os.path.abspath(".")
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, "index.html")):
            return c
            
    return meipass_dist

def get_html_file_path():
    """الحصول على المسار المؤكد لملف index.html"""
    dist_dir = get_dist_path()
    return os.path.join(dist_dir, "index.html")

# --- 2. DYNAMIC PERMANENT DATABASE CONFIGURATION & IMMEDIATE AUTO-COMMIT ---
def get_app_dir():
    """
    الحصول على المجلد الدائم المستقر لقاعدة البيانات على القرص الصلب.
    الأولوية لمجلد Roaming AppData ومجلد المستخدم الدائم لضمان عدم مسح البيانات أبداً.
    """
    # 1. Roaming AppData (أعلى مستوى أمان وثبات في ويندوز، لا يمسحه تنظيف القرص إطلاقاً)
    roaming = os.environ.get('APPDATA')
    if roaming and os.path.isdir(roaming):
        app_dir = os.path.join(roaming, 'NasserCompanyApp')
        os.makedirs(app_dir, exist_ok=True)
        return app_dir

    # 2. Local AppData
    local_app = os.environ.get('LOCALAPPDATA')
    if local_app and os.path.isdir(local_app):
        app_dir = os.path.join(local_app, 'NasserCompanyApp')
        os.makedirs(app_dir, exist_ok=True)
        return app_dir

    # 3. مجلد المستخدم الأساسي
    user_home = os.path.expanduser('~')
    app_dir = os.path.join(user_home, '.nasser_company')
    os.makedirs(app_dir, exist_ok=True)
    return app_dir

def get_db_path():
    """
    تحديد المسار الفعلي الدائم لقاعدة بيانات SQLite مع حماية تامة للبيانات السابقة.
    يتحقق من وجود قاعدة بيانات سابقة في أي مسار دائم لمنع إنشاء ملف جديد فارغ وتجنب ضياع البيانات.
    """
    candidates = []

    # 1. مسار مجلد Roaming AppData
    roaming = os.environ.get('APPDATA')
    if roaming:
        candidates.append(os.path.join(roaming, 'NasserCompanyApp', 'nasser_store.db'))

    # 2. مسار مجلد Local AppData
    local_app = os.environ.get('LOCALAPPDATA')
    if local_app:
        candidates.append(os.path.join(local_app, 'NasserCompanyApp', 'nasser_store.db'))

    # 3. مسار بجانب ملف الـ EXE (إذا كان متاحاً وقابلاً للكتابة)
    current_script_or_exe = sys.executable if getattr(sys, 'frozen', False) else (globals().get('__file__') or sys.executable or os.path.abspath('.'))
    exe_dir = os.path.dirname(os.path.abspath(current_script_or_exe))
    local_side_db = os.path.join(exe_dir, 'nasser_store.db')
    if os.path.exists(local_side_db) and os.access(exe_dir, os.W_OK) and ("Program Files" not in exe_dir):
        return local_side_db

    # 4. مسار مجلد المستخدم
    user_home = os.path.expanduser('~')
    candidates.append(os.path.join(user_home, '.nasser_company', 'nasser_store.db'))

    # فحص أي ملف موجود مسبقاً لاستئناف القراءة منه مباشرة وعدم مسح بيانات المستخدم
    for path in candidates:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path

    # إذا لم تكن هناك قاعدة بيانات سابقة، يتم اعتماد المسار الدائم الأساسي في Roaming AppData
    primary_dir = get_app_dir()
    return os.path.join(primary_dir, 'nasser_store.db')

def get_db_connection():
    """
    إنشاء اتصال آمن بقاعدة البيانات مع تفعيل مهلة انتظار 60 ثانية لمنع حدوث Database Lock وضمان إتمام المعاملات فورياً.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path, timeout=60.0, check_same_thread=False)
    try:
        conn.execute("PRAGMA busy_timeout=60000;")
    except Exception:
        pass
    return conn

def commit_and_sync(conn):
    """
    تنفيذ الحفظ النهائي اللحظي وإغلاق المعاملة ودفع البيانات مباشرة للقرص الصلب بأمان تام.
    """
    try:
        conn.commit()
    except Exception as e:
        print("Commit error:", e)

def flush_db_on_exit():
    """ضمان حفظ التغييرات بالكامل في ملف قاعدة البيانات الرئيسي عند إغلاق التطبيق"""
    try:
        with DB_LOCK:
            conn = get_db_connection()
            try:
                conn.commit()
            finally:
                conn.close()
    except Exception:
        pass

import atexit
atexit.register(flush_db_on_exit)

def init_sqlite_db():
    """تهيئة قاعدة البيانات وإنشاء الجداول وتفعيل وضع الحفظ الدائم WAL وترقية المخطط (Schema Migration) مع معالجة ذكية للـ Lock"""
    with DB_LOCK:
        for attempt in range(5):
            conn = None
            try:
                conn = get_db_connection()
                try:
                    conn.isolation_level = None
                    conn.execute("PRAGMA journal_mode=WAL;")
                    conn.execute("PRAGMA synchronous=NORMAL;")
                    conn.execute("PRAGMA busy_timeout=60000;")
                    conn.isolation_level = ""
                except Exception:
                    pass

                cursor = conn.cursor()
                
                # جدول المنتجات بتوليد تلقائي للمعرف (Auto-Increment Primary Key)
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL,
                        stock INTEGER NOT NULL DEFAULT 0,
                        min_stock INTEGER DEFAULT 5,
                        unit TEXT DEFAULT 'وحدة',
                        price REAL DEFAULT 0.0,
                        unit_price REAL DEFAULT 0.0,
                        description TEXT DEFAULT '',
                        updated_at TEXT
                    )
                ''')
                
                # جدول أوامر التسليم والمبيعات
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS sales (
                        id TEXT PRIMARY KEY,
                        invoice_number TEXT UNIQUE NOT NULL,
                        created_at TEXT NOT NULL,
                        customer_name TEXT,
                        customer_phone TEXT,
                        cashier_id TEXT,
                        cashier_name TEXT NOT NULL,
                        subtotal REAL NOT NULL,
                        discount REAL DEFAULT 0,
                        tax REAL DEFAULT 0,
                        total REAL NOT NULL,
                        payment_method TEXT NOT NULL,
                        items_json TEXT NOT NULL,
                        notes TEXT
                    )
                ''')
            
                # جدول المستخدمين
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        name TEXT NOT NULL,
                        role TEXT NOT NULL,
                        gmail TEXT,
                        created_at TEXT
                    )
                ''')

                # جدول سجل التدقيق والمراجعة
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS logs (
                        id TEXT PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        username TEXT NOT NULL,
                        role TEXT NOT NULL,
                        action TEXT NOT NULL,
                        details TEXT NOT NULL,
                        type TEXT NOT NULL
                    )
                ''')

                # جدول حركات المخزون (تعديل، توريد، صرف، فواتير)
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS movements (
                        id TEXT PRIMARY KEY,
                        reference_no TEXT,
                        product_id TEXT NOT NULL,
                        product_code TEXT,
                        product_name TEXT,
                        type TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        previous_stock INTEGER,
                        new_stock INTEGER,
                        reason TEXT,
                        operator_name TEXT,
                        created_at TEXT
                    )
                ''')
                
                # --- ترقية وتحديث المخطط التلقائي (AUTOMATIC SCHEMA MIGRATIONS) ---
                def ensure_columns(table_name, columns_to_check):
                    try:
                        cursor.execute(f"PRAGMA table_info({table_name})")
                        existing = [r[1] for r in cursor.fetchall()]
                        for col_name, col_def in columns_to_check:
                            if col_name not in existing:
                                try:
                                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def};")
                                except Exception as ex:
                                    print(f"Migration: add {col_name} to {table_name}:", ex)
                    except Exception as e:
                        print(f"Schema check error on {table_name}:", e)

                ensure_columns('movements', [
                    ('reference_no', 'TEXT DEFAULT ""'),
                    ('product_id', 'TEXT DEFAULT ""'),
                    ('product_code', 'TEXT DEFAULT ""'),
                    ('product_name', 'TEXT DEFAULT ""'),
                    ('type', 'TEXT DEFAULT "OUT"'),
                    ('quantity', 'INTEGER DEFAULT 1'),
                    ('previous_stock', 'INTEGER DEFAULT 0'),
                    ('new_stock', 'INTEGER DEFAULT 0'),
                    ('reason', 'TEXT DEFAULT ""'),
                    ('operator_name', 'TEXT DEFAULT "أمين المخزن"'),
                    ('created_at', 'TEXT DEFAULT ""')
                ])

                ensure_columns('products', [
                    ('code', 'TEXT DEFAULT ""'),
                    ('name', 'TEXT DEFAULT ""'),
                    ('category', 'TEXT DEFAULT "عام"'),
                    ('stock', 'INTEGER DEFAULT 0'),
                    ('min_stock', 'INTEGER DEFAULT 5'),
                    ('unit', 'TEXT DEFAULT "وحدة"'),
                    ('price', 'REAL DEFAULT 0.0'),
                    ('unit_price', 'REAL DEFAULT 0.0'),
                    ('description', 'TEXT DEFAULT ""'),
                    ('updated_at', 'TEXT DEFAULT ""')
                ])

                # تنظيف أي قيم خالية وضمان معرفات فريدة
                try:
                    cursor.execute("UPDATE products SET price = 0.0 WHERE price IS NULL")
                    cursor.execute("UPDATE products SET unit_price = price WHERE unit_price IS NULL OR unit_price = 0.0")
                    cursor.execute("UPDATE products SET id = CAST(rowid AS TEXT) WHERE id IS NULL OR id = '' OR id = 'None'")
                except Exception:
                    pass

                ensure_columns('sales', [
                    ('invoice_number', 'TEXT DEFAULT ""'),
                    ('created_at', 'TEXT DEFAULT ""'),
                    ('customer_name', 'TEXT DEFAULT ""'),
                    ('customer_phone', 'TEXT DEFAULT ""'),
                    ('cashier_id', 'TEXT DEFAULT ""'),
                    ('cashier_name', 'TEXT DEFAULT ""'),
                    ('subtotal', 'REAL DEFAULT 0'),
                    ('discount', 'REAL DEFAULT 0'),
                    ('tax', 'REAL DEFAULT 0'),
                    ('total', 'REAL DEFAULT 0'),
                    ('payment_method', 'TEXT DEFAULT "CASH"'),
                    ('items_json', 'TEXT DEFAULT "[]"'),
                    ('notes', 'TEXT DEFAULT ""')
                ])

                # --- فحص وإدخال البيانات الرسمية (82 صنف) فقط إذا كانت قاعدة البيانات فارغة تماماً ---
                cursor.execute("SELECT COUNT(*) FROM products")
                total_prods = cursor.fetchone()[0]

                if total_prods == 0:
                    print("🔄 SQLite Initialization: Inserting 82 official seed items...")
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    official_seed_groups = [
                        ("سوق 21 أجهزة بركانية", [
                            "شواية لحم",
                            "ثلاجة حلويات",
                            "ماكينة شاورما كهرباء",
                            "مضارب",
                            "آيس ميكر"
                        ]),
                        ("عام", [
                            "طاولة السندوتش",
                            "صواني قرص",
                            "ميزان ساعة",
                            "شواية مشكل",
                            "حوضات",
                            "ديسبنسر",
                            "صحن السندوتش",
                            "كرتونة زجاج",
                            "شيخ الشواية",
                            "فرامة أكياس + أخشاب",
                            "شاورما دجاج",
                            "غلاية لتر",
                            "مبرد عصير",
                            "منشر لحوم",
                            "غلاية لتر كهرباء",
                            "شواية عرض السندوتش",
                            "بسكيت سمك",
                            "شواية فراخ",
                            "كرتونة صواني",
                            "غلاية غاز",
                            "قاطع سيخ شتراك صغير",
                            "عصارة برتقال"
                        ]),
                        ("الأجهزة", [
                            "طاولة السندوتش",
                            "طباخة 2 شعلة فول",
                            "م. السندوتش مرضى",
                            "ماكينة بطاطس",
                            "مبرد غاز",
                            "فريزر هاير جديد",
                            "ماكينة سمك",
                            "شواية فراخ دوار",
                            "غلاية لتر كهرباء",
                            "ماكينة بروست ضغط",
                            "صندل في مكان نائي يصعب الوصول إليه"
                        ]),
                        ("المخزن الشروق", [
                            "شوايه فحم",
                            "شاورما دبل",
                            "غلايه غاز",
                            "سخانات بروست أحمر",
                            "فرن طبقة غاز",
                            "مضرب نابوليتان",
                            "بوفيه",
                            "قلاب لحوم",
                            "مسخنات بروست",
                            "توستر",
                            "كرتونه تقطيع بطاطس",
                            "كرتونه ثلج",
                            "قلايه 2 عين غاز",
                            "وافل مدور + مربع",
                            "ايس ميكر كيلو",
                            "منشار لحمه",
                            "كسارة ثلج",
                            "ماكينه كاشير",
                            "بروست",
                            "فرن طابق",
                            "شوايه لحم",
                            "غلايه كهرباء لتر"
                        ]),
                        ("مخزن العمدة غرب", [
                            "حوض عين",
                            "راس شاورما",
                            "ثلاجة حلويات",
                            "شواية فحم",
                            "ثلاجة عرض السندوتش",
                            "مفرمة",
                            "سخان بروست",
                            "كابتشينو",
                            "خلاط لتر",
                            "سخانة منزلية",
                            "مسن بروست",
                            "مفرمة لحم",
                            "خلاط لتر ك",
                            "كسارة ثلج",
                            "كبسة دبل مفرد",
                            "قلاية مفرد غاز",
                            "كبس سمك",
                            "سخان ماء بويلر",
                            "ماكينة تتبيل بروست",
                            "كرتونة صحون",
                            "وافل مربع",
                            "فرن مدور"
                        ])
                    ]

                    seq_counter = 1
                    for grp_cat, grp_items in official_seed_groups:
                        for grp_name in grp_items:
                            p_code = f"NASSER-{100 + seq_counter}"
                            cursor.execute('''
                                INSERT INTO products (code, name, category, stock, min_stock, unit, price, unit_price, description, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (p_code, grp_name.strip(), grp_cat, 10, 5, 'وحدة', 0.0, 0.0, f"صنف معتمد: {grp_name.strip()} - قسم {grp_cat}", now_iso))
                            
                            row_id = cursor.lastrowid
                            m_id = f"mvt_init_{row_id}"
                            cursor.execute('''
                                INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (m_id, 'OPENING-INIT', str(row_id), p_code, grp_name.strip(), 'IN', 10, 0, 10, 'رصيد افتتاحي رسمي مسجل بالمستودع', 'المدير العام', now_iso))
                            seq_counter += 1

                # تعبئة حسابات المستخدمين إذا كانت فارغة
                cursor.execute("SELECT COUNT(*) FROM users")
                if cursor.fetchone()[0] == 0:
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    cursor.execute(
                        "INSERT INTO users (id, username, password, name, role, gmail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        ('usr_1', 'admin', 'admin123', 'المدير العام - ناصر', 'GENERAL_MANAGER', 'zenithbabiker@gmail.com', now_iso)
                    )
                    cursor.execute(
                        "INSERT INTO users (id, username, password, name, role, gmail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        ('usr_2', 'wh_manager', 'wh123', 'أمين المخزن الرئيسي - أحمد مصطفى', 'WAREHOUSE_MANAGER', 'warehouse.nasser@gmail.com', now_iso)
                    )

                commit_and_sync(conn)
                break
            except sqlite3.OperationalError as oe:
                if "locked" in str(oe).lower() and attempt < 4:
                    time.sleep(0.5)
                    continue
                raise oe
            except Exception as e:
                if attempt < 4:
                    time.sleep(0.5)
                    continue
                raise e
            finally:
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass

# ذاكرة مؤقتة لرموز OTP
ACTIVE_OTPS = {}

def verify_py_password(stored_pass, input_pass):
    """التحقق الذكي والشامل من كلمة المرور: المطابقة المباشرة، التجريد، وخوارزميات التشفير SHA-256 / SHA-512 / MD5"""
    if not stored_pass or not input_pass:
        return False
    s = str(stored_pass).strip()
    inp = str(input_pass).strip()
    if stored_pass == input_pass or s == inp:
        return True
    try:
        import hashlib
        inp_sha = hashlib.sha256(inp.encode('utf-8')).hexdigest()
        if s.lower() == inp_sha.lower():
            return True
        stored_sha = hashlib.sha256(s.encode('utf-8')).hexdigest()
        if stored_sha.lower() == inp.lower():
            return True
        inp_sha512 = hashlib.sha512(inp.encode('utf-8')).hexdigest()
        if s.lower() == inp_sha512.lower():
            return True
        inp_md5 = hashlib.md5(inp.encode('utf-8')).hexdigest()
        if s.lower() == inp_md5.lower():
            return True
    except Exception:
        pass
    return False

def add_audit_log(username, role, action, details, log_type='INFO'):
    """تسجيل حركة في سجل التدقيق SQLite مع حفظ فوري على القرص"""
    try:
        with DB_LOCK:
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                log_id = f"log_{int(time.time()*1000)}"
                timestamp = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                cursor.execute(
                    "INSERT INTO logs (id, timestamp, username, role, action, details, type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (log_id, timestamp, username, role, action, details, log_type)
                )
                commit_and_sync(conn)
            finally:
                conn.close()
    except Exception as e:
        print("Log error:", e)

# --- 3. EMBEDDED HTTP SERVER WITH COMPLETE SQLITE REST API ---
class SPAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """خادم محلي متكامل ومحصن يربط الواجهة بقاعدة بيانات SQLite المحلية بحفظ فوري ودائم وحماية تامة ضد ERR_EMPTY_RESPONSE"""
    protocol_version = "HTTP/1.1"
    
    def __init__(self, *args, **kwargs):
        directory = get_dist_path()
        super().__init__(*args, directory=directory, **kwargs)
    
    def log_message(self, format, *args):
        """إلغاء أو تأمين تسجيل السجلات لمنع انهيار الخادم عند تشغيله بدون موجه أوامر (Windows --noconsole)"""
        try:
            if sys.stderr is not None:
                sys.stderr.write("%s - - [%s] %s\\n" % (self.address_string(), self.log_date_time_string(), format % args))
        except Exception:
            pass

    def _send_json(self, data, code=200):
        try:
            body_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            self.wfile.write(body_bytes)
            self.wfile.flush()
        except Exception as e:
            pass

    def _serve_file(self, filepath):
        """إرسال ملفات الواجهة (HTML, JS, CSS, Assets) بترميز ثنائي دقيق مع ترويسات Content-Length لمنع أخطاء ERR_EMPTY_RESPONSE"""
        try:
            if not os.path.isfile(filepath):
                return self._serve_fallback_html()
            
            with open(filepath, 'rb') as f:
                content = f.read()
            
            ext = os.path.splitext(filepath)[1].lower()
            mime_map = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.mjs': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.ico': 'image/x-icon',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.eot': 'application/vnd.ms-fontobject',
                '.webp': 'image/webp'
            }
            content_type = mime_map.get(ext, mimetypes.guess_type(filepath)[0] or 'application/octet-stream')

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            self.wfile.write(content)
            self.wfile.flush()
        except Exception as e:
            try:
                self._send_json({"error": "File Read Error", "details": str(e)}, 500)
            except Exception:
                pass

    def _serve_fallback_html(self):
        """صفحة استرداد وبدء تشغيل احترافية تمنع ظهور أي شاشة خطأ بالمتصفح أثناء التحميل أو المزامنة"""
        html = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>شركة NASSER - جاري تشغيل النظام</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 480px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .logo { font-size: 1.75rem; font-weight: 900; color: #38bdf8; margin-bottom: 0.5rem; }
        .sub { font-size: 0.95rem; color: #94a3b8; margin-bottom: 1.5rem; }
        .spinner { border: 3px solid rgba(56, 189, 248, 0.1); border-top: 3px solid #38bdf8; border-radius: 50%; width: 36px; height: 36px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .btn { background: #0284c7; color: white; border: none; padding: 0.6rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">شركة NASSER</div>
        <div class="sub">نظام إدارة المخازن والمبيعات - جاري تهيئة الاتصال المحلي...</div>
        <div class="spinner"></div>
        <button class="btn" onclick="location.reload()">تحديث الصفحة الآن</button>
    </div>
    <script>
        setTimeout(() => location.reload(), 2000);
    </script>
</body>
</html>"""
        try:
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except Exception:
            pass

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length)
                return json.loads(body.decode('utf-8'))
        except Exception as e:
            pass
        return {}

    def _find_product(self, cursor, p_id):
        """Universal resilient product lookup strictly isolating Primary Key ID, rowid, exact Code, and Name"""
        if not p_id:
            return None
        p_id_str = str(p_id).strip()
        if p_id_str.lower() in ('', 'none', 'null', 'undefined'):
            return None

        # 1. Exact match on primary key ID or rowid
        cursor.execute("SELECT id, code, name, stock, price, rowid FROM products WHERE id=? OR rowid=?", (p_id_str, p_id_str))
        row = cursor.fetchone()
        if row:
            return row

        # 2. Exact match on product code
        cursor.execute("SELECT id, code, name, stock, price, rowid FROM products WHERE code=?", (p_id_str,))
        row = cursor.fetchone()
        if row:
            return row

        # 3. Case-insensitive trimmed match on code
        cursor.execute("SELECT id, code, name, stock, price, rowid FROM products WHERE LOWER(TRIM(code))=LOWER(TRIM(?))", (p_id_str,))
        row = cursor.fetchone()
        if row:
            return row

        # 4. Exact trimmed match on name
        cursor.execute("SELECT id, code, name, stock, price, rowid FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM(?))", (p_id_str,))
        row = cursor.fetchone()
        if row:
            return row

        return None

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.send_header('Content-Length', '0')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
        except Exception:
            pass

    def do_GET(self):
        try:
            parsed_path = self.path.split('?')[0].split('#')[0]
            
            # 0. Health Check
            if parsed_path == '/api/health':
                return self._send_json({"status": "ok", "company": "شركة NASSER", "system": "إدارة المخازن والمبيعات", "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ')})

            # 1. API GET Products
            if parsed_path == '/api/products':
                try:
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id, code, name, category, stock, min_stock, unit, price, description, updated_at, rowid FROM products ORDER BY rowid DESC")
                            rows = cursor.fetchall()
                        finally:
                            conn.close()

                    products = []
                    for r in rows:
                        p_id_raw = r[0]
                        p_rowid = r[10]
                        final_id = str(p_id_raw) if (p_id_raw is not None and str(p_id_raw).strip() not in ('', 'None', 'none', 'null', 'undefined')) else str(p_rowid)
                        p_code = r[1] or f"NASSER-{final_id}"
                        products.append({
                            "id": final_id,
                            "code": p_code,
                            "name": r[2] or "",
                            "category": r[3] or "عام",
                            "stock": r[4] if r[4] is not None else 0,
                            "minStock": r[5] if r[5] is not None else 5,
                            "unit": r[6] or "وحدة",
                            "price": r[7] if r[7] is not None else 0.0,
                            "description": r[8] or "",
                            "updatedAt": r[9] or ""
                        })
                    return self._send_json({"success": True, "products": products})
                except Exception as e:
                    return self._send_json({"success": False, "error": str(e)}, 500)

            # 2. API GET Sales
            if parsed_path == '/api/sales':
                try:
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id, invoice_number, created_at, customer_name, customer_phone, cashier_id, cashier_name, subtotal, discount, tax, total, payment_method, items_json, notes FROM sales ORDER BY created_at DESC")
                            rows = cursor.fetchall()
                        finally:
                            conn.close()

                    sales = [{
                        "id": r[0], "invoiceNumber": r[1], "deliveryOrderRef": r[1], "createdAt": r[2],
                        "customerName": r[3] or "", "customerPhone": r[4] or "",
                        "cashierId": r[5] or "", "cashierName": r[6],
                        "subtotal": r[7], "discount": r[8], "tax": r[9], "total": r[10],
                        "paymentMethod": r[11], "items": json.loads(r[12]) if r[12] else [], "notes": r[13] or ""
                    } for r in rows]
                    return self._send_json({"success": True, "sales": sales})
                except Exception as e:
                    return self._send_json({"success": False, "error": str(e)}, 500)

            # 3. API GET Movements
            if parsed_path == '/api/movements':
                try:
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute('''
                                SELECT id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at
                                FROM movements
                                ORDER BY created_at DESC
                            ''')
                            rows = cursor.fetchall()
                        finally:
                            conn.close()

                    movements = [{
                        "id": r[0],
                        "referenceNo": r[1] or "",
                        "productId": r[2],
                        "productCode": r[3] or "",
                        "productName": r[4] or "صنف مخزني",
                        "type": r[5],
                        "quantity": r[6],
                        "previousStock": r[7] if r[7] is not None else 0,
                        "newStock": r[8] if r[8] is not None else 0,
                        "reason": r[9] or "",
                        "operatorName": r[10] or "أمين المخزن",
                        "timestamp": r[11] or ""
                    } for r in rows]
                    return self._send_json({"success": True, "movements": movements})
                except Exception as e:
                    return self._send_json({"success": False, "error": str(e)}, 500)

            # 4. API GET Users
            if parsed_path == '/api/users':
                try:
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id, username, name, role, gmail, created_at FROM users")
                            rows = cursor.fetchall()
                        finally:
                            conn.close()

                    users = [{
                        "id": r[0], "username": r[1], "name": r[2],
                        "role": r[3], "gmail": r[4], "createdAt": r[5]
                    } for r in rows]
                    return self._send_json({"success": True, "users": users})
                except Exception as e:
                    return self._send_json({"success": False, "error": str(e)}, 500)

            # 5. API GET Logs & Audit Logs
            if parsed_path in ['/api/logs', '/api/audit-logs']:
                try:
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id, timestamp, username, role, action, details, type FROM logs ORDER BY timestamp DESC LIMIT 200")
                            rows = cursor.fetchall()
                        finally:
                            conn.close()

                    logs = [{
                        "id": r[0], "timestamp": r[1], "username": r[2],
                        "role": r[3], "action": r[4], "details": r[5], "type": r[6]
                    } for r in rows]
                    return self._send_json({"success": True, "logs": logs, "auditLogs": logs})
                except Exception as e:
                    return self._send_json({"success": False, "error": str(e)}, 500)

            if parsed_path.startswith('/api/'):
                return self._send_json({"success": False, "message": "المسار غير موجود"}, 404)

            # 6. Static File Serving & Single Page App (SPA) Fallback
            dist_dir = get_dist_path()
            req_rel = parsed_path.lstrip('/')
            req_file = os.path.join(dist_dir, req_rel) if req_rel else os.path.join(dist_dir, 'index.html')

            if os.path.isfile(req_file):
                return self._serve_file(req_file)

            # SPA Routing: Send index.html for all non-file route paths
            index_path = os.path.join(dist_dir, 'index.html')
            if os.path.isfile(index_path):
                return self._serve_file(index_path)

            # In case dist is not built yet or index.html missing
            return self._serve_fallback_html()
        except Exception as e:
            try:
                self._send_json({"success": False, "error": str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        try:
            parsed_path = self.path.split('?')[0].split('#')[0]

            # 1. User Authentication (Login)
            if parsed_path == '/api/auth/login':
                try:
                    data = self._read_json_body()
                    username = data.get('username', '').strip()
                    password = data.get('password', '').strip()
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id, username, name, role, gmail, password FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(gmail)=LOWER(?) OR LOWER(name)=LOWER(?)", (username, username, username))
                            row = cursor.fetchone()
                        finally:
                            conn.close()

                    if row and verify_py_password(row[5], password):
                        user = {"id": row[0], "username": row[1], "name": row[2], "role": row[3], "gmail": row[4]}
                        add_audit_log(user['username'], user['role'], 'تسجيل دخول', f"تم تسجيل الدخول بنجاح للمستخدم {user['name']}", 'INFO')
                        return self._send_json({"success": True, "user": user, "message": "تم تسجيل الدخول بنجاح"})
                    else:
                        return self._send_json({"success": False, "message": "اسم المستخدم أو كلمة المرور غير صحيحة"}, 401)
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            # 2. Forgot Password OTP
            if parsed_path == '/api/auth/forgot-password':
                data = self._read_json_body()
                username = data.get('username', '').strip()
                with DB_LOCK:
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT username, gmail, role FROM users WHERE LOWER(username)=LOWER(?)", (username,))
                        row = cursor.fetchone()
                    finally:
                        conn.close()

                if not row:
                    return self._send_json({"success": False, "message": "اسم المستخدم غير موجود بالنظام"}, 404)
                
                otp_code = str(int(100000 + time.time() % 900000))
                ACTIVE_OTPS[username.lower()] = {
                    "code": otp_code,
                    "expires_at": time.time() + 600,
                    "gmail": row[1]
                }
                add_audit_log(row[0], row[2], 'طلب إرسال OTP', f"تم إنشاء رمز استعادة كلمة السر لـ {row[1]}", 'SECURITY')
                return self._send_json({
                    "success": True,
                    "message": f"تم إرسال رمز OTP المكون من 6 أرقام إلى بريدك ({row[1]})",
                    "gmail": row[1],
                    "demoOtpCode": otp_code
                })

            # 3. Verify OTP
            if parsed_path == '/api/auth/verify-otp':
                data = self._read_json_body()
                username = data.get('username', '').strip().lower()
                otp_code = data.get('otpCode', '').strip()
                rec = ACTIVE_OTPS.get(username)
                if not rec or time.time() > rec['expires_at']:
                    return self._send_json({"success": False, "message": "رمز OTP منتهي الصلاحية أو غير موجود"}, 400)
                if rec['code'] != otp_code:
                    return self._send_json({"success": False, "message": "رمز OTP غير صحيح"}, 400)
                return self._send_json({"success": True, "message": "تم التحقق من الرمز بنجاح"})

            # 4. Reset Password with OTP
            if parsed_path == '/api/auth/reset-password':
                data = self._read_json_body()
                username = data.get('username', '').strip().lower()
                otp_code = data.get('otpCode', '').strip()
                new_password = data.get('newPassword', '').strip()
                rec = ACTIVE_OTPS.get(username)
                if not rec or rec['code'] != otp_code:
                    return self._send_json({"success": False, "message": "رمز التحقق غير صالح"}, 400)
                
                with DB_LOCK:
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("UPDATE users SET password=? WHERE LOWER(username)=LOWER(?)", (new_password, username))
                        commit_and_sync(conn)
                    finally:
                        conn.close()

                ACTIVE_OTPS.pop(username, None)
                add_audit_log(username, 'GENERAL_MANAGER', 'تغيير كلمة السر', 'تم تغيير كلمة السر بنجاح عبر رمز OTP', 'SECURITY')
                return self._send_json({"success": True, "message": "تم تحديث كلمة السر بنجاح"})

            # 5. Reset Password Offline with Old Password
            if parsed_path == '/api/auth/reset-password-offline':
                data = self._read_json_body()
                username = data.get('username', '').strip()
                old_pass = data.get('oldPassword', '').strip()
                new_pass = data.get('newPassword', '').strip()
                if not username or not old_pass or not new_pass or len(new_pass) < 4:
                    return self._send_json({"success": False, "message": "يرجى تقديم اسم المستخدم، كلمة السر الحالية، والجديدة (4 أحرف على الأقل)"}, 400)
                with DB_LOCK:
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT id, username, password FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(gmail)=LOWER(?) OR LOWER(name)=LOWER(?)", (username, username, username))
                        row = cursor.fetchone()
                        if not row:
                            return self._send_json({"success": False, "message": "اسم المستخدم غير موجود بالنظام"}, 404)
                        if not verify_py_password(row[2], old_pass):
                            return self._send_json({"success": False, "message": "كلمة المرور الحالية غير صحيحة"}, 400)
                        cursor.execute("UPDATE users SET password=? WHERE id=?", (new_pass, row[0]))
                        commit_and_sync(conn)
                        user_uname = row[1]
                    finally:
                        conn.close()

                add_audit_log(user_uname, 'USER', 'تغيير كلمة السر', 'تم التحقق من كلمة السر القديمة وتحديث كلمة السر بنجاح', 'SECURITY')
                return self._send_json({"success": True, "message": "تم التحقق من كلمة المرور القديمة وتحديث كلمة السر بنجاح"})

            # 6. Add Single Product
            if parsed_path == '/api/products':
                try:
                    data = self._read_json_body()
                    name = (data.get('name') or 'صنف جديد').strip()
                    category = data.get('category') or 'عام'
                    unit = data.get('unit') or 'وحدة'
                    desc = data.get('description') or ''
                    stock_val = max(0, int(data.get('stock') or 0))
                    price_val = max(0.0, float(data.get('price') or 0.0))
                    min_stock = max(1, int(data.get('minStock') or 5))
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            
                            # Auto code generation with strict NASSER- formatting
                            code = (data.get('code') or '').strip()
                            cursor.execute("SELECT id, code FROM products")
                            all_prods = cursor.fetchall()
                            max_num = 100
                            for c in all_prods:
                                m = re.findall(r'[0-9]+', str(c[1]))
                                if m:
                                    max_num = max(max_num, int(m[-1]))
                                try:
                                    max_num = max(max_num, int(c[0]))
                                except Exception:
                                    pass

                            if not code:
                                code = f"NASSER-{max_num + 1}"
                            elif not code.upper().startswith('NASSER-'):
                                code = f"NASSER-{code}"
                            
                            # Handle unique constraint collision
                            cursor.execute("SELECT COUNT(*) FROM products WHERE code=?", (code,))
                            if cursor.fetchone()[0] > 0:
                                code = f"NASSER-{max_num + 1}_{int(time.time()) % 100}"

                            # Explicitly calculate and insert ID to ensure compatibility even if table was created without AUTOINCREMENT
                            cursor.execute("SELECT MAX(CAST(id AS INTEGER)), MAX(rowid) FROM products")
                            m_row = cursor.fetchone()
                            m_val = max(int(m_row[0] or 0), int(m_row[1] or 0)) if m_row else 0
                            explicit_id = str(m_val + 1)

                            cursor.execute('''
                                INSERT INTO products (id, code, name, category, stock, min_stock, unit, price, unit_price, description, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (explicit_id, code, name, category, stock_val, min_stock, unit, price_val, price_val, desc, now_iso))
                            
                            new_id = explicit_id

                            # Opening stock movement if stock > 0
                            if stock_val > 0:
                                mov_id = f"mvt_{int(time.time()*1000)}_{new_id}"
                                cursor.execute('''
                                    INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (mov_id, 'OPENING-BAL', new_id, code, name, 'IN', stock_val, 0, stock_val, 'رصيد افتتاحي عند إنشاء الصنف', data.get('username') or 'المدير العام', now_iso))

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    new_product = {
                        "id": new_id, "code": code, "name": name, "category": category,
                        "stock": stock_val, "minStock": min_stock, "unit": unit, "price": price_val,
                        "description": desc, "updatedAt": now_iso
                    }
                    add_audit_log(data.get('username') or 'المدير العام', data.get('role') or 'GENERAL_MANAGER', 'إضافة صنف جديد', f"تم تسجيل الصنف ({name}) بكود [{code}] ورصيد {stock_val} بسعر {price_val}", 'MOVEMENT')
                    return self._send_json({"success": True, "product": new_product, "message": "تم إضافة الصنف بنجاح وحفظه فوراً في قاعدة البيانات"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            # 7. Batch Add Products (Excel Multi-paste & Bulk insert)
            if parsed_path == '/api/products/batch':
                try:
                    data = self._read_json_body()
                    items = data.get('items', [])
                    if not items:
                        return self._send_json({"success": False, "message": "لا توجد أصناف للإضافة"}, 400)

                    created_products = []
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')

                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            
                            # Baseline numeric code
                            cursor.execute("SELECT code FROM products")
                            all_codes = cursor.fetchall()
                            max_num = 100
                            for c in all_codes:
                                m = re.findall(r'[0-9]+', str(c[0]))
                                if m:
                                    max_num = max(max_num, int(m[-1]))

                            for idx, itm in enumerate(items):
                                p_name = (itm.get('name') or '').strip()
                                if not p_name:
                                    continue
                                max_num += 1
                                raw_code = (itm.get('code') or '').strip()
                                if not raw_code:
                                    p_code = f"NASSER-{max_num}"
                                elif not raw_code.upper().startswith('NASSER-'):
                                    p_code = f"NASSER-{raw_code}"
                                else:
                                    p_code = raw_code
                                
                                # Ensure code uniqueness
                                cursor.execute("SELECT COUNT(*) FROM products WHERE code=?", (p_code,))
                                if cursor.fetchone()[0] > 0:
                                    p_code = f"{p_code}_{int(time.time()) % 1000}_{idx}"

                                p_cat = itm.get('category') or 'عام'
                                p_unit = itm.get('unit') or 'وحدة'
                                p_desc = itm.get('description') or ''
                                p_stock = max(0, int(itm.get('stock') or 0))
                                p_price = max(0.0, float(itm.get('price') or 0.0))
                                p_min = max(1, int(itm.get('minStock') or 5))

                                cursor.execute("SELECT MAX(CAST(id AS INTEGER)), MAX(rowid) FROM products")
                                b_m_row = cursor.fetchone()
                                b_m_val = max(int(b_m_row[0] or 0), int(b_m_row[1] or 0)) if b_m_row else 0
                                p_id = str(b_m_val + 1)

                                cursor.execute('''
                                    INSERT INTO products (id, code, name, category, stock, min_stock, unit, price, unit_price, description, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (p_id, p_code, p_name, p_cat, p_stock, p_min, p_unit, p_price, p_price, p_desc, now_iso))

                                if p_stock > 0:
                                    mov_id = f"mvt_{int(time.time()*1000)}_{p_id}"
                                    cursor.execute('''
                                        INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ''', (mov_id, 'BATCH-OPENING', p_id, p_code, p_name, 'IN', p_stock, 0, p_stock, 'رصيد إدخال افتتاحي دفعة واحدة', data.get('username') or 'المدير العام', now_iso))

                                created_products.append({
                                    "id": p_id, "code": p_code, "name": p_name, "category": p_cat,
                                    "stock": p_stock, "minStock": p_min, "unit": p_unit, "price": p_price,
                                    "description": p_desc, "updatedAt": now_iso
                                })

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    add_audit_log(data.get('username') or 'المدير العام', data.get('role') or 'GENERAL_MANAGER', 'إضافة أصناف دفعة واحدة', f"تم إضافة {len(created_products)} صنف بنجاح وحفظها نهائياً", 'MOVEMENT')
                    return self._send_json({"success": True, "count": len(created_products), "products": created_products, "message": f"تم إضافة {len(created_products)} صنف بنجاح"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            # 8. Single Movement Endpoint (Stock In / Out / Adjustment)
            if parsed_path == '/api/movements':
                try:
                    data = self._read_json_body()
                    p_id_raw = str(data.get('productId') or data.get('productCode') or data.get('code') or data.get('productName') or data.get('name') or '').strip()
                    m_type = data.get('type', 'OUT')
                    ref_no = data.get('referenceNo', '')
                    reason_str = data.get('reason', '')
                    op_name = data.get('operatorName') or 'أمين المخزن'
                    try:
                        qty = int(data.get('quantity', 1))
                    except Exception:
                        qty = 1
                    
                    mov_id = f"mov_{int(time.time()*1000)}"
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')

                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()

                            p_row = self._find_product(cursor, p_id_raw)
                            if not p_row and data.get('productCode'):
                                p_row = self._find_product(cursor, data.get('productCode'))
                            if not p_row and data.get('productName'):
                                p_row = self._find_product(cursor, data.get('productName'))
                            
                            actual_id = p_id_raw
                            p_code = data.get('productCode') or ""
                            p_name = data.get('productName') or "صنف مخزني"
                            previous_stock = 0
                            new_stock = 0

                            if p_row:
                                actual_id = str(p_row[0]) if (p_row[0] is not None and str(p_row[0]).strip() not in ('', 'None', 'null')) else str(p_row[5])
                                actual_rowid = p_row[5]
                                p_code = p_row[1]
                                p_name = p_row[2]
                                previous_stock = int(p_row[3] if p_row[3] is not None else 0)
                                
                                if m_type == 'IN':
                                    new_stock = previous_stock + qty
                                elif m_type == 'OUT':
                                    new_stock = max(0, previous_stock - qty)
                                elif m_type == 'ADJUSTMENT':
                                    new_stock = max(0, qty)
                                else:
                                    new_stock = previous_stock
                                
                                cursor.execute("UPDATE products SET stock=?, updated_at=? WHERE id=? OR rowid=? OR code=?", (new_stock, now_iso, actual_id, actual_rowid, p_code))
                            else:
                                new_stock = max(0, qty)

                            cursor.execute('''
                                INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (mov_id, ref_no, actual_id, p_code, p_name, m_type, qty, previous_stock, new_stock, reason_str, op_name, now_iso))

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    movement_obj = {
                        "id": mov_id,
                        "productId": actual_id,
                        "productCode": p_code,
                        "productName": p_name,
                        "type": m_type,
                        "quantity": qty,
                        "previousStock": previous_stock,
                        "newStock": new_stock,
                        "reason": reason_str,
                        "referenceNo": ref_no,
                        "operatorName": op_name,
                        "timestamp": now_iso
                    }
                    add_audit_log(op_name, data.get('role') or 'WAREHOUSE_MANAGER', 'حركة مخزنية', f"{m_type} - {p_name} ({qty}) - الرصيد الجديد: {new_stock}", 'MOVEMENT')
                    return self._send_json({"success": True, "movement": movement_obj, "message": "تم حفظ تحديث الكمية في قاعدة البيانات بنجاح"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            # 9. BATCH MOVEMENTS ENDPOINT (Atomic Invoice Processing - Solves Database Lock)
            if parsed_path == '/api/movements/batch':
                try:
                    data = self._read_json_body()
                    items = data.get('items', [])
                    ref_no = data.get('referenceNo', '1')
                    reason_str = data.get('reason', 'أمر تسليم مخزن')
                    op_name = data.get('operatorName') or 'أمين المخزن'
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')

                    if not items:
                        return self._send_json({"success": False, "message": "لا توجد أصناف في أمر التسليم"}, 400)

                    created_movements = []
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()

                            # مرحلة التحقق أولاً: التأكد من توفر الرصيد لجميع الأصناف
                            for idx, itm in enumerate(items):
                                p_id_key = str(itm.get('productId') or '').strip()
                                p_code_key = str(itm.get('productCode') or itm.get('code') or '').strip()
                                p_name_key = str(itm.get('productName') or itm.get('name') or '').strip()
                                try:
                                    qty = max(1, int(itm.get('quantity', 1)))
                                except Exception:
                                    qty = 1
                                
                                p_row = None
                                if p_id_key:
                                    p_row = self._find_product(cursor, p_id_key)
                                if not p_row and p_code_key:
                                    p_row = self._find_product(cursor, p_code_key)
                                if not p_row and p_name_key:
                                    p_row = self._find_product(cursor, p_name_key)

                                if not p_row:
                                    label = p_name_key or p_code_key or p_id_key or f"بند {idx+1}"
                                    return self._send_json({"success": False, "message": f"الصنف ({label}) غير موجود بالمخزن"}, 404)
                                
                                available_stock = int(p_row[3]) if p_row[3] is not None else 0
                                if available_stock < qty:
                                    return self._send_json({"success": False, "message": f"الرصيد المتاح من ({p_row[2]}) هو {available_stock} فقط، ولا يكفي لصرف كمية {qty}"}, 400)

                            # مرحلة التنفيذ الذري: خصم الكميات وتسجيل الحركات دفعة واحدة
                            for idx, itm in enumerate(items):
                                p_id_key = str(itm.get('productId') or '').strip()
                                p_code_key = str(itm.get('productCode') or itm.get('code') or '').strip()
                                p_name_key = str(itm.get('productName') or itm.get('name') or '').strip()
                                try:
                                    qty = max(1, int(itm.get('quantity', 1)))
                                except Exception:
                                    qty = 1

                                p_row = None
                                if p_id_key:
                                    p_row = self._find_product(cursor, p_id_key)
                                if not p_row and p_code_key:
                                    p_row = self._find_product(cursor, p_code_key)
                                if not p_row and p_name_key:
                                    p_row = self._find_product(cursor, p_name_key)

                                actual_id = str(p_row[0]) if (p_row[0] is not None and str(p_row[0]).strip() not in ('', 'None', 'null')) else str(p_row[5])
                                actual_rowid = p_row[5]
                                p_code = p_row[1]
                                p_name = p_row[2]
                                prev_stock = int(p_row[3] if p_row[3] is not None else 0)
                                new_stock = max(0, prev_stock - qty)

                                cursor.execute("UPDATE products SET stock=?, updated_at=? WHERE id=? OR rowid=? OR code=?", (new_stock, now_iso, actual_id, actual_rowid, p_code))

                                mov_id = f"mov_{int(time.time()*1000)}_{idx}"
                                cursor.execute('''
                                    INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (mov_id, ref_no, actual_id, p_code, p_name, 'OUT', qty, prev_stock, new_stock, reason_str, op_name, now_iso))

                                created_movements.append({
                                    "id": mov_id,
                                    "productId": actual_id,
                                    "productCode": p_code,
                                    "productName": p_name,
                                    "type": "OUT",
                                    "quantity": qty,
                                    "previousStock": prev_stock,
                                    "newStock": new_stock,
                                    "reason": reason_str,
                                    "referenceNo": ref_no,
                                    "operatorName": op_name,
                                    "timestamp": now_iso
                                })

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    add_audit_log(op_name, data.get('role') or 'WAREHOUSE_MANAGER', 'صرف أمر تسليم مخزن (دفعة واحدة)', f"تم صرف وتوثيق عدد ({len(created_movements)}) أصناف بموجب أمر تسليم رقم [{ref_no}] بنجاح", 'MOVEMENT')
                    return self._send_json({"success": True, "movements": created_movements, "message": f"تم صرف وتوثيق أمر التسليم رقم [{ref_no}] بنجاح"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            # 10. Add Sale Invoice Record
            if parsed_path == '/api/sales':
                try:
                    data = self._read_json_body()
                    items = data.get('items', [])
                    customer_name = data.get('customerName', '').strip()
                    customer_phone = data.get('customerPhone', '').strip()
                    cashier_name = data.get('cashierName', 'مسؤول المبيعات').strip()
                    cashier_id = data.get('cashierId', 'usr_1')
                    subtotal = float(data.get('subtotal', 0.0))
                    discount = float(data.get('discount', 0.0))
                    tax = float(data.get('tax', 0.0))
                    total = float(data.get('total', subtotal - discount + tax))
                    payment_method = data.get('paymentMethod', 'CASH')
                    notes = data.get('notes', '')
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT COUNT(*) FROM sales")
                            count = cursor.fetchone()[0] + 1
                            invoice_num = data.get('invoiceNumber') or f"INV-{time.strftime('%Y%m')}-{count:04d}"
                            sale_id = f"sale_{int(time.time()*1000)}"

                            cursor.execute('''
                                INSERT INTO sales (id, invoice_number, created_at, customer_name, customer_phone, cashier_id, cashier_name, subtotal, discount, tax, total, payment_method, items_json, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (sale_id, invoice_num, now_iso, customer_name, customer_phone, cashier_id, cashier_name, subtotal, discount, tax, total, payment_method, json.dumps(items, ensure_ascii=False), notes))

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    add_audit_log(cashier_name, 'WAREHOUSE_MANAGER', 'تسجيل فاتورة', f"تم تسجيل فاتورة مبيعات رقم [{invoice_num}] بقيمة {total}", 'MOVEMENT')
                    return self._send_json({"success": True, "invoiceNumber": invoice_num, "message": "تم حفظ الفاتورة بنجاح"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            return self._send_json({"success": False, "message": "المسار غير موجود"}, 404)
        except Exception as top_err:
            try:
                self._send_json({"success": False, "error": str(top_err)}, 500)
            except Exception:
                pass

    def do_PUT(self):
        try:
            parsed_path = self.path.split('?')[0].split('#')[0]
            if parsed_path.startswith('/api/products/'):
                try:
                    p_id = parsed_path.replace('/api/products/', '')
                    data = self._read_json_body()
                    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ')
                    
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            row = self._find_product(cursor, p_id)
                            if not row and data.get('code'):
                                row = self._find_product(cursor, data.get('code'))
                            if not row and data.get('name'):
                                row = self._find_product(cursor, data.get('name'))

                            actual_id = str(row[0]) if row else str(p_id)
                            old_code = row[1] if row else (data.get('code') or '')
                            old_name = row[2] if row else (data.get('name') or '')
                            
                            if row:
                                old_stock = int(row[3])
                                old_price = float(row[4]) if len(row) > 4 else 0.0
                                new_stock = int(data.get('stock', old_stock))
                                new_price = float(data.get('price', old_price))
                                if new_stock != old_stock:
                                    diff = new_stock - old_stock
                                    mov_id = f"mvt_{int(time.time()*1000)}"
                                    cursor.execute('''
                                        INSERT INTO movements (id, reference_no, product_id, product_code, product_name, type, quantity, previous_stock, new_stock, reason, operator_name, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ''', (mov_id, 'MANUAL-ADJUST', actual_id, data.get('code', old_code), data.get('name', old_name), 'ADJUSTMENT', abs(diff), old_stock, new_stock, f"تعديل يدوي للرصيد ({'+' if diff > 0 else ''}{diff})", data.get('username') or 'المدير العام', now_iso))

                            raw_code = (data.get('code') or old_code).strip()
                            if not raw_code:
                                p_code = f"NASSER-{actual_id}"
                            elif not raw_code.upper().startswith('NASSER-'):
                                p_code = f"NASSER-{raw_code}"
                            else:
                                p_code = raw_code

                            p_name = (data.get('name') or old_name).strip()
                            p_cat = data.get('category') or 'عام'
                            p_stock = max(0, int(data.get('stock', 0)))
                            p_min = max(1, int(data.get('minStock', 5)))
                            p_unit = data.get('unit') or 'وحدة'
                            p_price = max(0.0, float(data.get('price', 0.0)))
                            p_desc = data.get('description') or ''

                            cursor.execute('''
                                UPDATE products SET code=?, name=?, category=?, stock=?, min_stock=?, unit=?, price=?, unit_price=?, description=?, updated_at=?
                                WHERE id=?
                            ''', (p_code, p_name, p_cat, p_stock, p_min, p_unit, p_price, p_price, p_desc, now_iso, actual_id))
                            
                            if cursor.rowcount == 0:
                                cursor.execute('''
                                    UPDATE products SET code=?, name=?, category=?, stock=?, min_stock=?, unit=?, price=?, unit_price=?, description=?, updated_at=?
                                    WHERE code=?
                                ''', (p_code, p_name, p_cat, p_stock, p_min, p_unit, p_price, p_price, p_desc, now_iso, p_code))

                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    add_audit_log(data.get('username') or 'المدير العام', data.get('role') or 'GENERAL_MANAGER', 'تعديل صنف', f"تم تحديث بيانات الصنف [{p_code}] {p_name}", 'INFO')
                    return self._send_json({"success": True, "message": "تم تحديث الصنف وحفظ التعديلات نهائياً", "product": {
                        "id": actual_id, "code": p_code, "name": p_name, "category": p_cat,
                        "stock": p_stock, "minStock": p_min, "unit": p_unit, "price": p_price,
                        "description": p_desc, "updatedAt": now_iso
                    }})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            return self._send_json({"success": False, "message": "المسار غير موجود"}, 404)
        except Exception as top_err:
            try:
                self._send_json({"success": False, "error": str(top_err)}, 500)
            except Exception:
                pass

    def do_DELETE(self):
        try:
            parsed_path = self.path.split('?')[0].split('#')[0]
            if parsed_path.startswith('/api/products/'):
                try:
                    p_id = parsed_path.replace('/api/products/', '')
                    with DB_LOCK:
                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            row = self._find_product(cursor, p_id)
                            if not row:
                                return self._send_json({"success": False, "message": "الصنف المطلوب حذفه غير موجود بالمخزن"}, 404)
                            
                            actual_id = str(row[0])
                            p_code = str(row[1])
                            p_name = str(row[2])
                            
                            # حذف محدد ودقيق بنسبة 100% باستخدام المعرف الفعلي (Primary Key ID) فقط لمنع أي مسح جماعي
                            cursor.execute("DELETE FROM products WHERE id=?", (actual_id,))
                            cursor.execute("DELETE FROM movements WHERE product_id=? OR product_code=?", (actual_id, p_code))
                            commit_and_sync(conn)
                        finally:
                            conn.close()

                    add_audit_log('المدير العام', 'GENERAL_MANAGER', 'حذف صنف', f"تم حذف الصنف [{p_code}] {p_name} نهائياً", 'WARNING')
                    return self._send_json({"success": True, "message": "تم حذف الصنف من المخزن نهائياً"})
                except Exception as e:
                    return self._send_json({"success": False, "message": str(e)}, 500)

            return self._send_json({"success": False, "message": "المسار غير موجود"}, 404)
        except Exception as top_err:
            try:
                self._send_json({"success": False, "error": str(top_err)}, 500)
            except Exception:
                pass

# -------------------------------------------------------------
# 4. HTTP Server Runner on Thread with Strict Event Sync
# -------------------------------------------------------------
SERVER_READY = threading.Event()
SERVER_PORT = [0]
SERVER_ERROR = [None]

def start_local_server():
    """تشغيل خادم الويب المحلي الصامت لنقل الواجهة والـ API بربط فوري آمن ومنع تضارب المنافذ"""
    global SERVER_PORT, SERVER_ERROR
    try:
        class ThreadedTCPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True
            allow_reuse_address = True
            
            def handle_error(self, request, client_address):
                # كتم وتجاهل انقطاع اتصال المتصفح العادي بدون انهيار الخادم
                pass

        # ربط الخادم مباشرة على منفذ حر موثوق ديناميكياً لتجنب التعارض
        httpd = ThreadedTCPServer(('127.0.0.1', 0), SPAHTTPRequestHandler)
        actual_port = httpd.server_address[1]
        SERVER_PORT[0] = actual_port
        SERVER_READY.set()
        print(f"Local Server running on http://127.0.0.1:{actual_port}")
        httpd.serve_forever()
    except Exception as e:
        SERVER_ERROR[0] = str(e)
        SERVER_READY.set()
        print(f"Error starting local server: {e}")

# -------------------------------------------------------------
# 5. Native Qt GUI Window (QWebEngineView + Native Direct Printing)
# -------------------------------------------------------------
try:
    from PySide6.QtCore import Qt, QUrl, QTimer
    from PySide6.QtGui import QKeySequence, QShortcut
    from PySide6.QtWidgets import QMainWindow, QMessageBox, QFileDialog, QDialog
    from PySide6.QtPrintSupport import QPrinter, QPrintDialog
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile

    class NasserMainWindow(QMainWindow):
        def __init__(self, app_url):
            super().__init__()
            self.app_url = app_url
            self.retry_count = 0
            self.setWindowTitle("شركة NASSER - نظام إدارة المخازن والمبيعات وإصدار الفواتير")
            self.resize(1366, 850)
            
            # ضبط خصائص ثبات النافذة
            self.setAttribute(Qt.WA_NativeWindow, True)
            
            # تهيئة ملف تعريف التخزين الدائم لـ WebEngine لحفظ LocalStorage و IndexedDB في AppData مدى الحياة
            storage_dir = os.path.join(get_app_dir(), "web_profile")
            os.makedirs(storage_dir, exist_ok=True)
            profile = QWebEngineProfile.defaultProfile()
            profile.setPersistentStoragePath(storage_dir)
            profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)

            # تهيئة محرك عرض الويب الداخلي
            self.web_view = QWebEngineView(self)
            self.web_view.setAttribute(Qt.WA_NativeWindow, True)
            
            # تفعيل إعدادات الطباعة الأصلية وخلفيات الألوان بدقة
            settings = self.web_view.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.PrintElementBackgrounds, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.ShowScrollBars, True)
            
            # معالجة إعادة المحاولة التلقائية في حال استغراق المحرك وقتاً لبدء الخادم
            self.web_view.loadFinished.connect(self.on_load_finished)

            # ربط اختصارات التحديث السريع F5 و Ctrl+R
            self.shortcut_f5 = QShortcut(QKeySequence("F5"), self)
            self.shortcut_f5.activated.connect(lambda: self.web_view.reload())
            self.shortcut_ctrl_r = QShortcut(QKeySequence("Ctrl+R"), self)
            self.shortcut_ctrl_r.activated.connect(lambda: self.web_view.reload())

            # ربط إشارة الطباعة الداخلية الخاصة بـ QWebEnginePage (window.print())
            self.web_view.page().printRequested.connect(self.print_function)
            
            # ربط اختصار لوحة المفاتيح الصريح Ctrl + P بنطاق ApplicationShortcut لضمان عمله في كل الحالات
            self.shortcut_print = QShortcut(QKeySequence("Ctrl+P"), self)
            try:
                self.shortcut_print.setContext(Qt.ShortcutContext.ApplicationShortcut)
            except Exception:
                try:
                    self.shortcut_print.setContext(Qt.ApplicationShortcut)
                except Exception:
                    pass
            self.shortcut_print.activated.connect(self.print_function)
            
            # تحميل الواجهة عبر الرابط المحلي للخادم الداخلي
            self.web_view.setUrl(QUrl(self.app_url))
            self.setCentralWidget(self.web_view)

        def on_load_finished(self, ok):
            """إعادة محاولة الاتصال التلقائي الصامت في حال تأخر جاهزية الخادم"""
            if not ok and self.retry_count < 8:
                self.retry_count += 1
                QTimer.singleShot(1000, lambda: self.web_view.setUrl(QUrl(self.app_url)))

        def print_function(self):
            """
            دالة الطباعة الأصلية الداخلية 100% (Native Internal Qt Printing)
            تعتمد كلياً وحصرياً على محرك الطباعة الداخلي للنظام وإظهار حوار خيارات الطباعة الأصلي،
            ولا تفتح أو تعتمد على أي برامج خارجية كـ Word أو قارئات PDF خارجية إطلاقاً.
            """
            try:
                printer = QPrinter(QPrinter.PrinterMode.HighResolution)
                printer.setFullPage(True)
                
                # فتح حوار خيارات الطباعة الأصلي الداخلي (Native Print Dialog)
                print_dialog = QPrintDialog(printer, self)
                print_dialog.setWindowTitle("خيارات الطباعة الداخلية - شركة ناصر")
                print_dialog.setAttribute(Qt.WA_NativeWindow, True)
                print_dialog.setWindowModality(Qt.ApplicationModal)
                
                if print_dialog.exec() == QPrintDialog.DialogCode.Accepted:
                    self.web_view.page().print(printer, lambda success: None)
            except Exception as pe:
                print("Native Print Error:", pe)
                # في حال عدم وجود طابعة فيزيائية معرفة، حفظ المستند داخلياً كملف PDF
                try:
                    save_dialog = QFileDialog(self, "حفظ المستند كملف PDF داخلي", os.path.expanduser("~/Desktop/Invoice.pdf"), "PDF Files (*.pdf)")
                    save_dialog.setAttribute(Qt.WA_NativeWindow, True)
                    save_dialog.setWindowModality(Qt.ApplicationModal)
                    save_dialog.setAcceptMode(QFileDialog.AcceptSave)
                    
                    if save_dialog.exec() == QDialog.Accepted:
                        selected_files = save_dialog.selectedFiles()
                        if selected_files:
                            pdf_path = selected_files[0]
                            self.web_view.page().printToPdf(pdf_path)
                            msg = QMessageBox(self)
                            msg.setAttribute(Qt.WA_NativeWindow, True)
                            msg.setWindowModality(Qt.ApplicationModal)
                            msg.setWindowTitle("تم الحفظ بنجاح")
                            msg.setText(f"تم حفظ الفاتورة كملف PDF في المسار:\\n{pdf_path}")
                            msg.setIcon(QMessageBox.Information)
                            msg.exec()
                except Exception as save_err:
                    err_msg = QMessageBox(self)
                    err_msg.setAttribute(Qt.WA_NativeWindow, True)
                    err_msg.setWindowModality(Qt.ApplicationModal)
                    err_msg.setWindowTitle("تنبيه الطباعة")
                    err_msg.setText(f"تعذر إتمام عملية الطباعة الداخلية:\\n{pe}")
                    err_msg.setIcon(QMessageBox.Warning)
                    err_msg.exec()

        def closeEvent(self, event):
            """إجراء تفريغ نهائي لقاعدة البيانات وحفظ كافة التغييرات بأمان عند إغلاق النافذة"""
            try:
                flush_db_on_exit()
            except Exception:
                pass
            event.accept()

except ImportError:
    pass

def main():
    # 1. تهيئة قاعدة بيانات SQLite الدائمة في AppData عند التشغيل
    init_sqlite_db()

    # 2. تشغيل خادم التطبيق المحلي في خيط منفصل (Background Thread) والانتظار حتى يصبح جاهزاً تماماً
    server_thread = threading.Thread(target=start_local_server, daemon=True)
    server_thread.start()
    
    # انتظار مزامنة بدء الخادم لضمان عدم ظهور ERR_EMPTY_RESPONSE
    SERVER_READY.wait(timeout=10)
    actual_port = SERVER_PORT[0]
    
    if actual_port == 0:
        print("CRITICAL: Failed to bind local server")
        sys.exit(1)

    app_url = f"http://127.0.0.1:{actual_port}"

    # 3. تشغيل نافذة تطبيق PySide6 الأصلية مع ضبط إعدادات التوافق وإلغاء التسريع البرمجي للـ GPU
    try:
        from PySide6.QtCore import Qt
        from PySide6.QtWidgets import QApplication

        # إيقاف التداخل البرمجي لبطاقة الشاشة للنوافذ الفرعية ومنع الارتجاف
        QApplication.setAttribute(Qt.AA_UseSoftwareOpenGL, True)
        
        # تمرير معاملات إلغاء تسريع GPU لمحرك Chromium / WebEngine
        sys.argv.extend([
            "--disable-gpu",
            "--disable-gpu-compositing",
            "--in-process-gpu"
        ])
        
        app = QApplication(sys.argv)
        app.setApplicationName("شركة NASSER - إدارة المخازن والمبيعات")
        
        main_win = NasserMainWindow(app_url)
        main_win.showMaximized()
        sys.exit(app.exec())
        
    except ImportError as ie:
        print(f"CRITICAL: PySide6 is required. Please install it using: pip install PySide6 ({ie})")
        sys.exit(1)
    except Exception as e:
        print(f"CRITICAL Error launching PySide6 Native GUI: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
}
