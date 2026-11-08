/**
 * StylePro Manager — durable local store and transactional outbox.
 *
 * IMPORTANT: queue replay is adapter-based. An adapter must call a server-side
 * transactional endpoint that persists the idempotency key under a UNIQUE
 * constraint. Never register a plain table upsert for sales/stock operations.
 */
export type SyncState = 'pending' | 'syncing' | 'synced' | 'error'
export type EntityTable =
  | 'stores' | 'products' | 'product_variants' | 'categories' | 'brands'
  | 'customers' | 'sales' | 'sale_items' | 'returns' | 'return_items'
  | 'stock_movements' | 'expenses' | 'promotions' | 'promotion_products'
  | 'atelier_suppliers' | 'atelier_productions' | 'atelier_production_models'
  | 'atelier_production_sizes' | 'atelier_stock_integrations' | 'stock_storage_positions' | 'audit_logs' | 'deliveries' | 'delivery_items'
  | 'delivery_item_allocations' | 'delivery_returns'

export type LocalRecord<T = Record<string, unknown>> = {
  id: string
  store_id: string
  table_name: EntityTable
  data: T
  updated_at: string
  sync_state: SyncState
  last_sync_at?: string
  sync_error?: string
}

export type SyncOperation = {
  id: string
  idempotency_key: string
  dedupe_key?: string
  store_id: string
  table_name: EntityTable
  record_id: string
  operation: 'upsert' | 'delete'
  payload?: Record<string, unknown>
  created_at: string
  attempts: number
  status: 'pending' | 'processing' | 'error'
  next_retry_at?: string
  lease_until?: string
  last_error?: string
}

const DB_NAME = 'stylepro-manager-local'
const DB_VERSION = 2
const RECORDS = 'records'
const QUEUE = 'sync_queue'
const META = 'metadata'
const DEFAULT_LEASE_MS = 60_000

let dbPromise: Promise<IDBDatabase> | null = null

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export function openLocalDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Ce navigateur ne prend pas en charge IndexedDB.'))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const tx = request.transaction
      if (!db.objectStoreNames.contains(RECORDS)) {
        const records = db.createObjectStore(RECORDS, { keyPath: 'id' })
        records.createIndex('by_store', 'store_id')
        records.createIndex('by_table', 'table_name')
        records.createIndex('by_store_table', ['store_id', 'table_name'])
        records.createIndex('by_sync_state', 'sync_state')
      }
      let queue: IDBObjectStore
      if (!db.objectStoreNames.contains(QUEUE)) {
        queue = db.createObjectStore(QUEUE, { keyPath: 'id' })
        queue.createIndex('by_store', 'store_id')
        queue.createIndex('by_status', 'status')
        queue.createIndex('by_created', 'created_at')
      } else {
        queue = tx!.objectStore(QUEUE)
      }
      if (!queue.indexNames.contains('by_store_dedupe')) {
        queue.createIndex('by_store_dedupe', ['store_id', 'dedupe_key'])
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    request.onerror = () => { dbPromise = null; reject(request.error ?? new Error('Impossible d’ouvrir la base locale.')) }
    request.onblocked = () => reject(new Error('Fermez les autres onglets StylePro pour terminer la mise à jour locale.'))
  })
  return dbPromise
}

