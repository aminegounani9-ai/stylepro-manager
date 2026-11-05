import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { UserPlus, RefreshCw, ShieldCheck, UserRound, UserX, UserCheck, KeyRound, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'admin' | 'manager' | 'cashier' | 'stock_manager'
type ExistingRole = Role | 'accountant'
type Member = {
  user_id: string
  role: ExistingRole
  created_at: string
  full_name: string
  email: string
  is_active: boolean
}
type ModuleKey =
  | 'dashboard' | 'catalogue' | 'sales' | 'stock' | 'returns' | 'clients'
  | 'expenses' | 'atelier' | 'deliveries' | 'promotions' | 'labels' | 'users' | 'settings'
type Grant = {
  module_key: ModuleKey
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

const moduleCatalog: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'sales', label: 'Ventes / Caisse' },
  { key: 'stock', label: 'Gestion du stock' },
  { key: 'returns', label: 'Retours / Remboursements' },
  { key: 'clients', label: 'Clients' },
  { key: 'expenses', label: 'Dépenses' },
  { key: 'atelier', label: 'Atelier / Production' },
  { key: 'deliveries', label: 'Livraisons' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'labels', label: 'Étiquettes QR' },
  { key: 'users', label: 'Gestion des utilisateurs' },
  { key: 'settings', label: 'Paramètres' },
]

const adminRoles: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administrateur global' },
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Vendeur / Caisse' },
  { value: 'stock_manager', label: 'Gestionnaire de stock' },
]
const managerRoles: { value: Role; label: string }[] = [
  { value: 'cashier', label: 'Vendeur / Caisse' },
  { value: 'stock_manager', label: 'Gestionnaire de stock' },
]

function blankGrants(): Grant[] {
  return moduleCatalog.map(({ key }) => ({
    module_key: key, can_view: false, can_create: false, can_update: false, can_delete: false,
  }))
}

function defaultGrants(role: Role): Grant[] {
  const grants = blankGrants()
  const enable = (key: ModuleKey, actions: Partial<Omit<Grant, 'module_key'>>) => {
    const row = grants.find((grant) => grant.module_key === key)!
    Object.assign(row, actions)
  }
  enable('dashboard', { can_view: true })
  if (role === 'cashier') {
    enable('sales', { can_view: true, can_create: true })
    enable('deliveries', { can_view: true, can_create: true })
    enable('clients', { can_view: true, can_create: true, can_update: true })
  }
  if (role === 'stock_manager') {
    enable('stock', { can_view: true, can_create: true, can_update: true })
    enable('atelier', { can_view: true, can_create: true, can_update: true })
    enable('catalogue', { can_view: true })
    enable('deliveries', { can_view: true, can_create: true, can_update: true })
  }
  return grants
}

function normalizeGrants(rows: Partial<Grant>[]): Grant[] {
  const grants = blankGrants()
  for (const row of rows) {
    const target = grants.find((grant) => grant.module_key === row.module_key)
    if (target) {
      target.can_view = row.can_view === true
      target.can_create = row.can_create === true
      target.can_update = row.can_update === true
      target.can_delete = row.can_delete === true
    }
  }
  return grants
}

