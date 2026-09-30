import React, { useEffect, useRef, useState } from 'react';
import { StockMovement, Product } from '../types';
import { toArabicNumerals } from '../lib/arabicUtils';
import { X, Printer, Receipt, Edit3, Check, FileCheck, Layers } from 'lucide-react';
import { printHtmlElement } from '../utils/printDocument';

export interface DispatchItem {
  product: Product;
  quantity: number;
  unitPrice?: number;
  unit_price?: number;
  price?: number;
  totalPrice?: number;
  total_price?: number;
  notes?: string;
}

interface DeliveryOrderModalProps {
  movement?: StockMovement | null;
  items?: DispatchItem[];
  orderNumber?: string;
  recipientName?: string;
  recipientEntity?: string;
  warehouseName?: string;
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
  const printableRef = useRef<HTMLDivElement>(null);

  // Initial recipient parsing: extract clean recipient name from prop or movement reason
  const resolveRecipient = (): string => {
    const direct = (recipientName || recipientEntity || '').trim();
    if (direct) return direct;
    const parsed = movement?.reason?.match(/(?:المستلم\/العميل|المستلم|العميل):\s*([^,\n]+)/)?.[1]?.trim();
    if (parsed) return parsed;
    return '';
  };

  const [currentRecipient, setCurrentRecipient] = useState<string>(resolveRecipient());
  const [isEditingRecipient, setIsEditingRecipient] = useState<boolean>(false);
  const [orderNotes, setOrderNotes] = useState<string>('استلام سليم ومطابق للمواصفات');
  const [copyType, setCopyType] = useState<string>('نسخة أصلية معتمدة');

  useEffect(() => {
    setCurrentRecipient(resolveRecipient());
  }, [recipientName, recipientEntity, movement?.reason, isOpen]);

  // Dual-Engine High-Fidelity Print Trigger (Direct to native printer only, zero disk file prompts)
  const handlePrint = () => {
    if (printableRef.current) {
      printHtmlElement(printableRef.current, {
        title: `فاتورة مبيعات رقم ${orderNumber || movement?.referenceNo || '1'} - شركة NOSSER`,
      });
    } else {
      window.focus();
      window.print();
    }
  };

  // Keyboard Shortcut (Ctrl + P / Cmd + P)
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
    ? items.map(itm => {
        const itemAny = itm as any;
        const prodAny = (itm.product || {}) as any;

        // Extract unit price with exhaustive fallbacks
        const candidatePrices = [
          itemAny.unitPrice,
          itemAny.unit_price,
          itemAny.price,
          prodAny.price,
          prodAny.unit_price,
          prodAny.unitPrice,
        ];
        let foundPrice: number | undefined;
        for (const cp of candidatePrices) {
          if (cp !== undefined && cp !== null && cp !== '') {
            const num = Number(cp);
            if (!isNaN(num) && num >= 0) {
              foundPrice = num;
              break;
            }
          }
        }
        const uPrice = foundPrice !== undefined ? foundPrice : 0;
        const q = Math.max(1, Number(itm.quantity) || 1);

        // Automatic line total calculation (price * quantity)
        let lineTotal = uPrice * q;
        if (itemAny.totalPrice !== undefined && itemAny.totalPrice !== null && !isNaN(Number(itemAny.totalPrice))) {
          lineTotal = Number(itemAny.totalPrice);
        } else if (itemAny.total_price !== undefined && itemAny.total_price !== null && !isNaN(Number(itemAny.total_price))) {
          lineTotal = Number(itemAny.total_price);
        }

        return {
          ...itm,
          quantity: q,
          unitPrice: uPrice,
          unit_price: uPrice,
          price: uPrice,
          totalPrice: lineTotal,
          total_price: lineTotal,
        };
      })
    : movement
    ? (() => {
        const mAny = movement as any;
        const candidatePrices = [
          mAny.unitPrice,
          mAny.unit_price,
          mAny.price,
        ];
        let foundPrice: number | undefined;
        for (const cp of candidatePrices) {
          if (cp !== undefined && cp !== null && cp !== '') {
            const num = Number(cp);
            if (!isNaN(num) && num >= 0) {
              foundPrice = num;
              break;
            }
          }
        }
        const uPrice = foundPrice !== undefined ? foundPrice : 0;
        const q = Math.max(1, Number(movement.quantity) || 1);
        const lineTotal = Number(mAny.totalPrice ?? mAny.total_price ?? (uPrice * q));

        return [{
          product: {
            id: movement.productId,
            code: movement.productCode,
            name: movement.productName,
            category: 'عام',
            stock: movement.newStock,
            unit: 'وحدة',
            price: uPrice,
            unit_price: uPrice,
            minStock: 5,
            updatedAt: movement.timestamp,
          },
          quantity: q,
          unitPrice: uPrice,
          unit_price: uPrice,
          price: uPrice,
          totalPrice: lineTotal,
          total_price: lineTotal,
        }];
      })()
    : [];

