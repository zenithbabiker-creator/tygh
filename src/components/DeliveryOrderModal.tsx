import React, { useEffect } from 'react';
import { StockMovement, Product } from '../types';
import { toArabicNumerals } from '../lib/arabicUtils';
import { X, FileText, Printer, DollarSign } from 'lucide-react';

export interface DispatchItem {
  product: Product;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
}

interface DeliveryOrderModalProps {
  movement?: StockMovement | null;
  items?: DispatchItem[];
  orderNumber?: string;
  recipientName?: string;
  recipientEntity?: string;
  onClose: () => void;
}

export const DeliveryOrderModal: React.FC<DeliveryOrderModalProps> = ({
  movement,
  items = [],
  orderNumber,
  recipientName,
  recipientEntity,
  onClose
}) => {
  const isOpen = Boolean(movement || (items && items.length > 0));

  // Recipient info resolution with automatic fallback
  const rawRecipient =
    recipientName ||
    recipientEntity ||
    (movement?.reason?.startsWith('فاتورة مبيعات - المستلم/العميل:')
      ? movement.reason.replace('فاتورة مبيعات - المستلم/العميل:', '').trim()
      : movement?.reason?.startsWith('أمر تسليم مخزن - المستلم:')
      ? movement.reason.replace('أمر تسليم مخزن - المستلم:', '').trim()
      : '') ||
    movement?.operatorName ||
    '';
  const recipientInfo = (rawRecipient && rawRecipient !== '..........................' && rawRecipient.trim())
    ? rawRecipient.trim()
    : 'عميل نقدي / استلام مباشر';
  const hasValidRecipient = Boolean(recipientInfo && recipientInfo.length > 0);

  // Internal Native Print Function (Window Print / Native Qt Print Dialog)
  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error('Internal Print trigger error:', e);
    }
  };

  // Explicit Global Keyboard Shortcut (Ctrl + P / Cmd + P) for Instant Internal Printing
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

  if (!isOpen) return null;

  const formattedDate = toArabicNumerals(
    new Date(movement ? movement.timestamp : Date.now()).toLocaleString('ar-EG', {
      dateStyle: 'full',
      timeStyle: 'short',
    })
  );

  const displayItems: DispatchItem[] = items.length > 0
    ? items
    : movement
    ? [{
        product: {
          id: movement.productId,
          code: movement.productCode,
          name: movement.productName,
          category: 'عام',
          stock: movement.newStock,
          unit: 'وحدة',
          price: 0,
          minStock: 5,
          updatedAt: movement.timestamp,
        },
        quantity: movement.quantity,
        unitPrice: 0,
        totalPrice: 0,
      }]
    : [];

  // Calculate total price per item and grand total
  const calculatedItems = displayItems.map(item => {
    const unitPrice = typeof item.unitPrice === 'number'
      ? item.unitPrice
      : (typeof item.product.price === 'number' ? item.product.price : 0);
    const totalPrice = item.quantity * unitPrice;
    return {
      ...item,
      unitPrice,
      totalPrice,
    };
  });

  const grandTotal = calculatedItems.reduce((acc, itm) => acc + (itm.totalPrice || 0), 0);
  const totalQuantity = calculatedItems.reduce((acc, itm) => acc + itm.quantity, 0);

  const docNo = orderNumber
    ? orderNumber
    : movement?.referenceNo
    ? movement.referenceNo
    : '1';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border-2 border-black max-h-[95vh] overflow-y-auto space-y-6 text-black">
        
        {/* Controls Bar (no-print) */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-black no-print">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-5 h-5 text-black" />
            <h3 className="text-base font-black text-black">معاينة وطباعة الفاتورة</h3>
            <span className="text-xs bg-black text-white px-2.5 py-1 rounded-md font-mono font-bold mr-2">
              طباعة أصلية مباشرة (Qt Native Print)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!hasValidRecipient}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="طباعة الفاتورة عبر محرك النظام المباشر"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الفاتورة (Ctrl + P)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-black hover:bg-slate-100 rounded-xl border border-black transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Recipient Validation Warning if missing */}
        {!hasValidRecipient && (
          <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-900 text-xs font-extrabold flex items-center gap-2 no-print">
            <span>⚠️ تنبيه: حقل "اسم المستلم / العميل" فارغ. لن يتم تفعيل الطباعة إلا بعد كتابته.</span>
          </div>
        )}

        {/* PRINTABLE AREA - STRICTLY PURE BLACK TEXT ON PURE WHITE BACKGROUND */}
        <div
          className="printable print-area p-8 bg-white border-2 border-black rounded-xl text-black space-y-6"
          dir="rtl"
          style={{ backgroundColor: '#ffffff', color: '#000000' }}
        >
          {/* Document Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-black">
            <div className="space-y-1">
              <h1 className="text-2xl font-black text-black font-['Tajawal'] tracking-tight">شركة ناصر - أم درمان</h1>
              <h2 className="text-sm font-black text-black font-['Tajawal']">إدارة المبيعات والمخازن</h2>
              <p className="text-xs font-black text-black font-mono flex items-center gap-1">
                <span>هاتف:</span>
                <span dir="ltr" style={{ direction: 'ltr', display: 'inline-block', unicodeBidi: 'embed' }} className="font-sans font-black text-black">
                  &#x202A;0913247564&#x202C;
                </span>
              </p>
            </div>
            
            <div className="text-center bg-white text-black border-2 border-black px-8 py-3 rounded-xl shadow-xs">
              <h2 className="text-2xl font-black tracking-wide font-['Tajawal'] text-black">الفاتورة</h2>
              <p className="text-xs font-mono text-black font-black mt-1">
                رقم الفاتورة التسلسلي: {toArabicNumerals(docNo)}
              </p>
            </div>
          </div>

          {/* Recipient & Date Meta Banner */}
          <div className="bg-white p-3.5 rounded-xl border-2 border-black flex flex-wrap items-center justify-between gap-3 text-xs font-black text-black">
            <div className="flex items-center gap-2">
              <span className="text-black font-black text-sm">اسم المستلم / العميل:</span>
              <strong className="text-black font-black text-base border-b-2 border-black px-3 py-0.5 min-w-[220px] inline-block">
                {recipientInfo || '..........................'}
              </strong>
            </div>
            <div className="flex items-center gap-5 text-xs font-black">
              <div>
                <span className="text-black">تاريخ الفاتورة: </span>
                <strong className="text-black">{formattedDate}</strong>
              </div>
              <div>
                <span className="text-black">عدد الأصناف: </span>
                <strong className="text-black font-mono text-sm">{toArabicNumerals(calculatedItems.length)} صنف</strong>
              </div>
            </div>
          </div>

          {/* Items Table with 4 Core Columns + Line Number + Total Price */}
          <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-white text-black font-black border-b-2 border-black">
                  <th className="p-3 border-l-2 border-b-2 border-black w-12 text-center text-black font-black">م</th>
                  <th className="p-3 border-l-2 border-b-2 border-black w-36 text-black font-black">كود الصنف (Item Code)</th>
                  <th className="p-3 border-l-2 border-b-2 border-black text-black font-black">اسم الصنف (Item Name)</th>
                  <th className="p-3 border-l-2 border-b-2 border-black text-center w-28 text-black font-black">عدد الصنف / الكمية</th>
                  <th className="p-3 border-l-2 border-b-2 border-black text-center w-32 text-black font-black">سعر الصنف (الوحدة)</th>
                  <th className="p-3 border-b-2 border-black text-center w-36 text-black font-black bg-slate-50">السعر الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black font-black text-black bg-white">
                {calculatedItems.map((item, index) => (
                  <tr key={item.product.id || index} className="border-b-2 border-black bg-white">
                    <td className="p-3 text-center font-mono border-l-2 border-black text-black font-black text-sm">
                      {index + 1}
                    </td>
                    <td className="p-3 font-mono font-black text-black border-l-2 border-black text-xs sm:text-sm">
                      {toArabicNumerals(item.product.code)}
                    </td>
                    <td className="p-3 font-black text-xs sm:text-sm text-black border-l-2 border-black">
                      {item.product.name}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-sm sm:text-base text-black border-l-2 border-black">
                      {toArabicNumerals(item.quantity)}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-sm text-black border-l-2 border-black">
                      {toArabicNumerals(Number(item.unitPrice || 0).toLocaleString())}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-sm sm:text-base text-black bg-slate-50">
                      {toArabicNumerals(Number(item.totalPrice || 0).toLocaleString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grand Total Summary Box */}
          <div className="border-2 border-black rounded-xl p-4 bg-white flex flex-wrap items-center justify-between gap-4 text-black">
            <div className="flex items-center gap-6 text-xs font-black">
              <div>
                <span className="text-black">إجمالي الكميات / القطع: </span>
                <strong className="font-mono text-sm text-black">{toArabicNumerals(totalQuantity)} قطعة</strong>
              </div>
              <div>
                <span className="text-black">إجمالي البنود: </span>
                <strong className="font-mono text-sm text-black">{toArabicNumerals(calculatedItems.length)} صنف</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-lg border-2 border-black">
              <span className="text-sm font-black text-black">الإجمالي الكلي للفاتورة (Grand Total):</span>
              <span className="text-xl font-black font-mono text-black underline underline-offset-4">
                {toArabicNumerals(Number(grandTotal).toLocaleString())}
              </span>
            </div>
          </div>

          {/* Signatures and Official Stamp Section */}
          <div className="pt-6 mt-4 border-t-2 border-black grid grid-cols-3 gap-6 text-center text-xs text-black">
            
            {/* 1. Recipient Signature */}
            <div className="space-y-2 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">توقيع المستلم / العميل</span>
              <div className="text-[11px] font-black text-black space-y-1">
                <div>الاسم: <span className="font-black text-black underline underline-offset-4">{recipientInfo || '..........................'}</span></div>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-2">
                ..........................................
              </div>
            </div>

            {/* 2. Storekeeper / Cashier Signature */}
            <div className="space-y-3 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">توقيع المسؤول / أمين المخزن</span>
              <div className="text-[11px] font-black text-black">
                المسؤول: <span className="font-black text-black">{movement?.operatorName || 'أمين المخزن المختص'}</span>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-4">
                ..........................................
              </div>
            </div>

            {/* 3. Official Stamp Square */}
            <div className="flex flex-col items-center space-y-2">
              <span className="font-black text-black block text-sm">الختم الرسمي لشركة ناصر</span>
              <div className="w-36 h-24 border-2 border-dashed border-black rounded-xl flex items-center justify-center text-[11px] text-black font-black bg-white text-center p-2 leading-snug">
                الختم الرسمي لشركة ناصر
                <br />
                أم درمان
              </div>
            </div>

          </div>

        </div>

        {/* Bottom Controls Bar (no-print) */}
        <div className="flex items-center justify-between pt-3 border-t-2 border-black no-print">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!hasValidRecipient}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الفاتورة عبر محرك النظام (Ctrl + P)</span>
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
