# StylePro Manager — Offline-first rollout

## Architecture
- IndexedDB is the browser/device local database.
- Supabase remains the cloud source shared by authorized members of a store.
- The local sync queue stores durable operations and retries after connectivity returns.
- Every local record is scoped by `store_id`.

## Current foundation
`src/lib/offlineDb.ts` creates versioned IndexedDB stores for business records, sync operations, and metadata. It provides typed helpers for local records, queue persistence, and sync status.

## Important safety rule
The queue is infrastructure only at this stage. Do not replay arbitrary table writes yet. Each module needs a reviewed adapter and conflict policy. Sales, returns, stock movements, and delivery confirmation must use idempotency keys and server-side transactional RPCs before offline operations can be replayed. This prevents duplicate sales and stock changes.

## Migration order
1. Authentication and store context (never cache passwords or access tokens in business tables).
2. Read-through cache for catalogue, variants, categories, brands, customers, stock locations.
3. Offline drafts for Atelier and deliveries.
4. Idempotent offline sales/returns and inventory operations through dedicated Supabase RPCs.
5. Reconnect scheduler, conflict resolution, retry/backoff, and sync status UI.
6. Offline/PWA and multi-device acceptance tests.

## Data isolation
All cache reads must filter by the active store. On logout or store switch, clear in-memory state and never display records from another store. Local browser storage is not a security boundary; Supabase RLS remains mandatory.

## Not yet enabled
The existing screens still call Supabase directly. This foundation does not yet make every module usable offline. No database schema changes are required for this first local-storage layer.
