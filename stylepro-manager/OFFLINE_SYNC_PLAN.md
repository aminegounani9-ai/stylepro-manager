# StylePro Manager — Offline-first rollout

## Architecture
- IndexedDB is the browser/device local database.
- Supabase remains the cloud source shared by authorized members of a store.
- The local sync queue stores durable operations and retries after connectivity returns.
- Every local record is scoped by `store_id`.

## Current foundation
`src/lib/offlineDb.ts` creates versioned IndexedDB stores for business records, sync operations, and metadata. It provides typed helpers for local records, queue persistence, and sync status. Server snapshots are written with `cacheServerRecord` and marked `synced`; local mutations use a separate API and must never be confused with downloaded cache rows.

## Implemented read-only offline coverage (Web + Tauri Desktop)
- Catalogue products, categories, brands, product variants, customers, and stock-movement snapshots are cached by active `store_id`.
- Atelier and delivery modules cache their downloaded records and can use local snapshots when a network request fails.
- POS can read cached variants, customers, and stock movements when offline. This is a read-only fallback; final sale creation and stock-changing operations still require a server connection.
- The Tauri desktop app uses the same React frontend and therefore the same IndexedDB cache inside its WebView.
- Android currently persists its Supabase authentication session with AsyncStorage; the full business-data SQLite cache and offline write queue are not yet implemented there.

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

## Not yet enabled / release gates
- No general-purpose replay of queued writes is enabled. The queue is infrastructure only; do not send arbitrary table upserts/deletes.
- Offline creation of sales, returns, stock movements, expenses, production records, and delivery confirmations is not yet released. Each needs a reviewed local draft model, server-side idempotency key, transactional RPC, retry policy, and conflict handling.
- The Android client does not yet have a persistent SQLite business-data cache or background sync worker.
- User-management role delegation (Manager creating Cashier/Stock Manager) remains gated by a live read-only RLS/constraint audit. The current Edge Function is Admin-only; do not relax it until the live policies and store membership model are verified.
- Web and Desktop share source code, but Windows installers must pass the dedicated desktop workflow before distribution. Android APK must pass the standalone APK workflow. A successful web build does not certify either native package.

No production database or Storage changes are included in this phase. Apply additive SQL migrations only after the live project has been audited and the exact constraints/policies are known.
