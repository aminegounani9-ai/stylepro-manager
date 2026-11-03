import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Factory,
  Plus,
  Save,
  RefreshCw,
  Scissors,
  Users,
  Package,
  FileText,
  Search,
  X,
  Printer
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { getLocalRecords, saveLocalRecord, type EntityTable } from './lib/offlineDb'


type SupplierType = 'tissu' | 'confection'
type Supplier = {
  id: string; name: string; phone: string | null; address: string | null
  notes: string | null; supplier_type: SupplierType
}
type SizeLine = { size_name: string; quantity: string; unit_price: string; sale_price: string }
type TargetAudience = 'men' | 'women' | 'children' | 'unisex'

type ModelDraft = {
  localId: string
  model_name: string
  color: string
  target_audience: TargetAudience
  sizes: SizeLine[]
}
type Production = {
  id: string; production_number: number; production_date: string
  supplier_name_snapshot: string; confection_supplier_name_snapshot: string | null
  fabric_name: string; fabric_number: string | null; fabric_quantity_m: number
  fabric_price_per_m: number; fabric_total_cost: number | null
  model_name: string; color: string; total_quantity: number
  total_production_price: number; total_confection_cost: number | null
  total_cost: number | null; total_sales_price: number | null
  gross_profit: number | null; margin_percent: number | null; notes: string | null
}
type ModelRecord = {
  id: string
  production_id: string
  model_number: number
  model_name: string
  sku: string
  color: string | null
  target_audience: TargetAudience
  total_quantity: number
  total_production_cost: number
  total_sales_price: number
  gross_profit: number
}
type SizeRecord = {
  id: string; production_id: string; model_id: string | null; size_name: string
  quantity: number; unit_price: number; sale_price: number; line_total: number | null
}
const money = (n: number) => new Intl.NumberFormat('fr-DZ', {
  style: 'currency', currency: 'DZD', maximumFractionDigits: 2
}).format(Number.isFinite(n) ? n : 0)
const num = (v: string) => Math.max(0, Number(v) || 0)
const makeModel = (): ModelDraft => ({
  localId: `${Date.now()}-${Math.random()}`,
  model_name: '',
  color: '',
  target_audience: 'unisex',
  sizes: []
})
export default function AtelierModule({ storeId, userId }: { storeId: string; userId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [modelsByProduction, setModelsByProduction] = useState<Record<string, ModelRecord[]>>({})
  const [sizesByProduction, setSizesByProduction] = useState<Record<string, SizeRecord[]>>({})
  const [fabricSupplierId, setFabricSupplierId] = useState('')
  const [sewingSupplierId, setSewingSupplierId] = useState('')
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [supplierType, setSupplierType] = useState<SupplierType>('tissu')
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10))
  const [fabricName, setFabricName] = useState('')
  const [fabricNumber, setFabricNumber] = useState('')
  const [fabricMeters, setFabricMeters] = useState('')
  const [fabricPrice, setFabricPrice] = useState('')
  const [confectionCost, setConfectionCost] = useState('')
  const [modelCount, setModelCount] = useState('1')
  const [models, setModels] = useState<ModelDraft[]>([makeModel()])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [integratedProductionIds, setIntegratedProductionIds] = useState<string[]>([])
  const [integratingId, setIntegratingId] = useState<string | null>(null)

  const fabricSuppliers = suppliers.filter(s => s.supplier_type === 'tissu')
  const sewingSuppliers = suppliers.filter(s => s.supplier_type === 'confection')
  const selectedFabricSupplier = fabricSuppliers.find(s => s.id === fabricSupplierId)
  const selectedSewingSupplier = sewingSuppliers.find(s => s.id === sewingSupplierId)

  const calculations = useMemo(() => {
    const rows = models.flatMap(m => m.sizes)
    const quantity = rows.reduce((a, x) => a + num(x.quantity), 0)
    const confectionLinesCost = rows.reduce((a, x) => a + num(x.quantity) * num(x.unit_price), 0)
    const sales = rows.reduce((a, x) => a + num(x.quantity) * num(x.sale_price), 0)
    const fabric = num(fabricMeters) * num(fabricPrice)
    const sewing = num(confectionCost)
    const cost = fabric + confectionLinesCost + sewing
    const profit = sales - cost
    return { quantity, confectionLinesCost, sales, fabric, sewing, cost, profit, margin: sales > 0 ? profit / sales * 100 : 0 }
  }, [models, fabricMeters, fabricPrice, confectionCost])

  async function audit(action: string, entityType: string, entityId: string | null, details: Record<string, unknown>) {
    const { error: auditError } = await supabase.from('audit_logs').insert({
      store_id: storeId, actor_id: userId, action, entity_type: entityType,
      entity_id: entityId, details
    })
    if (auditError) console.error('Atelier audit log failed:', auditError.message)
  }

  async function loadData() {
    if (!storeId) return
    setLoading(true); setError('')
    const cache = async (table: EntityTable, rows: Array<Record<string, unknown>>) =>
      Promise.all(rows.map(row => saveLocalRecord(table, storeId, row)))
    const cached = async <T,>(table: EntityTable): Promise<T[]> =>
      (await getLocalRecords<T>(storeId, table)).map(row => row.data)
    try {
      const [supplierResult, productionResult, integrationResult] = await Promise.all([
        supabase.from('atelier_suppliers').select('id,name,phone,address,notes,supplier_type').eq('store_id', storeId).order('name'),
        supabase.from('atelier_productions').select('id,production_number,production_date,supplier_name_snapshot,confection_supplier_name_snapshot,fabric_name,fabric_number,fabric_quantity_m,fabric_price_per_m,fabric_total_cost,model_name,color,total_quantity,total_production_price,total_confection_cost,total_cost,total_sales_price,gross_profit,margin_percent,notes').eq('store_id', storeId).order('production_number', { ascending: false }).limit(200),
        supabase.from('atelier_stock_integrations').select('production_id').eq('store_id', storeId)
      ])
      if (supplierResult.error) throw supplierResult.error
      if (productionResult.error) throw productionResult.error
      if (integrationResult.error) throw integrationResult.error
      const suppliers = (supplierResult.data ?? []) as Supplier[]
      const productions = (productionResult.data ?? []) as Production[]
      await Promise.all([
        cache('atelier_suppliers', supplierResult.data ?? []),
        cache('atelier_productions', productionResult.data ?? []),
        cache('atelier_stock_integrations', integrationResult.data ?? [])
      ])
      setSuppliers(suppliers); setProductions(productions)
      setIntegratedProductionIds([...new Set((integrationResult.data ?? []).map(x => x.production_id))])
      if (productions.length) {
        const ids = productions.map(x => x.id)
        const [modelResult, sizeResult] = await Promise.all([
          supabase.from('atelier_production_models').select('id,production_id,model_number,model_name,sku,color,target_audience,total_quantity,total_production_cost,total_sales_price,gross_profit').eq('store_id', storeId).in('production_id', ids),
          supabase.from('atelier_production_sizes').select('id,production_id,model_id,size_name,quantity,unit_price,sale_price,line_total').eq('store_id', storeId).in('production_id', ids)
        ])
        if (modelResult.error) throw modelResult.error
        if (sizeResult.error) throw sizeResult.error
        await Promise.all([
          cache('atelier_production_models', modelResult.data ?? []),
          cache('atelier_production_sizes', sizeResult.data ?? [])
        ])
        const groupedModels: Record<string, ModelRecord[]> = {}
        ;((modelResult.data ?? []) as ModelRecord[]).forEach(m => { (groupedModels[m.production_id] ||= []).push(m) })
        const groupedSizes: Record<string, SizeRecord[]> = {}
        ;((sizeResult.data ?? []) as SizeRecord[]).forEach(x => { (groupedSizes[x.production_id] ||= []).push(x) })
        setModelsByProduction(groupedModels); setSizesByProduction(groupedSizes)
      } else { setModelsByProduction({}); setSizesByProduction({}) }
    } catch (onlineError) {
      try {
        const [suppliers, productions, models, sizes, integrations] = await Promise.all([
          cached<Supplier>('atelier_suppliers'), cached<Production>('atelier_productions'),
          cached<ModelRecord>('atelier_production_models'), cached<SizeRecord>('atelier_production_sizes'),
          cached<{production_id:string}>('atelier_stock_integrations')
        ])
        if (!suppliers.length && !productions.length) throw onlineError
        setSuppliers(suppliers); setProductions(productions)
        const groupedModels: Record<string, ModelRecord[]> = {}
        models.forEach(m => { (groupedModels[m.production_id] ||= []).push(m) })
        const groupedSizes: Record<string, SizeRecord[]> = {}
        sizes.forEach(x => { (groupedSizes[x.production_id] ||= []).push(x) })
        setModelsByProduction(groupedModels); setSizesByProduction(groupedSizes)
        setIntegratedProductionIds([...new Set(integrations.map(x => x.production_id))])
        setError('Mode hors ligne : données Atelier affichées depuis le cache local. Création et intégration au stock nécessitent Internet.')
      } catch {
        setError(onlineError instanceof Error ? onlineError.message : 'Chargement Atelier impossible.')
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { void loadData() }, [storeId])

  function resetProduction() {
    setProductionDate(new Date().toISOString().slice(0, 10))
    setFabricName(''); setFabricNumber(''); setFabricMeters(''); setFabricPrice('')
    setConfectionCost(''); setModelCount('1'); setModels([makeModel()]); setNotes('')
    setError(''); setMessage('')
  }
  function updateModel(index: number, patch: Partial<ModelDraft>) {
    setModels(current => current.map((m, i) => i === index ? { ...m, ...patch } : m))
  }
  function setModelNumber(value: string) {
    const count = Math.min(20, Math.max(1, Number(value) || 1))
    setModelCount(String(count))
    setModels(current => Array.from({ length: count }, (_, i) => current[i] || makeModel()))
  }
  function toggleSize(modelIndex: number, sizeName: string, checked: boolean) {
    setModels(current => current.map((m, i) => i !== modelIndex ? m : {
      ...m, sizes: checked
        ? [...m.sizes, { size_name: sizeName, quantity: '', unit_price: '', sale_price: '' }]
        : m.sizes.filter(s => s.size_name !== sizeName)
    }))
  }
  function updateSize(modelIndex: number, sizeIndex: number, key: keyof SizeLine, value: string) {
    setModels(current => current.map((m, i) => i !== modelIndex ? m : ({
      ...m, sizes: m.sizes.map((s, j) => j === sizeIndex ? { ...s, [key]: value } : s)
    })))
  }
  function addCustomSize(modelIndex: number) {
    const name = window.prompt('Nom de la taille (ex. 42, 3XL, 10 ans)')
    if (!name?.trim()) return
    const clean = name.trim()
    if (models[modelIndex].sizes.some(s => s.size_name.toLowerCase() === clean.toLowerCase())) return
    updateModel(modelIndex, { sizes: [...models[modelIndex].sizes, { size_name: clean, quantity: '', unit_price: '', sale_price: '' }] })
  }
  function removeSize(modelIndex: number, sizeIndex: number) {
    setModels(current => current.map((model, index) =>
      index !== modelIndex
        ? model
        : { ...model, sizes: model.sizes.filter((_, lineIndex) => lineIndex !== sizeIndex) }
    ))
  }

  async function saveSupplier(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!supplierName.trim()) return setError('Le nom du fournisseur est obligatoire.')
    setSaving(true)
    const payload = {
      store_id: storeId, name: supplierName.trim(), phone: supplierPhone.trim() || null,
      address: supplierAddress.trim() || null, notes: supplierNotes.trim() || null,
      supplier_type: supplierType
    }
    const { data, error: e } = await supabase.from('atelier_suppliers')
      .insert(payload).select('id,name,phone,address,notes,supplier_type').single()
    setSaving(false)
    if (e) return setError(e.message)
    const supplier = data as Supplier
    setSuppliers(current => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)))
    if (supplierType === 'tissu') setFabricSupplierId(supplier.id)
    else setSewingSupplierId(supplier.id)
    await audit('atelier.supplier.created', 'atelier_supplier', supplier.id, {
      name: supplier.name, supplier_type: supplier.supplier_type
    })
    setSupplierFormOpen(false); setSupplierName(''); setSupplierPhone('')
    setSupplierAddress(''); setSupplierNotes('')
    setMessage('Fournisseur enregistré.')
  }

  async function saveProduction(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!fabricSupplierId || !selectedFabricSupplier) return setError('Choisissez un fournisseur de tissu.')
    if (!fabricName.trim()) return setError('Le nom du tissu est obligatoire.')
    if (!(num(fabricMeters) > 0) || fabricPrice === '') return setError('Saisissez une quantité de tissu positive et un prix valide.')
    if (!models.length || models.some(m => !m.model_name.trim() || !m.color.trim() || !m.sizes.length))
      return setError('Chaque modèle doit avoir un nom, une couleur et au moins une taille.')
    if (models.some(m => m.sizes.some(s => !s.size_name.trim() || !(num(s.quantity) > 0) || s.unit_price === '' || s.sale_price === '')))
      return setError('Chaque taille doit avoir une quantité positive, un coût unitaire et un prix de vente.')
    if (num(confectionCost) > 0 && !selectedSewingSupplier)
      return setError('Choisissez le fournisseur de confection si vous saisissez un coût de confection.')
    setSaving(true)
    const legacyFirstModel = models[0]
    const productionPayload = {
      store_id: storeId, production_date: productionDate, supplier_id: fabricSupplierId,
      supplier_name_snapshot: selectedFabricSupplier.name,
      confection_supplier_id: sewingSupplierId || null,
      confection_supplier_name_snapshot: selectedSewingSupplier?.name || null,
      fabric_name: fabricName.trim(), fabric_number: fabricNumber.trim() || null,
      fabric_quantity_m: num(fabricMeters),
      fabric_price_per_m: num(fabricPrice),
      model_name: legacyFirstModel.model_name.trim(),
      color: legacyFirstModel.color.trim(),      total_quantity: calculations.quantity,
      total_production_price: calculations.confectionLinesCost,
      total_confection_cost: calculations.sewing, total_cost: calculations.cost,
      total_sales_price: calculations.sales, gross_profit: calculations.profit,
      margin_percent: calculations.margin, notes: notes.trim() || null, created_by: userId
    }
    const { data: production, error: pe } = await supabase.from('atelier_productions')
      .insert(productionPayload).select('id,production_number').single()
    if (pe || !production) { setSaving(false); return setError(pe?.message || 'Création impossible.') }

    const modelPayload = models.map((m, i) => ({
      store_id: storeId,
      production_id: production.id,
      model_number: i + 1,
      model_name: m.model_name.trim(),
      sku: `ATL-${String(production.production_number).padStart(6, '0')}-M${String(i + 1).padStart(2, '0')}`,
      color: m.color.trim(),
      target_audience: m.target_audience,
      total_quantity: m.sizes.reduce((a, s) => a + num(s.quantity), 0),
      total_production_cost: m.sizes.reduce((a, s) => a + num(s.quantity) * num(s.unit_price), 0),
      total_sales_price: m.sizes.reduce((a, s) => a + num(s.quantity) * num(s.sale_price), 0),
      gross_profit: m.sizes.reduce((a, s) => a + num(s.quantity) * (num(s.sale_price) - num(s.unit_price)), 0)
    }))
    const { data: insertedModels, error: me } = await supabase.from('atelier_production_models')
      .insert(modelPayload).select('id,model_number')
    if (me || !insertedModels) {
      await supabase.from('atelier_productions').delete().eq('store_id', storeId).eq('id', production.id)
      setSaving(false); return setError('Échec de création des modèles. La nouvelle production a été annulée : ' + (me?.message || 'Erreur inconnue'))
    }
    const sizesPayload = models.flatMap((m, i) => {
      const model = insertedModels.find(x => x.model_number === i + 1)
    
      return m.sizes.map(s => ({
        store_id: storeId,
        production_id: production.id,
        model_id: model?.id,
        size_name: s.size_name.trim(),
        quantity: num(s.quantity),
        unit_price: num(s.unit_price),
        sale_price: num(s.sale_price)
      }))
    })
    const { error: se } = await supabase.from('atelier_production_sizes').insert(sizesPayload)
    if (se) {
      await supabase.from('atelier_productions').delete().eq('store_id', storeId).eq('id', production.id)
      setSaving(false); return setError('Échec de sauvegarde des tailles. La production créée a été annulée : ' + se.message)
    }
    await audit('atelier.production.created', 'atelier_production', production.id, {
      production_number: production.production_number, sku: modelPayload.map(x => x.sku),
      model_count: models.length, total_quantity: calculations.quantity,
      total_cost: calculations.cost, total_sales_price: calculations.sales,
      gross_profit: calculations.profit
    })
    setSaving(false); setMessage(`Production #${production.production_number} enregistrée avec succès.`)
    resetProduction(); await loadData()
  }

  async function integrateProduction(production: Production) {
    if (integratedProductionIds.includes(production.id)) {
      setMessage('Cette production est déjà intégrée au stock.')
      return
    }
  
    const productionModels = modelsByProduction[production.id] || []
    const productionSizes = sizesByProduction[production.id] || []
  
    if (!productionModels.length) {
      setError('Cette ancienne production ne possède pas de modèles. Intégration automatique impossible.')
      return
    }
  
    const quantity = productionSizes.reduce((sum, s) => sum + Number(s.quantity || 0), 0)
  
    if (quantity !== Number(production.total_quantity)) {
      setError(`Quantité incohérente : production ${production.total_quantity}, tailles ${quantity}.`)
      return
    }
  
    const fabricCost = Number(production.fabric_total_cost || 0)
    const sewingCost = Number(production.total_confection_cost || 0)
    const extraCost = (fabricCost + sewingCost) / quantity
  
    const sizeCost = productionSizes.reduce(
      (sum, s) => sum + Number(s.quantity) * Number(s.unit_price),
      0
    )
  
    const totalCost = fabricCost + sewingCost + sizeCost
  
    const confirmed = window.confirm(
      `Confirmer l'entrée en stock ?\n\n` +
      `Production : #${production.production_number}\n` +
      `Modèles : ${productionModels.length}\n` +
      `Tailles : ${productionSizes.length}\n` +
      `Quantité : ${quantity} pièces\n` +
      `Coût total : ${money(totalCost)}\n` +
      `Coût supplémentaire par pièce (tissu + confection) : ${money(extraCost)}\n` +
      `Destination : Réserve\n\n` +
      `Cette opération créera les articles Catalogue et les mouvements de stock.`
    )
  
    if (!confirmed) return
  
    setIntegratingId(production.id)
    setError('')
    setMessage('')
  
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'integrate_atelier_production_to_stock',
        {
          p_store_id: storeId,
          p_production_id: production.id
        }
      )
  
      if (rpcError) throw rpcError
  
      if (!data || data.success !== true) {
        throw new Error('La base de données n’a pas confirmé l’intégration.')
      }
  
      setIntegratedProductionIds(current =>
        current.includes(production.id) ? current : [...current, production.id]
      )
  
      await audit(
        'atelier.production.stock_integrated',
        'atelier_production',
        production.id,
        {
          production_number: production.production_number,
          products_created: data.products_created,
          sizes_integrated: data.sizes_integrated,
          quantity_added_to_reserve: data.quantity_added_to_reserve
        }
      )
  
      setMessage(
        `Production #${production.production_number} intégrée : ` +
        `${data.quantity_added_to_reserve} pièces ajoutées à la Réserve.`
      )
  
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant l’intégration au stock.')
    } finally {
      setIntegratingId(null)
    }
  }

  const filteredProductions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return productions
    return productions.filter(p => {
      const modelText = (modelsByProduction[p.id] || []).map(m => `${m.model_name} ${m.sku} ${m.color}`).join(' ')
      return [
        String(p.production_number), p.model_name, p.fabric_name, p.fabric_number || '',
        p.supplier_name_snapshot, p.confection_supplier_name_snapshot || '', p.color, modelText
      ].join(' ').toLowerCase().includes(q)
    })
  }, [productions, modelsByProduction, search])

  function printReport(production?: Production) {
    const rows = production ? [production] : filteredProductions
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Atelier</title>
    <style>
    body{font:12px Arial,sans-serif;color:#29251f;padding:28px}h1{color:#684c35;margin-bottom:4px}
    .meta{color:#71685e;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:14px}
    th,td{border:1px solid #d8cabb;padding:8px;text-align:left}th{background:#eee5da}
    .tot{font-weight:bold;background:#f7f1e9}.brand{display:flex;justify-content:space-between}
    @media print{button{display:none}}
    </style></head><body><div class="brand"><div><h1>STYLEPRO MANAGER — ATELIER</h1><div class="meta">Rapport ${production ? `production #${production.production_number}` : 'historique des productions'}</div></div><div>${new Date().toLocaleDateString('fr-DZ')}</div></div>
    <table><thead><tr><th>N°</th><th>Date</th><th>Tissu</th><th>Fournisseur</th><th>Modèles / SKU</th><th>Qté</th><th>Coût total</th><th>Ventes</th><th>Bénéfice</th></tr></thead><tbody>
    ${rows.map(p => `<tr><td>${p.production_number}</td><td>${p.production_date}</td><td>${escapeHtml(p.fabric_name)}</td><td>${escapeHtml(p.supplier_name_snapshot)}</td><td>${(modelsByProduction[p.id] || []).map(m => `${escapeHtml(m.model_name)} (${escapeHtml(m.sku)})`).join('<br>') || escapeHtml(p.model_name)}</td><td>${p.total_quantity}</td><td>${money(Number(p.total_cost ?? (Number(p.fabric_total_cost || 0) + Number(p.total_production_price || 0) + Number(p.total_confection_cost || 0))))}</td><td>${money(Number(p.total_sales_price || 0))}</td><td>${money(Number(p.gross_profit || 0))}</td></tr>`).join('')}
    </tbody></table><p class="meta">Rapport généré depuis les données enregistrées dans cette boutique.</p><script>window.onload=()=>window.print()</script></body></html>`
    const w = window.open('', '_blank')
    if (!w) { setError('Autorisez les fenêtres pop-up pour générer le rapport PDF.'); return }
    w.document.write(html); w.document.close()
  }
  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
  }

  return <div className="atelier-module">
    <header className="atelier-hero">
      <div className="atelier-hero-icon"><Factory size={27}/></div>
      <div className="atelier-hero-copy"><span className="atelier-eyebrow">PRODUCTION TEXTILE</span><h1>Atelier</h1>
        <p>Gestion multi-modèles, fournisseurs, coûts et rentabilité de production.</p></div>
      <button className="atelier-secondary-button" type="button" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16}/> Actualiser</button>
    </header>
    {error && <div className="atelier-alert error"><X size={17}/>{error}</div>}
    {message && <div className="atelier-alert success">{message}</div>}


    <section className="atelier-card">
      <div className="atelier-section-heading">
        <div className="atelier-section-icon"><Users size={19} /></div>
        <div>
          <h2>Fournisseurs</h2>
          <p>Gérer les fournisseurs de tissu et de confection.</p>
        </div>
        <button type="button" className="atelier-primary-button" onClick={() => setSupplierFormOpen(v => !v)}>
          <Plus size={16} /> Nouveau fournisseur
        </button>
      </div>

      {supplierFormOpen && (
        <form onSubmit={saveSupplier} className="atelier-form">
          <div className="atelier-form-grid">
            <label>Type de fournisseur
              <select value={supplierType} onChange={e => setSupplierType(e.target.value as SupplierType)}>
                <option value="tissu">Tissu</option>
                <option value="confection">Confection</option>
              </select>
            </label>
            <label>Nom du fournisseur *
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} required />
            </label>
            <label>Téléphone
              <input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} />
            </label>
            <label>Adresse
              <input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} />
            </label>
            <label className="atelier-full">Notes
              <textarea value={supplierNotes} onChange={e => setSupplierNotes(e.target.value)} />
            </label>
          </div>
          <button className="atelier-primary-button" type="submit" disabled={saving}>
            <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer le fournisseur'}
          </button>
        </form>
      )}

      <div className="atelier-form-grid">
        <div>
          <label>Fournisseurs tissu</label>
          <select value={fabricSupplierId} onChange={e => setFabricSupplierId(e.target.value)}>
            <option value="">Choisir un fournisseur</option>
            {fabricSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label>Fournisseurs confection</label>
          <select value={sewingSupplierId} onChange={e => setSewingSupplierId(e.target.value)}>
            <option value="">Aucun / Interne</option>
            {sewingSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
    </section>

    <form className="atelier-card" onSubmit={saveProduction}>
      <div className="atelier-section-heading">
        <div className="atelier-section-icon"><Scissors size={19} /></div>
        <div>
          <h2>Nouvelle production</h2>
          <p>Enregistrer une production avec plusieurs modèles et tailles.</p>
        </div>
      </div>

      <div className="atelier-form-grid">
        <label>Date de production
          <input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)} required />
        </label>
        <label>Nom du tissu *
          <input value={fabricName} onChange={e => setFabricName(e.target.value)} required />
        </label>
        <label>Référence tissu
          <input value={fabricNumber} onChange={e => setFabricNumber(e.target.value)} />
        </label>
        <label>Quantité tissu (m) *
          <input type="number" min="0.01" step="0.01" value={fabricMeters} onChange={e => setFabricMeters(e.target.value)} required />
        </label>
        <label>Prix par mètre (DA) *
          <input type="number" min="0" step="0.01" value={fabricPrice} onChange={e => setFabricPrice(e.target.value)} required />
        </label>
        <label>Coût total confection (DA)
          <input type="number" min="0" step="0.01" value={confectionCost} onChange={e => setConfectionCost(e.target.value)} />
        </label>
        <label>Nombre de modèles
          <select value={modelCount} onChange={e => setModelNumber(e.target.value)}>
            {Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
          </select>
        </label>
        <label className="atelier-full">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
      </div>

      {models.map((model, modelIndex) => (
        <div className="atelier-model-history" key={model.localId}>
          <h3>Modèle {modelIndex + 1}</h3>
          <div className="atelier-form-grid">
            <label>Nom du modèle *
              <input value={model.model_name} onChange={e => updateModel(modelIndex, { model_name: e.target.value })} required />
            </label>
            <label>Couleur *
              <input value={model.color} onChange={e => updateModel(modelIndex, { color: e.target.value })} required />
            </label>
            <label>Catégorie
              <select value={model.target_audience} onChange={e => updateModel(modelIndex, { target_audience: e.target.value as TargetAudience })}>
                <option value="men">Homme</option>
                <option value="women">Femme</option>
                <option value="children">Enfant</option>
                <option value="unisex">Unisexe</option>
              </select>
            </label>
          </div>

          <div className="atelier-size-options">
            <strong>Tailles adultes</strong>
            {['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Standard'].map(size => (
              <label key={size}>
                <input type="checkbox" checked={model.sizes.some(s => s.size_name === size)} onChange={e => toggleSize(modelIndex, size, e.target.checked)} />
                {size}
              </label>
            ))}
            <strong>Tailles enfants</strong>
            {['8 ans', '16 ans'].map(size => (
              <label key={size}>
                <input type="checkbox" checked={model.sizes.some(s => s.size_name === size)} onChange={e => toggleSize(modelIndex, size, e.target.checked)} />
                {size}
              </label>
            ))}
            <button type="button" className="atelier-secondary-button" onClick={() => addCustomSize(modelIndex)}>
              <Plus size={15} /> Ajouter une taille
            </button>
          </div>

          {model.sizes.map((size, sizeIndex) => (
            <div className="atelier-form-grid" key={size.size_name}>
              <label>Taille
                <input value={size.size_name} readOnly />
              </label>
              <label>Quantité
                <input type="number" min="1" value={size.quantity} onChange={e => updateSize(modelIndex, sizeIndex, 'quantity', e.target.value)} required />
              </label>
              <label>Coût unitaire (DA)
                <input type="number" min="0" step="0.01" value={size.unit_price} onChange={e => updateSize(modelIndex, sizeIndex, 'unit_price', e.target.value)} required />
              </label>
              <label>Prix de vente (DA)
                <input type="number" min="0" step="0.01" value={size.sale_price} onChange={e => updateSize(modelIndex, sizeIndex, 'sale_price', e.target.value)} required />
              </label>
              <div className="atelier-production-metric">
                <small>Total quantité</small>
                <strong>{num(size.quantity)} pièces</strong>
              </div>
              <button
                type="button"
                className="atelier-secondary-button"
                onClick={() => removeSize(modelIndex, sizeIndex)}
                aria-label={`Supprimer la taille ${size.size_name}`}
              >
                Retirer
              </button>
              <div className="atelier-production-metric">
                <small>Total vente</small>
                <strong>{money(num(size.quantity) * num(size.sale_price))}</strong>
              </div>
            </div>
          ))}
          <div className="atelier-production-metric">
            <small>Total modèle</small>
            <strong>{model.sizes.reduce((sum, s) => sum + num(s.quantity), 0)} pièces</strong>
          </div>
        </div>
      ))}

      <div className="atelier-detail-grid">
        <span>Tissu <b>{money(calculations.fabric)}</b></span>
        <span>Coût des articles <b>{money(calculations.confectionLinesCost)}</b></span>
        <span>Confection <b>{money(calculations.sewing)}</b></span>
        <span>Quantité totale <b>{calculations.quantity} pièces</b></span>
        <span>Coût global <b>{money(calculations.cost)}</b></span>
        <span>Vente prévisionnelle <b>{money(calculations.sales)}</b></span>
        <span>Bénéfice prévisionnel <b>{money(calculations.profit)}</b></span>
        <span>Marge <b>{calculations.margin.toFixed(2)}%</b></span>
      </div>

      <button type="submit" className="atelier-primary-button" disabled={saving}>
        <Save size={17} /> {saving ? 'Enregistrement…' : 'Enregistrer la production'}
      </button>
    </form>


    <section className="atelier-card">
  <div className="atelier-section-heading">
    <div className="atelier-section-icon">
      <Package size={19} />
    </div>
    <div>
      <h2>Historique des productions</h2>
      <p>Recherche par numéro, SKU, modèle, fournisseur, tissu ou couleur.</p>
    </div>
    <button
      type="button"
      className="atelier-secondary-button"
      onClick={() => printReport()}
    >
      <Printer size={16} /> Rapport PDF
    </button>
  </div>

  <div className="atelier-history-toolbar">
    <div className="atelier-search">
      <Search size={16} />
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="N°, SKU, modèle, tissu, fournisseur, couleur…"
      />
    </div>
  </div>

  {loading ? (
    <div className="atelier-empty">
      <RefreshCw className="atelier-spin" size={20} />
      Chargement…
    </div>
  ) : filteredProductions.length === 0 ? (
    <div className="atelier-empty">
      <Factory size={24} />
      <strong>Aucune production trouvée</strong>
    </div>
  ) : (
    <div className="atelier-production-list">
      {filteredProductions.map(p => {
        const legacyCost =
          Number(p.fabric_total_cost || 0) +
          Number(p.total_production_price || 0) +
          Number(p.total_confection_cost || 0)

        const cost = Number(p.total_cost ?? legacyCost)

        return (
          <article key={p.id} className="atelier-production-row">
            <div className="atelier-production-number">
              #{p.production_number}
            </div>

            <div className="atelier-production-main">
              <strong>{p.model_name}</strong>
              <span>
                {p.fabric_name}
                {p.fabric_number ? ` · ${p.fabric_number}` : ''} · {p.color}
              </span>
              <small>
                {p.supplier_name_snapshot} ·{' '}
                {new Date(p.production_date + 'T12:00:00').toLocaleDateString('fr-DZ')}
              </small>
            </div>

            <div className="atelier-production-metric">
              <small>Quantité</small>
              <strong>{p.total_quantity}</strong>
            </div>

            <div className="atelier-production-metric">
              <small>Coût total</small>
              <strong>{money(cost)}</strong>
            </div>

            <div className="atelier-production-metric">
              <small>Bénéfice</small>
              <strong>{money(Number(p.gross_profit || 0))}</strong>
            </div>

            <div className="atelier-row-actions">
              <button
                type="button"
                className="atelier-icon-button"
                title="Détails"
                onClick={() =>
                  setExpandedId(expandedId === p.id ? null : p.id)
                }
              >
                <FileText size={16} />
              </button>

              <button
                type="button"
                className="atelier-icon-button"
                title="Rapport PDF"
                onClick={() => printReport(p)}
              >
                <Printer size={16} />
              </button>

              {integratedProductionIds.includes(p.id) ? (
                <span className="atelier-stock-integrated">
                  <Package size={14} /> Déjà intégré
                </span>
              ) : (
                <button
                  type="button"
                  className="atelier-primary-button"
                  disabled={
                    !!integratingId ||
                    !(modelsByProduction[p.id] || []).length
                  }
                  onClick={() => void integrateProduction(p)}
                >
                  <Package size={15} />
                  {integratingId === p.id
                    ? 'Intégration…'
                    : 'Entrée en stock'}
                </button>
              )}
            </div>

            {expandedId === p.id && (
              <div className="atelier-expanded">
                <div className="atelier-detail-grid">
                  <span>
                    Fournisseur tissu <b>{p.supplier_name_snapshot}</b>
                  </span>

                  <span>
                    Fournisseur confection{' '}
                    <b>
                      {p.confection_supplier_name_snapshot ||
                        'Interne / non renseigné'}
                    </b>
                  </span>

                  <span>
                    Coût tissu{' '}
                    <b>
                      {money(
                        Number(
                          p.fabric_total_cost ||
                          Number(p.fabric_quantity_m) *
                            Number(p.fabric_price_per_m)
                        )
                      )}
                    </b>
                  </span>

                  <span>
                    Prix de vente{' '}
                    <b>{money(Number(p.total_sales_price || 0))}</b>
                  </span>

                  <span>
                    Coût total <b>{money(cost)}</b>
                  </span>

                  <span>
                    Marge <b>{Number(p.margin_percent || 0).toFixed(2)}%</b>
                  </span>
                </div>

                {(modelsByProduction[p.id] || []).length > 0 ? (
                  (modelsByProduction[p.id] || []).map(m => (
                    <div className="atelier-model-history" key={m.id}>
                      <b>{m.model_name}</b>
                      <code>{m.sku}</code>
                      <span>{m.color}</span>
                      <span>{m.total_quantity} pcs</span>

                      {(sizesByProduction[p.id] || [])
                        .filter(s => s.model_id === m.id)
                        .map(s => (
                          <small key={s.id}>
                            {s.size_name}: {s.quantity} ×{' '}
                            {money(Number(s.sale_price))}
                          </small>
                        ))}
                    </div>
                  ))
                ) : (
                  <div className="atelier-model-history">
                    <b>{p.model_name}</b>
                    <span>{p.color}</span>
                    <small>
                      Ancien enregistrement — tailles conservées dans le format historique.
                    </small>

                    {(sizesByProduction[p.id] || [])
                      .filter(s => !s.model_id)
                      .map(s => (
                        <small key={s.id}>
                          {s.size_name}: {s.quantity}
                        </small>
                      ))}
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )}
</section>

<p className="atelier-footnote">
  Données isolées par boutique. L'entrée au stock est effectuée manuellement
  depuis chaque production validée. Les anciennes productions restent consultables.
</p>
</div>
}
