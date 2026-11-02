import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Truck, Plus, RefreshCw, Search, Package, ClipboardList, MapPin, Phone, User, Eye, RotateCcw, Printer, CheckCircle2, Clock3, AlertCircle, X, Trash2, Filter } from 'lucide-react'
import { supabase } from './lib/supabase'
import './livraison.css'

type Delivery = { id: string; delivery_number: number | string; status: string; customer_id: string | null; recipient_name: string | null; recipient_phone: string | null; delivery_address: string | null; notes: string | null; created_at: string }
type Product = { id: string; name: string }
type Variant = { id: string; product_id: string; sku: string; size: string | null; color: string | null; sale_price: number; purchase_cost: number; active: boolean }
type Customer = { id: string; full_name: string; phone: string | null }
type Allocation = { id: string; delivery_item_id: string; location_id: string; storage_position_id: string | null; quantity_dispatched: number; quantity_returned: number }
type Item = { id: string; delivery_id: string; variant_id: string; quantity: number; unit_price: number; variant: Variant | null; product: Product | null; allocations: Allocation[] }
type Position = { id: string; location_id: string; zone_code: string | null; aisle_code: string | null; shelf_code: string | null; level_code: string | null; position_label: string | null }
type ReturnRecord = { id: string; return_number: number | string; delivery_id: string; reason: string | null; notes: string | null; created_at: string }
type DraftLine = { key: string; variant_id: string; quantity: string; unit_price: string; location_id: string }
type ReturnLine = { delivery_item_id: string; quantity: string; condition: 'new' | 'damaged' | 'defective'; location_id: string; storage_position_id: string }
type Props = { storeId: string; userId: string }

