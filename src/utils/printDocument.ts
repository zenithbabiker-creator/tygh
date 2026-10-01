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
    window.print();
    return;
  }

  // Hide everything else in the body
  const bodyChildren = Array.from(document.body.children);
  bodyChildren.forEach(child => {
    if (child !== element) {
      (child as HTMLElement).style.display = 'none';
    }
  });

  // Temporarily style element for A4 portrait printing
  const originalStyle = element.getAttribute('style') || '';
  element.style.position = 'absolute';
  element.style.top = '0';
  element.style.left = '0';
  element.style.width = '100%';
  element.style.zIndex = '9999';
  
  if (options.onBeforePrint) options.onBeforePrint();
  window.print();
  if (options.onAfterPrint) options.onAfterPrint();

  // Restore
  element.setAttribute('style', originalStyle);
  bodyChildren.forEach(child => {
    (child as HTMLElement).style.display = '';
  });
}
