import * as SQLite from 'expo-sqlite'

type CacheTable =
  | 'products'
  | 'product_variants'
  | 'categories'
  | 'brands'
  | 'customers'
  | 'sales'
  | 'returns'
  | 'expenses'
  | 'stock_movements'
  | 'atelier_productions'
  | 'deliveries'

const DATABASE_NAME = 'stylepro-manager-mobile.db'
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME)
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS cached_records (
          store_id TEXT NOT NULL,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          cached_at TEXT NOT NULL,
          PRIMARY KEY (store_id, table_name, record_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cached_records_store_table
          ON cached_records (store_id, table_name);
      `)
      return db
    })().catch((error) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

/**
 * Persist a server snapshot for read-only offline fallback.
 * Rows are isolated by store_id and never become pending writes.
 */
export async function cacheMobileRows<T extends { id: string }>(
  storeId: string,
  table: CacheTable,
  rows: T[],
): Promise<void> {
  if (!storeId) throw new Error('store_id is required for the local cache.')
  const db = await getDatabase()
  const cachedAt = new Date().toISOString()

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'DELETE FROM cached_records WHERE store_id = ? AND table_name = ?',
      storeId,
      table,
    )
    for (const row of rows) {
      if (!row.id) continue
      await tx.runAsync(
        `INSERT INTO cached_records (store_id, table_name, record_id, payload, cached_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(store_id, table_name, record_id)
         DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at`,
        storeId,
        table,
        row.id,
        JSON.stringify(row),
        cachedAt,
      )
    }
  })
}

export async function getMobileCachedRows<T>(
  storeId: string,
  table: CacheTable,
): Promise<T[]> {
  if (!storeId) return []
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM cached_records WHERE store_id = ? AND table_name = ? ORDER BY record_id',
    storeId,
    table,
  )
  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.payload) as T]
    } catch {
      return []
    }
  })
}

/** Remove one store's cached business data without touching other stores. */
export async function clearMobileStoreCache(storeId: string): Promise<void> {
  if (!storeId) return
  const db = await getDatabase()
  await db.runAsync('DELETE FROM cached_records WHERE store_id = ?', storeId)
}
