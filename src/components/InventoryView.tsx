import React, { useState, useMemo, useEffect } from 'react';
import { Product, User, StockMovement, WarehouseId } from '../types';
import { SmartSearchBar } from './SmartSearchBar';
import { searchAndRank, toArabicNumerals } from '../lib/arabicUtils';
import { DeliveryOrderModal, DispatchItem } from './DeliveryOrderModal';
import { InventoryReportModal } from './InventoryReportModal';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  ArrowRight,
  X,
  Sparkles,
  Printer,
  FileText,
  ShoppingCart,
  Minus,
  Check,
  User as UserIcon,
  FileSpreadsheet,
  Receipt
} from 'lucide-react';

interface InventoryViewProps {
  products: Product[];
  currentUser: User | null;
  movements?: StockMovement[];
  activeWarehouse?: WarehouseId;
  onAddProduct: (product: Partial<Product>) => Promise<{ success: boolean; message?: string }>;
  onBatchAddProducts?: (items: Array<{ code?: string; name: string; stock: number; price?: number; category?: string; minStock?: number; unit?: string; description?: string }>) => Promise<{ success: boolean; count?: number; message?: string }>;
  onUpdateProduct: (id: string, product: Partial<Product>) => Promise<{ success: boolean; message?: string }>;
  onDeleteProduct: (id: string) => Promise<{ success: boolean; message?: string }>;
  onStockMovement: (movement: {
    productId: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
    referenceNo?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onBatchStockMovement?: (data: {
    items: Array<{ productId: string; quantity: number; unitPrice?: number; totalPrice?: number }>;
    reason: string;
    referenceNo: string;
  }) => Promise<{ success: boolean; message?: string; movements?: StockMovement[] }>;
  onBack?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  currentUser,
  onAddProduct,
  onBatchAddProducts,
  onUpdateProduct,
  onDeleteProduct,
  onStockMovement,
  onBatchStockMovement,
  onBack,
}) => {
  const isGeneralManager = currentUser?.role === 'GENERAL_MANAGER';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Product Add / Edit Modal & Dedicated Standalone Batch Screen
  const [isBatchAddMode, setIsBatchAddMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stock, setStock] = useState<string>('0');
  const [price, setPrice] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('5');
  const [category, setCategory] = useState<string>('عام');
  const [unit, setUnit] = useState<string>('وحدة');

  // Interactive Table Grid State for Excel Copy-Paste & Batch Add (Price column included for input, NO total column here)
  const [gridRows, setGridRows] = useState<Array<{ id: string; code: string; name: string; stock: string; price: string }>>([]);
  const [pasteMessage, setPasteMessage] = useState('');

  // Side Cart for "فاتورة مبيعات"
  const [cartItems, setCartItems] = useState<Array<{ product: Product; quantity: number; unitPrice?: number }>>([]);
  const [recipientName, setRecipientName] = useState<string>('');
  const [activeRecipientName, setActiveRecipientName] = useState<string>('');
  const [activeDeliveryItems, setActiveDeliveryItems] = useState<DispatchItem[] | null>(null);
  const [activeDeliveryOrderNo, setActiveDeliveryOrderNo] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);

  // Direct unified sales catalog: all products belong to the direct sales system
  const catalogProducts = products;

  // Key Sales & Inventory Metrics
  const metrics = useMemo(() => {
    const totalItems = catalogProducts.length;
    const totalUnits = catalogProducts.reduce((acc, p) => acc + p.stock, 0);
    const lowStockCount = catalogProducts.filter(p => p.stock <= (p.minStock || 5)).length;
    return { totalItems, totalUnits, lowStockCount };
  }, [catalogProducts]);

  // Filter products using Arabic Smart Search Engine
  const filteredProducts = useMemo(() => {
    return searchAndRank(catalogProducts, searchTerm, (p: Product) => [p.name, p.code]);
  }, [catalogProducts, searchTerm]);

  // Cart Calculations (Quantities & Total Order Value on demand)
  const cartTotals = useMemo(() => {
    const totalQuantity = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const totalOrderValue = cartItems.reduce((acc, item) => {
      const p = Number(item.unitPrice ?? item.product.price) || 0;
      return acc + (p * item.quantity);
    }, 0);
    return {
      totalItems: cartItems.length,
      totalQuantity,
      totalOrderValue,
    };
  }, [cartItems]);

  // Direct Click-to-Add to Side Sales Invoice Cart
  const handleToggleProductCart = (product: Product) => {
    if (!product || !product.id) return;
    const pId = String(product.id);
    const liveProd = catalogProducts.find(p => String(p.id) === pId) || product;
    if (liveProd.stock <= 0) {
      alert(`عفواً، الصنف (${liveProd.name}) غير متوفر حالياً (الرصيد المتاح: 0).`);
      return;
    }

    const prodPrice = Number(liveProd.price) || 0;

    setCartItems(prev => {
      const existsIndex = prev.findIndex(item => String(item.product.id) === pId);
      if (existsIndex > -1) {
        return prev.filter((_, idx) => idx !== existsIndex);
      } else {
        return [...prev, { product: liveProd, quantity: 1, unitPrice: prodPrice }];
      }
    });
  };