const BOUTIQUE = '5f2ccda1-58c1-4282-997b-309698834ad7'
const RESERVE = 'd67f391c-a873-4b56-a8db-0e709117eae6'
const money = (n: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(Number(n || 0))
const dateLabel = (s: string) => new Date(s).toLocaleDateString('fr-DZ')
const statusLabel = (s: string) => ({ draft: 'Brouillon', confirmed: 'Sortie confirmée', dispatched: 'Expédiée', partially_returned: 'Retour partiel', returned: 'Retournée', failed: 'Échec' }[s] || s)
const statusClass = (s: string) => ({ draft: 'draft', confirmed: 'confirmed', dispatched: 'confirmed', partially_returned: 'partial', returned: 'returned', failed: 'failed' }[s] || 'draft')

export default function LivraisonModule({ storeId, userId }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ key: 'line-1', variant_id: '', quantity: '1', unit_price: '', location_id: BOUTIQUE }])
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([])
  const [returnReason, setReturnReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!storeId) return
    setLoading(true); setError('')
    try {
      const results = await Promise.all([
        supabase.from('deliveries').select('id,delivery_number,status,customer_id,recipient_name,recipient_phone,delivery_address,notes,created_at').eq('store_id', storeId).order('created_at', { ascending: false }),
        supabase.from('products').select('id,name').eq('store_id', storeId).eq('active', true),
        supabase.from('product_variants').select('id,product_id,sku,size,color,sale_price,purchase_cost,active').eq('store_id', storeId).eq('active', true),
        supabase.from('customers').select('id,full_name,phone').eq('store_id', storeId).order('full_name'),
        supabase.from('stock_movements').select('variant_id,location_id,quantity_delta').eq('store_id', storeId),
        supabase.from('stock_storage_positions').select('id,location_id,zone_code,aisle_code,shelf_code,level_code,position_label').eq('store_id', storeId),
        supabase.from('delivery_returns').select('id,return_number,delivery_id,reason,notes,created_at').eq('store_id', storeId).order('created_at', { ascending: false }),
      ])
      for (const r of results) if (r.error) throw r.error
      setDeliveries((results[0].data || []) as Delivery[])
      setProducts((results[1].data || []) as Product[])
      setVariants((results[2].data || []) as Variant[])
      setCustomers((results[3].data || []) as Customer[])
      setPositions((results[5].data || []) as Position[])
      setReturns((results[6].data || []) as ReturnRecord[])
      const totals: Record<string, number> = {}
      for (const m of results[4].data || []) {
        const key = String(m.variant_id) + ':' + String(m.location_id)
        totals[key] = (totals[key] || 0) + Number(m.quantity_delta || 0)
      }
      setStock(totals)
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.') }
    finally { setLoading(false) }
  }, [storeId])

  useEffect(() => { void loadData() }, [loadData])

  // Keep the delivery detail dialog usable on touch devices without scrolling the page behind it.
  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showReturn) setSelected(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selected, showReturn])

  const filtered = useMemo(() => deliveries.filter(d => {
    const text = (String(d.delivery_number) + ' ' + (d.recipient_name || '') + ' ' + (d.recipient_phone || '')).toLowerCase()
    const day = d.created_at.slice(0, 10)
    return text.includes(query.trim().toLowerCase()) && (statusFilter === 'all' || d.status === statusFilter) && (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo)
  }), [deliveries, query, statusFilter, dateFrom, dateTo])

  const stats = useMemo(() => ({
    total: deliveries.length,
    drafts: deliveries.filter(d => d.status === 'draft').length,
    confirmed: deliveries.filter(d => d.status === 'confirmed' || d.status === 'dispatched').length,
    partial: deliveries.filter(d => d.status === 'partially_returned').length,
    returned: deliveries.filter(d => d.status === 'returned').length,
  }), [deliveries])

  const variantById = (id: string) => variants.find(v => v.id === id)
  const productById = (id: string) => products.find(p => p.id === id)
  const available = (variantId: string, locationId: string) => stock[variantId + ':' + locationId] || 0

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line))
  }

  function resetForm() {
    setRecipientName(''); setRecipientPhone(''); setCustomerId(''); setAddress(''); setNotes('')
    setLines([{ key: 'line-' + Date.now(), variant_id: '', quantity: '1', unit_price: '', location_id: BOUTIQUE }])
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')

    if (!recipientName.trim()) return setError('Le destinataire est obligatoire.')
    if (customerId && !customers.some(customer => customer.id === customerId)) {
      return setError('Le client sélectionné est invalide. Actualisez la liste.')
    }

    const valid = lines.filter(line => line.variant_id)
    if (!valid.length) return setError('Ajoutez au moins un article.')

    const requestedBySource = new Map<string, number>()
    for (const line of valid) {
      const quantity = Number(line.quantity)
      const unitPrice = Number(line.unit_price)
      if (!variantById(line.variant_id)) return setError('Un article sélectionné n’est plus disponible. Actualisez la liste.')
      if (!Number.isSafeInteger(quantity) || quantity < 1) return setError('Les quantités doivent être des entiers positifs.')
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return setError('Vérifiez les prix unitaires.')
      if (line.location_id !== BOUTIQUE && line.location_id !== RESERVE) return setError('Emplacement de stock invalide.')
      const sourceKey = line.variant_id + ':' + line.location_id
      requestedBySource.set(sourceKey, (requestedBySource.get(sourceKey) || 0) + quantity)
    }

    for (const [sourceKey, requested] of requestedBySource) {
      const [variantId, locationId] = sourceKey.split(':')
      if (requested > available(variantId, locationId)) {
        const variant = variantById(variantId)
        return setError('Stock insuffisant pour ' + (variant?.sku || 'un article') + ' dans cet emplacement.')
      }
    }

    setSaving(true)
    let createdDeliveryId: string | null = null
    const createdItemIds: string[] = []
    try {
      const { data: delivery, error: deliveryError } = await supabase.from('deliveries').insert({
        store_id: storeId, created_by: userId, customer_id: customerId || null,
        recipient_name: recipientName.trim(), recipient_phone: recipientPhone.trim() || null,
        delivery_address: address.trim() || null, notes: notes.trim() || null, status: 'draft',
      }).select('id').single()
      if (deliveryError) throw deliveryError
      if (!delivery?.id) throw new Error('Le brouillon a été créé sans identifiant retourné.')
      createdDeliveryId = delivery.id

      const allocationRows: Array<{
        store_id: string; delivery_id: string; delivery_item_id: string;
        location_id: string; storage_position_id: null;
        quantity_dispatched: number; quantity_returned: number;
      }> = []

      // Separate inserts preserve the exact stock source when a variant appears more than once.
      for (const line of valid) {
        const selectedVariant = variantById(line.variant_id)
        const { data: insertedItem, error: itemError } = await supabase.from('delivery_items').insert({
          store_id: storeId, delivery_id: delivery.id, variant_id: line.variant_id,
          quantity: Number(line.quantity), unit_price: Number(line.unit_price),
          unit_cost: Number(selectedVariant?.purchase_cost ?? 0),
        }).select('id').single()
        if (itemError) throw itemError
        if (!insertedItem?.id) throw new Error('Une ligne article a été créée sans identifiant retourné.')
        createdItemIds.push(insertedItem.id)
        allocationRows.push({
          store_id: storeId, delivery_id: delivery.id, delivery_item_id: insertedItem.id,
          location_id: line.location_id, storage_position_id: null,
          quantity_dispatched: Number(line.quantity), quantity_returned: 0,
        })
      }

      const { error: allocationError } = await supabase.from('delivery_item_allocations').insert(allocationRows)
      if (allocationError) throw allocationError

      setNotice('Brouillon enregistré. Aucun stock n’a été déduit.')
      setShowCreate(false); resetForm(); await loadData()
    } catch (e) {
      const originalMessage = e instanceof Error ? e.message : 'Enregistrement impossible.'
      // Compensate only rows created by this attempt, in child-to-parent order.
      // No stock movements are written while a delivery remains a draft.
      if (createdDeliveryId) {
        const cleanupErrors: string[] = []
        const { error: allocationCleanupError } = await supabase.from('delivery_item_allocations').delete().eq('store_id', storeId).eq('delivery_id', createdDeliveryId)
        if (allocationCleanupError) cleanupErrors.push(allocationCleanupError.message)
        if (createdItemIds.length) {
          const { error: itemCleanupError } = await supabase.from('delivery_items').delete().eq('store_id', storeId).in('id', createdItemIds)
          if (itemCleanupError) cleanupErrors.push(itemCleanupError.message)
        }
        const { error: deliveryCleanupError } = await supabase.from('deliveries').delete().eq('store_id', storeId).eq('id', createdDeliveryId).eq('status', 'draft')
        if (deliveryCleanupError) cleanupErrors.push(deliveryCleanupError.message)
        setError(cleanupErrors.length
          ? originalMessage + ' Le nettoyage automatique est incomplet : ' + cleanupErrors.join(' · ') + '. Vérifiez ce brouillon avant toute nouvelle tentative.'
          : originalMessage + ' Les lignes créées pendant cette tentative ont été nettoyées.')
      } else {
        setError(originalMessage)
      }
    } finally { setSaving(false) }
  }

  async function confirmDispatch(delivery: Delivery) {
    if (!window.confirm('Confirmer la sortie du BL-' + delivery.delivery_number + ' ? Le stock sera déduit.')) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('confirm_delivery', { p_delivery_id: delivery.id })
      if (rpcError) throw rpcError
      setNotice('Sortie BL-' + delivery.delivery_number + ' confirmée.')
      await loadData()
      if (selected?.id === delivery.id) await openDetails(delivery)
    } catch (e) { setError(e instanceof Error ? e.message : 'Confirmation impossible.') }
    finally { setSaving(false) }
  }

  async function openDetails(delivery: Delivery) {
    setSelected(delivery); setDetailLoading(true); setError(''); setShowReturn(false)
    try {
      const { data: rows, error: itemError } = await supabase.from('delivery_items').select('id,delivery_id,variant_id,quantity,unit_price').eq('store_id', storeId).eq('delivery_id', delivery.id)
      if (itemError) throw itemError
      const ids = (rows || []).map(row => row.id)
      const allocationResult = ids.length ? await supabase.from('delivery_item_allocations').select('id,delivery_item_id,location_id,storage_position_id,quantity_dispatched,quantity_returned').eq('store_id', storeId).in('delivery_item_id', ids) : { data: [], error: null }
      if (allocationResult.error) throw allocationResult.error
      setItems((rows || []).map(row => {
        const v = variants.find(x => x.id === row.variant_id) || null
        return { ...row, variant: v, product: v ? productById(v.product_id) || null : null, allocations: (allocationResult.data || []).filter(a => a.delivery_item_id === row.id) as Allocation[] }
      }) as Item[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Détail impossible à charger.') }
    finally { setDetailLoading(false) }
  }

  function beginReturn() {
    const draft = items.map(item => {
      const dispatched = item.allocations.reduce((s, a) => s + Number(a.quantity_dispatched), 0)
      const returned = item.allocations.reduce((s, a) => s + Number(a.quantity_returned), 0)
      return { delivery_item_id: item.id, quantity: String(Math.max(0, dispatched - returned)), condition: 'new' as const, location_id: BOUTIQUE, storage_position_id: '' }
    }).filter(l => Number(l.quantity) > 0)
    setReturnLines(draft); setReturnReason(''); setReturnNotes(''); setShowReturn(true)
  }

  async function submitReturn(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const payload = returnLines.filter(l => Number(l.quantity) > 0).map(l => ({
      delivery_item_id: l.delivery_item_id, quantity: Number(l.quantity), condition: l.condition,
      location_id: l.condition === 'new' ? l.location_id : null,
      storage_position_id: l.condition === 'new' && l.location_id === RESERVE && l.storage_position_id ? l.storage_position_id : null,
    }))
    if (!payload.length) return setError('Saisissez une quantité à retourner.')
    for (const l of payload) {
      const item = items.find(i => i.id === l.delivery_item_id)
      const dispatched = item?.allocations.reduce((s, a) => s + Number(a.quantity_dispatched), 0) || 0
      const returned = item?.allocations.reduce((s, a) => s + Number(a.quantity_returned), 0) || 0
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > dispatched - returned) return setError('Quantité invalide ou supérieure au reste retournable.')
    }
    setReturnSaving(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('return_delivery_items', {
        p_delivery_id: selected.id, p_items: payload,
        p_reason: returnReason.trim() || null, p_notes: returnNotes.trim() || null,
      })
      if (rpcError) throw rpcError
      setNotice('Retour enregistré. Les articles neufs ont été réintégrés selon la destination choisie.')
      setShowReturn(false); await loadData(); await openDetails(selected)
    } catch (e) { setError(e instanceof Error ? e.message : 'Retour impossible.') }
    finally { setReturnSaving(false) }
  }

  const selectedReturns = returns.filter(r => r.delivery_id === selected?.id)
  const total = items.reduce((s, item) => s + Number(item.quantity) * Number(item.unit_price), 0)

  return <div className="livraison-page">
    <div className="livraison-header"><div><span className="livraison-eyebrow">LOGISTIQUE & EXPÉDITION</span><h1><Truck size={27} /> Gestion des livraisons</h1><p>Préparation des bons, suivi des sorties et gestion des retours.</p></div>
      <div className="livraison-header-actions"><button className="livraison-btn secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16} /> Actualiser</button><button className="livraison-btn primary" onClick={() => { setShowCreate(v => !v); setError(''); setNotice('') }}><Plus size={17} /> Nouveau bon</button></div></div>
    {error && <div className="livraison-alert error"><AlertCircle size={17} />{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
    {notice && <div className="livraison-alert success"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
    <div className="livraison-dashboard">
      <Kpi icon={<ClipboardList />} label="Bons enregistrés" value={stats.total} /><Kpi icon={<Clock3 />} label="Brouillons" value={stats.drafts} /><Kpi icon={<Package />} label="Sorties confirmées" value={stats.confirmed} /><Kpi icon={<RotateCcw />} label="Retours partiels" value={stats.partial} /><Kpi icon={<CheckCircle2 />} label="Retours complets" value={stats.returned} />
    </div>

    {showCreate && <section className="livraison-card">
      <div className="livraison-section-heading"><div><span className="livraison-eyebrow">NOUVELLE EXPÉDITION</span><h2>Créer un bon de livraison</h2></div><button className="livraison-icon-btn" onClick={() => setShowCreate(false)}><X /></button></div>
      <form onSubmit={saveDraft}>
        <div className="livraison-form-grid">
          <label>Destinataire *<input required value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Nom du destinataire" /></label>
          <label>Client enregistré<select value={customerId} onChange={e => { setCustomerId(e.target.value); const c = customers.find(x => x.id === e.target.value); if (c) { setRecipientName(c.full_name); setRecipientPhone(c.phone || '') } }}><option value="">Saisie libre</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
          <label>Téléphone<input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} placeholder="05 / 06 / 07…" /></label>
          <label className="full">Adresse de livraison<input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresse complète" /></label>
          <label className="full">Notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        </div>
        <div className="livraison-section-heading compact"><h3>Articles à livrer</h3><span>{lines.length} ligne(s)</span></div>
        <div className="livraison-lines">{lines.map((line, index) => {
          const v = variantById(line.variant_id)
          const qty = Number(line.quantity || 0)
          return <div className="livraison-line" key={line.key}><div className="line-number">{index + 1}</div>
            <label className="product-field">Article / variante<select required value={line.variant_id} onChange={e => { const selectedVariant = variantById(e.target.value); updateLine(line.key, { variant_id: e.target.value, unit_price: selectedVariant ? String(selectedVariant.sale_price) : '' }) }}><option value="">Choisir un article</option>{variants.map(item => <option key={item.id} value={item.id}>{productById(item.product_id)?.name || 'Article'} — {item.sku} {item.size || ''} {item.color || ''}</option>)}</select>{v && <small>SKU {v.sku} · Disponible : {available(v.id, line.location_id)}</small>}</label>
            <label>Source<select value={line.location_id} onChange={e => updateLine(line.key, { location_id: e.target.value })}><option value={BOUTIQUE}>Boutique</option><option value={RESERVE}>Réserve</option></select></label>
            <label>Quantité<input type="number" min="1" step="1" required value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} /></label>
            <label>Prix unitaire (DA)<input type="number" min="0" step="1" required value={line.unit_price} onChange={e => updateLine(line.key, { unit_price: e.target.value })} /></label>
            <div className="line-total"><small>Total ligne</small><strong>{money(qty * Number(line.unit_price || 0))}</strong></div>
            <button type="button" className="livraison-icon-btn danger" onClick={() => setLines(current => current.length > 1 ? current.filter(x => x.key !== line.key) : current)}><Trash2 size={17} /></button>
          </div>
        })}</div>
        <div className="livraison-form-footer"><button type="button" className="livraison-btn secondary" onClick={() => setLines(current => [...current, { key: 'line-' + Date.now(), variant_id: '', quantity: '1', unit_price: '', location_id: BOUTIQUE }])}><Plus size={16} /> Ajouter une ligne</button><div className="livraison-total">Total du bon <strong>{money(lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0))}</strong></div><button className="livraison-btn primary" disabled={saving}>{saving ? <RefreshCw className="spin" size={16} /> : <ClipboardList size={16} />} Enregistrer en brouillon</button></div>
        <p className="livraison-hint">Le brouillon ne déduit pas le stock. La déduction intervient uniquement après confirmation de la sortie.</p>
      </form>
    </section>}

    <section className="livraison-card">
      <div className="livraison-section-heading"><div><span className="livraison-eyebrow">SUIVI OPÉRATIONNEL</span><h2>Historique des bons</h2></div><span className="livraison-count">{filtered.length} résultat(s)</span></div>
      <div className="livraison-filters"><label className="livraison-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="BL, destinataire, téléphone…" /></label>
        <label><Filter size={15} /><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="draft">Brouillons</option><option value="confirmed">Confirmés</option><option value="dispatched">Expédiés</option><option value="partially_returned">Retours partiels</option><option value="returned">Retournés</option><option value="failed">Échecs</option></select></label>
        <label>Du <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label><label>Au <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
      </div>
      {loading ? <div className="livraison-empty"><RefreshCw className="spin" /> Chargement…</div> : filtered.length === 0 ? <div className="livraison-empty"><Package size={30} /><strong>Aucun bon trouvé</strong><span>Modifiez les filtres ou créez un bon.</span></div> :
        <div className="livraison-table-wrap"><table className="livraison-table"><thead><tr><th>N° bon</th><th>Date</th><th>Destinataire</th><th>Contact</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{filtered.map(d => <tr key={d.id}><td><strong>BL-{d.delivery_number}</strong></td><td>{dateLabel(d.created_at)}</td><td>{d.recipient_name || '—'}</td><td>{d.recipient_phone || '—'}</td><td><span className={'livraison-status ' + statusClass(d.status)}>{statusLabel(d.status)}</span></td><td className="livraison-actions"><button className="livraison-icon-btn" title="Détail" onClick={() => void openDetails(d)}><Eye size={17} /></button>{d.status === 'draft' && <button className="livraison-btn small primary" disabled={saving} onClick={() => void confirmDispatch(d)}><CheckCircle2 size={15} /> Confirmer sortie</button>}</td></tr>)}</tbody></table></div>}
    </section>

    {selected && <div className="livraison-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="livraison-modal" role="dialog" aria-modal="true" aria-labelledby="livraison-dialog-title">
      <div className="livraison-section-heading"><div><span className="livraison-eyebrow">DOCUMENT DE LIVRAISON</span><h2 id="livraison-dialog-title">BL-{selected.delivery_number}</h2></div><button className="livraison-icon-btn" onClick={() => setSelected(null)}><X /></button></div>
      <div className="livraison-detail-top"><div><User size={16} /><span><small>Destinataire</small><strong>{selected.recipient_name || '—'}</strong></span></div><div><Phone size={16} /><span><small>Téléphone</small><strong>{selected.recipient_phone || '—'}</strong></span></div><div><MapPin size={16} /><span><small>Adresse</small><strong>{selected.delivery_address || '—'}</strong></span></div><div><Clock3 size={16} /><span><small>Date</small><strong>{dateLabel(selected.created_at)}</strong></span></div></div>
      {detailLoading ? <div className="livraison-empty"><RefreshCw className="spin" /> Chargement du détail…</div> : <>
        <div className="livraison-table-wrap"><table className="livraison-table"><thead><tr><th>Article</th><th>SKU / Variante</th><th>Qté</th><th>Prix unit.</th><th>Total</th><th>Sortie / Retour</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.product?.name || 'Article'}</td><td>{item.variant?.sku || '—'} {item.variant?.size || ''} {item.variant?.color || ''}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.quantity * item.unit_price)}</td><td>{item.allocations.map(a => <small key={a.id} className="allocation-note">{a.location_id === RESERVE ? 'Réserve' : 'Boutique'} : {a.quantity_dispatched} sorti / {a.quantity_returned} retourné</small>)}</td></tr>)}</tbody></table></div>
        <div className="livraison-detail-total"><span>Total du bon</span><strong>{money(total)}</strong></div>
        {selected.notes && <p className="livraison-hint">Notes : {selected.notes}</p>}
        {selectedReturns.length > 0 && <div className="livraison-return-history"><h3>Historique des retours</h3>{selectedReturns.map(r => <div key={r.id}><strong>Retour #{r.return_number}</strong><span>{dateLabel(r.created_at)} · {r.reason || 'Sans motif'}</span></div>)}</div>}
        {showReturn && <form className="livraison-return-panel" onSubmit={submitReturn}><div className="livraison-section-heading compact"><h3>Enregistrer un retour</h3><button type="button" className="livraison-icon-btn" onClick={() => setShowReturn(false)}><X size={16} /></button></div>
          {returnLines.map(line => { const item = items.find(x => x.id === line.delivery_item_id)!; const max = item.allocations.reduce((s, a) => s + Number(a.quantity_dispatched) - Number(a.quantity_returned), 0)
            return <div className="livraison-return-line" key={line.delivery_item_id}><strong>{item.product?.name || 'Article'} · {item.variant?.sku || ''}</strong><small>Reste retournable : {max}</small>
              <label>Quantité<input type="number" min="0" max={max} step="1" value={line.quantity} onChange={e => setReturnLines(current => current.map(x => x.delivery_item_id === line.delivery_item_id ? { ...x, quantity: e.target.value } : x))} /></label>
              <label>État<select value={line.condition} onChange={e => setReturnLines(current => current.map(x => x.delivery_item_id === line.delivery_item_id ? { ...x, condition: e.target.value as ReturnLine['condition'] } : x))}><option value="new">Neuf / revendable</option><option value="damaged">Endommagé</option><option value="defective">Défectueux</option></select></label>
              {line.condition === 'new' && <><label>Destination<select value={line.location_id} onChange={e => setReturnLines(current => current.map(x => x.delivery_item_id === line.delivery_item_id ? { ...x, location_id: e.target.value, storage_position_id: '' } : x))}><option value={BOUTIQUE}>Boutique</option><option value={RESERVE}>Réserve</option></select></label>{line.location_id === RESERVE && <label>Position (facultatif)<select value={line.storage_position_id} onChange={e => setReturnLines(current => current.map(x => x.delivery_item_id === line.delivery_item_id ? { ...x, storage_position_id: e.target.value } : x))}><option value="">Sans position précise</option>{positions.filter(p => p.location_id === RESERVE).map(p => <option key={p.id} value={p.id}>{p.position_label || [p.zone_code,p.aisle_code,p.shelf_code,p.level_code].filter(Boolean).join(' / ') || p.id.slice(0, 8)}</option>)}</select></label>}</>}
              {line.condition !== 'new' && <p className="livraison-hint">Enregistré sans réintégration dans le stock vendable.</p>}
            </div>
          })}
          <label>Motif<input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Motif du retour" /></label><label>Observations<textarea rows={2} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} /></label>
          <div className="livraison-form-footer"><button type="button" className="livraison-btn secondary" onClick={() => setShowReturn(false)}>Annuler</button><button className="livraison-btn primary" disabled={returnSaving}>{returnSaving ? <RefreshCw className="spin" size={16} /> : <RotateCcw size={16} />} Valider le retour</button></div>
        </form>}
      </>}
      <div className="livraison-modal-footer"><button className="livraison-btn secondary" onClick={() => window.print()}><Printer size={16} /> Imprimer A4 / 80 mm</button>{['confirmed','dispatched','partially_returned','failed'].includes(selected.status) && !showReturn && <button className="livraison-btn primary" onClick={beginReturn}><RotateCcw size={16} /> Enregistrer un retour</button>}{selected.status === 'draft' && <button className="livraison-btn primary" onClick={() => void confirmDispatch(selected)}><CheckCircle2 size={16} /> Confirmer la sortie</button>}</div>
    </section></div>}
    <div className="livraison-print-document"><h1>Bon de livraison BL-{selected?.delivery_number || ''}</h1><p>Date : {selected ? dateLabel(selected.created_at) : ''}</p><p>Destinataire : {selected?.recipient_name || ''}</p><p>Téléphone : {selected?.recipient_phone || ''}</p><p>Adresse : {selected?.delivery_address || ''}</p><table><thead><tr><th>Article</th><th>Référence</th><th>Qté</th><th>PU</th><th>Total</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.product?.name || 'Article'}</td><td>{item.variant?.sku || ''}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.quantity * item.unit_price)}</td></tr>)}</tbody></table><h2>Total : {money(total)}</h2><p>Signature du destinataire : __________________________</p></div>
  </div>
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="livraison-kpi"><div className="livraison-kpi-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>
}
