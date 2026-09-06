import React from 'react';
import { WarehouseId, WAREHOUSES, WarehouseConfig, Product, User } from '../types';
import { Building2, Compass, ArrowLeft, PackageCheck, AlertTriangle, ShieldCheck, Warehouse } from 'lucide-react';

interface WarehouseSelectorScreenProps {
  currentUser: User;
  products: Product[];
  selectedWarehouse: WarehouseId | null;
  onSelectWarehouse: (id: WarehouseId) => void;
  canDismiss?: boolean;
  onDismiss?: () => void;
}

export const WarehouseSelectorScreen: React.FC<WarehouseSelectorScreenProps> = ({
  currentUser,
  products,
  selectedWarehouse,
  onSelectWarehouse,
  canDismiss = false,
  onDismiss,
}) => {
  const warehouseKeys: WarehouseId[] = ['EASTERN', 'WESTERN', 'AUXILIARY'];

  // Helper to get stats per warehouse
  const getWarehouseStats = (wId: WarehouseId) => {
    const warehouseProducts = products.filter(p => (p.warehouseId || 'EASTERN') === wId);
    const totalItems = warehouseProducts.length;
    const totalUnits = warehouseProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const lowStockCount = warehouseProducts.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 5)).length;
    return { totalItems, totalUnits, lowStockCount };
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/60 text-center">
          {canDismiss && onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute top-6 left-6 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl border border-slate-600/50 transition-all"
            >
              إلغاء / العودة
            </button>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-400 text-xs font-bold mb-3">
            <Warehouse className="w-4 h-4" />
            <span>شركة NOSSER لإدارة المخازن والمخزون</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
            تحديد المخزن النشط للعمل
          </h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            مرحباً بك <span className="text-white font-bold">{currentUser.name}</span>. يرجى اختيار المخزن الذي ترغب في الدخول إليه؛ حيث يتم عزل حركة السحب، الأرصدة، وأوامر التسليم لكل مخزن بشكل مستقل.
          </p>
        </div>

        {/* 3 Warehouse Cards */}
        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/60">
          {warehouseKeys.map((wKey) => {
            const config: WarehouseConfig = WAREHOUSES[wKey];
            const stats = getWarehouseStats(wKey);
            const isCurrent = selectedWarehouse === wKey;

            // Card specific styling
            const cardTheme = {
              EASTERN: {
                borderHover: 'hover:border-blue-500 hover:shadow-blue-500/10',
                activeBorder: 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-950/20',
                btnBg: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20',
                iconBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
              },
              WESTERN: {
                borderHover: 'hover:border-emerald-500 hover:shadow-emerald-500/10',
                activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-950/20',
                btnBg: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20',
                iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
              },
              AUXILIARY: {
                borderHover: 'hover:border-amber-500 hover:shadow-amber-500/10',
                activeBorder: 'border-amber-500 ring-2 ring-amber-500/40 bg-amber-950/20',
                btnBg: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20',
                iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
              },
            }[wKey];

            return (
              <div
                key={wKey}
                onClick={() => onSelectWarehouse(wKey)}
                className={`relative flex flex-col justify-between p-6 rounded-2xl border transition-all duration-300 cursor-pointer text-right group ${
                  isCurrent ? cardTheme.activeBorder : 'border-slate-800 bg-slate-800/40'
                } ${cardTheme.borderHover} hover:scale-[1.02] shadow-lg`}
              >
                {/* Active Indicator */}
                {isCurrent && (
                  <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-black">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>النشط حالياً</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${cardTheme.iconBg}`}>
                      <Building2 className="w-6 h-6" />
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${cardTheme.badgeBg}`}>
                      {config.shortCode}
                    </span>
                  </div>

                  <h3 className="text-xl font-black text-white mb-1 group-hover:text-blue-300 transition-colors">
                    {config.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mb-4 line-clamp-2">
                    {config.description}
                  </p>

                  {/* Micro Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-6 p-3 rounded-xl bg-slate-900/80 border border-slate-700/50">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-medium">عدد الأصناف المسجلة</span>
                      <span className="text-sm font-black text-white font-mono">{stats.totalItems} صنف</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-medium">إجمالي رصيد الوحدات</span>
                      <span className="text-sm font-black text-emerald-400 font-mono">{stats.totalUnits.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Enter Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectWarehouse(wKey);
                  }}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${cardTheme.btnBg}`}
                >
                  <span>الدخول إلى {config.name}</span>
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-4 px-6 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>نظام عزل البيانات والمخزون مفعل - كل مخزن مستقل تماماً في أرصدته وحركاته وأوامر تسليمه</span>
          </div>
          <span className="text-slate-500 font-mono">شركة NOSSER © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
};
