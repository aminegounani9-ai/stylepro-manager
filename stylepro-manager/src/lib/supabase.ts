import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL ?? '').trim()

if (!url || !key) {
  throw new Error(
    'Configuration Supabase manquante. Vérifie le fichier .env.local.'
  )
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'stylepro-manager-auth',
    flowType: 'pkce',
  },
})

export const adminAccount = {
  email: adminEmail || null,
  requiresTrustedAssignment: true,
}

export const isAdminAccountEmail = (email?: string | null) => {
  if (!email || !adminAccount.email) return false
  return email.trim().toLowerCase() === adminAccount.email.trim().toLowerCase()
}