function PermissionEditor({
  value,
  onChange,
  disabled = false,
  grantablePermissions,
  hiddenModules = [],
}: {
  value: Grant[]
  onChange: (next: Grant[]) => void
  disabled?: boolean
  grantablePermissions?: Record<string, Partial<Grant>>
  hiddenModules?: ModuleKey[]
}) {
  const update = (moduleKey: ModuleKey, action: keyof Omit<Grant, 'module_key'>, checked: boolean) => {
    onChange(value.map((grant) => {
      if (grant.module_key !== moduleKey) return grant
      const next = { ...grant, [action]: checked }
      if (action !== 'can_view' && checked) next.can_view = true
      if (action === 'can_view' && !checked) {
        next.can_create = false
        next.can_update = false
        next.can_delete = false
      }
      return next
    }))
  }

  const selectAll = (checked: boolean) => onChange(value.map((grant) => {
    const allowed = grantablePermissions?.[grant.module_key]
    return {
      ...grant,
      can_view: checked && (allowed?.can_view ?? (grantablePermissions === undefined)),
      can_create: checked && (allowed?.can_create ?? (grantablePermissions === undefined)),
      can_update: checked && (allowed?.can_update ?? (grantablePermissions === undefined)),
      can_delete: checked && (allowed?.can_delete ?? (grantablePermissions === undefined)),
    }
  }))

  return <div className="module-permission-editor">
    <div className="module-permission-heading">
      <strong>Accès aux modules et opérations</strong>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => selectAll(true)}>Tout sélectionner</button>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => selectAll(false)}>Tout retirer</button>
    </div>
    <div className="module-permission-list">
      {moduleCatalog.filter((module) => !hiddenModules.includes(module.key)).map((module) => {
        const grant = value.find((item) => item.module_key === module.key)!
        const allowed = grantablePermissions?.[module.key]
        return <div className="module-permission-row" key={module.key}>
          <strong>{module.label}</strong>
          {([
            ['can_view', 'Voir'],
            ['can_create', 'Ajouter'],
            ['can_update', 'Modifier'],
            ['can_delete', 'Supprimer'],
          ] as const).map(([action, label]) => (
            <label key={action} className="module-permission-check">
              <input
                type="checkbox"
                checked={grant[action]}
                disabled={disabled || (grantablePermissions !== undefined && allowed?.[action] !== true)}
                onChange={(event) => update(module.key, action, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      })}
    </div>
  </div>
}

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
  const [newPermissions, setNewPermissions] = useState<Grant[]>(() => defaultGrants('cashier'))
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false)
  const [grantablePermissions, setGrantablePermissions] = useState<Record<string, Partial<Grant>>>({})
  const [canManage, setCanManage] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editingPermissions, setEditingPermissions] = useState<Grant[]>(blankGrants())

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('manage-users', {
      body: { ...payload, store_id: storeId },
    })
    if (invokeError) throw new Error(invokeError.message)
    if (data?.error) throw new Error(data.error)
    return data
  }, [storeId])

  const load = useCallback(async () => {
    if (!storeId || !user) return
    setLoading(true)
    setError('')
    try {
      const result = await call({ action: 'list' })
      setMembers((result.members || []) as Member[])
      setIsGlobalAdmin(result.is_global_admin === true)
      setCanManage(result.is_global_admin === true || result.is_store_manager === true)
      const allowed: Record<string, Partial<Grant>> = {}
      for (const row of (result.grantable_permissions || []) as Partial<Grant>[]) {
        if (row.module_key) allowed[row.module_key] = row
      }
      setGrantablePermissions(allowed)
      if (result.is_global_admin !== true) {
        setNewPermissions(current => current.map((grant) => {
          const own = allowed[grant.module_key]
          return {
            ...grant,
            can_view: grant.can_view && own?.can_view === true,
            can_create: grant.can_create && own?.can_create === true,
            can_update: grant.can_update && own?.can_update === true,
            can_delete: grant.can_delete && own?.can_delete === true,
          }
        }))
      }
    } catch (e) {
      setMembers([])
      setCanManage(false)
      setError(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [storeId, user, call])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const availableRoles = useMemo(() => isGlobalAdmin ? adminRoles : managerRoles, [isGlobalAdmin])

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    const defaults = defaultGrants(nextRole)
    setNewPermissions(isGlobalAdmin ? defaults : defaults.map((grant) => {
      const own = grantablePermissions[grant.module_key]
      return {
        ...grant,
        can_view: grant.can_view && own?.can_view === true,
        can_create: grant.can_create && own?.can_create === true,
        can_update: grant.can_update && own?.can_update === true,
        can_delete: grant.can_delete && own?.can_delete === true,
      }
    }))
  }

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const permissions = newPermissions.map((grant) => {
        const allowed = grantablePermissions[grant.module_key]
        return isGlobalAdmin ? grant : {
          ...grant,
          can_view: grant.can_view && allowed?.can_view === true,
          can_create: grant.can_create && allowed?.can_create === true,
          can_update: grant.can_update && allowed?.can_update === true,
          can_delete: grant.can_delete && allowed?.can_delete === true,
        }
      }).filter((grant) => grant.can_view || grant.can_create || grant.can_update || grant.can_delete)
      await call({ action: 'create', email, full_name: fullName, password, role, permissions })
      setEmail('')
      setFullName('')
      setPassword('')
      setRole('cashier')
      setNewPermissions(defaultGrants('cashier'))
      setNotice('Compte créé et associé à cette boutique avec ses permissions.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (member: Member, nextRole: Role) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await call({ action: 'update_role', user_id: member.user_id, role: nextRole })
      setNotice('Rôle mis à jour.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification impossible')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (member: Member) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await call({ action: 'set_active', user_id: member.user_id, active: !member.is_active })
      setNotice(member.is_active ? 'Accès désactivé dans cette boutique.' : 'Accès réactivé dans cette boutique.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification impossible')
    } finally {
      setSaving(false)
    }
  }

  const openPermissions = async (member: Member) => {
    setSaving(true)
    setError('')
    try {
      const result = await call({ action: 'get_permissions', user_id: member.user_id })
      setEditingMember(member)
      setEditingPermissions(normalizeGrants((result.permissions || []) as Partial<Grant>[]))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement des permissions impossible')
    } finally {
      setSaving(false)
    }
  }

  const savePermissions = async () => {
    if (!editingMember) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const permissions = editingPermissions.map((grant) => {
        const allowed = grantablePermissions[grant.module_key]
        return isGlobalAdmin ? grant : {
          ...grant,
          can_view: grant.can_view && allowed?.can_view === true,
          can_create: grant.can_create && allowed?.can_create === true,
          can_update: grant.can_update && allowed?.can_update === true,
          can_delete: grant.can_delete && allowed?.can_delete === true,
        }
      }).filter((grant) => grant.can_view || grant.can_create || grant.can_update || grant.can_delete)
      await call({ action: 'set_permissions', user_id: editingMember.user_id, permissions })
      setNotice('Permissions enregistrées.')
      setEditingMember(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement des permissions impossible')
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel settings-users">
    <div className="panel-title">
      <ShieldCheck size={21}/>
      <div>
        <h2>Gestion des utilisateurs</h2>
        <p>Gérez les accès et les opérations autorisées pour {storeName || 'la boutique sélectionnée'}.</p>
      </div>
      {canManage && <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={15}/> Actualiser
      </button>}
    </div>
    {!storeId ? <p className="appearance-note">Sélectionnez une boutique pour gérer ses utilisateurs.</p> :
      !canManage && !loading ? <p className="appearance-note">Accès non autorisé. Le module Utilisateurs doit être accordé par l’Admin.</p> :
      <>
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="appearance-note">{notice}</p>}
        {canManage && <>
          <form className="user-create-form" onSubmit={create}>
            <label className="field">Nom complet<input value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={100}/></label>
            <label className="field">Adresse e-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off"/></label>
            <label className="field">Mot de passe temporaire<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
            <label className="field">Rôle<select value={role} onChange={e => changeRole(e.target.value as Role)}>{availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            <button type="submit" className="primary-button" disabled={saving}>
              <UserPlus size={16}/> {saving ? 'Création…' : 'Ajouter utilisateur'}
            </button>
          </form>

          <div className="user-permissions-create">
            <h3>Permissions du nouvel utilisateur</h3>
            <PermissionEditor value={newPermissions} onChange={setNewPermissions} disabled={saving} grantablePermissions={grantablePermissions} hiddenModules={role === 'cashier' || role === 'stock_manager' ? ['users'] : []}/>
          </div>

          {editingMember && <div className="user-permissions-edit">
            <div className="user-permissions-edit-title">
              <div><h3>Permissions : {editingMember.full_name || editingMember.email}</h3><p>Les modifications s’appliquent à cette boutique uniquement.</p></div>
              <button type="button" className="secondary-button" onClick={() => setEditingMember(null)} disabled={saving}><X size={15}/> Fermer</button>
            </div>
            <PermissionEditor value={editingPermissions} onChange={setEditingPermissions} disabled={saving} grantablePermissions={grantablePermissions} hiddenModules={editingMember.role === 'cashier' || editingMember.role === 'stock_manager' ? ['users'] : []}/>
            <button type="button" className="primary-button" onClick={() => void savePermissions()} disabled={saving}><Save size={16}/> Enregistrer les permissions</button>
          </div>}

          <div className="user-members-list">
            <h3>Utilisateurs de la boutique ({members.length})</h3>
            {loading ? <p>Chargement…</p> : members.length === 0 ? <p className="appearance-note">Aucun utilisateur trouvé.</p> :
              members.map(member => {
                const editableByManager = isGlobalAdmin || ['cashier', 'stock_manager'].includes(member.role)
                return <div className="user-member-row" key={member.user_id}>
                  <div className="user-member-info">
                    <UserRound size={18}/>
                    <div><strong>{member.full_name || member.email || member.user_id}</strong><small>{member.email}</small></div>
                  </div>
                  <select
                    aria-label="Rôle utilisateur"
                    value={member.role}
                    disabled={saving || member.user_id === user?.id || !editableByManager || !member.is_active}
                    onChange={e => void updateRole(member, e.target.value as Role)}
                  >
                    {member.role === 'accountant' && <option value="accountant">Comptable (existant)</option>}
                    {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <span className={member.is_active ? 'user-status active' : 'user-status'}>{member.is_active ? 'Actif' : 'Désactivé'}</span>
                  {member.user_id !== user?.id && editableByManager && <>
                    {member.is_active && <button type="button" className="secondary-button" disabled={saving} onClick={() => void openPermissions(member)}><KeyRound size={15}/> Permissions</button>}
                    <button type="button" className="secondary-button" disabled={saving} onClick={() => void toggleActive(member)}>
                      {member.is_active ? <><UserX size={15}/> Désactiver</> : <><UserCheck size={15}/> Activer</>}
                    </button>
                  </>}
                </div>
              })
            }
          </div>
        </>}
      </>}
  </section>
}
