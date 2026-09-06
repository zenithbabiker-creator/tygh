export type UserRole = 'GENERAL_MANAGER' | 'WAREHOUSE_MANAGER';

export type WarehouseId = 'EASTERN' | 'WESTERN' | 'AUXILIARY';

export interface WarehouseConfig {
  id: WarehouseId;
  name: string;
  shortCode: string;
  tagline: string;
  description: string;
  themeColor: 'blue' | 'emerald' | 'amber';
  gradient: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  ringColor: string;
  headerBg: string;
  accentBg: string;
  accentText: string;
}

export const WAREHOUSES: Record<WarehouseId, WarehouseConfig> = {
  EASTERN: {
    id: 'EASTERN',
    name: 'المخزن الشرقي',
    shortCode: 'شرقي',
    tagline: 'المستودع الرئيسي - القطاع الشرقي',
    description: 'إدارة مخزون القطاع الشرقي وتجهيزات المعدات المركزية وحركة السحب والتسليم',
    themeColor: 'blue',
    gradient: 'from-blue-700 via-indigo-800 to-slate-900',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    borderColor: 'border-blue-600',
    ringColor: 'ring-blue-500',
    headerBg: 'bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900',
    accentBg: 'bg-blue-50 text-blue-800 border-blue-200',
    accentText: 'text-blue-600',
  },
  WESTERN: {
    id: 'WESTERN',
    name: 'المخزن الغربي',
    shortCode: 'غربي',
    tagline: 'المستودع الإقليمي - القطاع الغربي (أمدرمان)',
    description: 'إدارة مخزون القطاع الغربي ومعدات التوزيع والتشغيل الميداني وحركة السحب',
    themeColor: 'emerald',
    gradient: 'from-emerald-700 via-teal-800 to-slate-900',
    badgeBg: 'bg-emerald-600',
    badgeText: 'text-white',
    borderColor: 'border-emerald-600',
    ringColor: 'ring-emerald-500',
    headerBg: 'bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900',
    accentBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    accentText: 'text-emerald-600',
  },
  AUXILIARY: {
    id: 'AUXILIARY',
    name: 'المخزن الإضافي',
    shortCode: 'إضافي',
    tagline: 'المستودع الاحتياطي - مخزن الطوارئ والفائض',
    description: 'حفظ المواد الاحتياطية وقطع الغيار والتجهيزات الإضافية ومتابعة الصرف',
    themeColor: 'amber',
    gradient: 'from-amber-700 via-orange-800 to-slate-900',
    badgeBg: 'bg-amber-600',
    badgeText: 'text-white',
    borderColor: 'border-amber-600',
    ringColor: 'ring-amber-500',
    headerBg: 'bg-gradient-to-r from-amber-900 via-orange-900 to-slate-900',
    accentBg: 'bg-amber-50 text-amber-800 border-amber-200',
    accentText: 'text-amber-600',
  },
};

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  gmail: string;
  createdAt: string;
  avatar?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  warehouseId?: WarehouseId;
  warehouseName?: string;
  price?: number; // للتوافق العكسي فقط - تم إلغاء القيود السعرية والمالية
  description?: string;
  imageUrl?: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId?: WarehouseId;
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

export interface AuditLog {
  id: string;
  timestamp: string;
  username: string;
  role: UserRole | string;
  action: string;
  details: string;
  type: 'INFO' | 'WARNING' | 'SECURITY' | 'MOVEMENT';
}

export interface RateLimiterState {
  currentMinuteTimestamp: number;
  requestsInCurrentMinute: number;
  secondsRemaining: number;
  currentModel: string;
}

export interface SystemSettings {
  googleSheetUrl: string;
  rateLimitThreshold: number;
  appName: string;
  companyAddress: string;
  companyPhone: string;
}
