import { useCallback, useEffect, useState } from 'react'
import { Banknote, Calculator, CheckCircle2, LockKeyhole, RefreshCw, Wallet } from 'lucide-react'
import { supabase } from './lib/supabase'
import './cash-register.css'

type CashSession = {
  id: string
  store_id: string
  cashier_id: string
  opened_at: string
  opening_float: number
  status: 'open' | 'closed'
}
type Props = { storeId: string; userId: string; currency?: string; onSessionChange?: (id: string | null) => void }
const money = (n: number, currency: string) => new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:2}).format(n) + ' ' + currency

export default function CashRegisterPanel({storeId,userId,currency='DZD',onSessionChange}:Props){
 const [session,setSession]=useState<CashSession|null>(null)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [opening,setOpening]=useState('')
 const [counted,setCounted]=useState('')
 const [note,setNote]=useState('')
 const [summary,setSummary]=useState<{opening_float:number;cash_sales:number;cash_expenses:number;cash_refunds:number;expected_cash:number;counted_cash:number;cash_difference:number;total_sales:number;sales_returns:number;cost_of_goods_sold:number;gross_profit:number;total_expenses:number;net_profit:number}|null>(null)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  if(!storeId||!userId)return
  const {data,error:loadError}=await supabase.from('cash_register_sessions').select('id,store_id,cashier_id,opened_at,opening_float,status').eq('store_id',storeId).eq('cashier_id',userId).eq('status','open').maybeSingle()
  setError('')
  if(loadError){setError(loadError.message);setSession(null);onSessionChange?.(null)}
  else {const next=(data as CashSession|null);setSession(next);onSessionChange?.(next?.id??null)}
  setLoading(false)
 },[storeId,userId,onSessionChange])
 useEffect(()=>{const timer=window.setTimeout(()=>{void load()},0);return()=>window.clearTimeout(timer)},[load])
 async function open(){
  const amount=Number(opening)
  if(!Number.isFinite(amount)||amount<0){setError('Montant initial invalide.');return}
  setBusy(true);setError('')
  const {error:openError}=await supabase.rpc('open_cash_register',{p_store_id:storeId,p_opening_float:amount,p_note:note||null})
  if(openError)setError(openError.message)
  else {setOpening('');setNote('');await load()}
  setBusy(false)
 }
 async function close(){
  const amount=Number(counted)
  if(!Number.isFinite(amount)||amount<0){setError('Saisissez le montant réellement compté.');return}
  if(!session)return
  setBusy(true);setError('')
  const {data,error:closeError}=await supabase.rpc('close_cash_register',{p_session_id:session.id,p_counted_cash:amount,p_note:note||null})
  if(closeError)setError(closeError.message)
  else {const row=Array.isArray(data)?data[0]:data;if(row)setSummary({opening_float:Number(row.opening_float),cash_sales:Number(row.cash_sales),cash_expenses:Number(row.cash_expenses),cash_refunds:Number(row.cash_refunds),expected_cash:Number(row.expected_cash),counted_cash:Number(row.counted_cash),cash_difference:Number(row.cash_difference),total_sales:Number(row.total_sales),sales_returns:Number(row.sales_returns),cost_of_goods_sold:Number(row.cost_of_goods_sold),gross_profit:Number(row.gross_profit),total_expenses:Number(row.total_expenses),net_profit:Number(row.net_profit)});setSession(null);onSessionChange?.(null);setCounted('');setNote('')}
  setBusy(false)
 }
 return <section className="cash-register-panel">
  <div className="cash-register-heading"><div className="cash-register-icon"><Wallet size={20}/></div><div><h3>Ouverture & clôture de caisse</h3><p>Fonds de départ, ventes espèces et dépenses payées depuis le tiroir.</p></div><button type="button" className="secondary-button cash-register-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/></button></div>
  {error&&<div className="alert error">{error}</div>}
  {loading?<p className="cash-register-muted">Vérification de la session…</p>:session?<>
   <div className="cash-register-open-state"><span className="cash-register-dot"/> Caisse ouverte <span>Depuis {new Date(session.opened_at).toLocaleString('fr-DZ')}</span></div>
   <div className="cash-register-opening-amount"><small>Fond de caisse remis le matin</small><strong>{money(Number(session.opening_float),currency)}</strong></div>
   <div className="cash-register-close-form"><label>Montant réellement compté à la fermeture ({currency})<input type="number" min="0" step="0.01" value={counted} onChange={e=>setCounted(e.target.value)} placeholder="Compter les billets et pièces"/></label><label>Note de clôture (facultatif)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Écart expliqué, remise au responsable…"/></label><button type="button" className="primary-button" onClick={()=>void close()} disabled={busy||counted===''}><LockKeyhole size={16}/>{busy?'Clôture…':'Clôturer la caisse'}</button></div>
  </>:<>
   <div className="cash-register-open-form"><label>Fond de caisse remis au caissier le matin ({currency})<input type="number" min="0" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)} placeholder="Ex. 5000"/></label><label>Note / personne ayant remis la caisse<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex. Remis par le responsable"/></label><button type="button" className="primary-button" onClick={()=>void open()} disabled={busy||opening===''}><Banknote size={16}/>{busy?'Ouverture…':'Ouvrir la caisse'}</button></div>
  </>}
  {summary&&<div className="cash-register-summary"><div className="cash-register-summary-title"><CheckCircle2 size={17}/> Résultat de la dernière clôture</div><div><span>Fond initial</span><strong>{money(summary.opening_float,currency)}</strong></div><div><span>Ventes en espèces</span><strong>{money(summary.cash_sales,currency)}</strong></div><div><span>Dépenses sorties de caisse</span><strong>{money(summary.cash_expenses,currency)}</strong></div><div><span>Remboursements espèces</span><strong>{money(summary.cash_refunds,currency)}</strong></div><div className="cash-register-expected"><span>Montant théorique attendu</span><strong>{money(summary.expected_cash,currency)}</strong></div><div><span>Montant réellement compté</span><strong>{money(summary.counted_cash,currency)}</strong></div><div className={summary.cash_difference===0?'cash-register-balanced':'cash-register-difference'}><span>{summary.cash_difference===0?'Caisse équilibrée':summary.cash_difference>0?'Excédent':'Manquant'}</span><strong>{money(Math.abs(summary.cash_difference),currency)}</strong></div><div className="cash-register-profit-heading">Résultat commercial du caissier</div><div><span>Ventes totales (espèces + carte)</span><strong>{money(summary.total_sales,currency)}</strong></div><div><span>Retours produits</span><strong>{money(summary.sales_returns,currency)}</strong></div><div><span>Coût des articles vendus</span><strong>{money(summary.cost_of_goods_sold,currency)}</strong></div><div><span>Marge brute</span><strong>{money(summary.gross_profit,currency)}</strong></div><div><span>Total des dépenses</span><strong>{money(summary.total_expenses,currency)}</strong></div><div className={summary.net_profit>=0?'cash-register-balanced':'cash-register-difference'}><span>Bénéfice net estimé</span><strong>{money(summary.net_profit,currency)}</strong></div></div>}
  <p className="cash-register-footnote"><Calculator size={14}/> Le fond initial n’est pas un revenu. Le solde de caisse utilise les paiements espèces, remboursements espèces et dépenses caisse. Le bénéfice net estimé déduit les retours, le coût d’achat des articles vendus (en tenant compte des articles remis en stock) et toutes les dépenses enregistrées par ce caissier.</p>
 </section>
}
