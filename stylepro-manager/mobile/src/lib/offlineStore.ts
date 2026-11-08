import * as SQLite from 'expo-sqlite'

export type MobileScanVariant = {
  id: string
  store_id: string
  product_id: string
  sku: string | null
  barcode: string | null
  qr_token: string | null
  size: string | null
  color: string | null
  sale_price: number
  active: boolean
  product_name: string
  current_stock: number | null
}

export type MobileCacheInfo = {
  itemCount: number
  lastSyncedAt: string | null
}

export type MobileSyncOperation = {
  id: string
  store_id: string
  operation: string
  idempotency_key: string
  dedupe_key: string
  payload: Record<string, unknown>
  created_at: string
  status: 'pending' | 'processing' | 'error'
  attempts: number
  next_retry_at: string
  lease_until: string | null
  last_error: string | null
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync('stylepro-mobile.db')
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS mobile_scan_catalog (
          store_id TEXT NOT NULL,
          id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          sku TEXT,
          barcode TEXT,
          qr_token TEXT,
          size TEXT,
          color TEXT,
          sale_price REAL NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          product_name TEXT NOT NULL,
          current_stock REAL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (store_id, id)
        );
        CREATE INDEX IF NOT EXISTS mobile_scan_barcode_idx
          ON mobile_scan_catalog(store_id, barcode);
        CREATE INDEX IF NOT EXISTS mobile_scan_qr_idx
          ON mobile_scan_catalog(store_id, qr_token);
        CREATE INDEX IF NOT EXISTS mobile_scan_sku_idx
          ON mobile_scan_catalog(store_id, sku);
        CREATE TABLE IF NOT EXISTS mobile_cache_metadata (
          store_id TEXT PRIMARY KEY NOT NULL,
          item_count INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT
        );
        CREATE TABLE IF NOT EXISTS mobile_sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          store_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          dedupe_key TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at TEXT NOT NULL,
          lease_until TEXT,
          last_error TEXT,
          UNIQUE(store_id, idempotency_key),
          UNIQUE(store_id, dedupe_key)
        );
        CREATE INDEX IF NOT EXISTS mobile_outbox_due_idx
          ON mobile_sync_outbox(store_id, status, next_retry_at, created_at);
      `)
      return database
    })().catch(error => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

export async function replaceScannerCatalog(
  storeId: string,
  rows: MobileScanVariant[],
): Promise<MobileCacheInfo> {
  if (!storeId) throw new Error('Boutique manquante pour le cache mobile.')
  const database = await getDatabase()
  const syncedAt = new Date().toISOString()

  await database.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('DELETE FROM mobile_scan_catalog WHERE store_id = ?', storeId)
    for (const row of rows) {
      await transaction.runAsync(
        `INSERT INTO mobile_scan_catalog
          (store_id,id,product_id,sku,barcode,qr_token,size,color,sale_price,active,product_name,current_stock,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        storeId, row.id, row.product_id, row.sku, row.barcode, row.qr_token,
        row.size, row.color, row.sale_price, row.active ? 1 : 0, row.product_name,
        row.current_stock, syncedAt,
      )
    }
    await transaction.runAsync(
      `INSERT INTO mobile_cache_metadata(store_id,item_count,last_synced_at)
       VALUES(?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET item_count=excluded.item_count,last_synced_at=excluded.last_synced_at`,
      storeId, rows.length, syncedAt,
    )
  })

  return { itemCount: rows.length, lastSyncedAt: syncedAt }
}

export async function upsertScannerVariant(row: MobileScanVariant): Promise<void> {
  const database = await getDatabase()
  const now = new Date().toISOString()
  await database.runAsync(
    `INSERT INTO mobile_scan_catalog
      (store_id,id,product_id,sku,barcode,qr_token,size,color,sale_price,active,product_name,current_stock,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(store_id,id) DO UPDATE SET
       product_id=excluded.product_id,sku=excluded.sku,barcode=excluded.barcode,
       qr_token=excluded.qr_token,size=excluded.size,color=excluded.color,
       sale_price=excluded.sale_price,active=excluded.active,
       product_name=excluded.product_name,current_stock=excluded.current_stock,
       updated_at=excluded.updated_at`,
    row.store_id, row.id, row.product_id, row.sku, row.barcode, row.qr_token,
    row.size, row.color, row.sale_price, row.active ? 1 : 0, row.product_name,
    row.current_stock, now,
  )
}

