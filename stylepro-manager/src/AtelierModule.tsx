import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Factory, Plus, Save, RefreshCw, Scissors, Users, CalendarDays,
  Package, Phone, MapPin, FileText, Ruler, Trash2, Search, X
} from 'lucide-react'
import { supabase } from './lib/supabase'

type Supplier = { id: string; name: string; phone: string | null; address: string | null; notes: string | null }
type SizeLine = { size_name: string; unit_price: string; quantity: string }
type Production = {
  id: string; production_number: number; production_date: string; supplier_name_snapshot: string
  fabric_name: string; fabric_number: string | null; fabric_quantity_m: number
  fabric_price_per_m: number; fabric_total_cost: number; model_name: string; color: string
  total_quantity: number; total_production_price: number; notes: string | null
}
const adultSizes = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Standard']
const childSizes = ['8 ans', '16 ans']

export default function AtelierModule({ storeId, userId }: { storeId: string; userId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10))
  const [fabricName, setFabricName] = useState('')
  const [fabricNumber, setFabricNumber] = useState('')
  const [fabricMeters, setFabricMeters] = useState('')
  const [fabricPrice, setFabricPrice] = useState('')
  const [modelName, setModelName] = useState('')
  const [color, setColor] = useState('')
  const [sizeType, setSizeType] = useState<'adult' | 'child' | 'custom'>('adult')
  const [customSize, setCustomSize] = useState('')
  const [sizes, setSizes] = useState<SizeLine[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selectedSupplier = suppliers.find(item => item.id === supplierId)
  const totalQuantity = useMemo(() => sizes.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0), [sizes])
  const totalProductionPrice = useMemo(() => sizes.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unit_price) || 0), 0), [sizes])
  const fabricCost = (Math.max(0, Number(fabricMeters) || 0) * Math.max(0, Number(fabricPrice) || 0))
  const money = (value: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 2 }).format(value)

  async function loadData() {
    if (!storeId) return
    setLoading(true); setError('')
    const [supplierResult, productionResult] = await Promise.all([
      supabase.from('atelier_suppliers').select('id,name,phone,address,notes').eq('store_id', storeId).order('name'),
      supabase.from('atelier_productions').select('id,production_number,production_date,supplier_name_snapshot,fabric_name,fabric_number,fabric_quantity_m,fabric_price_per_m,fabric_total_cost,model_name,color,total_quantity,total_production_price,notes').eq('store_id', storeId).order('production_number', { ascending: false }).limit(100)
    ])
    if (supplierResult.error) setError(supplierResult.error.message)
    else setSuppliers((supplierResult.data ?? []) as Supplier[])
    if (productionResult.error) setError(current => current || productionResult.error!.message)
    else setProductions((productionResult.data ?? []) as Production[])
    setLoading(false)
  }
  useEffect(() => { void loadData() }, [storeId])

  function resetProduction() {
    setProductionDate(new Date().toISOString().slice(0, 10)); setFabricName(''); setFabricNumber('')
    setFabricMeters(''); setFabricPrice(''); setModelName(''); setColor(''); setSizes([]); setNotes('')
    setError(''); setMessage('')
  }
  function toggleSize(size: string, checked: boolean) {
    setSizes(current => checked
      ? [...current, { size_name: size, unit_price: '', quantity: '' }]
      : current.filter(line => line.size_name !== size))
  }
  function changeSize(index: number, key: 'unit_price' | 'quantity', value: string) {
    setSizes(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line))
  }
  function changeSizeType(value: 'adult' | 'child' | 'custom') {
    setSizeType(value); setSizes([]); setCustomSize('')
  }
  async function saveSupplier(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!supplierName.trim()) return setError('Le nom du fournisseur est obligatoire.')
    setSaving(true)
    const { data, error: saveError } = await supabase.from('atelier_suppliers').insert({
      store_id: storeId, name: supplierName.trim(), phone: supplierPhone.trim() || null,
      address: supplierAddress.trim() || null, notes: supplierNotes.trim() || null
    }).select('id,name,phone,address,notes').single()
    setSaving(false)
    if (saveError) return setError(saveError.message)
    const supplier = data as Supplier
    setSuppliers(current => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)))
    setSupplierId(supplier.id); setSupplierFormOpen(false); setSupplierName(''); setSupplierPhone('')
    setSupplierAddress(''); setSupplierNotes(''); setMessage('Fournisseur enregistré.')
  }
  async function saveProduction(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!supplierId || !selectedSupplier) return setError('Choisissez ou créez un fournisseur.')
    if (!fabricName.trim() || !modelName.trim() || !color.trim()) return setError('Renseignez le tissu, le modèle et la couleur.')
    if (!(Number(fabricMeters) > 0) || Number(fabricPrice) < 0 || fabricPrice === '') return setError('La quantité de tissu doit être positive et son prix valide.')
    if (!sizes.length) return setError('Sélectionnez au moins une taille.')
    if (sizes.some(line => !line.quantity || Number(line.quantity) <= 0 || line.unit_price === '' || Number(line.unit_price) < 0)) return setError('Chaque taille doit avoir une quantité positive et un prix valide.')
    setSaving(true)
    const { data: production, error: productionError } = await supabase.from('atelier_productions').insert({
      store_id: storeId, production_date: productionDate, supplier_id: supplierId,
      supplier_name_snapshot: selectedSupplier.name, fabric_name: fabricName.trim(),
      fabric_number: fabricNumber.trim() || null, fabric_quantity_m: Number(fabricMeters),
      fabric_price_per_m: Number(fabricPrice), model_name: modelName.trim(), color: color.trim(),
      total_quantity: totalQuantity, total_production_price: Number(totalProductionPrice.toFixed(2)),
      notes: notes.trim() || null, created_by: userId
    }).select('id').single()
    if (productionError || !production) { setSaving(false); return setError(productionError?.message || 'Création de production impossible.') }
    const { error: sizeError } = await supabase.from('atelier_production_sizes').insert(
      sizes.map(line => ({ store_id: storeId, production_id: production.id, size_name: line.size_name, unit_price: Number(line.unit_price), quantity: Number(line.quantity) }))
    )
    if (sizeError) {
      // Roll back only this just-created production if its size lines could not be saved.
      await supabase.from('atelier_productions').delete().eq('store_id', storeId).eq('id', production.id)
      setSaving(false); return setError('Les tailles n’ont pas été enregistrées. La production en cours a été annulée : ' + sizeError.message)
    }
    setSaving(false); setMessage('Production enregistrée avec succès.'); resetProduction(); await loadData()
  }
  const filteredProductions = productions.filter(p => [String(p.production_number), p.model_name, p.fabric_name, p.supplier_name_snapshot, p.color].join(' ').toLowerCase().includes(search.toLowerCase()))

  return <div className="atelier-module">
    <div className="atelier-hero">
      <div className="atelier-hero-icon"><Factory size={27}/></div>
      <div className="atelier-hero-copy"><span className="atelier-eyebrow">PRODUCTION TEXTILE</span><h1>Atelier</h1><p>Planifiez vos fabrications, gérez les fournisseurs et calculez automatiquement les quantités et montants.</p></div>
      <button className="atelier-secondary-button" type="button" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16}/> Actualiser</button>
    </div>
    {error && <div className="atelier-alert error"><X size={17}/>{error}</div>}
    {message && <div className="atelier-alert success">{message}</div>}

    <section className="atelier-card">
      <div className="atelier-section-heading"><div className="atelier-section-icon"><Users size={19}/></div><div><h2>Fournisseur de tissu</h2><p>Choisissez un fournisseur enregistré ou ajoutez-en un nouveau.</p></div><button type="button" className="atelier-secondary-button" onClick={() => setSupplierFormOpen(v => !v)}><Plus size={16}/>{supplierFormOpen ? 'Fermer' : 'Nouveau fournisseur'}</button></div>
      <div className="atelier-supplier-layout">
        <label className="atelier-field"><span>Fournisseur enregistré</span><select value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Choisir un fournisseur…</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="atelier-supplier-details">
          <div><Phone size={15}/><span><small>Téléphone</small><strong>{selectedSupplier?.phone || 'Non renseigné'}</strong></span></div>
          <div><MapPin size={15}/><span><small>Adresse</small><strong>{selectedSupplier?.address || 'Non renseignée'}</strong></span></div>
          <div><FileText size={15}/><span><small>Notes</small><strong>{selectedSupplier?.notes || 'Aucune note'}</strong></span></div>
        </div>
      </div>
      {supplierFormOpen && <form className="atelier-inline-form" onSubmit={saveSupplier}>
        <label className="atelier-field"><span>Nom du fournisseur *</span><input value={supplierName} onChange={e => setSupplierName(e.target.value)} required placeholder="Nom / raison sociale"/></label>
        <label className="atelier-field"><span>Téléphone</span><input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="05 xx xx xx xx"/></label>
        <label className="atelier-field"><span>Adresse</span><input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Adresse du fournisseur"/></label>
        <label className="atelier-field"><span>Notes</span><input value={supplierNotes} onChange={e => setSupplierNotes(e.target.value)} placeholder="Informations complémentaires"/></label>
        <button className="atelier-primary-button" disabled={saving}><Save size={16}/>{saving ? 'Enregistrement…' : 'Enregistrer le fournisseur'}</button>
      </form>}
    </section>

    <form className="atelier-card atelier-production-form" onSubmit={saveProduction}>
      <div className="atelier-section-heading"><div className="atelier-section-icon"><Scissors size={19}/></div><div><h2>Nouvelle production</h2><p>Le numéro de production est attribué automatiquement par la base de données.</p></div><span className="atelier-auto-number">N° AUTO</span></div>
      <div className="atelier-form-grid">
        <label className="atelier-field"><span>Date de production *</span><div className="atelier-input-icon"><CalendarDays size={16}/><input type="date" required value={productionDate} onChange={e => setProductionDate(e.target.value)}/></div></label>
        <label className="atelier-field"><span>Nom du tissu *</span><input required value={fabricName} onChange={e => setFabricName(e.target.value)} placeholder="Ex. Coton, denim…"/></label>
        <label className="atelier-field"><span>Numéro du tissu</span><input value={fabricNumber} onChange={e => setFabricNumber(e.target.value)} placeholder="Référence / lot"/></label>
        <label className="atelier-field"><span>Quantité de tissu (m) *</span><input type="number" min="0.001" step="0.001" required value={fabricMeters} onChange={e => setFabricMeters(e.target.value)} placeholder="0,000"/></label>
        <label className="atelier-field"><span>Prix du mètre (DA) *</span><input type="number" min="0" step="0.01" required value={fabricPrice} onChange={e => setFabricPrice(e.target.value)} placeholder="0,00"/></label>
        <label className="atelier-field"><span>Modèle fabriqué *</span><input required value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Nom du modèle"/></label>
        <label className="atelier-field"><span>Couleur *</span><input required value={color} onChange={e => setColor(e.target.value)} placeholder="Ex. Noir, beige…"/></label>
        <label className="atelier-field atelier-notes-field"><span>Notes de production</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations éventuelles"/></label>
      </div>
      <div className="atelier-cost-strip"><div><small>Coût du tissu</small><strong>{money(fabricCost)}</strong></div><div><small>Quantité totale à fabriquer</small><strong>{totalQuantity.toLocaleString('fr-DZ')}</strong></div><div><small>Montant total de production</small><strong>{money(totalProductionPrice)}</strong></div></div>

      <div className="atelier-size-header"><div><h3><Ruler size={18}/> Répartition par taille</h3><p>Choisissez les tailles : chaque ligne calcule son montant automatiquement.</p></div>
        <label className="atelier-field atelier-size-type"><span>Type de tailles</span><select value={sizeType} onChange={e => changeSizeType(e.target.value as 'adult' | 'child' | 'custom')}><option value="adult">Adulte</option><option value="child">Enfant</option><option value="custom">Taille personnalisée</option></select></label>
      </div>
      {sizeType === 'custom' && <div className="atelier-custom-size"><input value={customSize} onChange={e => setCustomSize(e.target.value)} placeholder="Nom de la taille"/><button type="button" className="atelier-secondary-button" disabled={!customSize.trim() || sizes.some(s => s.size_name === customSize.trim())} onClick={() => { toggleSize(customSize.trim(), true); setCustomSize('') }}><Plus size={15}/> Ajouter taille</button></div>}
      <div className="atelier-size-options">{(sizeType === 'adult' ? adultSizes : sizeType === 'child' ? childSizes : []).map(size => <label key={size} className={sizes.some(s => s.size_name === size) ? 'atelier-size-chip selected' : 'atelier-size-chip'}><input type="checkbox" checked={sizes.some(s => s.size_name === size)} onChange={e => toggleSize(size, e.target.checked)}/><span>{size}</span></label>)}</div>
      {sizes.length > 0 && <div className="atelier-size-table-wrap"><table className="atelier-size-table"><thead><tr><th>Taille</th><th>Prix unitaire (DA)</th><th>Quantité</th><th>Total ligne</th><th></th></tr></thead><tbody>{sizes.map((line, index) => <tr key={line.size_name}><td><strong>{line.size_name}</strong></td><td><input aria-label={'Prix taille ' + line.size_name} type="number" min="0" step="0.01" value={line.unit_price} onChange={e => changeSize(index, 'unit_price', e.target.value)} required placeholder="0,00"/></td><td><input aria-label={'Quantité taille ' + line.size_name} type="number" min="1" step="1" value={line.quantity} onChange={e => changeSize(index, 'quantity', e.target.value)} required placeholder="0"/></td><td className="atelier-line-total">{money((Number(line.unit_price) || 0) * (Number(line.quantity) || 0))}</td><td><button type="button" className="atelier-icon-button" aria-label={'Retirer taille ' + line.size_name} onClick={() => toggleSize(line.size_name, false)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}
      <div className="atelier-form-actions"><button type="button" className="atelier-secondary-button" onClick={resetProduction}>Réinitialiser</button><button className="atelier-primary-button" disabled={saving || !storeId || !sizes.length}><Save size={17}/>{saving ? 'Enregistrement…' : 'Enregistrer la production'}</button></div>
    </form>

    <section className="atelier-card">
      <div className="atelier-section-heading"><div className="atelier-section-icon"><Package size={19}/></div><div><h2>Historique des productions</h2><p>Les productions enregistrées dans cette boutique.</p></div><span className="atelier-count">{productions.length}</span></div>
      <div className="atelier-history-toolbar"><div className="atelier-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher N°, modèle, tissu, fournisseur…"/></div></div>
      {loading ? <div className="atelier-empty"><RefreshCw className="atelier-spin" size={20}/>Chargement des productions…</div> : filteredProductions.length === 0 ? <div className="atelier-empty"><Factory size={24}/><strong>Aucune production enregistrée</strong><span>Les productions réelles apparaîtront ici après enregistrement.</span></div> : <div className="atelier-production-list">{filteredProductions.map(p => <article key={p.id} className="atelier-production-row"><div className="atelier-production-number">#{p.production_number}</div><div className="atelier-production-main"><strong>{p.model_name} <span className="atelier-color-dot" title={p.color}/></strong><span>{p.fabric_name}{p.fabric_number ? ' · ' + p.fabric_number : ''} · {p.color}</span><small>{p.supplier_name_snapshot} · {new Date(p.production_date + 'T12:00:00').toLocaleDateString('fr-DZ')}</small></div><div className="atelier-production-metric"><small>Quantité</small><strong>{p.total_quantity}</strong></div><div className="atelier-production-metric"><small>Coût tissu</small><strong>{money(Number(p.fabric_total_cost))}</strong></div><div className="atelier-production-metric"><small>Montant production</small><strong>{money(Number(p.total_production_price))}</strong></div></article>)}</div>}
    </section>
    <p className="atelier-footnote">Les données sont enregistrées dans Supabase et isolées par boutique. Aucun article, vente ou mouvement de stock existant n’est modifié par ce module.</p>
  </div>
}
