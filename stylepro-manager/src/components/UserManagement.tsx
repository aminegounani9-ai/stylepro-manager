import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { UserPlus, RefreshCw, ShieldCheck, UserRound, UserX, UserCheck, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'admin' | 'manager' | 'cashier' | 'stock_manager'
type ModuleKey = 'dashboard' | 'catalogue' | 'sales' | 'stock' | 'returns' | 'clients' | 'expenses' | 'atelier' | 'deliveries' | 'promotions' | 'labels' | 'users' | 'settings'
type Permission = { module_key: ModuleKey; can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }
type Member = { user_id: string; role: Role; created_at: string; full_name: string; email: string; is_active: boolean; permissions: Permission[] }
type StoreOption = { id: string; name: string; currency: string }
type ExistingUserOption = { user_id: string; email: string; full_name: string; membership: { role: Role; is_active: boolean } | null }

const modules: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'sales', label: 'Ventes / Caisse' },
  { key: 'stock', label: 'Stock' },
  { key: 'returns', label: 'Retours' },
  { key: 'clients', label: 'Clients' },
  { key: 'expenses', label: 'Dépenses' },
  { key: 'atelier', label: 'Atelier / Production' },
  { key: 'deliveries', label: 'Livraisons' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'labels', label: 'Étiquettes QR' },
  { key: 'users', label: 'Utilisateurs' },
  { key: 'settings', label: 'Paramètres' },
]
const roles: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrateur boutique' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Vendeur / Caisse' },
  { value: 'stock_manager', label: 'Gestionnaire de stock' },
]
const emptyPermissions = (): Permission[] => modules.map(({ key }) => ({
  module_key: key, can_view: false, can_add: false, can_edit: false, can_delete: false,
}))
// Sensible starting grants by role. The creator can still remove any module/action.
const permissionsForRole = (role: Role): Permission[] => modules.map(({ key }) => {
  const all = role === 'manager' || role === 'admin'
  const stock = role === 'stock_manager' && ['dashboard', 'catalogue', 'stock', 'labels', 'deliveries'].includes(key)
  const cashier = role === 'cashier' && ['dashboard', 'sales', 'returns', 'clients'].includes(key)
  const enabled = all || stock || cashier
  const canWrite = all || (role === 'stock_manager' && ['stock', 'deliveries'].includes(key)) ||
    (role === 'cashier' && ['sales', 'returns', 'clients'].includes(key))
  return { module_key: key, can_view: enabled, can_add: canWrite, can_edit: canWrite, can_delete: all }
})
const normalize = (items: Permission[] = []): Permission[] => {
  const byKey = new Map(items.map(item => [item.module_key, item]))
  return modules.map(({ key }) => {
    const item = byKey.get(key)
    return { module_key: key, can_view: item?.can_view === true, can_add: item?.can_add === true, can_edit: item?.can_edit === true, can_delete: item?.can_delete === true }
  })
}

function PermissionEditor({ value, onChange, disabled = false }: { value: Permission[]; onChange: (next: Permission[]) => void; disabled?: boolean }) {
  const rows = useMemo(() => normalize(value), [value])
  const update = (moduleKey: ModuleKey, action: keyof Omit<Permission, 'module_key'>, checked: boolean) => {
    onChange(rows.map(row => row.module_key === moduleKey ? { ...row, [action]: checked } : row))
  }
  return <div className="user-permission-editor">
    <div className="user-permission-heading"><strong>Module</strong><strong>Voir</strong><strong>Ajouter</strong><strong>Modifier</strong><strong>Supprimer</strong></div>
    {rows.map(row => <div className="user-permission-row" key={row.module_key}>
      <span>{modules.find(item => item.key === row.module_key)?.label}</span>
      {(['can_view', 'can_add', 'can_edit', 'can_delete'] as const).map(action =>
        <label key={action} className="user-permission-check">
          <input type="checkbox" checked={row[action]} disabled={disabled} onChange={event => update(row.module_key, action, event.target.checked)} />
        </label>
      )}
    </div>)}
  </div>
}

