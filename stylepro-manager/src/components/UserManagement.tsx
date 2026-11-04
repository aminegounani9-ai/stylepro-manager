import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { UserPlus, RefreshCw, ShieldCheck, UserRound, UserX, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'admin' | 'manager' | 'cashier' | 'stock_manager'
type Member = { user_id: string; role: Role; created_at: string; full_name: string; email: string; is_active: boolean }

const roles: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Vendeur / Caisse' },
  { value: 'stock_manager', label: 'Gestionnaire de stock' },
]

export default function UserManagement({ user, storeId, storeName }: { user: User | null; storeId: string; storeName: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [isAdmin, setIsAdmin] = useState(false)

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('manage-users', { body: { ...payload, store_id: storeId } })
    if (invokeError) throw new Error(invokeError.message)
    if (data?.error) throw new Error(data.error)
    return data
  }, [storeId])

  const load = useCallback(async () => {
    if (!storeId || !user) return
    setLoading(true); setError('')
    try {
      const { data: membership, error: membershipError } = await supabase.from('store_members')
        .select('role').eq('store_id', storeId).eq('user_id', user.id).maybeSingle()
      if (membershipError) throw membershipError
      const admin = membership?.role === 'admin'
      setIsAdmin(admin)
      if (admin) {
        const result = await call({ action: 'list' })
        setMembers((result.members || []) as Member[])
      } else setMembers([])
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible') }
    finally { setLoading(false) }
  }, [storeId, user, call])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await call({ action: 'create', email, full_name: fullName, password, role })
      setEmail(''); setFullName(''); setPassword(''); setRole('cashier')
      setNotice('Compte créé et associé à cette boutique.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible') }
    finally { setSaving(false) }
  }

  const updateRole = async (member: Member, nextRole: Role) => {
    setSaving(true); setError(''); setNotice('')
    try { await call({ action: 'update_role', user_id: member.user_id, role: nextRole }); setNotice('Rôle mis à jour.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible') }
    finally { setSaving(false) }
  }

  const toggleActive = async (member: Member) => {
    setSaving(true); setError(''); setNotice('')
    try { await call({ action: 'set_active', user_id: member.user_id, active: !member.is_active }); setNotice('Statut du compte mis à jour.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible') }
    finally { setSaving(false) }
  }

  return <section className="panel settings-users">
    <div className="panel-title"><ShieldCheck size={21}/><div><h2>Gestion des utilisateurs</h2><p>Ajoutez des comptes et gérez leurs rôles pour {storeName || 'la boutique sélectionnée'}.</p></div>
      {isAdmin && <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Actualiser</button>}
    </div>
    {!storeId ? <p className="appearance-note">Sélectionnez une boutique pour gérer ses utilisateurs.</p> :
      !isAdmin && !loading ? <p className="appearance-note">Cette section est réservée aux administrateurs de la boutique.</p> :
      <>
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="appearance-note">{notice}</p>}
        {isAdmin && <>
          <form className="user-create-form" onSubmit={create}>
            <label className="field">Nom complet<input value={fullName} onChange={e=>setFullName(e.target.value)} required maxLength={100} /></label>
            <label className="field">Adresse e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="off"/></label>
            <label className="field">Mot de passe temporaire<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
            <label className="field">Rôle<select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            <button type="submit" className="primary-button" disabled={saving}><UserPlus size={16}/> {saving ? 'Création…' : 'Ajouter utilisateur'}</button>
          </form>
          <div className="user-members-list">
            <h3>Utilisateurs de la boutique ({members.length})</h3>
            {loading ? <p>Chargement…</p> : members.length === 0 ? <p className="appearance-note">Aucun utilisateur trouvé.</p> :
              members.map(member=><div className="user-member-row" key={member.user_id}>
                <div className="user-member-info"><UserRound size={18}/><div><strong>{member.full_name || member.email || member.user_id}</strong><small>{member.email}</small></div></div>
                <select aria-label="Rôle utilisateur" value={member.role} disabled={saving || member.user_id===user?.id} onChange={e=>void updateRole(member,e.target.value as Role)}>{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>
                <span className={member.is_active ? 'user-status active' : 'user-status'}>{member.is_active ? 'Actif' : 'Désactivé'}</span>
                {member.user_id!==user?.id && <button type="button" className="secondary-button" disabled={saving} onClick={()=>void toggleActive(member)}>{member.is_active ? <><UserX size={15}/> Désactiver</> : <><UserCheck size={15}/> Activer</>}</button>}
              </div>)
            }
          </div>
        </>}
      </>}
  </section>
}
