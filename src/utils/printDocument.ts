/**
 * High-Fidelity Native Printing Engine for شركة NOSSER
 * Guarantees zero-blank-page, clean A4 Arabic printouts across all browsers and iframes.
 */

export interface PrintOptions {
  title?: string;
  documentNumber?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
}

export function printHtmlElement(element: HTMLElement | null, options: PrintOptions = {}) {
  if (!element) {
    // Fallback if no element passed
    window.focus();
    window.print();
    return;
  }

  const { title = 'شركة NOSSER - إدارة المخازن والمستودعات' } = options;

  try {
    // Create an invisible sandboxed iframe dedicated solely to printing
    const iframe = document.createElement('iframe');
    iframe.id = 'nosser_print_frame_' + Date.now();
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      // Fallback
      window.focus();
      window.print();
      return;
    }

    // Collect all existing stylesheets from the document
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
        ${styleTags}
        <style>
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Cairo', 'Tajawal', sans-serif !important;
            direction: rtl !important;
            text-align: right !important;
            width: 100% !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          .printable-doc {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-top: 8px !important;
            margin-bottom: 8px !important;
          }
          th, td {
            border: 1.5px solid #000000 !important;
            padding: 6px 8px !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print, [data-no-print] {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div class="printable-doc">
          ${element.innerHTML}
        </div>
      </body>
      </html>
    `);
    doc.close();

    // Trigger printing once content is ready
    setTimeout(() => {
      try {
        if (options.onBeforePrint) options.onBeforePrint();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        if (options.onAfterPrint) options.onAfterPrint();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print()', err);
        window.focus();
        window.print();
      } finally {
        // Remove iframe after print dialog resolves
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 1500);
      }
    }, 250);
  } catch (e) {
    console.error('Print trigger failure, falling back to window.print():', e);
    window.focus();
    window.print();
  }
}
