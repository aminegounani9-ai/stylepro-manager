/**
 * StylePro Manager - offline-first local database foundation.
 *
 * This module deliberately does not write business records to Supabase yet.
 * Each module must be migrated with its own validated read/write adapter before
 * queued operations are replayed, so stock and sales are never duplicated.
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
  store_id: string
  table_name: EntityTable
  record_id: string
  operation: 'upsert' | 'delete'
  payload?: Record<string, unknown>
  created_at: string
  attempts: number
  status: 'pending' | 'processing' | 'error'
  last_error?: string
}

const DB_NAME = 'stylepro-manager-local'
const DB_VERSION = 1
const RECORDS = 'records'
const QUEUE = 'sync_queue'
const META = 'metadata'

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
      if (!db.objectStoreNames.contains(RECORDS)) {
        const records = db.createObjectStore(RECORDS, { keyPath: 'id' })
        records.createIndex('by_store', 'store_id')
        records.createIndex('by_table', 'table_name')
        records.createIndex('by_store_table', ['store_id', 'table_name'])
        records.createIndex('by_sync_state', 'sync_state')
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        const queue = db.createObjectStore(QUEUE, { keyPath: 'id' })
        queue.createIndex('by_store', 'store_id')
        queue.createIndex('by_status', 'status')
        queue.createIndex('by_created', 'created_at')
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('Impossible d’ouvrir la base locale.'))
    }
    request.onblocked = () => reject(new Error('Fermez les autres onglets StylePro pour terminer la mise à jour locale.'))
  })
  return dbPromise
}

export async function saveLocalRecord<T extends Record<string, unknown>>(
  table: EntityTable,
  storeId: string,
  data: T,
): Promise<LocalRecord<T>> {
  if (!storeId || typeof data.id !== 'string' || !data.id) {
    throw new Error('store_id et id sont obligatoires pour sauvegarder un enregistrement local.')
  }
  const db = await openLocalDatabase()
  const record: LocalRecord<T> = {
    id: `${storeId}:${table}:${data.id}`,
    store_id: storeId,
    table_name: table,
    data,
    updated_at: new Date().toISOString(),
    sync_state: 'pending',
  }
  const tx = db.transaction(RECORDS, 'readwrite')
  tx.objectStore(RECORDS).put(record)
  await transactionDone(tx)
  return record
}

export async function getLocalRecords<T = Record<string, unknown>>(
  storeId: string,
  table: EntityTable,
): Promise<LocalRecord<T>[]> {
  const db = await openLocalDatabase()
  const tx = db.transaction(RECORDS, 'readonly')
  const rows = await requestResult(
    tx.objectStore(RECORDS).index('by_store_table').getAll([storeId, table]),
  ) as LocalRecord<T>[]
  await transactionDone(tx)
  return rows
}

export async function enqueueSyncOperation(
  operation: Omit<SyncOperation, 'id' | 'created_at' | 'attempts' | 'status'>,
): Promise<SyncOperation> {
  const db = await openLocalDatabase()
  const item: SyncOperation = {
    ...operation,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  }
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).add(item)
  await transactionDone(tx)
  return item
}

export async function getPendingSyncOperations(storeId: string): Promise<SyncOperation[]> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readonly')
  const rows = await requestResult(tx.objectStore(QUEUE).index('by_store').getAll(storeId)) as SyncOperation[]
  await transactionDone(tx)
  return rows
    .filter(item => item.status === 'pending' || item.status === 'error')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function setSyncOperationState(
  id: string,
  status: SyncOperation['status'],
  error?: string,
): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  const store = tx.objectStore(QUEUE)
  const item = await requestResult(store.get(id)) as SyncOperation | undefined
  if (item) {
    store.put({
      ...item,
      status,
      attempts: status === 'processing' ? item.attempts : item.attempts + 1,
      last_error: error,
    })
  }
  await transactionDone(tx)
}

export async function removeSyncOperation(id: string): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).delete(id)
  await transactionDone(tx)
}

export async function setLocalMetadata(key: string, value: unknown): Promise<void> {
  const db = await openLocalDatabase()
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put({ key, value, updated_at: new Date().toISOString() })
  await transactionDone(tx)
}

export async function getLocalMetadata<T>(key: string): Promise<T | undefined> {
  const db = await openLocalDatabase()
  const tx = db.transaction(META, 'readonly')
  const result = await requestResult(tx.objectStore(META).get(key)) as { key: string; value: T } | undefined
  await transactionDone(tx)
  return result?.value
}

export async function getLocalSyncCount(storeId: string): Promise<number> {
  return (await getPendingSyncOperations(storeId)).length
}