export async function saveLocalRecord<T extends Record<string, unknown>>(
  table: EntityTable, storeId: string, data: T,
): Promise<LocalRecord<T>> {
  if (!storeId || typeof data.id !== 'string' || !data.id) {
    throw new Error('store_id et id sont obligatoires pour sauvegarder un enregistrement local.')
  }
  const db = await openLocalDatabase()
  const record: LocalRecord<T> = {
    id: `${storeId}:${table}:${data.id}`, store_id: storeId, table_name: table,
    data, updated_at: new Date().toISOString(), sync_state: 'pending',
  }
  const tx = db.transaction(RECORDS, 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore(RECORDS).put(record)
  await done
  return record
}

export async function cacheServerRecord<T extends Record<string, unknown>>(
  table: EntityTable, storeId: string, data: T,
): Promise<LocalRecord<T>> {
  if (!storeId || typeof data.id !== 'string' || !data.id) {
    throw new Error('store_id et id sont obligatoires pour mettre en cache un enregistrement.')
  }
  const now = new Date().toISOString()
  const db = await openLocalDatabase()
  const key = `${storeId}:${table}:${data.id}`
  const tx = db.transaction(RECORDS, 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore(RECORDS)
  const record: LocalRecord<T> = {
    id: key, store_id: storeId, table_name: table, data,
    updated_at: now, sync_state: 'synced', last_sync_at: now,
  }
  let result: LocalRecord<T> = record
  const request = store.get(key)
  request.onsuccess = () => {
    const existing = request.result as LocalRecord<T> | undefined
    // Never overwrite an unsynced local edit with an older server snapshot.
    if (existing?.sync_state === 'pending' || existing?.sync_state === 'error') {
      result = existing
      return
    }
    store.put(record)
  }
  await done
  return result
}

export async function getLocalRecords<T = Record<string, unknown>>(
  storeId: string, table: EntityTable,
): Promise<LocalRecord<T>[]> {
  const db = await openLocalDatabase()
  const tx = db.transaction(RECORDS, 'readonly')
  const done = transactionDone(tx)
  const rows = await requestResult(
    tx.objectStore(RECORDS).index('by_store_table').getAll([storeId, table]),
  ) as LocalRecord<T>[]
  await done
  return rows
}

export async function enqueueSyncOperation(
  operation: Omit<SyncOperation, 'id' | 'created_at' | 'attempts' | 'status' | 'next_retry_at' | 'lease_until' | 'idempotency_key'> & {
    idempotency_key?: string
  },
): Promise<SyncOperation> {
  if (!operation.store_id || !operation.record_id) throw new Error('store_id et record_id sont obligatoires.')
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore(QUEUE)
  const now = new Date().toISOString()
  const item: SyncOperation = {
    ...operation,
    id: crypto.randomUUID(),
    idempotency_key: operation.idempotency_key || crypto.randomUUID(),
    created_at: now,
    attempts: 0,
    status: 'pending',
    next_retry_at: now,
  }
  let result: SyncOperation = item
  const addItem = () => { store.add(item) }
  if (operation.dedupe_key) {
    const request = store.index('by_store_dedupe').get([operation.store_id, operation.dedupe_key])
    request.onsuccess = () => {
      const existing = request.result as SyncOperation | undefined
      if (existing) result = existing
      else addItem()
    }
  } else {
    addItem()
  }
  await done
  return result
}

export async function getPendingSyncOperations(storeId: string): Promise<SyncOperation[]> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readonly')
  const done = transactionDone(tx)
  const rows = await requestResult(tx.objectStore(QUEUE).index('by_store').getAll(storeId)) as SyncOperation[]
  await done
  const now = Date.now()
  return rows.filter(item =>
    item.status === 'pending' ||
    (item.status === 'error' && (!item.next_retry_at || Date.parse(item.next_retry_at) <= now)) ||
    (item.status === 'processing' && (!item.lease_until || Date.parse(item.lease_until) <= now))
  ).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function getSyncQueueSummary(storeId: string): Promise<{ pending: number; processing: number; errors: number }> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readonly')
  const done = transactionDone(tx)
  const rows = await requestResult(tx.objectStore(QUEUE).index('by_store').getAll(storeId)) as SyncOperation[]
  await done
  return {
    pending: rows.filter(x => x.status === 'pending').length,
    processing: rows.filter(x => x.status === 'processing' && !!x.lease_until && Date.parse(x.lease_until) > Date.now()).length,
    errors: rows.filter(x => x.status === 'error').length,
  }
}

/** Atomically claims one due operation. Expired processing leases are reclaimable. */
export async function claimNextSyncOperation(storeId: string, leaseMs = DEFAULT_LEASE_MS, allowedTables?: EntityTable[]): Promise<SyncOperation | null> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore(QUEUE)
  const now = Date.now()
  let result: SyncOperation | null = null
  const request = store.index('by_store').getAll(storeId)
  request.onsuccess = () => {
    const rows = request.result as SyncOperation[]
    const candidate = rows
      .filter(item =>
        (!allowedTables || allowedTables.includes(item.table_name)) && (
          ((item.status === 'pending' || item.status === 'error') &&
            (!item.next_retry_at || Date.parse(item.next_retry_at) <= now)) ||
          (item.status === 'processing' && (!item.lease_until || Date.parse(item.lease_until) <= now))
        )
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (!candidate) return
    result = {
      ...candidate, status: 'processing', attempts: candidate.attempts + 1,
      lease_until: new Date(now + leaseMs).toISOString(), last_error: undefined,
    }
    store.put(result)
  }
  await done
  return result
}

export async function setSyncOperationState(
  id: string, status: SyncOperation['status'], error?: string,
): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  const done = transactionDone(tx)
  const store = tx.objectStore(QUEUE)
  const request = store.get(id)
  request.onsuccess = () => {
    const item = request.result as SyncOperation | undefined
    if (!item) return
    const attempts = item.attempts
    const delay = Math.min(5 * 60_000, 2_000 * (2 ** Math.max(0, attempts - 1)))
    store.put({
      ...item, status, lease_until: undefined, last_error: error,
      next_retry_at: status === 'error' ? new Date(Date.now() + delay).toISOString() : item.next_retry_at,
    })
  }
  await done
}

export async function removeSyncOperation(id: string): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore(QUEUE).delete(id)
  await done
}

export async function setLocalMetadata(key: string, value: unknown): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(META, 'readwrite')
  const done = transactionDone(tx)
  tx.objectStore(META).put({ key, value, updated_at: new Date().toISOString() })
  await done
}

export async function getLocalMetadata<T>(key: string): Promise<T | undefined> {
  const db = await openLocalDatabase()
  const tx = db.transaction(META, 'readonly')
  const done = transactionDone(tx)
  const result = await requestResult(tx.objectStore(META).get(key)) as { key: string; value: T } | undefined
  await done
  return result?.value
}

export async function getLocalSyncCount(storeId: string): Promise<number> {
  const summary = await getSyncQueueSummary(storeId)
  return summary.pending + summary.errors + summary.processing
}
