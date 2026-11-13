import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownLeft, Banknote, Building2, CalendarDays, Download, Plus, RefreshCw, Search, Trash2, Truck, Wallet } from 'lucide-react'
import { supabase } from './lib/supabase'
import './expenses.css'

type ExpenseType = 'cash_withdrawal' | 'salary' | 'delivery' | 'company' | 'other'
type PaymentSource = 'cashbox' | 'bank' | 'other'
type ExpenseRow = {
  id: string
  description: string
  amount: number
  expense_date: string
  expense_type: ExpenseType
  payment_source: PaymentSource
  payee_name: string | null
  reference: string | null
  notes: string | null
  created_at: string
}
type Props = { storeId: string; userId: string; currency?: string }

const TYPES: { value: ExpenseType; label: string }[] = [
  { value: 'cash_withdrawal', label: 'Retrait de caisse' },
  { value: 'salary', label: 'Salaire / avance' },
  { value: 'delivery', label: 'Livraison / transport' },
  { value: 'company', label: 'Dépense de l’entreprise' },
  { value: 'other', label: 'Autre dépense' },
]
const SOURCES: { value: PaymentSource; label: string }[] = [
  { value: 'cashbox', label: 'Caisse boutique' },
  { value: 'bank', label: 'Banque' },
  { value: 'other', label: 'Autre source' },
]
const today = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const money = (value: number, currency: string) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(value) + ' ' + currency
const typeLabel = (value: ExpenseType) => TYPES.find(item => item.value === value)?.label ?? 'Autre dépense'

