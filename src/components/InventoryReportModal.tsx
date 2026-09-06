import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../types';
import { toArabicNumerals } from '../lib/arabicUtils';
import { X, Printer, FileSpreadsheet, ClipboardList, CheckCircle2, AlertTriangle, Filter } from 'lucide-react';
import { printHtmlElement } from '../utils/printDocument';

interface InventoryReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  warehouseName: string;
  operatorName?: string;
}

export const InventoryReportModal: React.FC<InventoryReportModalProps> = ({
  isOpen,
  onClose,
  products,
  warehouseName,
  operatorName = 'أمين المخزن المعتمد',
}) => {
  const printableRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'LOW_STOCK'>('ALL');
  const [reportNote, setReportNote] = useState<string>('جرد دوري رسمي لمطابقة الأرصدة الفعلية');

  // Categories list
  const categories = Array.from(new Set(products.map(p => p.category || 'عام'))).filter(Boolean);

  // Filtered products
  const filteredProducts = products.filter(p => {
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
    if (filterType === 'LOW_STOCK' && (Number(p.stock) || 0) > (Number(p.minStock) || 5)) return false;
    return true;
  });

  const totalQuantity = filteredProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const lowStockCount = filteredProducts.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 5)).length;

  const now = new Date();
  const formattedDate = toArabicNumerals(
    now.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  );
  const formattedTime = toArabicNumerals(
    now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
  const reportCode = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${filteredProducts.length}`;

  const handlePrint = () => {
    if (printableRef.current) {
      printHtmlElement(printableRef.current, {
        title: `كشف جرد مخزون - ${warehouseName} - شركة NOSSER`,
      });
    } else {
      window.focus();
      window.print();
    }
  };

  // Keyboard shortcut Ctrl + P
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  // Export to CSV / Excel
  const handleExportCSV = () => {
    try {
      const BOM = '\uFEFF';
      const headers = ['م', 'كود الصنف', 'اسم الصنف', 'التصنيف', 'الوحدة', 'الرصيد الدفتري', 'الحد الأدنى', 'حالة المخزون'];
      const rows = filteredProducts.map((p, idx) => [
        idx + 1,
        `"${p.code}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category || 'عام'}"`,
        `"${p.unit || 'وحدة'}"`,
        p.stock,
        p.minStock || 5,
        p.stock <= (p.minStock || 5) ? 'منخفض / يحتاج توريد' : 'متوفر'
      ]);

      const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `كشف_جرد_${warehouseName}_${now.toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export CSV:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay-stable">
      <div className="modal-content-stable bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border-2 border-black max-h-[95vh] overflow-y-auto space-y-6 text-black">
        
        {/* Controls Bar (no-print) */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-black no-print gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-black">كشف جرد وتفقد المخزون الفعلي</h3>
              <p className="text-[11px] text-slate-600 font-bold">
                تقرير رسمي لجرد ومطابقة أرصدة المستودع معتمدة للطباعة على ورق A4
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer"
              title="طباعة كشف الجرد عبر محرك النظام (Ctrl + P)"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كشف الجرد (Ctrl + P)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="تصدير بيانات الجرد الحالية إلى ملف إكسل CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-black hover:bg-slate-100 rounded-xl border border-black transition cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar (no-print) */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 no-print">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>تصنيف الأصناف:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-black focus:outline-none"
              >
                <option value="ALL">جميع التصنيفات ({products.length})</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  filterType === 'ALL' ? 'bg-white text-black shadow-xs' : 'text-slate-600'
                }`}
              >
                كافة الأصناف ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('LOW_STOCK')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  filterType === 'LOW_STOCK' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                المنخفضة فقط ({lowStockCount})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span>ملاحظة الكشف:</span>
            <input
              type="text"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-black font-bold focus:outline-none max-w-xs"
              placeholder="اكتب ملاحظة الجرد..."
            />
          </div>
        </div>

        {/* PRINTABLE DOCUMENT - ZERO GLITCHES, CRISP A4 FORMAT */}
        <div
          ref={printableRef}
          className="printable print-area p-5 sm:p-7 bg-white border-2 border-black rounded-xl text-black space-y-4"
          dir="rtl"
          style={{ backgroundColor: '#ffffff', color: '#000000' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-black">
            <div className="space-y-1">
              <h1 className="text-2xl font-black text-black font-['Tajawal'] tracking-tight">شركة NOSSER - أم درمان</h1>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-black font-['Tajawal']">إدارة المخازن والمستودعات</h2>
                <span className="text-xs font-black px-2 py-0.5 border border-black rounded-md bg-slate-100 font-['Tajawal']">
                  [{warehouseName}]
                </span>
              </div>
              <p className="text-xs font-black text-black font-mono flex items-center gap-1">
                <span>هاتف الإدارة:</span>
                <span dir="ltr" style={{ direction: 'ltr', display: 'inline-block', unicodeBidi: 'embed' }} className="font-sans font-black text-black">
                  &#x202A;0913247564&#x202C;
                </span>
              </p>
            </div>
            
            <div className="text-center bg-white text-black border-2 border-black px-7 py-2.5 rounded-xl shadow-xs">
              <h2 className="text-xl font-black tracking-wide font-['Tajawal'] text-black">كشف جرد المخزون الفعلي</h2>
              <p className="text-xs font-mono text-black font-black mt-1">
                رقم الكشف: {toArabicNumerals(reportCode)}
              </p>
            </div>
          </div>

          {/* Meta Info Banner */}
          <div className="bg-white p-3 rounded-xl border-2 border-black flex flex-wrap items-center justify-between gap-3 text-xs font-black text-black">
            <div className="flex items-center gap-4">
              <div>
                <span>تاريخ الجرد: </span>
                <strong>{formattedDate} - {formattedTime}</strong>
              </div>
              <div>
                <span>المسؤول القائم بالجرد: </span>
                <strong>{operatorName}</strong>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div>
                <span>الأصناف المدرجة: </span>
                <strong className="font-mono text-sm">{toArabicNumerals(filteredProducts.length)} صنف</strong>
              </div>
              <div>
                <span>إجمالي الرصيد الدفتري: </span>
                <strong className="font-mono text-sm">{toArabicNumerals(totalQuantity)} قطعة</strong>
              </div>
              {lowStockCount > 0 && (
                <div>
                  <span className="text-rose-700">تحت حد الأمان: </span>
                  <strong className="font-mono text-sm text-rose-700">{toArabicNumerals(lowStockCount)} صنف</strong>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-white text-black font-black border-b-2 border-black">
                  <th className="p-2.5 border-l-2 border-b-2 border-black w-8 text-center">م</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black w-28">كود الصنف</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black">اسم وبيان الصنف</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-24">التصنيف</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-16">الوحدة</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-24 bg-slate-50">الرصيد المسجل</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-28">العدّ الفعلي</th>
                  <th className="p-2.5 border-b-2 border-black text-center w-36">الفارق والملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black font-black text-black bg-white">
                {filteredProducts.map((prod, index) => {
                  const stock = Number(prod.stock) || 0;
                  const minStock = Number(prod.minStock) || 5;
                  const isLow = stock <= minStock;

                  return (
                    <tr key={prod.id || index} className="border-b-2 border-black bg-white">
                      <td className="p-2 text-center font-mono border-l-2 border-black text-black font-black">
                        {index + 1}
                      </td>
                      <td className="p-2 font-mono font-black text-black border-l-2 border-black">
                        {toArabicNumerals(prod.code)}
                      </td>
                      <td className="p-2 font-black text-black border-l-2 border-black">
                        <div>{prod.name}</div>
                      </td>
                      <td className="p-2 text-center text-black border-l-2 border-black text-[11px]">
                        {prod.category || 'عام'}
                      </td>
                      <td className="p-2 text-center text-black border-l-2 border-black text-[11px]">
                        {prod.unit || 'وحدة'}
                      </td>
                      <td className="p-2 text-center font-mono font-black text-black border-l-2 border-black bg-slate-50 text-sm">
                        {toArabicNumerals(stock)}
                        {isLow && <span className="text-[10px] text-rose-700 block font-normal">منخفض</span>}
                      </td>
                      {/* Blank Physical Count Box for Manual Inventory Check */}
                      <td className="p-2 text-center border-l-2 border-black font-mono text-sm text-black">
                        [ ........... ]
                      </td>
                      <td className="p-2 text-center text-[10px] text-slate-800 border-black font-normal">
                        {isLow ? 'مراجعة التوريد' : 'مطابق دفترياً'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Grand Totals and Inspection Note */}
          <div className="border-2 border-black rounded-xl p-3 bg-white flex flex-wrap items-center justify-between gap-3 text-black">
            <div className="flex items-center gap-6 text-xs font-black">
              <div>
                <span>إجمالي بنود الجرد: </span>
                <strong className="font-mono">{toArabicNumerals(filteredProducts.length)} صنف</strong>
              </div>
              <div>
                <span>إجمالي الوحدات المسجلة بالمستودع: </span>
                <strong className="font-mono underline underline-offset-4">{toArabicNumerals(totalQuantity)} قطعة</strong>
              </div>
            </div>

            <div className="text-xs font-black text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-300">
              {reportNote || 'تمت مطابقة الجرد الدفتري مع الأرصدة بالمستودع'}
            </div>
          </div>

          {/* Signatures and Stamp Section */}
          <div className="pt-4 mt-3 border-t-2 border-black grid grid-cols-3 gap-6 text-center text-xs text-black break-inside-avoid">
            {/* 1. Storekeeper Signature */}
            <div className="space-y-2 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">أمين المخزن المسؤول</span>
              <div className="text-[11px] font-black text-black">
                الاسم: <span className="underline underline-offset-4">{operatorName}</span>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-3">
                ..........................................
              </div>
            </div>

            {/* 2. Audit Committee Signature */}
            <div className="space-y-2 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">لجنة الجرد والتدقيق</span>
              <div className="text-[11px] font-black text-black">
                المطابقة: <span>معتمد بعد الفحص</span>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-3">
                ..........................................
              </div>
            </div>

            {/* 3. Official Stamp Square */}
            <div className="flex flex-col items-center space-y-2">
              <span className="font-black text-black block text-sm">الختم الرسمي للمستودع</span>
              <div className="w-36 h-20 border-2 border-dashed border-black rounded-xl flex items-center justify-center text-[10px] text-black font-black bg-white text-center p-2 leading-tight">
                الختم الرسمي لشركة NOSSER
                <br />
                إدارة المخازن - أم درمان
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Controls Bar (no-print) */}
        <div className="flex items-center justify-between pt-3 border-t-2 border-black no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة كشف الجرد عبر محرك النظام (Ctrl + P)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white hover:bg-slate-100 text-black border-2 border-black rounded-xl text-xs font-black transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
};
