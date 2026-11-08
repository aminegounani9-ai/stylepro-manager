# StylePro Manager — Offline-first rollout

## Architecture
- IndexedDB is the browser/device local database.
- Supabase remains the cloud source shared by authorized members of a store.
- The local sync queue stores durable operations and retries after connectivity returns.
- Every local record is scoped by `store_id`.

## Current foundation
`src/lib/offlineDb.ts` creates versioned IndexedDB stores for business records, sync operations, and metadata. It provides typed helpers for local records, queue persistence, and sync status. Server snapshots are written with `cacheServerRecord` and marked `synced`; local mutations use a separate API and must never be confused with downloaded cache rows.

## Durable outbox foundation (Web + Tauri Desktop)
- IndexedDB schema version 2 keeps existing cached rows and adds a store-scoped deduplication index for queued operations.
- Each queued operation has a stable idempotency key, optional dedupe key, retry schedule, and expiring processing lease.
- A lease is claimed atomically; the Web Locks API prevents concurrent replay from multiple tabs where supported.
- Retry delay grows exponentially and is capped. Expired leases can be reclaimed after a tab/browser crash.
- The sync engine only replays tables with an explicitly registered adapter that declares server-side idempotency support. It does not perform arbitrary Supabase table upserts/deletes.
- The app header displays connectivity and local outbox status.

## Enabled offline write adapters (Web + Tauri Desktop)
- POS sales use `create_pos_sale_cart_idempotent`; offline checkouts are queued locally with a durable key and replayed after reconnect.
- POS returns use `create_pos_return_idempotent`; return items and restock choice are preserved in the queue.
- Stock transfers use `transfer_stock_idempotent`; the two movement rows are created by the existing transactional stock-transfer RPC only once.
- Delivery dispatch confirmation uses `confirm_delivery_idempotent`; stock deductions are replay-safe.
- Five authenticated RPCs use a private `private.idempotency_requests` table with a primary key over store, actor, operation and client key. The request payload hash is checked; reusing a key with a different payload is rejected; successful RPC results are stored and returned on retries.
- The idempotency table has no SELECT grants for `anon` or `authenticated`. RPC execution is granted only to `authenticated`, with membership/role and per-module action checks performed in each wrapper.
- Android remains an online companion; this IndexedDB queue applies to Web and Tauri Desktop only.
- Business operations are committed server-side after reconnect, not speculatively applied to cloud stock. The UI reports queued operations until the server confirms them.

## Implemented read-only offline coverage (Web + Tauri Desktop)
- Catalogue products, categories, brands, product variants, customers, and stock-movement snapshots are cached by active `store_id`.
- Atelier and delivery modules cache their downloaded records and can use local snapshots when a network request fails.
- POS can read cached variants, customers, and stock movements when offline. Sales and returns can now be queued for server-side processing after reconnect; queued actions are not represented as completed cloud transactions until synchronization succeeds.
- The Tauri desktop app uses the same React frontend and therefore the same IndexedDB cache inside its WebView.
- Android currently persists its Supabase authentication session with AsyncStorage, loads server-assigned module visibility, and remains an online companion; the full business-data SQLite cache and offline write queue are not yet implemented there. User administration remains in Web/Desktop until the full permission matrix is added to Android.

## Important safety rule
Never register arbitrary table upserts/deletes for financial or inventory operations. Only the reviewed adapters above may replay operations, and they must continue to use the idempotent server RPCs. Do not treat a queued operation as a completed sale, refund, transfer, or dispatch before the server acknowledges it.

## Migration order
1. Authentication and store context (never cache passwords or access tokens in business tables).
2. Read-through cache for catalogue, variants, categories, brands, customers, stock locations.
3. Additive private idempotency ledger and authenticated RPC wrappers.
4. Offline sales/returns, stock transfers, and delivery dispatch queue adapters.
5. Reconnect scheduler, conflict-aware retries, backoff, and sync status UI.
6. Offline/PWA and multi-device acceptance tests.

## Data isolation
All cache reads must filter by the active store. On logout or store switch, clear in-memory state and never display records from another store. Local browser storage is not a security boundary; Supabase RLS remains mandatory.

## Not yet enabled / release gates
- General-purpose replay of queued writes remains disabled. Only sales, returns, stock transfers and delivery dispatch have registered idempotent adapters.
- Offline expenses, purchase orders, production records, delivery creation/returns, arbitrary stock adjustments, and payment recording are not yet queued. Each requires a reviewed transactional RPC and idempotency contract.
- Queue acceptance tests for real multi-device network interruption, duplicate retries and server timeout-after-commit are still required; RPC definitions, grants, private table access and migration history were verified, but no live sale/refund/stock operation was generated as a test.
- The Android client does not yet have a persistent SQLite business-data cache or background sync worker.
- Manager delegation and per-user module/action permissions are present in the project; verify the current deployed `manage-users` Edge Function separately before relying on backend redaction.
- Web and Desktop share source code, but Windows installers must pass the dedicated desktop workflow before distribution. Android APK must pass the standalone APK workflow. A successful web build does not certify either native package.

The additive idempotency migrations are applied to Supabase project `khofawpfhzaxhwttibid` and recorded under `supabase/migrations/`. No existing business table rows were modified or deleted.
