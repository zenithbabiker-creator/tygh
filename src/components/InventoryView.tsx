import React, { useState, useMemo, useEffect } from 'react';
import { Product, User, StockMovement } from '../types';
import { SmartSearchBar } from './SmartSearchBar';
import { searchAndRank, toArabicNumerals } from '../lib/arabicUtils';
import { DeliveryOrderModal, DispatchItem } from './DeliveryOrderModal';
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
  Building,
  User as UserIcon,
  DollarSign
} from 'lucide-react';

interface InventoryViewProps {
  products: Product[];
  currentUser: User | null;
  movements?: StockMovement[];
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
    items: Array<{ productId: string; quantity: number }>;
    reason: string;
    referenceNo: string;
  }) => Promise<{ success: boolean; message?: string; movements?: StockMovement[] }>;
  onBack?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  currentUser,
  movements = [],
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

  // Product Add / Edit Modal & Dedicated Standalone Batch Screen
  const [isBatchAddMode, setIsBatchAddMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stock, setStock] = useState<string>('0');
  const [price, setPrice] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('5');

  // Interactive Table Grid State for Excel Copy-Paste & Batch Add
  const [gridRows, setGridRows] = useState<Array<{ id: string; code: string; name: string; stock: string; price: string }>>([]);
  const [pasteMessage, setPasteMessage] = useState('');

  // Side Cart for "الفاتورة"
  const [cartItems, setCartItems] = useState<Array<{ product: Product; quantity: number; unitPrice: number }>>([]);
  const [recipientName, setRecipientName] = useState<string>('');
  const [activeDeliveryItems, setActiveDeliveryItems] = useState<DispatchItem[] | null>(null);
  const [activeDeliveryOrderNo, setActiveDeliveryOrderNo] = useState<string>('');
  const [activeRecipientName, setActiveRecipientName] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Keyboard shortcut Ctrl + P handler to trigger invoice print with mandatory field validation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        // If the invoice modal is already open, let the modal handle it
        if (activeDeliveryItems && activeDeliveryItems.length > 0) {
          return;
        }

        e.preventDefault();
        if (cartItems.length === 0) {
          alert('💡 تنبيه: سلة الفاتورة فارغة حالياً.\n\nخطوات الطباعة:\n1. انقر على الصنف لإضافته إلى الفاتورة.\n2. اكتب "اسم المستلم / العميل".\n3. اضغط على زر "إصدار وطباعة الفاتورة" أو اختصار (Ctrl + P).');
          return;
        }
        if (!recipientName.trim()) {
          alert('⚠️ تنبيه هام: يرجى كتابة "اسم المستلم / العميل" في الحقل المخصص بالسلة قبل طباعة الفاتورة.');
          return;
        }
        handleCompleteInvoice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems, recipientName, activeDeliveryItems]);

  // Key Inventory Metrics
  const metrics = useMemo(() => {
    const totalItems = products.length;
    const totalUnits = products.reduce((acc, p) => acc + p.stock, 0);
    const totalValue = products.reduce((acc, p) => acc + (p.stock * (p.price || 0)), 0);
    return { totalItems, totalUnits, totalValue };
  }, [products]);

  // Filter products using Arabic Smart Search Engine
  const filteredProducts = useMemo(() => {
    return searchAndRank(products, searchTerm, (p: Product) => [p.name, p.code]);
  }, [products, searchTerm]);

  // Cart Calculations (Totals & Grand Total)
  const cartTotals = useMemo(() => {
    const totalQuantity = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const grandTotal = cartItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    return {
      totalItems: cartItems.length,
      totalQuantity,
      grandTotal,
    };
  }, [cartItems]);

  // Direct Click-to-Add to Side Invoice Cart
  const handleToggleProductCart = (product: Product) => {
    const liveProd = products.find(p => p.id === product.id) || product;
    if (liveProd.stock <= 0) {
      alert(`عفواً، الصنف (${liveProd.name}) غير متوفر بالمخزن حالياً (الرصيد المتاح: 0).`);
      return;
    }

    const defaultPrice = typeof liveProd.price === 'number' ? liveProd.price : 0;

    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= liveProd.stock) {
          alert(`تنبيه: الرصيد المتاح من (${liveProd.name}) هو ${liveProd.stock} قطعة فقط. لا يمكن تجاوز هذا الرصيد.`);
          return prev;
        }
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, product: liveProd }
            : item
        );
      } else {
        return [...prev, { product: liveProd, quantity: 1, unitPrice: defaultPrice }];
      }
    });
  };

  const handleUpdateCartQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    const liveProd = products.find(p => p.id === productId);
    const maxStock = liveProd ? liveProd.stock : 0;

    if (newQty > maxStock) {
      alert(`عفواً، الرصيد المتاح بالمخزن للصنف (${liveProd?.name || ''}) هو ${maxStock} قطعة فقط! لا يمكن طلب ${newQty} قطعة.`);
      newQty = maxStock;
    }

    setCartItems(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQty, product: liveProd || item.product }
          : item
      )
    );
  };

  const handleUpdateCartPrice = (productId: string, newPrice: number) => {
    const validPrice = Math.max(0, isNaN(newPrice) ? 0 : newPrice);
    setCartItems(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, unitPrice: validPrice }
          : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Sequential Invoice Number Generator starting from 1 (1, 2, 3, 4...)
  const getNextInvoiceNo = (): string => {
    let maxSeq = 0; // Starts at 0 so first document is 1

    try {
      const savedSeq = localStorage.getItem('nasser_last_delivery_order_seq_v2');
      if (savedSeq) {
        const parsedSeq = parseInt(savedSeq, 10);
        if (!isNaN(parsedSeq) && parsedSeq > maxSeq) {
          maxSeq = parsedSeq;
        }
      }
    } catch (e) {
      // ignore
    }

    const allMovements = movements || [];
    let savedMovements: StockMovement[] = [];
    try {
      const raw = localStorage.getItem('nasser_warehouse_movements_v1');
      if (raw) savedMovements = JSON.parse(raw);
    } catch (e) {
      // ignore
    }

    const combined = [...allMovements, ...savedMovements];

    combined.forEach(m => {
      if (m.referenceNo) {
        const match = m.referenceNo.match(/\d+/g);
        if (match) {
          const val = parseInt(match.join(''), 10);
          if (!isNaN(val) && val > maxSeq) {
            maxSeq = val;
          }
        }
      }
    });

    return String(maxSeq + 1);
  };

  // Complete Order & Print Invoice Document
  const handleCompleteInvoice = async () => {
    if (cartItems.length === 0) return;
    if (!recipientName.trim()) {
      alert('تنبيه هام: يرجى كتابة اسم المستلم / العميل قبل طباعة الفاتورة.');
      return;
    }

    // Pre-flight validation: check all cart items against current stock
    for (const item of cartItems) {
      const liveProd = products.find(p => p.id === item.product.id);
      const available = liveProd ? liveProd.stock : item.product.stock;
      if (item.quantity > available) {
        alert(`خطأ في العملية: الكمية المطلوبة للصنف (${item.product.name}) هي ${item.quantity} ولكن الرصيد المتاح هو ${available} فقط! يرجى تعديل الكمية أولاً.`);
        return;
      }
      if (available <= 0) {
        alert(`خطأ في العملية: الصنف (${item.product.name}) غير متوفر بالمخزن (الرصيد: 0). يرجى إزالته من الفاتورة.`);
        return;
      }
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const finalOrderNo = getNextInvoiceNo();

      // Persist generated invoice sequence number immediately
      const numVal = parseInt(finalOrderNo, 10);
      if (!isNaN(numVal)) {
        try {
          const currentSeq = parseInt(localStorage.getItem('nasser_last_delivery_order_seq_v2') || '0', 10);
          if (numVal >= currentSeq) {
            localStorage.setItem('nasser_last_delivery_order_seq_v2', String(numVal));
          }
        } catch (e) {
          // ignore
        }
      }

      const dispatchItemsToPrint: DispatchItem[] = cartItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      }));

      // Use atomic batch movement if available (100% resilient against Database Lock)
      if (onBatchStockMovement) {
        const res = await onBatchStockMovement({
          items: cartItems.map(item => ({
            productId: String(item.product.id || item.product.code || ''),
            productCode: item.product.code || '',
            productName: item.product.name || '',
            quantity: item.quantity,
          })),
          referenceNo: finalOrderNo,
          reason: `فاتورة مبيعات - المستلم/العميل: ${recipientName.trim()}`,
        });

        if (res && res.success === false) {
          const errMsg = res.message || 'فشلت عملية صرف الفاتورة، يرجى مراجعة البيانات';
          setFormError(errMsg);
          return;
        }
      } else {
        // Fallback for sequential stock movement
        for (const item of cartItems) {
          const res = await onStockMovement({
            productId: String(item.product.id || item.product.code || ''),
            productCode: item.product.code || '',
            productName: item.product.name || '',
            type: 'OUT',
            quantity: item.quantity,
            reason: `فاتورة مبيعات - المستلم/العميل: ${recipientName.trim()}`,
            referenceNo: finalOrderNo,
          });

          if (res && res.success === false) {
            const errMsg = res.message || 'فشلت عملية صرف الصنف بالفاتورة';
            setFormError(errMsg);
            return;
          }
        }
      }

      // Open Modal for immediate print
      setActiveDeliveryItems(dispatchItemsToPrint);
      setActiveDeliveryOrderNo(finalOrderNo);
      setActiveRecipientName(recipientName.trim());

      // Reset cart and recipient
      setCartItems([]);
      setRecipientName('');
    } catch (err: any) {
      console.error('Invoice execution error:', err);
      setFormError('حدث خطأ أثناء معالجة الفاتورة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Automated Next Sequential Code Generator (NASSER-101, NASSER-102... or NASSER-1001...)
  const generateNextCode = (currentList: Product[] = products): string => {
    let maxNum = 100;
    currentList.forEach(p => {
      const match = p.code.match(/^(?:NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    return `NASSER-${maxNum + 1}`;
  };

  // Open Add Product Modal (Single or Batch Mode)
  const openAddModal = () => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات إضافة وتعديل الأصناف هي صلاحيات حصرية للمدير العام (الحساب الرئيسي) فقط.');
      return;
    }
    setEditingProduct(null);
    setCode(generateNextCode());
    setName('');
    setStock('1');
    setPrice('0');
    setMinStock('5');
    setFormError('');

    // Pre-populate 5 clean rows in grid table with standardized NASSER- prefix
    let startingNum = 100;
    products.forEach(p => {
      const match = p.code.match(/^(?:NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > startingNum) startingNum = num;
      }
    });

    const initialFive = Array.from({ length: 5 }, (_, i) => ({
      id: `row_${Date.now()}_${i}`,
      code: `NASSER-${startingNum + 1 + i}`,
      name: '',
      stock: '1',
      price: '0',
    }));
    setGridRows(initialFive);
    setPasteMessage('');
    setIsBatchAddMode(true);
  };

  // Process Pasted Text from Excel / Clipboard
  const processPastedText = (rawText: string) => {
    if (!rawText || !rawText.trim()) return;

    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return;

    let baseNum = 100;
    products.forEach(p => {
      const match = p.code.match(/^(?:NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > baseNum) baseNum = num;
      }
    });
    gridRows.forEach(r => {
      const match = r.code.match(/^(?:NASSER-)?(\d+)$/i) || r.code.match(/\d+/);
      if (match) {
        const num = parseInt(match[1] || match[0], 10);
        if (!isNaN(num) && num > baseNum) baseNum = num;
      }
    });

    const parsedRows: Array<{ id: string; code: string; name: string; stock: string; price: string }> = [];

    lines.forEach((line) => {
      // Split by tab (Excel copy), comma, or multiple spaces
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.includes(',')
        ? line.split(',')
        : line.split(/\s{2,}/);

      const cleanParts = parts.map(p => p.trim()).filter(Boolean);

      if (cleanParts.length === 0) return;

      baseNum += 1;
      let parsedCode = `NASSER-${baseNum}`;
      let parsedName = '';
      let parsedStock = '1';
      let parsedPrice = '0';

      if (cleanParts.length === 1) {
        parsedName = cleanParts[0];
      } else if (cleanParts.length === 2) {
        // [Name, Quantity] OR [Code, Name]
        if (!isNaN(Number(cleanParts[1]))) {
          parsedName = cleanParts[0];
          parsedStock = String(Math.max(0, parseInt(cleanParts[1], 10) || 1));
        } else {
          parsedCode = cleanParts[0].startsWith('NASSER-') ? cleanParts[0] : `NASSER-${cleanParts[0]}`;
          parsedName = cleanParts[1];
        }
      } else if (cleanParts.length === 3) {
        // [Name, Quantity, Price] OR [Code, Name, Quantity]
        if (!isNaN(Number(cleanParts[1])) && !isNaN(Number(cleanParts[2]))) {
          parsedName = cleanParts[0];
          parsedStock = String(Math.max(0, parseInt(cleanParts[1], 10) || 1));
          parsedPrice = String(Math.max(0, parseFloat(cleanParts[2]) || 0));
        } else {
          parsedCode = cleanParts[0].startsWith('NASSER-') ? cleanParts[0] : `NASSER-${cleanParts[0]}`;
          parsedName = cleanParts[1];
          parsedStock = String(Math.max(0, parseInt(cleanParts[2], 10) || 1));
        }
      } else if (cleanParts.length >= 4) {
        // [Code, Name, Quantity, Price]
        parsedCode = cleanParts[0].startsWith('NASSER-') ? cleanParts[0] : `NASSER-${cleanParts[0]}`;
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
      setPasteMessage(`✅ تم استيراد ولصق عدد (${parsedRows.length}) صنف من جدول Excel بنجاح.`);
      setTimeout(() => setPasteMessage(''), 5000);
    }
  };

  // Add 5 more empty rows to the grid
  const handleAddFiveRows = () => {
    setGridRows(prev => {
      let maxNum = 100;
      products.forEach(p => {
        const match = p.code.match(/^(?:NASSER-)?(\d+)$/i) || p.code.match(/\d+/);
        if (match) {
          const num = parseInt(match[1] || match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      prev.forEach(r => {
        const match = r.code.match(/^(?:NASSER-)?(\d+)$/i) || r.code.match(/\d+/);
        if (match) {
          const num = parseInt(match[1] || match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });

      const newFive: Array<{ id: string; code: string; name: string; stock: string; price: string }> = [];
      for (let i = 1; i <= 5; i++) {
        newFive.push({
          id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 5)}_${i}`,
          code: `NASSER-${maxNum + i}`,
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

  // Save Batch Products
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
        } else if (!finalCode.startsWith('NASSER-')) {
          finalCode = `NASSER-${finalCode}`;
        }
        return {
          code: finalCode,
          name: r.name.trim(),
          stock: parseInt(r.stock, 10) || 0,
          price: parseFloat(r.price) || 0,
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
          setFormError(res.message || 'فشلت عملية حفظ الأصناف بالمخزن');
        }
      } else {
        for (const item of itemsToSave) {
          await onAddProduct(item);
        }
        setIsBatchAddMode(false);
        setIsModalOpen(false);
      }
    } catch (err: any) {
      setFormError('حدث خطأ أثناء حفظ الأصناف بالمخزن');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Product Modal
  const openEditModal = (product: Product) => {
    if (!isGeneralManager) {
      alert('عفواً، خيارات تعديل بيانات الأصناف هي صلاحيات حصرية للمدير العام (الحساب الرئيسي) فقط.');
      return;
    }
    setEditingProduct(product);
    setCode(product.code);
    setName(product.name);
    setStock(String(product.stock));
    setPrice(String(product.price || 0));
    setMinStock(String(product.minStock || 5));
    setFormError('');
    setIsModalOpen(true);
  };

  // Save Add / Edit Product
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
      } else if (!formattedCode.startsWith('NASSER-')) {
        formattedCode = `NASSER-${formattedCode}`;
      }

      if (editingProduct) {
        const res = await onUpdateProduct(editingProduct.id, {
          code: formattedCode || editingProduct.code,
          name: name.trim(),
          stock: Math.max(0, parseInt(stock, 10) || 0),
          price: Math.max(0, parseFloat(price) || 0),
          minStock: Math.max(1, parseInt(minStock, 10) || 5),
          category: editingProduct.category || 'عام',
          unit: editingProduct.unit || 'وحدة',
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
          category: 'عام',
          stock: Math.max(0, parseInt(stock, 10) || 0),
          price: Math.max(0, parseFloat(price) || 0),
          minStock: Math.max(1, parseInt(minStock, 10) || 5),
          unit: 'وحدة',
          description: '',
        });
        if (res.success) {
          setIsModalOpen(false);
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
      alert('عفواً، خيارات حذف الأصناف هي صلاحيات حصرية للمدير العام (الحساب الرئيسي) فقط.');
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف الصنف "${nameStr}" نهائياً من قاعدة البيانات؟`)) {
      setCartItems(prev => prev.filter(item => item.product.id !== id && item.product.code !== id));
      await onDeleteProduct(id);
    }
  };

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
              <span>العودة إلى جدول الجرد والمخزن</span>
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Package className="w-6 h-6 text-blue-600" />
                <span>شاشة إضافة أصناف وتوريدات جديدة للمخزن</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                إدخال الأصناف والأسعار - ترقيم الأكواد أوتوماتيكياً - دعم اللصق المباشر من Excel (Ctrl + V)
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

        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-extrabold text-blue-950 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span>منطقة اللصق السريع المباشر من إكسل (Ctrl + V)</span>
            </label>
            <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg font-bold">
              نسخ الأعمدة (الاسم، الكمية، السعر)
            </span>
          </div>
          <textarea
            rows={3}
            placeholder="اضغط (Ctrl + V) هنا في هذه المنطقة أو في أي مكان بالشاشة لصق بيانات جدول الإكسل المنسوخ وسيقوم النظام بتنسيقها وتوزيع الخانات تلقائياً..."
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
                    <th className="p-3.5 w-44 sm:w-52">الكود / Serial Number (تلقائي ومحمي)</th>
                    <th className="p-3.5">اسم الصنف بالكامل</th>
                    <th className="p-3.5 w-32 sm:w-40 text-center">العدد / الكمية</th>
                    <th className="p-3.5 w-32 sm:w-40 text-center">سعر الصنف (الوحدة)</th>
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
                            placeholder="1001"
                            title="يتم توليد السيريال نمبر تلقائياً وغير قابل للتعديل اليدوي"
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
                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.price}
                            onChange={(e) => handleGridCellChange(row.id, 'price', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-black text-slate-900 text-center text-xs sm:text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-500 focus:outline-none shadow-xs"
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
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>إضافة (5) صفوف فارغة جديدة</span>
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
                  disabled={isSubmitting}
                  className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md shadow-blue-200 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري حفظ الأصناف...' : 'اعتماد وحفظ كافة الأصناف بالمخزن'}</span>
                </button>
              </div>
            </div>

          </div>
        </form>

      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Top Banner & Quick Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="space-y-1">
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight font-['Tajawal']">
            إدارة المخزن والمبيعات وإصدار الفواتير
          </h2>
          <p className="text-xs text-slate-500 font-semibold">
            نظام متكامل لإدارة الأصناف، الأسعار، الحساب الآلي للإجمالي، والطباعة الفورية للفواتير
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {isGeneralManager && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs transition flex items-center gap-2 shadow-md shadow-blue-200 cursor-pointer"
            >
              <Package className="w-4 h-4" />
              <span>إضافة أصناف وتوريدات جديدة</span>
            </button>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>رجوع</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي الأصناف المسجلة</p>
            <p className="text-lg font-black text-slate-900 font-mono">{toArabicNumerals(metrics.totalItems)} صنف</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي القطع المتوفرة بالمخزن</p>
            <p className="text-lg font-black text-emerald-700 font-mono">{toArabicNumerals(metrics.totalUnits)} وحدة</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي القيمة التقديرية للمخزون</p>
            <p className="text-lg font-black text-slate-900 font-mono">{toArabicNumerals(metrics.totalValue.toLocaleString())}</p>
          </div>
        </div>
      </div>

      {/* SPLIT VIEW LAYOUT: Main Table (Right/Center) + Side Invoice Cart Panel (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        
        {/* MAIN SECTION: Product Search & Table (2 cols on Desktop) */}
        <div className="lg:col-span-2 space-y-4">
          
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
              <button
                onClick={openAddModal}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-200 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            )}
          </div>

          {/* Product List Table with Direct Click-to-Add Behavior */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-400" />
                <span>قائمة أصناف المخزن والأسعار (الضغط على أي صنف يُضيفه مباشرة للفاتورة)</span>
              </span>
              <span className="text-[11px] font-mono text-slate-300">
                {toArabicNumerals(filteredProducts.length)} صنف
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 text-xs">
                    <th className="p-3.5 w-36 font-mono">كود الصنف (Item Code)</th>
                    <th className="p-3.5">اسم الصنف (Item Name)</th>
                    <th className="p-3.5 w-28 text-center bg-blue-50/70">عدد الصنف (الكمية)</th>
                    <th className="p-3.5 w-28 text-center bg-emerald-50/70">سعر الصنف (الوحدة)</th>
                    {isGeneralManager && (
                      <th className="p-3.5 w-28 text-center">إجراءات (تعديل / حذف)</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={isGeneralManager ? 5 : 4} className="p-12 text-center text-slate-400">
                        <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-600" />
                        <p className="font-bold text-sm text-slate-700">لا توجد أصناف مخزنية تطابق البحث</p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => {
                      const inCart = cartItems.find(item => item.product.id === product.id);
                      const isOutOfStock = product.stock <= 0;

                      return (
                        <tr
                          key={product.id}
                          onClick={() => handleToggleProductCart(product)}
                          className={`transition-all cursor-pointer select-none ${
                            inCart
                              ? 'bg-emerald-50/90 border-r-4 border-r-emerald-600 font-bold'
                              : 'hover:bg-blue-50/60'
                          }`}
                        >
                          {/* Code / Serial */}
                          <td className="p-3.5 font-mono font-black text-blue-900 text-xs sm:text-sm">
                            {toArabicNumerals(product.code)}
                          </td>

                          {/* Item Name */}
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              {inCart && (
                                <span className="bg-emerald-600 text-white p-0.5 rounded-full shrink-0">
                                  <Check className="w-3 h-3" />
                                </span>
                              )}
                              <p className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug">
                                {product.name}
                              </p>
                            </div>
                          </td>

                          {/* Item Quantity / Count */}
                          <td className="p-3.5 text-center font-black font-mono text-sm sm:text-base bg-blue-50/30">
                            <span className={isOutOfStock ? 'text-rose-600' : 'text-slate-900'}>
                              {toArabicNumerals(product.stock)} <span className="text-[11px] font-sans text-slate-500">{product.unit || 'وحدة'}</span>
                            </span>
                          </td>

                          {/* Item Price */}
                          <td className="p-3.5 text-center font-black font-mono text-sm sm:text-base bg-emerald-50/30 text-emerald-800">
                            {toArabicNumerals(Number(product.price || 0).toLocaleString())}
                          </td>

                          {/* Actions: Edit & Delete (General Manager only) */}
                          {isGeneralManager && (
                            <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(product);
                                  }}
                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition cursor-pointer border border-blue-200"
                                  title="تعديل الصنف"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProductConfirm(product.id, product.name);
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer border border-rose-200"
                                  title="حذف الصنف"
                                >
                                  <Trash2 className="w-4 h-4" />
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

        {/* SIDE PANEL: Invoice Cart Preview (1 col on Desktop) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-6 flex flex-col min-h-[500px]">
            
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm sm:text-base">معاينة الفاتورة</h3>
              </div>
              
              {cartItems.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-300 hover:text-rose-100 font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>تفريغ</span>
                </button>
              )}
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3 bg-rose-50 text-rose-800 text-xs font-bold border-b border-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Added Items List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 max-h-[420px]">
              {cartItems.length === 0 ? (
                <div className="h-full py-16 text-center space-y-3 flex flex-col items-center justify-center text-slate-400">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <ShoppingCart className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="font-extrabold text-xs text-slate-700 max-w-xs">
                    سلة الفاتورة فارغة حالياً
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                    اضغط مباشرة على أي صنف من القائمة لإضافته فوراً إلى الفاتورة.
                  </p>
                </div>
              ) : (
                cartItems.map(({ product, quantity, unitPrice }, idx) => {
                  const itemTotalPrice = quantity * unitPrice;
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

                      {/* Quantity & Unit Price Inputs */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                        {/* Quantity */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">العدد (الكمية):</label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateCartQuantity(product.id, quantity - 1)}
                              className="w-6 h-6 bg-white hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center justify-center text-slate-700 font-bold text-xs transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="number"
                              min="1"
                              value={quantity || ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  handleUpdateCartQuantity(product.id, 0);
                                } else {
                                  const parsed = parseInt(raw, 10);
                                  if (!isNaN(parsed) && parsed > 0) {
                                    handleUpdateCartQuantity(product.id, parsed);
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (quantity <= 0) {
                                  handleUpdateCartQuantity(product.id, 1);
                                }
                              }}
                              className="w-12 px-1 py-0.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-center text-xs focus:border-blue-600 focus:outline-none"
                            />

                            <button
                              type="button"
                              onClick={() => handleUpdateCartQuantity(product.id, (quantity || 0) + 1)}
                              className="w-6 h-6 bg-white hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center justify-center text-slate-700 font-bold text-xs transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Unit Price */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">سعر الوحدة:</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={unitPrice}
                            onChange={(e) => handleUpdateCartPrice(product.id, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono font-black text-left text-xs focus:border-blue-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Row Total Price */}
                      <div className="flex items-center justify-between text-[11px] font-bold bg-white p-1.5 rounded-lg border border-slate-200">
                        <span className="text-slate-600">السعر الإجمالي للصنف:</span>
                        <span className="font-mono font-black text-emerald-700">
                          {toArabicNumerals(itemTotalPrice.toLocaleString())}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Primary Confirm & Print Action Button */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              {/* Recipient Input & Order Serial Number */}
              <div className="space-y-3">
                {/* Document Serial Number Field (Locked Official Sequential Number) */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>رقم الفاتورة التسلسلي (تلقائي غير قابل للتعديل):</span>
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-black">
                      تسلسلي رسمي
                    </span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={getNextInvoiceNo()}
                    className="w-full px-3.5 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono font-black text-blue-950 cursor-not-allowed select-none shadow-inner"
                  />
                </div>

                {/* Recipient Name Field */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1 flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>اسم المستلم / العميل (إجباري للطباعة):</span>
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="أدخل اسم العميل أو المستلم..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs font-bold">
                <div className="flex items-center justify-between text-slate-600">
                  <span>إجمالي البنود:</span>
                  <strong className="text-blue-800 font-mono">{toArabicNumerals(cartTotals.totalItems)} صنف</strong>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>إجمالي الكميات / القطع:</span>
                  <strong className="text-slate-800 font-mono">{toArabicNumerals(cartTotals.totalQuantity)} قطعة</strong>
                </div>
                <div className="flex items-center justify-between text-slate-900 pt-1.5 border-t border-slate-100 font-extrabold">
                  <span className="text-sm">الإجمالي الكلي للفاتورة:</span>
                  <span className="text-base text-emerald-700 font-mono font-black">
                    {toArabicNumerals(cartTotals.grandTotal.toLocaleString())}
                  </span>
                </div>
              </div>

              {!recipientName.trim() && cartItems.length > 0 && (
                <p className="text-[11px] font-extrabold text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-center">
                  ⚠️ يجب تعبئة اسم المستلم / العميل لتفعيل زر الطباعة
                </p>
              )}

              <button
                type="button"
                disabled={isSubmitting || cartItems.length === 0 || !recipientName.trim()}
                onClick={handleCompleteInvoice}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-emerald-100 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التوليد...' : 'إصدار وطباعة الفاتورة (Ctrl + P)'}</span>
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* SINGLE ITEM EDIT PRODUCT MODAL */}
      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <span>تعديل بيانات الصنف المخزني</span>
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
                    تلقائي ومحمي - غير قابل للتعديل
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
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصنف بالكامل</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد المتاح بالمخزن</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val) || val < 0) {
                        setStock('0');
                      } else {
                        setStock(String(val));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر الصنف (الوحدة)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={price}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 0) {
                        setPrice('0');
                      } else {
                        setPrice(String(val));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono font-bold focus:border-blue-600 focus:outline-none"
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
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تحديث بيانات الصنف</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* AUTOMATIC INVOICE PRINT PREVIEW MODAL */}
      <DeliveryOrderModal
        movement={null}
        items={activeDeliveryItems || undefined}
        orderNumber={activeDeliveryOrderNo}
        recipientName={activeRecipientName}
        onClose={() => {
          setActiveDeliveryItems(null);
          setActiveDeliveryOrderNo('');
          setActiveRecipientName('');
        }}
      />

    </div>
  );
};