export default function ExpensesModule({ storeId, userId, currency = 'DZD' }: Props) {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const [showForm, setShowForm] = useState(false)
  const [expenseType, setExpenseType] = useState<ExpenseType>('cash_withdrawal')
  const [source, setSource] = useState<PaymentSource>('cashbox')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(today())
  const [payee, setPayee] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    setError('')
    let query = supabase.from('expenses')
      .select('id,description,amount,expense_date,expense_type,payment_source,payee_name,reference,notes,created_at')
      .eq('store_id', storeId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (period === 'month') {
      const date = new Date()
      const start = new Date(date.getFullYear(), date.getMonth(), 1)
      const startDate = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      query = query.gte('expense_date', startDate)
    }
    const { data, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else setRows((data ?? []) as ExpenseRow[])
    setLoading(false)
  }, [storeId, period])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase()
    return rows.filter(row => !q || [row.description, row.payee_name, row.reference, row.notes, typeLabel(row.expense_type)]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(q)))
  }, [rows, search])
  const total = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const cashboxTotal = filtered.filter(row => row.payment_source === 'cashbox').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const salaryTotal = filtered.filter(row => row.expense_type === 'salary').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const deliveryTotal = filtered.filter(row => row.expense_type === 'delivery').reduce((sum, row) => sum + Number(row.amount || 0), 0)

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Saisissez un montant supérieur à zéro.')
      return
    }
    if (!description.trim()) {
      setError('La description est obligatoire.')
      return
    }
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('expenses').insert({
      store_id: storeId,
      description: description.trim(),
      amount: numericAmount,
      expense_date: expenseDate,
      created_by: userId,
      expense_type: expenseType,
      payment_source: source,
      payee_name: payee.trim() || null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDescription('')
    setAmount('')
    setPayee('')
    setReference('')
    setNotes('')
    setShowForm(false)
    await load()
  }

  async function removeExpense(row: ExpenseRow) {
    if (!window.confirm('Supprimer cette dépense ? Cette action est réservée aux utilisateurs autorisés.')) return
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', row.id).eq('store_id', storeId)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  function exportCsv() {
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const content = [
      ['Date', 'Type', 'Description', 'Bénéficiaire', 'Source', 'Montant', 'Référence', 'Notes'].join(';'),
      ...filtered.map(row => [row.expense_date, typeLabel(row.expense_type), row.description, row.payee_name, SOURCES.find(item => item.value === row.payment_source)?.label, row.amount, row.reference, row.notes].map(quote).join(';')),
    ].join('\r\n')
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'stylepro-depenses.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel expenses-page">
      <header className="expenses-hero">
        <div className="expenses-hero-icon"><Wallet size={25} /></div>
        <div className="expenses-hero-copy"><span className="expenses-kicker">FINANCE & TRÉSORERIE</span><h2>Dépenses & sorties de caisse</h2><p>Suivez les retraits, salaires, frais de livraison et dépenses générales de la boutique.</p></div>
        <button type="button" className="primary-button expenses-add" onClick={() => setShowForm(value => !value)}><Plus size={17} /> Nouvelle dépense</button>
      </header>

      {error && <div className="alert error">{error}</div>}

      <div className="expenses-stats">
        <article className="expenses-stat"><span><ArrowDownLeft size={17} /> Total des sorties</span><strong>{money(total, currency)}</strong><small>{period === 'month' ? 'Depuis le début du mois' : 'Toutes les opérations chargées'}</small></article>
        <article className="expenses-stat"><span><Wallet size={17} /> Sorties de caisse</span><strong>{money(cashboxTotal, currency)}</strong><small>Payées depuis la caisse boutique</small></article>
        <article className="expenses-stat"><span><Banknote size={17} /> Salaires & avances</span><strong>{money(salaryTotal, currency)}</strong><small>Rémunération du personnel</small></article>
        <article className="expenses-stat"><span><Truck size={17} /> Livraison & transport</span><strong>{money(deliveryTotal, currency)}</strong><small>Frais logistiques</small></article>
      </div>

      {showForm && <form className="expenses-form" onSubmit={saveExpense}>
        <div className="expenses-form-heading"><div><h3>Enregistrer une sortie</h3><p>Chaque opération est rattachée à cette boutique et à l’utilisateur connecté.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Fermer">×</button></div>
        <div className="expenses-form-grid">
          <label>Type d’opération<select value={expenseType} onChange={event => setExpenseType(event.target.value as ExpenseType)}>{TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Source des fonds<select value={source} onChange={event => setSource(event.target.value as PaymentSource)}>{SOURCES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="expenses-wide">Description<input required value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex. avance de caisse, salaire du mois, carburant…" /></label>
          <label>Montant ({currency})<input required min="0.01" step="0.01" type="number" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
          <label>Date<input required type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} /></label>
          <label>Bénéficiaire / employé<input value={payee} onChange={event => setPayee(event.target.value)} placeholder="Nom de l’employé ou prestataire" /></label>
          <label>Référence<input value={reference} onChange={event => setReference(event.target.value)} placeholder="N° reçu, matricule, facture…" /></label>
          <label className="expenses-wide">Notes<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Détails complémentaires (facultatif)" /></label>
        </div>
        <div className="expenses-form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Annuler</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la dépense'}</button></div>
      </form>}

      <div className="expenses-toolbar">
        <div className="expenses-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une dépense, un bénéficiaire…" /></div>
        <select value={period} onChange={event => setPeriod(event.target.value as 'month' | 'all')} aria-label="Période"><option value="month">Ce mois</option><option value="all">Toutes les dates</option></select>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Actualiser</button>
        <button type="button" className="secondary-button" onClick={exportCsv} disabled={!filtered.length}><Download size={15} /> Export CSV</button>
      </div>

      <div className="expenses-table-wrap">
        <table className="expenses-table"><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire</th><th>Source</th><th>Montant</th><th>Référence</th><th></th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id}><td><span className="expenses-date"><CalendarDays size={14} />{row.expense_date}</span></td><td><span className={'expenses-type expenses-type-' + row.expense_type}>{typeLabel(row.expense_type)}</span></td><td><strong>{row.description}</strong>{row.notes && <small className="expenses-note">{row.notes}</small>}</td><td>{row.payee_name || '—'}</td><td>{SOURCES.find(item => item.value === row.payment_source)?.label ?? '—'}</td><td className="expenses-amount">{money(Number(row.amount), currency)}</td><td>{row.reference || '—'}</td><td><button type="button" className="expenses-delete" title="Supprimer" onClick={() => void removeExpense(row)}><Trash2 size={15} /></button></td></tr>)}
          {!filtered.length && <tr><td colSpan={8} className="expenses-empty">{loading ? 'Chargement des dépenses…' : 'Aucune dépense trouvée pour cette période.'}</td></tr>}</tbody>
        </table>
      </div>
      <footer className="expenses-footnote"><Building2 size={15} /> Les sorties de caisse sont distinguées des paiements bancaires. Le solde réel du tiroir-caisse doit être rapproché avec le comptage physique à la clôture.</footer>
    </section>
  )
}
