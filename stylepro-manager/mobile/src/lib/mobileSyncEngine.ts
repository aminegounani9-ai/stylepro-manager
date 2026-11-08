import { AppState } from 'react-native'
import { supabase } from './supabase'
import {
  claimNextMobileSyncOperation,
  completeMobileSyncOperation,
  failMobileSyncOperation,
  type MobileSyncOperation,
} from './offlineStore'

type MobileSyncAdapter = (operation: MobileSyncOperation) => Promise<void>
const adapters = new Map<string, MobileSyncAdapter>()
const activeStores = new Set<string>()

function registerAdapter(operation: string, adapter: MobileSyncAdapter) {
  adapters.set(operation, adapter)
}

registerAdapter('pos_sale', async operation => {
  const payload = operation.payload as {
    items: Array<{ variant_id: string; quantity: number; discount: number }>
    customer_id: string | null
  }
  const { error } = await supabase.rpc('create_pos_sale_cart_idempotent', {
    p_store_id: operation.store_id,
    p_items: payload.items,
    p_customer_id: payload.customer_id,
    p_idempotency_key: operation.idempotency_key,
  })
  if (error) throw error
})

registerAdapter('pos_return', async operation => {
  const payload = operation.payload as {
    sale_id: string
    items: Array<{ sale_item_id: string; quantity: number; restock: boolean }>
    reason: string
  }
  const { error } = await supabase.rpc('create_pos_return_idempotent', {
    p_store_id: operation.store_id,
    p_sale_id: payload.sale_id,
    p_items: payload.items,
    p_reason: payload.reason,
    p_idempotency_key: operation.idempotency_key,
  })
  if (error) throw error
})

registerAdapter('stock_transfer', async operation => {
  const payload = operation.payload as {
    variant_id: string
    from_location_id: string
    to_location_id: string
    quantity: number
    reason: string
  }
  const { error } = await supabase.rpc('transfer_stock_idempotent', {
    p_store_id: operation.store_id,
    p_variant_id: payload.variant_id,
    p_from_location_id: payload.from_location_id,
    p_to_location_id: payload.to_location_id,
    p_quantity: payload.quantity,
    p_reason: payload.reason,
    p_idempotency_key: operation.idempotency_key,
  })
  if (error) throw error
})

registerAdapter('delivery_confirmation', async operation => {
  const payload = operation.payload as { delivery_id: string }
  const { error } = await supabase.rpc('confirm_delivery_idempotent', {
    p_delivery_id: payload.delivery_id,
    p_idempotency_key: operation.idempotency_key,
  })
  if (error) throw error
})

export type MobileSyncResult = {
  processed: number
  failed: number
  offline: boolean
}

export async function flushMobileSyncQueue(
  storeId: string,
  isOnline: boolean,
): Promise<MobileSyncResult> {
  if (!storeId) return { processed: 0, failed: 0, offline: !isOnline }
  if (!isOnline) return { processed: 0, failed: 0, offline: true }
  if (activeStores.has(storeId)) return { processed: 0, failed: 0, offline: false }

  activeStores.add(storeId)
  let processed = 0
  let failed = 0
  try {
    for (let index = 0; index < 25; index += 1) {
      const operation = await claimNextMobileSyncOperation(storeId)
      if (!operation) break
      const adapter = adapters.get(operation.operation)
      if (!adapter) {
        await failMobileSyncOperation(operation.id, operation.attempts, 'Aucun adaptateur idempotent mobile pour cette opération.')
        failed += 1
        continue
      }
      try {
        await adapter(operation)
        await completeMobileSyncOperation(operation.id)
        processed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur de synchronisation mobile inconnue.'
        await failMobileSyncOperation(operation.id, operation.attempts, message)
        failed += 1
      }
    }
  } finally {
    activeStores.delete(storeId)
  }
  return { processed, failed, offline: false }
}

export function startMobileSyncScheduler(
  storeId: string,
  isOnline: boolean,
): () => void {
  if (!storeId) return () => undefined
  let disposed = false
  const trigger = () => {
    if (!disposed && isOnline) {
      void flushMobileSyncQueue(storeId, isOnline).catch(() => undefined)
    }
  }
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') trigger()
  })
  const timer = setInterval(trigger, 20_000)
  trigger()
  return () => {
    disposed = true
    clearInterval(timer)
    subscription.remove()
  }
}