type StoredScanVariant = Omit<MobileScanVariant, 'active'> & { active: number }

function mapStoredVariant(row: StoredScanVariant): MobileScanVariant {
  return { ...row, active: row.active === 1 }
}

export async function findCachedScannerVariant(
  storeId: string,
  code: string,
): Promise<MobileScanVariant | null> {
  const database = await getDatabase()
  const row = await database.getFirstAsync<StoredScanVariant>(
    `SELECT * FROM mobile_scan_catalog
     WHERE store_id = ? AND active = 1
       AND (barcode = ? OR qr_token = ? OR sku = ?)
     LIMIT 1`,
    storeId, code, code, code,
  )
  return row ? mapStoredVariant(row) : null
}

export async function getMobileCacheInfo(storeId: string): Promise<MobileCacheInfo> {
  if (!storeId) return { itemCount: 0, lastSyncedAt: null }
  const database = await getDatabase()
  const row = await database.getFirstAsync<{ item_count: number; last_synced_at: string | null }>(
    'SELECT item_count,last_synced_at FROM mobile_cache_metadata WHERE store_id = ?',
    storeId,
  )
  return {
    itemCount: Number(row?.item_count ?? 0),
    lastSyncedAt: row?.last_synced_at ?? null,
  }
}

export async function enqueueMobileSyncOperation(input: {
  storeId: string
  operation: string
  idempotencyKey: string
  dedupeKey: string
  payload: Record<string, unknown>
}): Promise<void> {
  if (!input.storeId || !input.idempotencyKey || !input.dedupeKey) {
    throw new Error('Boutique, clé idempotente et clé anti-doublon obligatoires.')
  }
  const database = await getDatabase()
  const now = new Date().toISOString()
  await database.runAsync(
    `INSERT OR IGNORE INTO mobile_sync_outbox
      (id,store_id,operation,idempotency_key,dedupe_key,payload_json,created_at,status,attempts,next_retry_at)
     VALUES(?,?,?,?,?,?,?,'pending',0,?)`,
    input.idempotencyKey, input.storeId, input.operation, input.idempotencyKey,
    input.dedupeKey, JSON.stringify(input.payload), now, now,
  )
}

export async function getMobileSyncQueueSummary(storeId: string): Promise<{
  pending: number
  processing: number
  errors: number
}> {
  if (!storeId) return { pending: 0, processing: 0, errors: 0 }
  const database = await getDatabase()
  const rows = await database.getAllAsync<{ status: string; count: number }>(
    'SELECT status,COUNT(*) AS count FROM mobile_sync_outbox WHERE store_id = ? GROUP BY status',
    storeId,
  )
  return {
    pending: Number(rows.find(row => row.status === 'pending')?.count ?? 0),
    processing: Number(rows.find(row => row.status === 'processing')?.count ?? 0),
    errors: Number(rows.find(row => row.status === 'error')?.count ?? 0),
  }
}

export async function getCachedProducts(storeId: string): Promise<Array<{
  id: string
  name: string
  target_audience: string | null
  description: string | null
  active: boolean
}>> {
  if (!storeId) return []
  const database = await getDatabase()
  const rows = await database.getAllAsync<{ id: string; name: string }>(
    `SELECT product_id AS id,MAX(product_name) AS name
     FROM mobile_scan_catalog WHERE store_id = ? AND active = 1
     GROUP BY product_id ORDER BY name`,
    storeId,
  )
  return rows.map(row => ({
    id: row.id, name: row.name, target_audience: null,
    description: null, active: true,
  }))
}
