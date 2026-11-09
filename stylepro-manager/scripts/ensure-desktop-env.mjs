import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectDir = process.cwd()
const localEnvPath = resolve(projectDir, '.env.local')
const mobileEnvPath = resolve(projectDir, 'mobile/.env')

function parseEnv(content) {
  const values = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    values[key] = value
  }
  return values
}

const current = existsSync(localEnvPath)
  ? parseEnv(readFileSync(localEnvPath, 'utf8'))
  : {}

if (!existsSync(mobileEnvPath) && (!current.VITE_SUPABASE_URL || !current.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Missing .env.local and mobile/.env. Restore the existing mobile Supabase config or create .env.local from .env.example.')
}

const mobile = existsSync(mobileEnvPath)
  ? parseEnv(readFileSync(mobileEnvPath, 'utf8'))
  : {}

const merged = {
  ...current,
  VITE_SUPABASE_URL: current.VITE_SUPABASE_URL || mobile.EXPO_PUBLIC_SUPABASE_URL || '',
  VITE_SUPABASE_PUBLISHABLE_KEY: current.VITE_SUPABASE_PUBLISHABLE_KEY || mobile.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
}

const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
  .filter((name) => !merged[name]?.trim())

if (missing.length) {
  throw new Error(`Desktop configuration incomplete: ${missing.join(', ')}. Check .env.local and mobile/.env.`)
}

const lines = [
  '# Generated locally for the Windows desktop build.',
  '# Do not commit this file. It is ignored by .gitignore.',
  ...Object.entries(merged).map(([key, value]) => `${key}=${value}`),
]
writeFileSync(localEnvPath, `${lines.join('\n')}\n`, { encoding: 'utf8', flag: 'w' })
console.log('Desktop .env.local is ready (Supabase values were not printed).')
