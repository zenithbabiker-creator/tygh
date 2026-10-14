import React, { useState, useEffect } from 'react';
import { generatePySideScript } from '../lib/pysideScriptGenerator';
import { Download, Copy, Check, Monitor, Terminal, FileCode, Printer, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

interface PrinterItem {
  name: string;
  isDefault: boolean;
  isPhysical: boolean;
  isPreferred: boolean;
}

export const DesktopAppTab: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [preferredPrinter, setPreferredPrinter] = useState<string>('');
  const [loadingPrinters, setLoadingPrinters] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const pythonScript = generatePySideScript();

  const fetchPrinters = async () => {
    try {
      setLoadingPrinters(true);
      const res = await fetch('/api/printers');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.printers)) {
          setPrinters(data.printers);
          const pref = data.preferredPrinter || '';
          setPreferredPrinter(pref);
          if (pref) {
            setSelectedPrinter(pref);
          } else {
            const firstPhys = data.printers.find((p: PrinterItem) => p.isPhysical);
            if (firstPhys) setSelectedPrinter(firstPhys.name);
          }
        }
      }
    } catch (e) {
      // Ignored in purely web dev preview
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    fetchPrinters();
  }, []);

  const handleSavePreferredPrinter = async () => {
    if (!selectedPrinter) return;
    try {
      const res = await fetch('/api/printers/preferred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName: selectedPrinter })
      });
      if (res.ok) {
        setPreferredPrinter(selectedPrinter);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(pythonScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([pythonScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nasser_company_app.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const physicalPrinters = printers.filter(p => p.isPhysical);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0F172A] to-blue-950 text-white p-6 rounded-2xl shadow-lg border border-blue-900 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-6 h-6 text-blue-400" />
            <h3 className="text-xl font-extrabold font-['Tajawal'] flex items-center gap-2">
              <span>تطبيق سطح المكتب المباشر لنظام الويندوز (Windows .exe)</span>
              <span className="text-xs font-mono font-bold bg-blue-500/30 text-blue-300 border border-blue-400/40 px-2 py-0.5 rounded-full">v3.0.2</span>
            </h3>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            كود برمجية بايثون المتكامل بـ PySide6 وقاعدة بيانات SQLite المستقلة تماماً يعمل أوفلاين 100%. يمكنك تنزيله وبنائه إلى ملف .exe لتشغيله مباشرة على أجهزة الشركة بدون إنترنت.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'تم النسخ!' : 'نسخ الكود الكامل'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md shadow-blue-900 transition"
          >
            <Download className="w-4 h-4" />
            <span>تحميل سكريبت (nasser_app.py)</span>
          </button>
        </div>
      </div>

      {/* Printer Configuration & Anti-SavePrintOutputAs Box */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                إدارة طابعة الفواتير المعتمدة (حل مشكلة Save Print Output As)
              </h4>
              <p className="text-xs text-slate-500">
                يقوم التطبيق بالطباعة الصامتة المباشرة إلى الطابعة الفيزيائية المختارة هنا وتخطي طابعات PDF الوهمية تلقائياً
              </p>
            </div>
          </div>

          <button
            onClick={fetchPrinters}
            disabled={loadingPrinters}
            className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
            <span>تحديث الطابعات المتصلة</span>
          </button>
        </div>

        {printers.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="text-xs font-bold text-slate-700 shrink-0">
                اختر طابعتك الفيزيائية الحقيقية:
              </label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-2.5 font-bold focus:ring-2 focus:ring-blue-500 flex-1 w-full sm:w-auto"
              >
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isPhysical ? '✓ (طابعة حقيقية)' : '⚠️ (طابعة وهمية/PDF)'} {p.isDefault ? '[افتراضية ويندوز]' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={handleSavePreferredPrinter}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>تثبيت كطابعة دائمة للفواتير</span>
              </button>
            </div>

            {saveSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded-lg flex items-center gap-2 border border-emerald-200 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تم اعتماد الطابعة [{preferredPrinter}] بنجاح! سيتم إرسال كافة الفواتير إليها مباشرة بصمت.</span>
              </div>
            )}

            {physicalPrinters.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <strong>تنبيه ويندوز: جميع الطابعات الحالية هي طابعات وهمية (مثل Microsoft Print to PDF)!</strong>
                  <p className="text-[11px] text-amber-800">
                    سبب ظهور نافذة "Save Print Output As" هو عدم وجود تعريف لطابعة فيزيائية حقيقية موصولة بالجهاز. يرجى توصيل طابعتك (كابل USB أو عبر الشبكة) وتشغيلها، ثم الضغط على "تحديث الطابعات المتصلة" لتحديدها.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
            <span className="leading-relaxed">
              💡 عند تشغيل السكريبت على ويندوز، سيتم فحص طابعات النظام تلقائياً وتثبيت أول طابعة حقيقية لتوجيه أمر الطباعة إليها دون فتح نوافذ حفظ.
            </span>
          </div>
        )}
      </div>

      {/* Instructions Steps */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-600" />
          <span>خطوات تحويل الكود إلى ملف تنفيذي (.exe) يعمل أوفلاين بمعالجة خلفية صامتة:</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="font-extrabold text-blue-700 block mb-1">1. تثبيت الحزم المطلوبة:</span>
            <code className="bg-slate-900 text-emerald-400 p-2 rounded block font-mono text-[11px] select-all">
              pip install PySide6 pyinstaller
            </code>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="font-extrabold text-blue-700 block mb-1">2. تجربة وتشغيل السكريبت:</span>
            <code className="bg-slate-900 text-emerald-400 p-2 rounded block font-mono text-[11px] select-all">
              python nasser_company_app.py
            </code>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="font-extrabold text-blue-700 block mb-1">3. أمر التغليف المعتمد (مع تضمين ملفات dist):</span>
            <code className="bg-slate-900 text-emerald-400 p-2 rounded block font-mono text-[10px] select-all leading-tight">
              pyinstaller --noconsole --onefile --add-data "dist;dist" nasser_company_app.py
            </code>
          </div>
        </div>

        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-start gap-2.5 text-emerald-950">
          <div className="p-1 bg-emerald-600 text-white rounded-md mt-0.5 shrink-0 font-mono text-[10px] font-bold">CI/CD</div>
          <div className="space-y-0.5">
            <span className="font-bold block text-emerald-900">تجميع وتغليف تلقائي عبر GitHub Actions:</span>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              تم إعداد ملف العمل <code>.github/workflows/window.yml</code> تلقائياً ليقوم عند كل Push أو تشغيل يدوي ببناء مثبت الويندوز الكامل (<code>Nasser_Company_Setup.exe</code>) والنسخة المحمولة (<code>Portable .exe</code>) ورفعها كـ Artifacts جاهزة للتحميل المباشر.
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1.5 text-slate-700">
          <span className="font-bold text-blue-900 block">⚙️ حلول التغليف المطبقة برمجياً (Production Packaging Engine):</span>
          <p className="text-[11px] leading-relaxed text-slate-600">
            • <strong>معالجة الارتجاف والرسومات (Flickering & GPU Fix):</strong> تم تعطيل تسريع GPU لـ OpenGL عبر <code>Qt.AA_UseSoftwareOpenGL</code> وإيقاف تسريع Chromium المزدوج لضمان ثبات النوافذ المنبثقة وحوارات الطباعة 100% دون أي اهتزاز.
            <br />
            • <strong>معالجة الشاشة البيضاء (Asset Path Resolution):</strong> تم اعتماد دالة <code>get_resource_path</code> المزودة بـ <code>sys._MEIPASS</code> لاستخراج ملفات الواجهة والـ Assets بدقة عند تشغيل الـ EXE في أي جهاز غريب.
            <br />
            • <strong>قاعدة البيانات الديناميكية (Dynamic SQLite):</strong> تهيئة وتخزين دائم بـ <code>AppData</code> ومقاومة انقطاع التيار بـ WAL Mode مع تعبئة تلقائية لكافة أصناف ومستخدمي الشركة عند التثبيت لأول مرة.
            <br />
            • <strong>الطباعة الأصلية (Native Qt Printing):</strong> ربط كلاس <code>QPrinter</code> و <code>QPrintDialog</code> الداخلي مع التقاط اختصار <code>Ctrl + P</code> الفوري لعرض حوار طباعة ويندوز دون الحاجة لبرامج خارجية.
          </p>
        </div>
      </div>

      {/* Code Editor View */}
      <div className="bg-slate-900 text-slate-100 rounded-xl overflow-hidden border border-slate-800 shadow-lg">
        <div className="bg-slate-950 px-4 py-3 flex items-center justify-between border-b border-slate-800 text-xs">
          <span className="flex items-center gap-2 font-mono text-blue-400">
            <FileCode className="w-4 h-4" />
            <span>nasser_company_app.py</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Python 3.10+ / PySide6 / SQLite3</span>
        </div>

        <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[450px] leading-relaxed">
          {pythonScript}
        </pre>
      </div>

    </div>
  );
};
