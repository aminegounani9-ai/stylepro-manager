import {
  claimNextSyncOperation,
  getPendingSyncOperations,
  removeSyncOperation,
  setSyncOperationState,
  type EntityTable,
  type SyncOperation,
} from './offlineDb'

export type SyncApplyResult = { duplicate?: boolean }

/**
 * An adapter may only be registered after its server endpoint has durable,
 * database-enforced idempotency (same key + same payload returns same result).
 * This prevents a timeout after commit from creating a second sale on retry.
 */
export type SyncAdapter = {
  supportsServerIdempotency: true
  apply: (operation: SyncOperation) => Promise<SyncApplyResult | void>
}

const adapters = new Map<EntityTable, SyncAdapter>()
let flushInProgress = false

export function registerSyncAdapter(table: EntityTable, adapter: SyncAdapter): () => void {
  if (adapter.supportsServerIdempotency !== true) {
    throw new Error(`Refus d’activer la synchronisation de ${table} sans idempotence côté serveur.`)
  }
  adapters.set(table, adapter)
  return () => {
    if (adapters.get(table) === adapter) adapters.delete(table)
  }
}

export type SyncFlushResult = {
  processed: number
  failed: number
  blocked: number
  offline: boolean
}

export async function flushStoreSyncQueue(storeId: string): Promise<SyncFlushResult> {
  if (!storeId) throw new Error('Une boutique doit être sélectionnée pour synchroniser.')
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0, blocked: 0, offline: true }
  }
  if (flushInProgress) return { processed: 0, failed: 0, blocked: 0, offline: false }

  const pending = await getPendingSyncOperations(storeId)
  const supported = new Set([...adapters.keys()])
  const blocked = pending.filter(item => !supported.has(item.table_name)).length
  if (supported.size === 0) return { processed: 0, failed: 0, blocked, offline: false }

  const run = async (): Promise<SyncFlushResult> => {
    if (flushInProgress) return { processed: 0, failed: 0, blocked, offline: false }
    flushInProgress = true
    let processed = 0
    let failed = 0
    try {
      // Bound each pass so a large backlog cannot monopolize the UI thread.
      for (let index = 0; index < 25; index += 1) {
        const candidate = (await getPendingSyncOperations(storeId))
          .find(item => adapters.has(item.table_name))
        if (!candidate) break

        const operation = await claimNextSyncOperation(storeId, 60_000, [...supported])
        if (!operation) break
        const adapter = adapters.get(operation.table_name)
        if (!adapter) {
          await setSyncOperationState(operation.id, 'error', 'Aucun adaptateur idempotent enregistré.')
          failed += 1
          continue
        }

        try {
          await adapter.apply(operation)
          await removeSyncOperation(operation.id)
          processed += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erreur de synchronisation inconnue.'
          await setSyncOperationState(operation.id, 'error', message.slice(0, 500))
          failed += 1
        }
      }
    } finally {
      flushInProgress = false
    }
    return { processed, failed, blocked, offline: false }
  }

  // Web Locks prevents two tabs from replaying the same outbox simultaneously.
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(`stylepro-sync-${storeId}`, run)
  }
  return run()
}
