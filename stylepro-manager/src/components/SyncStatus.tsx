import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Cloud, CloudOff, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getSyncQueueSummary } from '../lib/offlineDb'
import { flushStoreSyncQueue } from '../lib/syncEngine'

type Props = { storeId: string; isOnline: boolean }

export default function SyncStatus({ storeId, isOnline }: Props) {
  const [summary, setSummary] = useState({ pending: 0, processing: 0, errors: 0 })
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  const refresh = useCallback(async () => {
    if (!storeId) { setSummary({ pending: 0, processing: 0, errors: 0 }); return }
    try { setSummary(await getSyncQueueSummary(storeId)) } catch { /* IndexedDB may be unavailable */ }
  }, [storeId])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const synchronize = async () => {
    if (busy || !storeId || !isOnline) return
    setBusy(true)
    setHint('')
    try {
      const result = await flushStoreSyncQueue(storeId)
      await refresh()
      if (result.processed) setHint(`${result.processed} opération(s) synchronisée(s).`)
      else if (result.blocked) setHint('En attente des connecteurs serveur idempotents. Aucune écriture risquée n’a été rejouée.')
      else setHint('Aucune opération synchronisable en attente.')
    } catch {
      setHint('Synchronisation impossible. Les données locales sont conservées.')
    } finally { setBusy(false) }
  }

  const total = summary.pending + summary.processing + summary.errors
  const label = !isOnline ? 'Hors ligne · cache local' : summary.errors ? `${summary.errors} erreur(s)` : total ? `${total} en attente` : 'Synchronisé'
  const Icon = !isOnline ? CloudOff : summary.errors ? AlertTriangle : total ? Cloud : CheckCircle2

  return (
    <button
      type="button"
      className={`sync-status-badge ${!isOnline ? 'offline' : summary.errors ? 'has-errors' : total ? 'has-pending' : 'is-synced'}`}
      onClick={() => void synchronize()}
      disabled={!isOnline || busy || !storeId}
      title={hint || (isOnline
        ? 'Cliquez pour vérifier la file de synchronisation'
        : 'Mode hors ligne : consultation du cache local. Les opérations commerciales restent protégées.')}
      aria-live="polite"
    >
      <Icon size={15} />
      <span>{busy ? 'Synchronisation…' : label}</span>
      <RefreshCw size={13} className={busy ? 'sync-spin' : ''} />
    </button>
  )
}
