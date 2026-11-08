import { useMemo, useState } from 'react'
import { Download, FileText, Printer, PackageCheck, WalletCards, CalendarDays } from 'lucide-react'

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
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]!)

export default function OperationsReports({ sales, expenses, returns, lowStock, currency, storeName }: Props) {
  const today = localDateKey(new Date())
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const validRange = dateFrom <= dateTo

  const report = useMemo(() => {
    if (!validRange) return { daySales: [], dayReturns: [], dayExpenses: [], grossSales: 0, returned: 0, costs: 0, netAfterExpenses: 0 }
    const inRange = (key: string) => key >= dateFrom && key <= dateTo
    const daySales = sales.filter(sale => inRange(localDateKey(new Date(sale.completed_at || sale.created_at))))
    const dayReturns = returns.filter(item => inRange(localDateKey(new Date(item.created_at))))
    const dayExpenses = expenses.filter(item => inRange(item.expense_date))
    const grossSales = daySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
    const returned = dayReturns.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const costs = dayExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return { daySales, dayReturns, dayExpenses, grossSales, returned, costs, netAfterExpenses: grossSales - returned - costs }
  }, [sales, expenses, returns, dateFrom, dateTo, validRange])

  const dailyTrend = useMemo(() => {
    if (!validRange) return []
    const start = new Date(`${dateFrom}T00:00:00`)
    const end = new Date(`${dateTo}T00:00:00`)
    const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const step = span > 31 ? Math.ceil(span / 31) : 1
    const buckets: Array<{ label: string; sales: number; returns: number; expenses: number }> = []
    for (let offset = 0; offset < span; offset += step) {
      const bucketStart = new Date(start)
      bucketStart.setDate(start.getDate() + offset)
      const bucketEnd = new Date(start)
      bucketEnd.setDate(start.getDate() + Math.min(span - 1, offset + step - 1))
      const from = localDateKey(bucketStart)
      const to = localDateKey(bucketEnd)
      const salesTotal = report.daySales.filter(s => {
        const key = localDateKey(new Date(s.completed_at || s.created_at))
        return key >= from && key <= to
      }).reduce((sum, s) => sum + Number(s.total || 0), 0)
      const returnsTotal = report.dayReturns.filter(r => {
        const key = localDateKey(new Date(r.created_at))
        return key >= from && key <= to
      }).reduce((sum, r) => sum + Number(r.total || 0), 0)
      const expensesTotal = report.dayExpenses.filter(e => e.expense_date >= from && e.expense_date <= to)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      buckets.push({ label: span > 31 ? `${from.slice(5)} – ${to.slice(5)}` : bucketStart.toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit' }), sales: salesTotal, returns: returnsTotal, expenses: expensesTotal })
    }
    return buckets
  }, [dateFrom, dateTo, report, validRange])
  const trendMax = Math.max(1, ...dailyTrend.map(item => item.sales))

  function setPreset(days: number) {
    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - days + 1)
    setDateFrom(localDateKey(start))
    setDateTo(localDateKey(end))
  }

  function exportCsv() {
    const rows: unknown[][] = [
      ['Boutique', storeName],
      ['Période', dateFrom, dateTo],
      [],
      ['Type', 'Date', 'Référence', 'Montant', 'Devise', 'Détail'],
      ...report.daySales.map(sale => ['Vente', localDateKey(new Date(sale.completed_at || sale.created_at)), sale.sale_number, sale.total, currency, 'Facture complétée']),
      ...report.dayReturns.map((item, index) => ['Retour', localDateKey(new Date(item.created_at)), index + 1, item.total, currency, 'Retour enregistré']),
      ...report.dayExpenses.map((item, index) => ['Dépense', item.expense_date, index + 1, item.amount, currency, 'Dépense enregistrée']),
      ...lowStock.map(item => ['Alerte stock', today, item.sku, Math.max(0, item.minimum - item.current), 'unité(s)', `Stock actuel: ${item.current}; minimum: ${item.minimum}`]),
      [],
      ['TOTAL VENTES', '', '', report.grossSales, currency, ''],
      ['TOTAL RETOURS', '', '', report.returned, currency, ''],
      ['TOTAL DÉPENSES', '', '', report.costs, currency, ''],
      ['SOLDE INDICATIF APRÈS DÉPENSES', '', '', report.netAfterExpenses, currency, 'Ne représente pas un comptage physique de caisse'],
    ]
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `stylepro-rapport-${dateFrom}-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    if (!validRange) return
    const popup = window.open('', '_blank', 'width=1000,height=760')
    if (!popup) return
    const rows = [
      ...report.daySales.map(sale => `<tr><td>Vente</td><td>${escapeHtml(localDateKey(new Date(sale.completed_at || sale.created_at)))}</td><td>#${escapeHtml(sale.sale_number)}</td><td>${formatMoney(Number(sale.total), currency)}</td></tr>`),
      ...report.dayReturns.map((item, index) => `<tr><td>Retour</td><td>${escapeHtml(localDateKey(new Date(item.created_at)))}</td><td>${index + 1}</td><td>-${formatMoney(Number(item.total), currency)}</td></tr>`),
      ...report.dayExpenses.map((item, index) => `<tr><td>Dépense</td><td>${escapeHtml(item.expense_date)}</td><td>${index + 1}</td><td>-${formatMoney(Number(item.amount), currency)}</td></tr>`),
    ].join('')
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport StylePro</title><style>
      body{font:14px Arial,sans-serif;color:#202a28;margin:28px}header{border-bottom:2px solid #a9875b;padding-bottom:14px;margin-bottom:22px}
      h1{font-size:22px;margin:0 0 6px}p{color:#66716d;margin:4px 0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
      .card{border:1px solid #d8ddd8;border-radius:8px;padding:12px}.card span{display:block;color:#66716d;font-size:11px}.card strong{display:block;margin-top:7px;font-size:17px}
      table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #e2e6e2;text-align:left}th{background:#f3f0e9}
      .note{margin-top:24px;padding:12px;background:#f7f4ed;border-left:3px solid #a9875b;font-size:11px}
      @media print{body{margin:12mm}.cards{grid-template-columns:repeat(2,1fr)}}
    </style></head><body><header><h1>${escapeHtml(storeName)}</h1><p>Rapport de gestion · ${escapeHtml(dateFrom)} → ${escapeHtml(dateTo)}</p></header>
    <div class="cards"><div class="card"><span>Ventes brutes</span><strong>${formatMoney(report.grossSales, currency)}</strong></div>
    <div class="card"><span>Retours</span><strong>${formatMoney(report.returned, currency)}</strong></div>
    <div class="card"><span>Dépenses</span><strong>${formatMoney(report.costs, currency)}</strong></div>
    <div class="card"><span>Solde indicatif</span><strong>${formatMoney(report.netAfterExpenses, currency)}</strong></div></div>
    <p>Ventes: ${report.daySales.length} · Retours: ${report.dayReturns.length} · Dépenses: ${report.dayExpenses.length}</p>
    <table><thead><tr><th>Opération</th><th>Date</th><th>Référence</th><th>Montant</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Aucune opération pour cette période.</td></tr>'}</tbody></table>
    <div class="note">Synthèse des enregistrements accessibles dans StylePro Manager. Le solde n'est ni un bénéfice net comptable ni un comptage physique de caisse. Les données sont limitées aux enregistrements chargés par le tableau de bord.</div>
    <script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  return <section className="panel operations-reports">
    <div className="panel-title">
      <WalletCards size={21} />
      <div><h2>Rapports & réapprovisionnement</h2><p>Analysez une journée ou une période personnalisée, puis exportez les résultats.</p></div>
    </div>
    <div className="operations-report-toolbar operations-report-range">
      <label className="field"><CalendarDays size={15}/> Du<input type="date" value={dateFrom} max={dateTo} onChange={event => setDateFrom(event.target.value)} /></label>
      <label className="field"><CalendarDays size={15}/> Au<input type="date" value={dateTo} min={dateFrom} onChange={event => setDateTo(event.target.value)} /></label>
      <div className="operations-report-presets">
        <button type="button" className="secondary-button" onClick={() => setPreset(1)}>Aujourd'hui</button>
        <button type="button" className="secondary-button" onClick={() => setPreset(7)}>7 jours</button>
        <button type="button" className="secondary-button" onClick={() => setPreset(30)}>30 jours</button>
      </div>
      <div className="operations-report-actions">
        <button type="button" className="secondary-button" onClick={printReport} disabled={!validRange}><Printer size={16}/> PDF / Imprimer</button>
        <button type="button" className="primary-button" onClick={exportCsv} disabled={!validRange}><Download size={16}/> Exporter CSV</button>
      </div>
    </div>
    {!validRange && <div className="alert error">La date de début doit être antérieure ou égale à la date de fin.</div>}
    <div className="operations-report-kpis">
      <div><span>Ventes brutes</span><strong>{formatMoney(report.grossSales, currency)}</strong><small>{report.daySales.length} facture(s)</small></div>
      <div><span>Retours</span><strong>{formatMoney(report.returned, currency)}</strong><small>{report.dayReturns.length} opération(s)</small></div>
      <div><span>Dépenses</span><strong>{formatMoney(report.costs, currency)}</strong><small>{report.dayExpenses.length} dépense(s)</small></div>
      <div className="operations-report-total"><span>Solde indicatif</span><strong>{formatMoney(report.netAfterExpenses, currency)}</strong><small>Hors comptage physique de caisse</small></div>
    </div>
    <div className="operations-trend">
      <div className="operations-reorder-heading"><FileText size={18}/><strong>Évolution de l'activité</strong><span>{dailyTrend.length} période(s)</span></div>
      {dailyTrend.length === 0 || !report.daySales.length && !report.dayReturns.length && !report.dayExpenses.length
        ? <p className="muted">Aucune opération sur la période sélectionnée.</p>
        : <div className="operations-trend-chart">{dailyTrend.map((item, index) => <div className="operations-trend-column" key={index} title={`${item.label} · Ventes: ${formatMoney(item.sales, currency)} · Retours: ${formatMoney(item.returns, currency)} · Dépenses: ${formatMoney(item.expenses, currency)}`}>
          <strong>{item.sales ? item.sales.toLocaleString('fr-DZ', { notation: 'compact', maximumFractionDigits: 1 }) : '—'}</strong>
          <div className="operations-trend-track"><span style={{ height: `${item.sales ? Math.max(4, item.sales / trendMax * 100) : 2}%` }}/></div>
          <small>{item.label}</small>
        </div>)}</div>}
      <p className="operations-trend-legend"><span/> Ventes brutes · Les retours et dépenses sont visibles au survol de chaque période.</p>
    </div>
    <div className="operations-reorder">
      <div className="operations-reorder-heading"><PackageCheck size={18}/><strong>Proposition de réapprovisionnement</strong><span>{lowStock.length} référence(s) à contrôler</span></div>
      {!lowStock.length ? <p className="muted">Aucun article sous son seuil minimum.</p> :
        <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Stock actuel</th><th>Seuil minimum</th><th>Qté pour atteindre le seuil</th></tr></thead>
          <tbody>{lowStock.map(item => <tr key={item.id}><td><strong>{item.sku}</strong></td><td>{item.current}</td><td>{item.minimum}</td><td><strong>{Math.max(0, item.minimum - item.current)}</strong></td></tr>)}</tbody>
        </table></div>}
    </div>
    <p className="operations-report-disclaimer"><FileText size={15}/> Rapport indicatif calculé à partir des enregistrements accessibles. Le solde n'est ni un bénéfice net comptable ni un comptage physique de caisse. Les ventes affichées dépendent des données chargées par le tableau de bord (maximum 500 factures récentes).</p>
  </section>
}