  const totalQuantity = displayItems.reduce((acc, itm) => acc + (Number(itm.quantity) || 1), 0);

  // Grand Total calculation (sum of line totals: price * quantity)
  const grandTotalAmount = displayItems.reduce((acc, itm) => {
    const uPrice = Number(itm.unitPrice ?? itm.product?.price ?? 0);
    const qty = Number(itm.quantity) || 1;
    const lineTotal = Number(itm.totalPrice ?? (uPrice * qty));
    return acc + lineTotal;
  }, 0);

  const docNo = orderNumber
    ? orderNumber
    : movement?.referenceNo
    ? movement.referenceNo
    : '1';

  return (
    <div className="modal-overlay-stable">
      <div className="modal-content-stable bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border-2 border-black max-h-[95vh] overflow-y-auto space-y-6 text-black">
        
        {/* Controls Bar (no-print) */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-black no-print gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-black">معاينة وطباعة فاتورة مبيعات</h3>
              <p className="text-[11px] text-slate-600 font-bold">
                فاتورة مبيعات رسمية معتمدة تطبع بدقة عالية على ورق A4 مع احتساب الإجمالي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy Type Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-300 text-xs">
              <Layers className="w-3.5 h-3.5 text-slate-500 mr-1" />
              <select
                value={copyType}
                onChange={(e) => setCopyType(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer py-1 px-1.5"
                title="نوع النسخة المطبوعة"
              >
                <option value="نسخة أصلية معتمدة">نسخة أصلية معتمدة</option>
                <option value="نسخة العميل">نسخة العميل</option>
                <option value="نسخة المحاسبة والمبيعات">نسخة المحاسبة والمبيعات</option>
                <option value="نسخة الإدارة">نسخة الإدارة</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer"
              title="طباعة فاتورة مبيعات (Ctrl + P)"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فاتورة مبيعات (Ctrl + P)</span>
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

        {/* Quick Edit Bar before Print (no-print) */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 no-print">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-slate-900 font-extrabold shrink-0">اسم العميل / المستلم:</span>
            {isEditingRecipient ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="text"
                  value={currentRecipient}
                  onChange={(e) => setCurrentRecipient(e.target.value)}
                  placeholder="اكتب اسم العميل أو الجهة المستلمة..."
                  className="flex-1 px-3 py-1 bg-white border-2 border-blue-600 rounded-lg text-xs font-bold text-black focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setIsEditingRecipient(false)}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                  title="تأكيد الاسم"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-black font-black bg-white px-3 py-1 rounded-md border border-slate-300">
                  {currentRecipient}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingRecipient(true)}
                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded cursor-pointer"
                  title="تعديل اسم العميل قبل الطباعة"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-900 font-extrabold shrink-0">ملاحظات الفاتورة:</span>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-black font-bold focus:outline-none focus:border-blue-600 max-w-xs"
              placeholder="ملاحظات المبيعات..."
            />
          </div>
        </div>

        {/* PRINTABLE AREA - STRICTLY PURE BLACK TEXT ON PURE WHITE BACKGROUND */}
        <div
          ref={printableRef}
          className="printable print-area p-5 sm:p-7 bg-white border-2 border-black rounded-xl text-black space-y-4"
          dir="rtl"
          style={{ backgroundColor: '#ffffff', color: '#000000' }}
        >
          {/* Document Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-black">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-black font-['Tajawal'] tracking-tight">شركة NOSSER - أم درمان</h1>
                <span className="text-[10px] font-black border border-black px-1.5 py-0.5 rounded text-black bg-slate-100">
                  {copyType}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-black font-['Tajawal']">نظام المبيعات المباشر</h2>
                <span className="text-xs font-black px-2 py-0.5 border border-black rounded-md bg-slate-100 font-['Tajawal']">
                  [فاتورة مبيعات رسمية]
                </span>
              </div>
              <p className="text-xs font-black text-black font-mono flex items-center gap-1">
                <span>هاتف المبيعات:</span>
                <span dir="ltr" style={{ direction: 'ltr', display: 'inline-block', unicodeBidi: 'embed' }} className="font-sans font-black text-black">
                  &#x202A;0913247564&#x202C;
                </span>
              </p>
            </div>
            
            <div className="text-center bg-white text-black border-2 border-black px-7 py-2.5 rounded-xl shadow-xs">
              <h2 className="text-2xl font-black tracking-wide font-['Tajawal'] text-black">فاتورة مبيعات</h2>
              <p className="text-xs font-mono text-black font-black mt-1">
                رقم الفاتورة: {toArabicNumerals(docNo)}
              </p>
            </div>
          </div>

          {/* Customer & Date Meta Banner */}
          <div className="bg-white p-3.5 rounded-xl border-2 border-black flex flex-wrap items-center justify-between gap-3 text-xs font-black text-black">
            <div className="flex items-center gap-2">
              <span className="text-black font-black text-sm">اسم العميل / المستلم:</span>
              <strong className="text-black font-black text-base border-b-2 border-black px-3 py-0.5 min-w-[220px] inline-block">
                {currentRecipient || '..........................'}
              </strong>
            </div>
            <div className="flex items-center gap-5 text-xs font-black">
              <div>
                <span className="text-black">تاريخ الفاتورة: </span>
                <strong className="text-black">{formattedDate}</strong>
              </div>
              <div>
                <span className="text-black">عدد البنود: </span>
                <strong className="text-black font-mono text-sm">{toArabicNumerals(displayItems.length)} صنف</strong>
              </div>
            </div>
          </div>

          {/* Items Table - Includes Unit Price and the Total column (السعر × الكمية) exclusively in this Sales Invoice */}
          <div className="border-2 border-black rounded-xl overflow-hidden bg-white">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-white text-black font-black border-b-2 border-black">
                  <th className="p-2.5 border-l-2 border-b-2 border-black w-10 text-center text-black font-black">م</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black w-32 text-black font-black">كود الصنف (Code)</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-black font-black">اسم الصنف والبيان (Description)</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-20 text-black font-black">الوحدة</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-24 text-black font-black bg-slate-50">الكمية</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-28 text-black font-black">سعر الوحدة</th>
                  <th className="p-2.5 border-l-2 border-b-2 border-black text-center w-32 text-black font-black bg-slate-100">الإجمالي (السعر × الكمية)</th>
                  <th className="p-2.5 border-b-2 border-black text-center w-32 text-black font-black">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black font-black text-black bg-white">
                {displayItems.map((item, index) => {
                  const qty = Math.max(1, Number(item.quantity) || 1);
                  const unitPrice = Number(
                    item.unitPrice ?? 
                    (item as any)?.unit_price ?? 
                    (item as any)?.price ?? 
                    item.product?.price ?? 
                    (item.product as any)?.unit_price ?? 
                    0
                  );
                  const lineTotal = Number(item.totalPrice ?? (unitPrice * qty));
                  const formattedUnitPrice = toArabicNumerals(unitPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  const formattedLineTotal = toArabicNumerals(lineTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

                  return (
                    <tr key={item.product.id || index} className="border-b-2 border-black bg-white">
                      <td className="p-2.5 text-center font-mono border-l-2 border-black text-black font-black text-sm">
                        {toArabicNumerals(index + 1)}
                      </td>
                      <td className="p-2.5 font-mono font-black text-black border-l-2 border-black text-xs sm:text-sm">
                        {toArabicNumerals(item.product.code)}
                      </td>
                      <td className="p-2.5 font-black text-xs sm:text-sm text-black border-l-2 border-black">
                        <div>{item.product.name}</div>
                      </td>
                      <td className="p-2.5 text-center font-black text-xs sm:text-sm text-black border-l-2 border-black">
                        {item.product.unit || 'وحدة'}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-sm sm:text-base text-black border-l-2 border-black bg-slate-50">
                        {toArabicNumerals(qty)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-xs sm:text-sm text-black border-l-2 border-black">
                        {formattedUnitPrice} ج.س
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-xs sm:text-sm text-black border-l-2 border-black bg-slate-100">
                        {formattedLineTotal} ج.س
                      </td>
                      <td className="p-2.5 text-center text-xs text-black border-black font-bold">
                        {item.notes || orderNotes || 'سليم ومطابق'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Grand Physical Quantity & Financial Order Total Summary Box */}
          <div className="border-2 border-black rounded-xl p-4 bg-white flex flex-wrap items-center justify-between gap-4 text-black">
            <div className="flex items-center gap-6 text-xs font-black flex-wrap">
              <div>
                <span className="text-black">إجمالي البنود: </span>
                <strong className="font-mono text-sm text-black">{toArabicNumerals(displayItems.length)} صنف</strong>
              </div>
              <div>
                <span className="text-black">إجمالي كمية القطع: </span>
                <strong className="font-mono text-base text-black underline underline-offset-4">{toArabicNumerals(totalQuantity)} قطعة</strong>
              </div>
              <div className="bg-slate-100 border-2 border-black px-4 py-1.5 rounded-lg">
                <span className="text-black font-black text-sm">القيمة الكلية للطلب (إجمالي الفاتورة): </span>
                <strong className="font-mono text-base text-black font-black underline underline-offset-4">
                  {toArabicNumerals(grandTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ج.س
                </strong>
              </div>
            </div>

            <div className="text-xs font-black text-slate-800 bg-slate-50 px-4 py-2 rounded-lg border border-slate-300 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-emerald-700" />
              <span>✓ فاتورة مبيعات معتمدة وصادرة رسمياً من شركة NOSSER</span>
            </div>
          </div>

          {/* Signatures and Official Stamp Section */}
          <div className="pt-6 mt-4 border-t-2 border-black grid grid-cols-3 gap-6 text-center text-xs text-black break-inside-avoid">
            
            {/* 1. Recipient Signature */}
            <div className="space-y-2 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">توقيع العميل / المستلم</span>
              <div className="text-[11px] font-black text-black space-y-1">
                <div>الاسم: <span className="font-black text-black underline underline-offset-4">{currentRecipient || '..........................'}</span></div>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-3">
                ..........................................
              </div>
            </div>

            {/* 2. Salesperson Signature */}
            <div className="space-y-3 flex flex-col justify-between">
              <span className="font-black text-black block text-sm">توقيع مسؤول المبيعات</span>
              <div className="text-[11px] font-black text-black">
                المسؤول: <span className="font-black text-black">{movement?.operatorName || 'مسؤول المبيعات المعتمد'}</span>
              </div>
              <div className="border-b-2 border-dashed border-black w-4/5 mx-auto pb-1 text-black text-[11px] pt-3">
                ..........................................
              </div>
            </div>

            {/* 3. Official Stamp Square */}
            <div className="flex flex-col items-center space-y-2">
              <span className="font-black text-black block text-sm">الختم الرسمي لشركة NOSSER</span>
              <div className="w-36 h-24 border-2 border-dashed border-black rounded-xl flex items-center justify-center text-[11px] text-black font-black bg-white text-center p-2 leading-snug">
                الختم الرسمي لشركة NOSSER
                <br />
                إدارة المبيعات - أم درمان
              </div>
            </div>

          </div>

        </div>

        {/* Bottom Controls Bar (no-print) */}
        <div className="flex items-center justify-between pt-3 border-t-2 border-black no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة فاتورة مبيعات عبر محرك النظام (Ctrl + P)</span>
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
