import { useCallback,useEffect,useState } from 'react'
import { RefreshCw,ShoppingBag,Phone,Clock3,MapPin,Truck,CheckCircle2,Printer } from 'lucide-react'
import { escapePrintHtml, openPrintPreview } from './lib/printPreview'
import { supabase } from './lib/supabase'
import './web-orders.css'
type Item={variant_id:string;product_name:string;sku:string;size:string|null;color:string|null;quantity:number;unit_price:number;line_total:number}
type Order={id:string;order_number:number;customer_name:string;customer_phone:string;customer_note:string|null;delivery_address:string|null;delivery_id:string|null;status:string;subtotal:number;currency:string;created_at:string;items:Item[]}
const labels:Record<string,string>={pending:'Nouvelle',confirmed:'Confirmée',preparing:'En préparation',shipped:'Expédiée',completed:'Terminée',cancelled:'Annulée'}
const statuses=Object.keys(labels)
export default function WebOrdersModule({storeId,storeName='StylePro Manager',onOpenDelivery}:{storeId:string;storeName?:string;onOpenDelivery:()=>void}){
 const [orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[creating,setCreating]=useState(''),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[printFormat,setPrintFormat]=useState<'a4'|'thermal'>('a4')
 const fetchOrders=useCallback(()=>supabase.rpc('get_web_orders',{p_store_id:storeId}),[storeId])
 useEffect(()=>{
  let active=true
  fetchOrders().then(r=>{
   if(!active)return
   if(r.error)setError(r.error.message)
   else setOrders((r.data??[]) as Order[])
   setLoading(false)
  })
  return()=>{active=false}
 },[fetchOrders])
 async function load(){
  setLoading(true);setError('')
  const r=await fetchOrders()
  if(r.error)setError(r.error.message)
  else setOrders((r.data??[]) as Order[])
  setLoading(false)
 }
 async function update(id:string,status:string){setBusy(id);const r=await supabase.rpc('update_web_order_status',{p_order_id:id,p_status:status});if(r.error)setError(r.error.message);else setOrders(v=>v.map(o=>o.id===id?{...o,status}:o));setBusy('')}
 async function confirmAndCreateDelivery(order:Order){
  if(creating) return
  setCreating(order.id);setError('')
  const r=await supabase.rpc('create_delivery_from_web_order',{p_order_id:order.id})
  if(r.error){setError(r.error.message);setCreating('');return}
  setOrders(v=>v.map(o=>o.id===order.id?{...o,status:'confirmed',delivery_id:r.data?.delivery_id||o.delivery_id}:o))
  setCreating('')
  onOpenDelivery()
 }
 const visible=orders.filter(o=>filter==='all'||o.status===filter)
 const money=(n:number,c:string)=>`${Number(n).toLocaleString('fr-DZ',{maximumFractionDigits:2})} ${c}`
 function printOrders(){
  const total=visible.reduce((sum,o)=>sum+Number(o.subtotal||0),0)
  const rows=visible.map(o=>{
   const itemRows=o.items.map(it=>`<tr><td>${escapePrintHtml(it.product_name)}</td><td>${escapePrintHtml(it.sku)}</td><td>${escapePrintHtml([it.size,it.color].filter(Boolean).join(' / ')||'—')}</td><td>${it.quantity}</td><td>${escapePrintHtml(money(it.unit_price,o.currency))}</td><td>${escapePrintHtml(money(it.line_total,o.currency))}</td></tr>`).join('')
   return `<section class="order-report-card"><h3>Commande web #${o.order_number} · ${escapePrintHtml(labels[o.status]||o.status)}</h3><p><strong>Client :</strong> ${escapePrintHtml(o.customer_name)} · <strong>Téléphone :</strong> ${escapePrintHtml(o.customer_phone)} · <strong>Date :</strong> ${escapePrintHtml(new Date(o.created_at).toLocaleString('fr-DZ'))}</p><p><strong>Adresse :</strong> ${escapePrintHtml(o.delivery_address||'Non renseignée')}</p>${o.customer_note?`<p><strong>Note client :</strong> ${escapePrintHtml(o.customer_note)}</p>`:''}<table><thead><tr><th>Article</th><th>Référence</th><th>Variante</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table><p><strong>Total commande : ${escapePrintHtml(money(o.subtotal,o.currency))}</strong></p></section>`
  }).join('')
  const content=`<div class="summary-grid"><div class="summary-card"><span>Commandes affichées</span><strong>${visible.length}</strong></div><div class="summary-card"><span>Montant total</span><strong>${escapePrintHtml(money(total,visible[0]?.currency||'DZD'))}</strong></div></div>${rows||'<p>Aucune commande dans ce filtre.</p>'}`
  const opened=openPrintPreview({title:'Rapport des commandes Web',storeName,subtitle:`Filtre : ${filter==='all'?'Tous les statuts':labels[filter]||filter} · ${visible.length} commande(s)`,content,format:printFormat})
  if(!opened)setError('Autorisez les fenêtres pop-up pour afficher l’aperçu du rapport.')
 }
 return <section className="panel web-orders-panel">
 <div className="panel-heading"><div className="panel-title"><ShoppingBag size={23}/><div><h2>Commandes Web</h2><p>Commandes reçues avec les coordonnées et l’adresse de livraison.</p></div></div><div className="web-order-report-actions"><select aria-label="Format du rapport" value={printFormat} onChange={e=>setPrintFormat(e.target.value as 'a4'|'thermal')}><option value="a4">A4</option><option value="thermal">80 mm</option></select><button className="secondary-button" onClick={printOrders} disabled={!visible.length}><Printer size={16}/> Aperçu / Imprimer</button><button className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Actualiser</button></div></div>
 <div className="web-order-stats"><div><span>Total commandes</span><strong>{orders.length}</strong></div><div><span>À traiter</span><strong>{orders.filter(o=>o.status==='pending').length}</strong></div><div><span>Terminées</span><strong>{orders.filter(o=>o.status==='completed').length}</strong></div></div>
 <div className="web-order-toolbar"><div><h3>Suivi des commandes</h3><p>{visible.length} commande(s)</p></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous les statuts</option>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></div>
 {error&&<div className="web-order-error">{error}</div>}
 {loading?<div className="web-order-empty">Chargement…</div>:!visible.length?<div className="web-order-empty"><ShoppingBag size={30}/><strong>Aucune commande pour le moment</strong><span>Les commandes du site apparaîtront ici.</span></div>:
 <div className="web-order-list">{visible.map(o=><article className="web-order-card" key={o.id}>
 <div className="web-order-card-head"><div><span className="web-order-number">COMMANDE WEB #{o.order_number}</span><h3>{o.customer_name}</h3><a href={`tel:${o.customer_phone}`}><Phone size={14}/>{o.customer_phone}</a></div><div className="web-order-head-right"><span className={`web-order-status ${o.status}`}>{labels[o.status]||o.status}</span><small><Clock3 size={13}/>{new Date(o.created_at).toLocaleString('fr-DZ')}</small></div></div>
 <div className="web-order-items">{o.items.map((it,i)=><div className="web-order-item" key={i}><div><b>{it.product_name}</b><span>{it.sku} · {it.size||'Standard'} · {it.color||'—'} × {it.quantity}</span></div><strong>{money(it.line_total,o.currency)}</strong></div>)}</div>
 {o.delivery_address&&<p className="web-order-note"><MapPin size={14}/> Adresse : {o.delivery_address}</p>}{o.customer_note&&<p className="web-order-note">Note client : {o.customer_note}</p>}
 <div className="web-order-card-foot"><strong>Total : {money(o.subtotal,o.currency)}</strong>{o.delivery_id ? <button type="button" className="secondary-button" onClick={onOpenDelivery}><Truck size={15}/> BL créé · Voir Livraisons</button> : <button type="button" className="primary-button" disabled={creating===o.id || !o.delivery_address} onClick={()=>void confirmAndCreateDelivery(o)}>{creating===o.id?<RefreshCw size={15} className="spin"/>:<CheckCircle2 size={15}/>} Confirmer & créer BL</button>}<label>Statut<select value={o.status} disabled={busy===o.id} onChange={e=>void update(o.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label></div>
 </article>)}</div>}
 </section>
}
