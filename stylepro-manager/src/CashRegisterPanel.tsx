import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Banknote, Calculator, CheckCircle2, Clock3, LockKeyhole, RefreshCw,
  Wallet, AlertTriangle, TrendingUp, ArrowDownRight, ArrowUpRight, Printer,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './cash-register.css'
import { escapePrintHtml, openPrintPreview } from './lib/printPreview'

type CashSession = {
  id: string
  store_id: string
  cashier_id: string
  opened_at: string
  opening_float: number
  status: 'open' | 'closed'
}
type CashSummary = {
  opening_float: number
  cash_sales: number
  cash_expenses: number
  cash_refunds: number
  expected_cash: number
  counted_cash: number
  cash_difference: number
  total_sales: number
  sales_returns: number
  cost_of_goods_sold: number
  gross_profit: number
  total_expenses: number
  net_profit: number
}
type Props = {
  storeId: string
  userId: string
  currency?: string
  storeName?: string
  onSessionChange?: (id: string | null) => void
}
const money = (n: number, currency: string) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ' + currency
const asSummary = (row: Record<string, unknown>): CashSummary => ({
  opening_float: Number(row.opening_float ?? 0),
  cash_sales: Number(row.cash_sales ?? 0),
  cash_expenses: Number(row.cash_expenses ?? 0),
  cash_refunds: Number(row.cash_refunds ?? 0),
  expected_cash: Number(row.expected_cash ?? 0),
  counted_cash: Number(row.counted_cash ?? 0),
  cash_difference: Number(row.cash_difference ?? 0),
  total_sales: Number(row.total_sales ?? 0),
  sales_returns: Number(row.sales_returns ?? 0),
  cost_of_goods_sold: Number(row.cost_of_goods_sold ?? 0),
  gross_profit: Number(row.gross_profit ?? 0),
  total_expenses: Number(row.total_expenses ?? 0),
  net_profit: Number(row.net_profit ?? 0),
})

