import { useMemo, useState } from 'react'
import { Download, FileText, Printer, PackageCheck, WalletCards } from 'lucide-react'

type Sale = { id: string; sale_number: number; total: number; status: string; created_at: string; completed_at?: string | null }
type Expense = { amount: number; expense_date: string }
type ReturnRecord = { sale_id: string; total: number; created_at: string }
type LowStock = { id: string; sku: string; current: number; minimum: number }

type Props = {
  sales: Sale[]
  expenses: Expense[]
  returns: ReturnRecord[]
  lowStock: LowStock[]
  currency: string
  storeName: string
}

const localDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const formatMoney = (value: number, currency: string) =>
  `${Number(value || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
const csvCell = (value: unknown) => {
  const text = String(value ?? '')
  const safe = /^[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replace(/"/g, '""') + '"'
}

export default function OperationsReports({ sales, expenses, returns, lowStock, currency, storeName }: Props) {
  const [reportDate, setReportDate] = useState(() => localDateKey(new Date()))
  const report = useMemo(() => {
    const daySales = sales.filter(sale => localDateKey(new Date(sale.completed_at || sale.created_at)) === reportDate)
    const dayReturns = returns.filter(item => localDateKey(new Date(item.created_at)) === reportDate)
    const dayExpenses = expenses.filter(item => item.expense_date === reportDate)
    const grossSales = daySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
    const returned = dayReturns.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const costs = dayExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return { daySales, dayReturns, dayExpenses, grossSales, returned, costs, netAfterExpenses: grossSales - returned - costs }
  }, [sales, expenses, returns, reportDate])

  function exportCsv() {
    const rows: unknown[][] = [
      ['Type', 'Date', 'Référence', 'Montant', 'Devise', 'Détail'],
      ...report.daySales.map(sale => ['Vente', reportDate, sale.sale_number, sale.total, currency, 'Facture complétée']),
      ...report.dayReturns.map((item, index) => ['Retour', reportDate, index + 1, item.total, currency, 'Retour enregistré']),
      ...report.dayExpenses.map((item, index) => ['Dépense', reportDate, index + 1, item.amount, currency, 'Dépense enregistrée']),
      ...lowStock.map(item => ['Alerte stock', reportDate, item.sku, Math.max(0, item.minimum - item.current), 'unité(s)', `Stock actuel: ${item.current}; minimum: ${item.minimum}`]),
      ['TOTAL VENTES', reportDate, '', report.grossSales, currency, ''],
      ['TOTAL RETOURS', reportDate, '', report.returned, currency, ''],
      ['TOTAL DÉPENSES', reportDate, '', report.costs, currency, ''],
      ['SOLDE INDICATIF APRÈS DÉPENSES', reportDate, '', report.netAfterExpenses, currency, 'Ne représente pas un comptage physique de caisse'],
    ]
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `stylepro-rapport-${reportDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    const popup = window.open('', '_blank', 'width=1000,height=760')
    if (!popup) return
    const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
    const safeStore = storeName.replace(/[&<>"]/g, char => htmlEntities[char] || char)
    const rows = [
      ...report.daySales.map(sale => `<tr><td>Vente</td><td>#${sale.sale_number}</td><td>${formatMoney(Number(sale.total), currency)}</td></tr>`),
      ...report.dayReturns.map((item, index) => `<tr><td>Retour</td><td>${index + 1}</td><td>-${formatMoney(Number(item.total), currency)}</td></tr>`),
      ...report.dayExpenses.map((item, index) => `<tr><td>Dépense</td><td>${index + 1}</td><td>-${formatMoney(Number(item.amount), currency)}</td></tr>`),
    ].join('')
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport journalier</title><style>
      body{font:14px Arial,sans-serif;color:#202a28;margin:28px}header{border-bottom:2px solid #a9875b;padding-bottom:14px;margin-bottom:22px}
      h1{font-size:22px;margin:0 0 6px}p{color:#66716d;margin:4px 0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
      .card{border:1px solid #d8ddd8;border-radius:8px;padding:12px}.card span{display:block;color:#66716d;font-size:11px}.card strong{display:block;margin-top:7px;font-size:17px}
      table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #e2e6e2;text-align:left}th{background:#f3f0e9}
      .note{margin-top:24px;padding:12px;background:#f7f4ed;border-left:3px solid #a9875b;font-size:11px}
      @media print{body{margin:12mm}.cards{grid-template-columns:repeat(2,1fr)}}
    </style></head><body><header><h1>${safeStore}</h1><p>Rapport journalier de gestion · ${reportDate}</p></header>
    <div class="cards"><div class="card"><span>Ventes brutes</span><strong>${formatMoney(report.grossSales, currency)}</strong></div>
    <div class="card"><span>Retours</span><strong>${formatMoney(report.returned, currency)}</strong></div>
    <div class="card"><span>Dépenses</span><strong>${formatMoney(report.costs, currency)}</strong></div>
    <div class="card"><span>Solde indicatif</span><strong>${formatMoney(report.netAfterExpenses, currency)}</strong></div></div>
    <p>Ventes: ${report.daySales.length} · Retours: ${report.dayReturns.length} · Dépenses: ${report.dayExpenses.length}</p>
    <table><thead><tr><th>Opération</th><th>Référence</th><th>Montant</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Aucune opération pour cette date.</td></tr>'}</tbody></table>
    <div class="note">Document de synthèse basé sur les données enregistrées dans StylePro Manager. Ce rapport ne constitue pas un arrêté comptable de caisse : les espèces réellement comptées, les écarts de caisse et le détail des moyens de paiement ne sont pas inclus.</div>
    <script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  return <section className="panel operations-reports">
    <div className="panel-title">
      <WalletCards size={21} />
      <div><h2>Rapport journalier & réapprovisionnement</h2><p>Synthèse des ventes, retours, dépenses et besoins de stock.</p></div>
    </div>
    <div className="operations-report-toolbar">
      <label className="field">Date du rapport<input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></label>
      <div className="operations-report-actions">
        <button type="button" className="secondary-button" onClick={printReport}><Printer size={16} /> Imprimer / PDF</button>
        <button type="button" className="primary-button" onClick={exportCsv}><Download size={16} /> Exporter CSV</button>
      </div>
    </div>
    <div className="operations-report-kpis">
      <div><span>Ventes brutes</span><strong>{formatMoney(report.grossSales, currency)}</strong><small>{report.daySales.length} facture(s)</small></div>
      <div><span>Retours</span><strong>{formatMoney(report.returned, currency)}</strong><small>{report.dayReturns.length} opération(s)</small></div>
      <div><span>Dépenses</span><strong>{formatMoney(report.costs, currency)}</strong><small>{report.dayExpenses.length} dépense(s)</small></div>
      <div className="operations-report-total"><span>Solde indicatif</span><strong>{formatMoney(report.netAfterExpenses, currency)}</strong><small>Hors comptage physique de caisse</small></div>
    </div>
    <div className="operations-reorder">
      <div className="operations-reorder-heading"><PackageCheck size={18}/><strong>Proposition de réapprovisionnement</strong><span>{lowStock.length} référence(s) à contrôler</span></div>
      {!lowStock.length ? <p className="muted">Aucun article sous son seuil minimum.</p> :
        <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Stock actuel</th><th>Seuil minimum</th><th>Qté pour atteindre le seuil</th></tr></thead>
          <tbody>{lowStock.map(item => <tr key={item.id}><td><strong>{item.sku}</strong></td><td>{item.current}</td><td>{item.minimum}</td><td><strong>{Math.max(0, item.minimum - item.current)}</strong></td></tr>)}</tbody>
        </table></div>}
    </div>
    <p className="operations-report-disclaimer"><FileText size={15}/> Rapport indicatif calculé à partir des enregistrements accessibles. Le solde n'est ni un bénéfice net comptable ni un comptage physique de caisse. Les ventes affichées dépendent de la période chargée par le tableau de bord.</p>
  </section>
}
