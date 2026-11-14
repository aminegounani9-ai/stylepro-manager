export type PrintPageFormat = 'a4' | 'a4-landscape' | 'thermal'

type PrintPreviewOptions = {
  title: string
  storeName: string
  subtitle?: string
  content: string
  format?: PrintPageFormat
}

export function escapePrintHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

/**
 * Opens a branded, on-screen document preview. Printing is user-triggered from
 * the preview toolbar so the document can be checked before opening the native
 * print dialog / Save as PDF flow.
 */
export function openPrintPreview({
  title,
  storeName,
  subtitle = '',
  content,
  format = 'a4',
}: PrintPreviewOptions): boolean {
  const popup = window.open('', '_blank')
  if (!popup) return false

  const page = format === 'thermal'
    ? '80mm auto'
    : format === 'a4-landscape'
      ? 'A4 landscape'
      : 'A4 portrait'
  const sheetWidth = format === 'thermal' ? '80mm' : format === 'a4-landscape' ? '297mm' : '210mm'
  const pageMargin = format === 'thermal' ? '3mm' : '12mm'
  const isThermal = format === 'thermal'

  popup.document.open()
  popup.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapePrintHtml(title)} — ${escapePrintHtml(storeName)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#e9e6df;color:#202b39;font-family:Arial,Helvetica,sans-serif}
  .preview-toolbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#24354b;color:#fff;box-shadow:0 3px 14px #17223322}
  .preview-toolbar strong{font-size:13px;letter-spacing:.2px}
  .preview-actions{display:flex;gap:8px;flex-wrap:wrap}
  .preview-actions button{border:1px solid #ffffff55;border-radius:8px;padding:9px 13px;background:#ffffff16;color:#fff;font-weight:700;cursor:pointer}
  .preview-actions .primary{background:#b58b54;border-color:#b58b54;color:#172233}
  .preview-sheet{width:min(${sheetWidth},calc(100% - 32px));min-height:${isThermal ? 'auto' : format === 'a4-landscape' ? '210mm' : '297mm'};margin:24px auto;padding:${pageMargin};background:#fff;box-shadow:0 8px 32px #17223320}
  .document-brand{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:12px;margin-bottom:18px;border-bottom:2px solid #b58b54}
  .document-store{font-size:${isThermal ? '12px' : '17px'};font-weight:800;color:#24354b}
  .document-title{margin:5px 0 4px;font-size:${isThermal ? '13px' : '22px'};letter-spacing:.3px;color:#24354b}
  .document-subtitle{margin:0;color:#687383;font-size:${isThermal ? '8px' : '11px'}}
  .document-generated{font-size:${isThermal ? '8px' : '10px'};color:#687383;text-align:right;white-space:nowrap}
  .document-content{font-size:${isThermal ? '8px' : '11px'};color:#202b39}
  .document-content table{width:100%;border-collapse:collapse;table-layout:auto;margin:12px 0}
  .document-content th,.document-content td{padding:${isThermal ? '4px 3px' : '8px'};border:1px solid #d8dce2;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  .document-content th{background:#f0ece4;color:#24354b;font-weight:800}
  .document-content tr{break-inside:avoid}
  .document-content .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
  .document-content .summary-card{border:1px solid #d8dce2;border-radius:8px;padding:9px}
  .document-content .summary-card span{display:block;color:#687383;font-size:9px}
  .document-content .summary-card strong{display:block;margin-top:5px;font-size:14px;color:#24354b}
  .document-footer{margin-top:22px;padding-top:9px;border-top:1px solid #d8dce2;color:#687383;font-size:9px;display:flex;justify-content:space-between;gap:10px}
  ${isThermal ? '.preview-sheet{padding:3mm}.document-brand{margin-bottom:8px;padding-bottom:6px}.document-content table{font-size:7px}.document-content th,.document-content td{padding:3px 2px}.document-content .summary-grid{grid-template-columns:1fr}.document-content .summary-card{padding:5px}.document-content .summary-card strong{font-size:10px}' : ''}
  @page{size:${page};margin:${pageMargin}}
  @media print{
    html,body{background:#fff!important}
    .preview-toolbar{display:none!important}
    .preview-sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
    .document-content{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .document-content thead{display:table-header-group}
    .document-content tr{break-inside:avoid;page-break-inside:avoid}
    .document-footer{break-inside:avoid}
  }
  @media(max-width:700px){
    .preview-toolbar{align-items:flex-start;flex-direction:column}
    .preview-sheet{width:min(${sheetWidth},calc(100% - 16px));margin:8px auto;padding:12px;overflow-wrap:anywhere}
  }
</style>
</head>
<body>
  <div class="preview-toolbar">
    <strong>Aperçu du document · ${escapePrintHtml(title)}</strong>
    <div class="preview-actions">
      <button class="primary" id="print-document" type="button">Imprimer / Enregistrer en PDF</button>
      <button id="close-preview" type="button">Fermer</button>
    </div>
  </div>
  <main class="preview-sheet">
    <header class="document-brand">
      <div><div class="document-store">${escapePrintHtml(storeName)}</div><h1 class="document-title">${escapePrintHtml(title)}</h1><p class="document-subtitle">${escapePrintHtml(subtitle)}</p></div>
      <div class="document-generated">Généré le<br>${escapePrintHtml(new Date().toLocaleString('fr-DZ'))}</div>
    </header>
    <section class="document-content">${content}</section>
    <footer class="document-footer"><span>${escapePrintHtml(storeName)} · Document généré par StylePro Manager</span><span>Page imprimable / PDF</span></footer>
  </main>
</body>
</html>`)
  popup.document.close()
  popup.document.getElementById('print-document')?.addEventListener('click', () => popup.print())
  popup.document.getElementById('close-preview')?.addEventListener('click', () => popup.close())
  return true
}