export default function CashRegisterPanel({
  storeId, userId, currency = 'DZD', storeName = 'StylePro Manager', onSessionChange,
}: Props) {
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4')
  const [session, setSession] = useState<CashSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!storeId || !userId) {
      setLoading(false)
      setSession(null)
      onSessionChange?.(null)
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('cash_register_sessions')
      .select('id,store_id,cashier_id,opened_at,opening_float,status')
      .eq('store_id', storeId)
      .eq('cashier_id', userId)
      .eq('status', 'open')
      .maybeSingle()
    if (loadError) {
      setError(loadError.message)
      setSession(null)
      onSessionChange?.(null)
    } else {
      setError('')
      const next = data as CashSession | null
      setSession(next)
      onSessionChange?.(next?.id ?? null)
    }
    setLoading(false)
  }, [storeId, userId, onSessionChange])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(opening)
    if (opening.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setError('Saisissez un fond de caisse valide, égal ou supérieur à zéro.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: openError } = await supabase.rpc('open_cash_register', {
        p_store_id: storeId,
        p_opening_float: amount,
        p_note: note.trim() || null,
      })
      if (openError) throw openError
      setOpening('')
      setNote('')
      setNotice('La caisse est ouverte. Vous pouvez commencer les encaissements.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’ouvrir la caisse.')
    } finally {
      setBusy(false)
    }
  }

  async function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(counted)
    if (counted.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setError('Saisissez le montant réellement compté, égal ou supérieur à zéro.')
      return
    }
    if (!session) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: closeError } = await supabase.rpc('close_cash_register', {
        p_session_id: session.id,
        p_counted_cash: amount,
        p_note: note.trim() || null,
      })
      if (closeError) throw closeError
      const row = Array.isArray(data) ? data[0] : data
      if (row && typeof row === 'object') setSummary(asSummary(row as Record<string, unknown>))
      setSession(null)
      onSessionChange?.(null)
      setCounted('')
      setNote('')
      setNotice('Clôture enregistrée avec succès. Vérifiez le récapitulatif ci-dessous.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de clôturer la caisse.')
    } finally {
      setBusy(false)
    }
  }

  const difference = summary?.cash_difference ?? 0

  function printSessionReport() {
    if (!summary) return
    const metrics = [
      ['Fond initial', summary.opening_float],
      ['Ventes espèces', summary.cash_sales],
      ['Dépenses caisse', summary.cash_expenses],
      ['Remboursements espèces', summary.cash_refunds],
      ['Solde théorique', summary.expected_cash],
      ['Montant compté', summary.counted_cash],
      [difference === 0 ? 'Écart de caisse' : difference > 0 ? 'Excédent de caisse' : 'Manquant de caisse', Math.abs(difference)],
      ['Ventes totales', summary.total_sales],
      ['Retours produits', summary.sales_returns],
      ['Coût des articles vendus', summary.cost_of_goods_sold],
      ['Marge brute estimée', summary.gross_profit],
      ['Total des dépenses', summary.total_expenses],
      ['Bénéfice net estimé', summary.net_profit],
    ]
    const content = `<div class="summary-grid">${metrics.map(([label, value]) => `<div class="summary-card"><span>${escapePrintHtml(label)}</span><strong>${escapePrintHtml(money(Number(value), currency))}</strong></div>`).join('')}</div>
      <p><strong>État de clôture :</strong> ${difference === 0 ? 'Équilibrée' : difference > 0 ? 'Excédent' : 'Manquant'}</p>
      <p>Le fond initial n’est pas un revenu. Le solde théorique tient compte des paiements en espèces, des dépenses sorties du tiroir et des remboursements espèces.</p>
      <p>Le bénéfice net affiché est une estimation calculée à partir des coûts d’achat et des dépenses enregistrées. Il ne remplace pas une comptabilité certifiée.</p>`
    const opened = openPrintPreview({ title: 'Rapport de clôture de caisse', storeName, subtitle: `Clôture · ${new Date().toLocaleString('fr-DZ')} · Devise : ${currency}`, content, format: printFormat })
    if (!opened) setError('Autorisez les fenêtres pop-up pour afficher l’aperçu du rapport.')
  }
  return (
    <section className="cash-register-panel">
      <header className="cash-register-heading">
        <div className="cash-register-icon"><Wallet size={21} /></div>
        <div className="cash-register-heading-copy">
          <span className="cash-register-eyebrow">GESTION QUOTIDIENNE</span>
          <h3>Caisse & clôture</h3>
          <p>Suivez le fond de caisse, sécurisez les encaissements et contrôlez les écarts.</p>
        </div>
        <button type="button" className="cash-register-refresh" onClick={() => void load()} disabled={loading || busy} aria-label="Actualiser la caisse" title="Actualiser">
          <RefreshCw size={16} className={loading ? 'cash-register-spin' : ''} />
        </button>
      </header>

      {error && <div className="cash-register-alert cash-register-alert-error" role="alert"><AlertTriangle size={17} /><span>{error}</span></div>}
      {notice && <div className="cash-register-alert cash-register-alert-success" role="status"><CheckCircle2 size={17} /><span>{notice}</span></div>}

      {loading ? (
        <div className="cash-register-loading"><RefreshCw size={17} className="cash-register-spin" /> Vérification de votre session…</div>
      ) : session ? (
        <div className="cash-register-workspace">
          <div className="cash-register-session-banner">
            <div className="cash-register-session-status"><span className="cash-register-dot" /> SESSION ACTIVE <span className="cash-register-session-id">#{session.id.slice(0, 8).toUpperCase()}</span></div>
            <div className="cash-register-session-time"><Clock3 size={14} /> Ouverte le {new Date(session.opened_at).toLocaleString('fr-DZ')}</div>
          </div>
          <div className="cash-register-float-card">
            <span>Fond de caisse initial</span>
            <strong>{money(Number(session.opening_float), currency)}</strong>
            <small>Montant remis au caissier à l’ouverture</small>
          </div>
          <form className="cash-register-form cash-register-close-form" onSubmit={close}>
            <div className="cash-register-form-title"><LockKeyhole size={17} /><div><strong>Clôturer la session</strong><small>Comptez physiquement les billets et les pièces avant validation.</small></div></div>
            <label>Montant réellement compté <em>{currency}</em>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={counted} onChange={e => setCounted(e.target.value)} placeholder="Ex. 12 500,00" required />
            </label>
            <label>Note de clôture <span className="cash-register-optional">FACULTATIF</span>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Ex. Écart expliqué, remise au responsable…" />
            </label>
            <button type="submit" className="cash-register-action cash-register-action-close" disabled={busy || counted.trim() === ''}>
              <LockKeyhole size={16} /> {busy ? 'Traitement en cours…' : 'Valider la clôture'}
            </button>
          </form>
        </div>
      ) : (
        <div className="cash-register-workspace">
          <div className="cash-register-closed-banner"><span className="cash-register-closed-icon"><Wallet size={18} /></span><div><strong>Aucune session ouverte</strong><small>Ouvrez la caisse avant de commencer les ventes.</small></div><span className="cash-register-closed-pill">FERMÉE</span></div>
          <form className="cash-register-form cash-register-open-form" onSubmit={open}>
            <div className="cash-register-form-title"><Banknote size={18} /><div><strong>Ouverture de caisse</strong><small>Enregistrez le montant de départ remis au caissier.</small></div></div>
            <label>Fond de caisse initial <em>{currency}</em>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="Ex. 5 000,00" required />
            </label>
            <label>Note / personne ayant remis la caisse <span className="cash-register-optional">FACULTATIF</span>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Ex. Remis par le responsable" />
            </label>
            <button type="submit" className="cash-register-action cash-register-action-open" disabled={busy || opening.trim() === ''}>
              <Banknote size={17} /> {busy ? 'Ouverture en cours…' : 'Ouvrir la caisse'}
            </button>
          </form>
        </div>
      )}

      {summary && (
        <section className="cash-register-summary" aria-label="Résumé de la dernière clôture">
          <div className="cash-register-summary-heading"><div><span className="cash-register-eyebrow">RAPPORT DE SESSION</span><h4>Dernière clôture</h4></div><span className={difference === 0 ? 'cash-register-result-pill is-balanced' : 'cash-register-result-pill is-unbalanced'}>{difference === 0 ? 'ÉQUILIBRÉE' : difference > 0 ? 'EXCÉDENT' : 'MANQUANT'}</span><div className="cash-register-print-actions"><select aria-label="Format du rapport" value={printFormat} onChange={event => setPrintFormat(event.target.value as 'a4' | 'thermal')}><option value="a4">A4</option><option value="thermal">80 mm</option></select><button type="button" className="cash-register-action" onClick={printSessionReport}><Printer size={15}/> Aperçu / Imprimer</button></div></div>
          <div className="cash-register-metrics">
            <div><span>Fond initial</span><strong>{money(summary.opening_float, currency)}</strong></div>
            <div><span>Ventes espèces</span><strong>{money(summary.cash_sales, currency)}</strong></div>
            <div><span>Dépenses caisse</span><strong>{money(summary.cash_expenses, currency)}</strong></div>
            <div><span>Remboursements espèces</span><strong>{money(summary.cash_refunds, currency)}</strong></div>
          </div>
          <div className="cash-register-cash-balance">
            <div><span>Solde théorique</span><strong>{money(summary.expected_cash, currency)}</strong></div>
            <div><span>Montant compté</span><strong>{money(summary.counted_cash, currency)}</strong></div>
            <div className={difference === 0 ? 'cash-register-diff-balanced' : 'cash-register-diff-warning'}>
              {difference > 0 ? <ArrowUpRight size={17} /> : difference < 0 ? <ArrowDownRight size={17} /> : <CheckCircle2 size={17} />}
              <span>{difference === 0 ? 'Aucun écart' : difference > 0 ? 'Excédent de caisse' : 'Manquant de caisse'}</span>
              <strong>{money(Math.abs(difference), currency)}</strong>
            </div>
          </div>
          <div className="cash-register-profit-title"><TrendingUp size={16} /> Performance commerciale estimée</div>
          <div className="cash-register-metrics cash-register-profit-metrics">
            <div><span>Ventes totales (espèces + carte)</span><strong>{money(summary.total_sales, currency)}</strong></div>
            <div><span>Retours produits</span><strong>{money(summary.sales_returns, currency)}</strong></div>
            <div><span>Coût des articles vendus</span><strong>{money(summary.cost_of_goods_sold, currency)}</strong></div>
            <div><span>Marge brute estimée</span><strong>{money(summary.gross_profit, currency)}</strong></div>
            <div><span>Total des dépenses</span><strong>{money(summary.total_expenses, currency)}</strong></div>
            <div className={summary.net_profit >= 0 ? 'cash-register-profit-positive' : 'cash-register-profit-negative'}><span>Bénéfice net estimé</span><strong>{money(summary.net_profit, currency)}</strong></div>
          </div>
        </section>
      )}
      <footer className="cash-register-footnote"><Calculator size={15} /><span>Le fond initial n’est pas un revenu. Le solde théorique tient compte des paiements en espèces, dépenses sorties du tiroir et remboursements espèces. Le bénéfice affiché est une estimation basée sur les coûts d’achat et les dépenses enregistrées ; il ne remplace pas une comptabilité certifiée.</span></footer>
    </section>
  )
}