export default function UserManagement({ user, storeId, storeName, stores = [] }: { user: User | null; storeId: string; storeName: string; stores?: StoreOption[] }) {
  const [members, setMembers] = useState<Member[]>([])
  const [existingUsers, setExistingUsers] = useState<ExistingUserOption[]>([])
  const [existingUserId, setExistingUserId] = useState('')
  const [existingUserRole, setExistingUserRole] = useState<Role>('manager')
  // Global Admin chooses the destination boutique independently from the app's current workspace.
  const [targetStoreId, setTargetStoreId] = useState(storeId)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [callerRole, setCallerRole] = useState<Role | null>(null)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false)
  const [canAddUsers, setCanAddUsers] = useState(false)
  const [canEditUsers, setCanEditUsers] = useState(false)
  const [draftPermissions, setDraftPermissions] = useState<Permission[]>(() => permissionsForRole('cashier'))
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>(emptyPermissions)

  const canManage = callerRole === 'admin' || callerRole === 'manager'
  const isAdmin = isGlobalAdmin
  const availableRoles = isGlobalAdmin ? roles : roles.filter(item => item.value === 'cashier' || item.value === 'stock_manager')

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('manage-users', { body: { ...payload, store_id: targetStoreId } })
    if (invokeError) throw new Error(invokeError.message)
    if (data?.error) throw new Error(data.error)
    return data
  }, [targetStoreId])

  const load = useCallback(async () => {
    if (!targetStoreId || !user) return
    setLoading(true); setError('')
    try {
      const access = await call({ action: 'my_permissions' })
      const memberRole = access.role as Role | undefined
      if (!memberRole) throw new Error('Accès à cette boutique non autorisé.')
      setCallerRole(memberRole)
      const globalAdmin = access.is_global_admin === true
      setIsGlobalAdmin(globalAdmin)
      if (globalAdmin) {
        const allUsers = await call({ action: 'global_list_users' })
        setExistingUsers((allUsers.users || []) as ExistingUserOption[])
      } else {
        setExistingUsers([])
      }
      const ownUsersGrant = (access.permissions || []).find((item: Permission) => item.module_key === 'users')
      setCanAddUsers(globalAdmin || memberRole === 'admin' || ownUsersGrant?.can_add === true)
      setCanEditUsers(globalAdmin || memberRole === 'admin' || ownUsersGrant?.can_edit === true)
      if (memberRole === 'admin' || memberRole === 'manager') {
        const result = await call({ action: 'list' })
        setMembers((result.members || []) as Member[])
      } else {
        setMembers([])
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible') }
    finally { setLoading(false) }
  }, [targetStoreId, user, call])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await call({ action: 'create', email, full_name: fullName, password, role, permissions: draftPermissions })
      setEmail(''); setFullName(''); setPassword(''); setRole('cashier'); setDraftPermissions(permissionsForRole('cashier'))
      setNotice('Compte créé, associé à cette boutique et doté des permissions sélectionnées.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible') }
    finally { setSaving(false) }
  }

  const assignExistingUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!existingUserId) return
    setSaving(true); setError(''); setNotice('')
    try {
      await call({ action: 'assign_existing_user', user_id: existingUserId, role: existingUserRole })
      setNotice('Utilisateur affecté à cette boutique. Son accès aux autres boutiques a été désactivé.')
      setExistingUserId('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Affectation impossible') }
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
    try { await call({ action: 'set_active', user_id: member.user_id, active: !member.is_active }); setNotice('Accès à cette boutique mis à jour.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible') }
    finally { setSaving(false) }
  }

  const savePermissions = async (member: Member) => {
    setSaving(true); setError(''); setNotice('')
    try {
      await call({ action: 'set_permissions', user_id: member.user_id, permissions: editingPermissions })
      setNotice('Permissions enregistrées.')
      setEditingUserId(null)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement des permissions impossible') }
    finally { setSaving(false) }
  }

  return <section className="panel settings-users">
    <div className="panel-title"><ShieldCheck size={21}/><div><h2>Gestion des utilisateurs</h2><p>Gérez les accès et les permissions pour {(stores.find(store => store.id === targetStoreId)?.name) || storeName || 'la boutique sélectionnée'}. </p></div>
      {canManage && <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Actualiser</button>}
    </div>
    {!targetStoreId ? <p className="appearance-note">Sélectionnez une boutique pour gérer ses utilisateurs.</p> :
      !canManage && !loading ? <p className="appearance-note">Cette section est réservée aux administrateurs et managers autorisés.</p> :
      <>
        {isGlobalAdmin && <label className="field user-store-assignment">Boutique à gérer / boutique du nouvel utilisateur<select value={targetStoreId} onChange={event => setTargetStoreId(event.target.value)} disabled={saving || stores.length === 0} required><option value="" disabled>Choisir une boutique</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select><small>Le Manager créé sera rattaché à la boutique sélectionnée. Ses employés seront ensuite créés dans cette même boutique.</small></label>}
        {isGlobalAdmin && <form className="user-create-form" onSubmit={assignExistingUser}>
          <h3>Affecter un compte existant à cette boutique</h3>
          <p className="appearance-note">Choisissez un compte déjà créé et son rôle dans la boutique sélectionnée. Son accès aux autres boutiques sera désactivé, sans supprimer ses données.</p>
          <label className="field">Compte existant<select value={existingUserId} onChange={e=>setExistingUserId(e.target.value)} required>
            <option value="">Choisir un utilisateur</option>
            {existingUsers.filter(item => !item.membership?.is_active).map(item=><option key={item.user_id} value={item.user_id}>{item.full_name || item.email} — {item.email}</option>)}
          </select></label>
          <label className="field">Rôle dans cette boutique<select value={existingUserRole} onChange={e=>setExistingUserRole(e.target.value as Role)}>
            {roles.filter(item=>item.value!=='admin').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>
          <button type="submit" className="primary-button" disabled={saving || !existingUserId}><UserPlus size={16}/> Affecter à cette boutique</button>
        </form>}
                {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="appearance-note">{notice}</p>}
        {canManage && <>
          {canAddUsers && <form className="user-create-form" onSubmit={create}>
            <label className="field">Nom complet<input value={fullName} onChange={e=>setFullName(e.target.value)} required maxLength={100} /></label>
            <label className="field">Adresse e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="off"/></label>
            <label className="field">Mot de passe temporaire<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
            <label className="field">Rôle<select value={role} onChange={e=>{const nextRole=e.target.value as Role;setRole(nextRole);setDraftPermissions(permissionsForRole(nextRole))}}>{availableRoles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            <div className="user-permission-card">
              <h3>Permissions du nouvel utilisateur</h3>
              <PermissionEditor value={draftPermissions} onChange={setDraftPermissions} disabled={saving}/>
            </div>
            <button type="submit" className="primary-button" disabled={saving || !targetStoreId}><UserPlus size={16}/> {saving ? 'Création…' : 'Ajouter utilisateur'}</button>
          </form>}
          <div className="user-members-list">
            <h3>Utilisateurs de la boutique ({members.length})</h3>
            {loading ? <p>Chargement…</p> : members.length === 0 ? <p className="appearance-note">Aucun utilisateur trouvé.</p> :
              members.map(member=><div className="user-member-card" key={member.user_id}>
                <div className="user-member-row">
                  <div className="user-member-info"><UserRound size={18}/><div><strong>{member.full_name || member.email || member.user_id}</strong><small>{member.email}</small></div></div>
                  <select aria-label="Rôle utilisateur" value={member.role} disabled={saving || member.user_id===user?.id || (!isAdmin && (member.role === 'admin' || member.role === 'manager'))}
                    onChange={e=>void updateRole(member,e.target.value as Role)}>
                    {(isAdmin ? roles : availableRoles).map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <span className={member.is_active ? 'user-status active' : 'user-status'}>{member.is_active ? 'Actif' : 'Désactivé'}</span>
                  {canEditUsers && member.user_id!==user?.id && (isAdmin || (member.role !== 'admin' && member.role !== 'manager')) &&
                    <button type="button" className="secondary-button" disabled={saving} onClick={()=>void toggleActive(member)}>
                      {member.is_active ? <><UserX size={15}/> Désactiver</> : <><UserCheck size={15}/> Activer</>}
                    </button>}
                  <button type="button" className="secondary-button" disabled={!canEditUsers || saving || (!isAdmin && (member.role === 'admin' || member.role === 'manager'))}
                    onClick={() => { setEditingUserId(editingUserId === member.user_id ? null : member.user_id); setEditingPermissions(normalize(member.permissions)); }}>
                    {editingUserId === member.user_id ? <><ChevronUp size={15}/> Fermer droits</> : <><ChevronDown size={15}/> Permissions</>}
                  </button>
                </div>
                {editingUserId === member.user_id && canEditUsers && <div className="user-permission-card">
                  <PermissionEditor value={editingPermissions} onChange={setEditingPermissions} disabled={saving}/>
                  <button type="button" className="primary-button" disabled={saving} onClick={() => void savePermissions(member)}>
                    <Save size={15}/> {saving ? 'Enregistrement…' : 'Enregistrer les permissions'}
                  </button>
                </div>}
              </div>)
            }
          </div>
        </>}
      </>}
  </section>
}