  const handleUpdateCartPrice = (productId: string, price: number) => {
    const pId = String(productId);
    const cleanPrice = Math.max(0, price);
    setCartItems(prev =>
      prev.map(item => (String(item.product.id) === pId ? { ...item, unitPrice: cleanPrice } : item))
    );
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    const pId = String(productId);
    const targetProduct = catalogProducts.find(p => String(p.id) === pId);
    const maxAvailable = targetProduct ? targetProduct.stock : 99999;

    if (quantity > maxAvailable) {
      alert(`عفواً، أقصى رصيد متاح للصنف (${targetProduct?.name}) هو ${maxAvailable} وحدة.`);
      quantity = maxAvailable;
    }

    if (quantity <= 0) {
      setCartItems(prev => prev.filter(item => String(item.product.id) !== pId));
    } else {
      setCartItems(prev =>
        prev.map(item => (String(item.product.id) === pId ? { ...item, quantity } : item))
      );
    }
  };

  const handleRemoveFromCart = (productId: string) => {
    const pId = String(productId);
    setCartItems(prev => prev.filter(item => String(item.product.id) !== pId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Helper to generate next sequential invoice number
  const getNextInvoiceNo = () => {
    const currentYear = new Date().getFullYear();
    const storedSeq = localStorage.getItem('nosser_sales_invoice_seq') || localStorage.getItem('nosser_last_delivery_order_seq_v2') || '0';
    const nextSeq = (parseInt(storedSeq, 10) || 0) + 1;
    return `INV-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  };

  // Process Sales Invoice Generation and Direct Printing
  const handleCompleteInvoice = async () => {
    if (cartItems.length === 0) {
      alert('💡 تنبيه: سلة فاتورة المبيعات فارغة حالياً. يرجى اختيار الأصناف أولاً.');
      return;
    }

    if (!recipientName.trim()) {
      alert('تنبيه هام: يرجى كتابة اسم العميل / المستلم قبل إصدار وطباعة فاتورة المبيعات.');
      return;
    }

    // Pre-flight validation: check all cart items against current stock
    for (const item of cartItems) {
      const pId = String(item.product.id || '');
      const liveProd = catalogProducts.find(p => String(p.id) === pId) || item.product;

      const available = Number(liveProd ? liveProd.stock : item.product.stock) || 0;
      const requestedQty = Math.max(1, Number(item.quantity) || 1);

      if (available <= 0) {
        alert(`خطأ في العملية: الصنف (${item.product.name}) غير متوفر (الرصيد: 0). يرجى إزالته من سلة الفاتورة.`);
        return;
      }
      if (requestedQty > available) {
        alert(`خطأ في العملية: الكمية المطلوبة للصنف (${item.product.name}) هي ${requestedQty} ولكن الرصيد المتاح هو ${available} فقط! يرجى تعديل الكمية أولاً.`);
        return;
      }
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const finalInvoiceNo = getNextInvoiceNo();

      // Persist sequence number immediately
      const numMatch = finalInvoiceNo.match(/\d+$/);
      if (numMatch) {
        const numVal = parseInt(numMatch[0], 10);
        if (!isNaN(numVal)) {
          localStorage.setItem('nosser_sales_invoice_seq', String(numVal));
        }
      }

      const finalRecipient = recipientName.trim();

      const dispatchItemsToPrint: DispatchItem[] = cartItems.map(item => {
        const pId = String(item.product.id || '');
        const liveProd = catalogProducts.find(p => String(p.id) === pId) || item.product;
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unitPrice = Number(
          item.unitPrice ?? 
          (item as any)?.unit_price ?? 
          (item as any)?.price ?? 
          liveProd.price ?? 
          (liveProd as any)?.unit_price ?? 
          0
        );
        const lineTotal = unitPrice * qty;
        return {
          product: {
            ...liveProd,
            price: unitPrice,
            unit_price: unitPrice,
          },
          quantity: qty,
          unitPrice,
          unit_price: unitPrice,
          price: unitPrice,
          totalPrice: lineTotal,
          total_price: lineTotal,
        };
      });

      const batchItemsPayload = cartItems.map(item => {
        const pId = String(item.product.id || '');
        const liveProd = catalogProducts.find(p => String(p.id) === pId) || item.product;
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unitPrice = Number(
          item.unitPrice ?? 
          (item as any)?.unit_price ?? 
          (item as any)?.price ?? 
          liveProd.price ?? 
          (liveProd as any)?.unit_price ?? 
          0
        );
        const lineTotal = unitPrice * qty;

        return {
          productId: String(liveProd.id || item.product.id || ''),
          productCode: String(liveProd.code || item.product.code || ''),
          productName: String(liveProd.name || item.product.name || ''),
          quantity: qty,
          unitPrice,
          unit_price: unitPrice,
          price: unitPrice,
          totalPrice: lineTotal,
          total_price: lineTotal,
        };
      });

      // Use atomic batch movement for direct sales invoice
      if (onBatchStockMovement) {
        const res = await onBatchStockMovement({
          items: batchItemsPayload,
          referenceNo: finalInvoiceNo,
          reason: `فاتورة مبيعات - المستلم/العميل: ${finalRecipient}`,
        });

        if (res && res.success === false) {
          const errMsg = res.message || 'فشلت عملية إصدار فاتورة المبيعات، يرجى مراجعة البيانات';
          setFormError(errMsg);
          return;
        }
      } else {
        // Fallback
        for (const item of batchItemsPayload) {
          const res = await onStockMovement({
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            reason: `فاتورة مبيعات - المستلم/العميل: ${finalRecipient}`,
            referenceNo: finalInvoiceNo,
          });

          if (res && res.success === false) {
            const errMsg = res.message || 'فشلت عملية صرف الصنف بالفاتورة';
            setFormError(errMsg);
            return;
          }
        }
      }

      // Open Modal for immediate preview and print with typed recipient name
      setActiveRecipientName(finalRecipient);
      setActiveDeliveryItems(dispatchItemsToPrint);
      setActiveDeliveryOrderNo(finalInvoiceNo);

      // Reset cart and recipient input
      setCartItems([]);
      setRecipientName('');
    } catch (err: any) {
      setFormError('حدث خطأ أثناء معالجة فاتورة المبيعات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to generate the next unique code
  const generateNextCode = (currentList: Product[] = products): string => {
    let maxNum = 100;
    currentList.forEach(p => {
      const match = p.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `NOSSER-${maxNum + 1}`;
  };

  // Open Single Add Modal
  const openAddModal = () => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات إضافة وتعديل الأصناف هي صلاحيات حصرية للمدير العام فقط.');
      return;
    }
    setEditingProduct(null);
    setCode(generateNextCode());
    setName('');
    setStock('0');
    setPrice('0');
    setMinStock('5');
    setCategory('عام');
    setUnit('وحدة');
    setFormError('');
    setIsModalOpen(true);
  };

  // Open Batch Add Screen (Excel mode)
  const openBatchAddModal = () => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات إضافة وتعديل الأصناف هي صلاحيات حصرية للمدير العام فقط.');
      return;
    }
    let startingNum = 100;
    products.forEach(p => {
      const match = p.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > startingNum) startingNum = num;
      }
    });

    const initialFive = Array.from({ length: 5 }, (_, i) => ({
      id: `init_${Date.now()}_${i}`,
      code: `NOSSER-${startingNum + 1 + i}`,
      name: '',
      stock: '1',
      price: '0',
    }));
    setGridRows(initialFive);
    setPasteMessage('');
    setIsBatchAddMode(true);
  };

  // Process Pasted Text from Excel / Clipboard with Price detection
  const processPastedText = (rawText: string) => {
    if (!rawText || !rawText.trim()) return;

    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return;

    let baseNum = 100;
    products.forEach(p => {
      const match = p.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > baseNum) baseNum = num;
      }
    });
    gridRows.forEach(r => {
      const match = r.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || r.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > baseNum) baseNum = num;
      }
    });

    const parsedRows: Array<{ id: string; code: string; name: string; stock: string; price: string }> = [];

    lines.forEach((line) => {
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.includes(',')
        ? line.split(',')
        : line.split(/\s{2,}/);

      const cleanParts = parts.map(p => p.trim()).filter(Boolean);
      if (cleanParts.length === 0) return;

      baseNum += 1;
      let parsedCode = `NOSSER-${baseNum}`;
      let parsedName = '';
      let parsedStock = '1';
      let parsedPrice = '0';

      if (cleanParts.length === 1) {
        parsedName = cleanParts[0];
      } else if (cleanParts.length === 2) {
        // [Name, Quantity] OR [Name, Price]
        if (!isNaN(Number(cleanParts[1]))) {
          parsedName = cleanParts[0];
          parsedStock = String(Math.max(0, parseInt(cleanParts[1], 10) || 1));
        } else {
          parsedName = cleanParts[1];
        }
      } else if (cleanParts.length === 3) {
        // [Name, Quantity, UnitPrice] OR [Code, Name, Quantity]
        if (isNaN(Number(cleanParts[0]))) {
          parsedName = cleanParts[0];
          parsedStock = String(Math.max(0, parseInt(cleanParts[1], 10) || 1));
          parsedPrice = String(Math.max(0, parseFloat(cleanParts[2]) || 0));
        } else {
          parsedName = cleanParts[1];
          parsedStock = String(Math.max(0, parseInt(cleanParts[2], 10) || 1));
        }
      } else if (cleanParts.length >= 4) {
        // [Code, Name, Quantity, UnitPrice]
        parsedName = cleanParts[1];
        parsedStock = String(Math.max(0, parseInt(cleanParts[2], 10) || 1));
        parsedPrice = String(Math.max(0, parseFloat(cleanParts[3]) || 0));
      }

      if (parsedName) {
        parsedRows.push({
          id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: parsedCode,
          name: parsedName,
          stock: parsedStock,
          price: parsedPrice,
        });
      }
    });

    if (parsedRows.length > 0) {
      setGridRows(prev => {
        const withoutEmpty = prev.filter(r => r.name.trim().length > 0);
        return [...withoutEmpty, ...parsedRows];
      });
      setPasteMessage(`✅ تم استيراد ولصق عدد (${parsedRows.length}) صنف من جدول Excel بنجاح مع تحديد الكميات والأسعار.`);
      setTimeout(() => setPasteMessage(''), 5000);
    }
  };

  // Add 5 more empty rows to the grid
  const handleAddFiveRows = () => {
    setGridRows(prev => {
      let maxNum = 100;
      products.forEach(p => {
        const match = p.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
        if (match) {
          const num = parseInt(match[1] || match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      prev.forEach(r => {
        const match = r.code.match(/^(?:NOSSER-|NASSER-)?(\d+)$/i) || r.code.match(/\d+/);
        if (match) {
          const num = parseInt(match[1] || match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });

      const newFive: Array<{ id: string; code: string; name: string; stock: string; price: string }> = [];
      for (let i = 1; i <= 5; i++) {
        newFive.push({
          id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 5)}_${i}`,
          code: `NOSSER-${maxNum + i}`,
          name: '',
          stock: '1',
          price: '0',
        });
      }
      return [...prev, ...newFive];
    });
  };

  const handleGridCellChange = (id: string, field: 'code' | 'name' | 'stock' | 'price', value: string) => {
    setGridRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleRemoveGridRow = (id: string) => {
    setGridRows(prev => prev.filter(r => r.id !== id));
  };

  // Save Batch Products from Data Entry Screen
  const handleConfirmBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validRows = gridRows.filter(r => r.name.trim().length > 0);
    if (validRows.length === 0) {
      setFormError('يرجى كتابة اسم صنف واحد على الأقل قبل الحفظ');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToSave = validRows.map(r => {
        let finalCode = r.code.trim();
        if (!finalCode) {
          finalCode = generateNextCode(products);
        } else if (!finalCode.startsWith('NOSSER-') && !finalCode.startsWith('NASSER-')) {
          finalCode = `NOSSER-${finalCode}`;
        }
        return {
          code: finalCode,
          name: r.name.trim(),
          stock: parseInt(r.stock, 10) || 0,
          price: Math.max(0, parseFloat(r.price) || 0), // سعر الوحدة المحدد أثناء الإدخال
          category: 'عام',
          minStock: 5,
          unit: 'وحدة',
        };
      });

      if (onBatchAddProducts) {
        const res = await onBatchAddProducts(itemsToSave);
        if (res.success) {
          setIsBatchAddMode(false);
          setIsModalOpen(false);
        } else {
          setFormError(res.message || 'فشلت عملية حفظ الأصناف');
        }
      } else {
        for (const item of itemsToSave) {
          await onAddProduct(item);
        }
        setIsBatchAddMode(false);
        setIsModalOpen(false);
      }
    } catch (err: any) {
      setFormError('حدث خطأ أثناء حفظ الأصناف في النظام');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Product Modal
  const openEditModal = (product: Product) => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات تعديل بيانات الأصناف هي صلاحيات حصرية للمدير العام فقط.');
      return;
    }
    setEditingProduct(product);
    setCode(product.code);
    setName(product.name);
    setStock(String(product.stock));
    setPrice(String(product.price || 0));
    setMinStock(String(product.minStock || 5));
    setCategory(product.category || 'عام');
    setUnit(product.unit || 'وحدة');
    setFormError('');
    setIsModalOpen(true);
  };

  // Save Single Add / Edit Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGeneralManager) {
      setFormError('عفواً، خيارات إضافة وتعديل الأصناف هي صلاحيات حصرية للمدير العام فقط.');
      return;
    }
    setFormError('');

    if (!name.trim()) {
      setFormError('يرجى كتابة اسم الصنف');
      return;
    }

    setIsSubmitting(true);
    try {
      let formattedCode = code.trim();
      if (!formattedCode) {
        formattedCode = generateNextCode();
      } else if (!formattedCode.startsWith('NOSSER-') && !formattedCode.startsWith('NASSER-')) {
        formattedCode = `NOSSER-${formattedCode}`;
      }

      const parsedPrice = Math.max(0, parseFloat(price) || 0);

      if (editingProduct) {
        const res = await onUpdateProduct(editingProduct.id, {
          code: formattedCode || editingProduct.code,
          name: name.trim(),
          stock: Math.max(0, parseInt(stock, 10) || 0),
          price: parsedPrice, // سعر الوحدة المحدث
          minStock: Math.max(1, parseInt(minStock, 10) || 5),
          category: category.trim() || 'عام',
          unit: unit.trim() || 'وحدة',
          description: editingProduct.description || '',
        });
        if (res.success) {
          setIsModalOpen(false);
        } else {
          setFormError(res.message || 'فشلت عملية تحديث الصنف');
        }
      } else {
        const res = await onAddProduct({
          code: formattedCode,
          name: name.trim(),
          category: category.trim() || 'عام',
          stock: Math.max(0, parseInt(stock, 10) || 0),
          price: parsedPrice, // سعر الوحدة المحدد عند الإدخال
          minStock: Math.max(1, parseInt(minStock, 10) || 5),
          unit: unit.trim() || 'وحدة',
          description: '',
        });
        if (res.success) {
          setIsModalOpen(false);
          setSelectedProductId(null);
          setCode('');
          setName('');
          setStock('0');
          setPrice('0');
          setMinStock('5');
        } else {
          setFormError(res.message || 'فشلت عملية إضافة الصنف');
        }
      }
    } catch (err: any) {
      setFormError('حدث خطأ في النظام أثناء حفظ الصنف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProductConfirm = async (id: string, nameStr: string) => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات حذف الأصناف هي صلاحيات حصرية للمدير العام فقط.');
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف الصنف "${nameStr}" نهائياً من قاعدة البيانات؟`)) {
      setCartItems(prev => prev.filter(item => item.product.id !== id && item.product.code !== id));
      await onDeleteProduct(id);
    }
  };

  // -------------------------------------------------------------
  // SCREEN: BATCH DATA ENTRY / PURCHASES GRID (Excel Mode)
  // Shows: Code, Name, Quantity/Stock, Unit Price (NO Total column here)
  // -------------------------------------------------------------
  if (isBatchAddMode) {
    return (
      <div
        className="space-y-6 animate-fadeIn pb-12"
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text && text.trim()) {
            processPastedText(text);
          }
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsBatchAddMode(false)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <ArrowRight className="w-4 h-4 text-blue-600" />
              <span>العودة إلى شاشة المبيعات</span>
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Package className="w-6 h-6 text-blue-600" />
                <span>شاشة إدخال البيانات وعملية الشراء والتوريد</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                تحديد اسم الصنف والكمية وسعر الوحدة - ترقيم تسلسلي أوتوماتيكي - دعم اللصق المباشر من Excel (Ctrl + V)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsBatchAddMode(false)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>إلغاء الخروج</span>
          </button>
        </div>

        {formError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-800 font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {pasteMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-800 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{pasteMessage}</span>
          </div>
        )}

        {/* Excel Paste Zone */}
        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-extrabold text-blue-950 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span>منطقة اللصق السريع المباشر من إكسل (Ctrl + V)</span>
            </label>
            <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg font-bold">
              نسخ الأعمدة: (اسم الصنف، الكمية، سعر الوحدة)
            </span>
          </div>
          <textarea
            rows={3}
            placeholder="اضغط (Ctrl + V) هنا أو في أي مكان بالشاشة للصق بيانات جدول الإكسل وسيقوم النظام بتوزيع الخانات والأسعار تلقائياً..."
            onChange={(e) => {
              if (e.target.value) {
                processPastedText(e.target.value);
                e.target.value = '';
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text && text.trim()) {
                e.preventDefault();
                processPastedText(text);
              }
            }}
            className="w-full p-3.5 bg-white border border-blue-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner resize-none"
          />
        </div>

        <form onSubmit={handleConfirmBatchAdd} className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0F172A] text-white font-extrabold text-xs sm:text-sm border-b border-slate-800">
                    <th className="p-3.5 w-12 text-center">#</th>
                    <th className="p-3.5 w-44 sm:w-52">الكود / Serial (تلقائي ومحمي)</th>
                    <th className="p-3.5">اسم الصنف بالكامل</th>
                    <th className="p-3.5 w-28 sm:w-32 text-center">الكمية / الرصيد المسجل</th>
                    <th className="p-3.5 w-32 sm:w-36 text-center bg-blue-950/80">سعر الوحدة (ج.س)</th>
                    <th className="p-3.5 w-16 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {gridRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400 font-bold">
                        لا توجد أصناف بالجدول. اضغط إضافة صفوف جديدة أو قم باللصق من Excel.
                      </td>
                    </tr>
                  ) : (
                    gridRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-center text-slate-400 font-extrabold text-xs">{idx + 1}</td>
                        <td className="p-3">
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={row.code}
                            className="w-full px-3 py-2 border border-slate-300 bg-slate-100 rounded-xl font-mono font-black text-slate-700 text-center text-xs sm:text-sm cursor-not-allowed select-none shadow-inner"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleGridCellChange(row.id, 'name', e.target.value)}
                            placeholder="اكتب اسم الصنف هنا..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 text-xs sm:text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-500 focus:outline-none shadow-xs"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            value={row.stock}
                            onChange={(e) => handleGridCellChange(row.id, 'stock', e.target.value)}
                            placeholder="1"
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-black text-slate-900 text-center text-xs sm:text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-500 focus:outline-none shadow-xs"
                          />
                        </td>
                        <td className="p-3 bg-blue-50/40">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.price}
                            onChange={(e) => handleGridCellChange(row.id, 'price', e.target.value)}
                            placeholder="0"
                            title="حدد سعر الوحدة أثناء الإدخال"
                            className="w-full px-3 py-2 border border-blue-300 rounded-xl font-mono font-black text-blue-950 text-center text-xs sm:text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-500 focus:outline-none shadow-xs bg-white"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveGridRow(row.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleAddFiveRows}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>إضافة 5 صفوف جديدة فارغة</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsBatchAddMode(false)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || gridRows.filter(r => r.name.trim()).length === 0}
                  className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md shadow-blue-900/30 transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الحفظ...' : `حفظ وتأكيد الأصناف (${gridRows.filter(r => r.name.trim()).length})`}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN VIEW: DIRECT SALES SYSTEM & INVOICING INTERFACE
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      
      {/* Sales Header Banner */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 shadow-xl border bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 border-blue-800/50 text-white">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black shadow-lg shrink-0 bg-blue-600 text-white shadow-blue-900/50">
              <Receipt className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black tracking-tight font-['Tajawal']">
                  نظام المبيعات المباشر - شركة NOSSER
                </h2>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full border bg-blue-500/20 text-blue-300 border-blue-400/40">
                  مبيعات فورية معتمدة
                </span>
                <span className="text-[10px] bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  نظام مبيعات موحد
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-300">
                نظام متكامل لإدارة أصناف المبيعات، إدخال المشتريات بالأسعار، وإصدار وطباعة فواتير المبيعات الفورية
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isGeneralManager && (
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-blue-900/30 cursor-pointer"
              >
                <Package className="w-4 h-4" />
                <span>إضافة أصناف وتوريدات جديدة</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsInventoryReportOpen(true)}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-emerald-900/30 cursor-pointer border border-emerald-600"
              title="معاينة وطباعة كشف جرد المخزون الحالي (Ctrl + P)"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كشف الجرد (Ctrl + P)</span>
            </button>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <ArrowRight className="w-4 h-4" />
                <span>رجوع</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي أصناف المبيعات المسجلة</p>
            <p className="text-lg font-black text-slate-900 font-mono">{toArabicNumerals(metrics.totalItems)} صنف</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي القطع المتوفرة للبيع</p>
            <p className="text-lg font-black text-emerald-700 font-mono">{toArabicNumerals(metrics.totalUnits)} وحدة</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">أصناف تحتاج إعادة توريد (منخفضة)</p>
            <p className="text-lg font-black text-amber-700 font-mono">{toArabicNumerals(metrics.lowStockCount)} صنف</p>
          </div>
        </div>
      </div>

      {/* SPLIT VIEW LAYOUT: Product Table (Left) + Dedicated Sales Invoice Details & Cart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        
        {/* MAIN SECTION: Product Search & Table (8 cols on Desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4 lg:order-2">
          
          {/* Top Header Controls: Smart Search + Add Product */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex-1">
              <SmartSearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                totalResultsCount={filteredProducts.length}
              />
            </div>

            {isGeneralManager && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة صنف جديد</span>
                </button>
                <button
                  type="button"
                  onClick={openBatchAddModal}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="شاشة إدخال البيانات والتوريدات من إكسل مع تحديد الأسعار"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>إدخال مشتريات (إكسل)</span>
                </button>
              </div>
            )}
          </div>

          {/* Selected Product Quick Info Bar (Single Selection Indicator) */}
          {selectedProductId && (() => {
            const selProd = catalogProducts.find(p => String(p.id) === String(selectedProductId));
            if (!selProd) return null;
            const inCart = Boolean(cartItems.some(item => String(item.product?.id) === String(selProd.id)));

            return (
              <div className="bg-blue-50/90 border border-blue-200 p-3 rounded-xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
                <div className="flex items-center gap-2 text-blue-950 font-bold flex-wrap">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded font-mono font-black text-[11px]">
                    {selProd.code}
                  </span>
                  <span className="font-extrabold text-sm">{selProd.name}</span>
                  <span className="text-slate-500 font-normal">| الرصيد المتاح: {toArabicNumerals(selProd.stock)} {selProd.unit || 'وحدة'}</span>
                  <span className="text-emerald-700 font-bold">| التصنيف: {selProd.category || 'عام'}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleProductCart(selProd)}
                    className={`px-3 py-1.5 rounded-lg font-extrabold text-xs flex items-center gap-1 transition cursor-pointer ${
                      inCart
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{inCart ? 'موجود بالفاتورة' : 'إضافة لفاتورة المبيعات'}</span>
                  </button>
                  {isGeneralManager && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditModal(selProd)}
                        className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProductConfirm(selProd.id, selProd.name)}
                        className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>حذف</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Product List Table: Main sales catalog */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-400" />
                <span>قائمة أصناف المبيعات (انقر لتحديد الصنف، أو اضغط زر السلة لإضافته لفاتورة المبيعات)</span>
              </span>
              <span className="text-[11px] font-mono text-slate-300">
                {toArabicNumerals(filteredProducts.length)} صنف
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-xs">
                    <th className="p-3.5 w-32 font-mono">كود الصنف (Item Code)</th>
                    <th className="p-3.5">اسم الصنف (Item Name)</th>
                    <th className="p-3.5 w-28 text-center bg-emerald-50/80 text-emerald-950 font-black">السعر (ج.س)</th>
                    <th className="p-3.5 w-28 text-center bg-blue-50/70">الرصيد المتوفر</th>
                    <th className="p-3.5 w-28 text-center">حالة المخزون</th>
                    <th className="p-3.5 w-28 text-center">فاتورة المبيعات</th>
                    {isGeneralManager && (
                      <th className="p-3.5 w-24 text-center">إجراءات</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={isGeneralManager ? 8 : 7} className="p-12 text-center text-slate-400">
                        <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-600" />
                        <p className="font-bold text-sm text-slate-700">لا توجد أصناف تطابق البحث</p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => {
                      const pId = String(product.id);
                      const isSelected = selectedProductId !== null && pId === String(selectedProductId);
                      const inCart = Boolean(cartItems.some(item => String(item.product?.id) === pId));
                      const isOutOfStock = product.stock <= 0;
                      const isLowStock = product.stock > 0 && product.stock <= (product.minStock || 5);
                      const unitPrice = Number(product.price ?? (product as any).unit_price ?? 0);

                      return (
                        <tr
                          key={pId}
                          onClick={() => setSelectedProductId(prev => prev === pId ? null : pId)}
                          onDoubleClick={() => handleToggleProductCart(product)}
                          className={`transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'bg-blue-100/90 ring-2 ring-inset ring-blue-500 font-bold'
                              : inCart
                              ? 'bg-emerald-50/70 border-r-4 border-r-emerald-500'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Code */}
                          <td className="p-3.5 font-mono font-black text-blue-900 text-xs sm:text-sm">
                            {toArabicNumerals(product.code)}
                          </td>

                          {/* Item Name */}
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              {inCart && (
                                <span className="bg-emerald-600 text-white p-0.5 rounded-full shrink-0" title="موجود في فاتورة المبيعات">
                                  <Check className="w-3 h-3" />
                                </span>
                              )}
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                {product.name}
                              </span>
                            </div>
                          </td>


                          {/* Unit Price (السعر) */}
                          <td className="p-3.5 text-center font-mono font-black text-xs sm:text-sm text-emerald-800 bg-emerald-50/40">
                            {toArabicNumerals(unitPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ج.س
                          </td>

                          {/* Available Stock */}
                          <td className="p-3.5 text-center font-mono font-black text-xs sm:text-sm bg-blue-50/40">
                            <span className={isOutOfStock ? 'text-rose-600 font-black' : isLowStock ? 'text-amber-700 font-black' : 'text-slate-900 font-black'}>
                              {toArabicNumerals(product.stock)} {product.unit || 'وحدة'}
                            </span>
                          </td>

                          {/* Status Badge */}
                          <td className="p-3.5 text-center">
                            {isOutOfStock ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                نفد الرصيد
                              </span>
                            ) : isLowStock ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                رصيد منخفض
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                متوفر للبيع
                              </span>
                            )}
                          </td>

                          {/* Cart Add Button */}
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => handleToggleProductCart(product)}
                              className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center mx-auto ${
                                isOutOfStock
                                  ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400'
                                  : inCart
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                                  : 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200'
                              }`}
                              title={inCart ? 'إزالة من فاتورة المبيعات' : 'إضافة إلى فاتورة المبيعات'}
                            >
                              <ShoppingCart className="w-4 h-4" />
                            </button>
                          </td>

                          {/* Actions */}
                          {isGeneralManager && (
                            <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(product)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="تعديل الصنف"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProductConfirm(product.id, product.name)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="حذف الصنف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* SIDE SECTION: Sales Invoice & Cart Controls (4-5 cols on Desktop) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 lg:order-1">
          
          {/* CARD 1: Sales Invoice Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm sm:text-base">بيانات فاتورة المبيعات</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-md font-black">
                فاتورة فورية
              </span>
            </div>

            <div className="p-4 space-y-3.5 bg-slate-50/50">
              {/* Document Serial Number Field */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>رقم فاتورة المبيعات (تلقائي ومحمي):</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">محمي</span>
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={getNextInvoiceNo()}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono font-black text-blue-950 cursor-not-allowed select-none shadow-inner"
                />
              </div>

              {/* Recipient / Customer Name Field */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>اسم العميل / المستلم:</span>
                  </span>
                  <span className="text-[10px] text-rose-600 font-extrabold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">إجباري للطباعة</span>
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Find the print button or focus it to trigger
                      const printBtn = document.querySelector('button[title*="إصدار وطباعة"]') as HTMLButtonElement;
                      if (printBtn) printBtn.focus();
                    }
                  }}
                  placeholder="أدخل اسم العميل أو الجهة المستلمة هنا..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition shadow-2xs"
                />
              </div>

              {/* Totals Summary including Grand Total on demand */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 text-xs font-bold shadow-2xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>إجمالي بنود الفاتورة:</span>
                  <strong className="text-blue-800 font-mono text-sm">{toArabicNumerals(cartTotals.totalItems)} صنف</strong>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>إجمالي الكميات المباعة:</span>
                  <span className="text-slate-900 font-mono font-black text-sm">
                    {toArabicNumerals(cartTotals.totalQuantity)} قطعة
                  </span>
                </div>
                {cartTotals.totalOrderValue > 0 && (
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-slate-900">
                    <span className="font-extrabold text-blue-950">القيمة الكلية للفاتورة (الإجمالي):</span>
                    <span className="text-emerald-700 font-mono font-black text-base">
                      {toArabicNumerals(cartTotals.totalOrderValue.toLocaleString())} ج.س
                    </span>
                  </div>
                )}
              </div>

              {!recipientName.trim() && cartItems.length > 0 && (
                <p className="text-[11px] font-extrabold text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-center">
                  ⚠️ يرجى كتابة اسم العميل / المستلم لتفعيل زر الطباعة
                </p>
              )}

              {/* Print Action Button */}
              <button
                type="button"
                disabled={isSubmitting || cartItems.length === 0 || !recipientName.trim()}
                onClick={handleCompleteInvoice}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-blue-200/50 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التوليد...' : 'إصدار وطباعة فاتورة مبيعات (Ctrl + P)'}</span>
              </button>
            </div>
          </div>

          {/* CARD 2: Sales Invoice Items List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-xs sm:text-sm">سلة فاتورة المبيعات</h3>
                <span className="bg-blue-600/60 text-blue-200 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
                  {toArabicNumerals(cartItems.length)}
                </span>
              </div>
              
              {cartItems.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-300 hover:text-rose-100 font-bold transition flex items-center gap-1 cursor-pointer bg-slate-800 px-2 py-1 rounded-lg border border-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>تفريغ السلة</span>
                </button>
              )}
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 text-rose-800 text-xs font-bold border-b border-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Cart Items List */}
            <div className="p-3 overflow-y-auto space-y-2.5 max-h-[480px]">
              {cartItems.length === 0 ? (
                <div className="py-12 text-center space-y-2.5 flex flex-col items-center justify-center text-slate-400">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <ShoppingCart className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="font-extrabold text-xs text-slate-700">
                    سلة فاتورة المبيعات فارغة حالياً
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    اضغط مباشرة على أي صنف من قائمة الأصناف لإضافته فوراً إلى فاتورة المبيعات.
                  </p>
                </div>
              ) : (
                cartItems.map((cartItem, idx) => {
                  const product = cartItem.product;
                  const quantity = cartItem.quantity;
                  const unitPrice = Number(
                    cartItem.unitPrice ?? 
                    (cartItem as any)?.unit_price ?? 
                    (cartItem as any)?.price ?? 
                    product.price ?? 
                    (product as any)?.unit_price ?? 
                    0
                  );
                  const subtotal = unitPrice * quantity;

                  return (
                    <div
                      key={product.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl space-y-2.5 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-mono text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded-md">
                            كود: {toArabicNumerals(product.code)}
                          </span>
                          <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                            {idx + 1}. {product.name}
                          </h4>
                        </div>

                        <button
                          onClick={() => handleRemoveFromCart(product.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="حذف من الفاتورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Quantity Input */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-[11px] font-bold text-slate-600">الكمية المباعة:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val > 0) {
                                handleUpdateCartQuantity(product.id, val);
                              }
                            }}
                            className="w-16 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-center text-sm focus:border-blue-600 focus:outline-none shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQuantity(product.id, quantity + 1)}
                            className="w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center font-bold text-lg transition cursor-pointer shadow-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Price and Subtotal Info */}
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-200/60 font-bold">
                        <div className="text-slate-600 flex items-center gap-1">
                          <span>سعر الوحدة:</span>
                          <span className="font-mono text-emerald-700 font-black">
                            {toArabicNumerals(unitPrice.toLocaleString())} ج.س
                          </span>
                        </div>
                        <div className="text-slate-900 flex items-center gap-1">
                          <span className="text-slate-500">الإجمالي:</span>
                          <span className="font-mono text-blue-900 font-black">
                            {toArabicNumerals(subtotal.toLocaleString())} ج.س
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* SINGLE ITEM ADD / EDIT PRODUCT MODAL (Data entry screen includes Unit Price, NO Total column here) */}
      {isModalOpen && (
        <div className="modal-overlay-stable">
          <div className="modal-content-stable bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                {editingProduct ? (
                  <>
                    <Edit2 className="w-5 h-5 text-blue-600" />
                    <span>تعديل بيانات صنف المبيعات</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-emerald-600" />
                    <span>إدخال صنف مبيعات جديد (عملية شراء/توريد)</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">الكود / Serial Number</label>
                  <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    تلقائي ومحمي - يبدأ بـ NOSSER-
                  </span>
                </div>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={code}
                  className="w-full px-3 py-2 text-xs border border-slate-300 bg-slate-100 rounded-xl font-mono font-black text-slate-700 cursor-not-allowed select-none shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصنف بالكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شواية فراخ دوار..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد / الكمية المسجلة *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر الوحدة (ج.س) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    title="حدد سعر الوحدة أثناء الإدخال"
                    className="w-full px-3 py-2 text-xs border border-blue-400 rounded-xl font-mono font-bold focus:border-blue-600 focus:outline-none bg-blue-50/30 text-blue-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="عام"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="وحدة"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'جاري الحفظ...' : editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* SALES INVOICE PRINT MODAL */}
      <DeliveryOrderModal
        items={activeDeliveryItems || []}
        orderNumber={activeDeliveryOrderNo}
        recipientName={activeRecipientName}
        onClose={() => {
          setActiveDeliveryItems(null);
          setActiveDeliveryOrderNo('');
        }}
      />

      {/* INVENTORY REPORT MODAL */}
      <InventoryReportModal
        isOpen={isInventoryReportOpen}
        onClose={() => setIsInventoryReportOpen(false)}
        products={catalogProducts}
        warehouseName="نظام المبيعات المباشر"
        operatorName={currentUser?.name || 'مسؤول المبيعات المعتمد'}
      />

    </div>
  );
};
