# StylePro Manager — Access Control Baseline

Status: **live audit results received; additive permission foundation drafted; business-table enforcement and client integration remain incomplete**.

This document records the agreed authorization model before changing production code or the Supabase schema. It is additive documentation only: it does not modify application behavior, database tables, policies, or existing data.

## 1. Agreed role model

| Role | Store scope | User administration |
| --- | --- | --- |
| Admin | Global: all stores, products, and business data | Can create Managers and all employee roles; can manage roles and module grants |
| Manager | Only stores assigned to that Manager through `store_members` | Can create Cashiers and Stock Managers only inside assigned stores; can grant only modules the Manager is allowed to use |
| Cashier | Assigned store(s) only | No user/role administration |
| Stock Manager | Assigned store(s) only | No user/role administration |

A Manager must never create or promote another Admin or Manager. A client-supplied `store_id`, `role`, or module list is a request, not proof of authorization. The server must independently derive and validate the caller's permissions.

## 2. User creation form

The approved form contains:
- Full name
- Email
- Password
- Role
- Assigned store
- Module checklist
- Select all
- Save

The selected store must be one the caller is authorized to administer. For Managers, only their own assigned stores may be offered. The server must reject a forged store ID.

Module grants are persisted centrally in Supabase and loaded after authentication by Web, Tauri Desktop, and Android. They must not be stored only in local preferences.

## 3. Module catalogue and role defaults

The application currently exposes these navigation areas; implementation must map each key to the actual route/screen and its data tables:

- dashboard
- catalogue
- sales / caisse
- stock
- returns
- clients
- expenses
- atelier
- deliveries
- promotions
- labels
- users
- settings

Default examples agreed for onboarding:
- Cashier: Dashboard + Caisse (sales) + Deliveries.
- Stock Manager: Dashboard + Stock + Atelier.

These are defaults, not an authorization bypass. Admin can grant modules globally. A Manager can grant only modules within the Manager's own effective module set. A user must be blocked both from hidden navigation and from directly opening a protected route.

## 4. Security requirements

1. **Tenant isolation:** all store-owned records remain scoped by the authenticated user's store membership. Admin's global scope must be explicit and server/database-enforced.
2. **No client authority:** never trust client-side role checks, selected store IDs, or module checkboxes.
3. **Manager delegation:** verify the caller is a Manager for the requested store; permit creation only for `cashier` or `stock_manager`; prevent role escalation and cross-store membership changes.
4. **Module authorization:** enforce module access in the server/database layer for data operations, not only in React navigation.
5. **Consistent clients:** Web and Tauri Desktop share the React frontend; Android must consume the same server-authoritative membership and module grants.
6. **Secrets:** the Supabase service-role key stays only in Edge Function/server secrets and is never shipped to Web, Desktop, or Android.
7. **Preserve data:** use additive migrations only after confirming live constraints and policies. No dropping/recreating tables, no deleting memberships, no rewriting existing business records.

## 5. Existing project findings (GitHub main audit)

- `profiles` stores profile details; role is held in `store_members`, not `profiles`.
- Known `stores` columns: `id, name, currency, timezone, created_by, created_at, updated_at`.
- Known `store_members` columns: `store_id, user_id, role, created_at`.
- The current role check constraint was reported to allow `admin`, `manager`, `cashier`, `stock_manager`, and `accountant`. The approved UI roles are Admin, Manager, Cashier, and Stock Manager; do not silently rewrite existing role values.
- Existing helper functions reported: `private.is_store_member(uuid)` and `private.has_store_role(uuid, text[])`, SECURITY DEFINER and STABLE.
- The live policy inventory supplied on 2026-11-05 shows that several business tables grant CRUD based on store membership or broad role checks, rather than per-user module grants. Atelier CRUD is membership-based; catalogue/stock tables have broad role-based manage policies; sales, payments, returns and delivery tables have role-based write policies; `store_modules` is admin-managed and member-readable. These existing permissive policies must be narrowed with reviewed restrictive policies or carefully replaced policies.
- The repository's `supabase/00_read_only_security_audit.sql` is a SELECT-only inventory script. An additive migration has now been drafted under `supabase/migrations/20261105133000_store_member_module_permissions.sql`; it adds store-specific membership activation, a per-member module/CRUD grant table, and security-definer helper functions. It is not applied to Supabase.
- Baseline before this branch: `manage-users` accepted only store Admin callers; Web/Desktop user management was Admin-only; Android included a legacy `accountant` role option. This branch is replacing those behaviors, while preserving existing database role values.
- Local IndexedDB is a cache/queue foundation; full safe offline mutation replay is not implemented. Do not claim complete offline synchronization.

## 6. Implementation gates

The live read-only audit results have been supplied in the conversation. The first additive migration is a foundation only; it does not yet enforce permissions on products, sales, stock, Atelier, deliveries, expenses, or other business tables. Do not apply it as a completed authorization solution.

Before release, complete these steps:
1. Verify the exact live constraints and the new migration against the target Supabase project.
2. Extend `manage-users` so Admin is global, Manager is restricted to assigned stores and may create/manage only Cashier or Stock Manager, and module grants are validated server-side.
3. Replace global Auth banning for store-specific disablement with `store_members.is_active` after the migration is applied.
4. Add and test restrictive RLS policies per module/action on every store-owned business table. PostgreSQL permissive policies combine with OR; a new permissive policy cannot narrow an existing permissive policy. Restrictive policies combine with AND, but must be designed carefully so they do not break existing tenant isolation or legitimate server workflows.
5. Update Web/Desktop and Android to load the same server-authoritative grants, hide ungranted navigation, and block direct route access.
6. Run the acceptance tests below against live Supabase before deployment.

## 7. Acceptance tests

- Admin can list all stores and products, and create a Manager or employee.
- Manager can list only assigned stores and their data.
- Manager can create Cashier and Stock Manager only in an assigned store.
- Manager cannot create Admin/Manager, promote employees, or alter a foreign store ID.
- Cashier with Dashboard + Caisse cannot open Stock or Atelier by navigation, direct URL, or direct data query.
- Stock Manager with Dashboard + Stock + Atelier cannot access ungranted modules.
- Revoking a module takes effect across Web, Desktop, and Android after permission refresh.
- Cross-store reads and writes fail at Supabase RLS even if the client changes `store_id`.
- Existing users, memberships, products, sales, stock, Atelier records, and other business data remain intact.

**No application or database authorization changes are considered complete until these checks pass against the live Supabase project.**


## 8. Current implementation status (2026-11-05)

- A separate branch `feat/custom-store-module-permissions` was created from `main`.
- The additive SQL foundation is drafted on that branch only. No SQL has been run against Supabase; no production data, policies, or Auth users were changed.
- `manage-users` has been updated in the branch to distinguish global Admin from store-scoped Manager, restrict Manager delegation to Cashier/Stock Manager, store per-user module/CRUD grants, and disable a membership per store instead of banning the whole Auth account.
- The Web/Desktop user-management component now contains a per-module Voir / Ajouter / Modifier / Supprimer editor and uses the Edge Function as its authorization source.
- The Web app now loads authorized store lists and server permission snapshots, hides ungranted navigation, blocks ungranted views, and has a separate Users view.
- Android now loads the same permission snapshot, filters module navigation, blocks ungranted module views, and has module/action controls when creating or editing a member.
- A second additive migration drafts restrictive RLS guards for the mapped store-owned tables and a global-Admin allow policy. It is not applied to Supabase.
- The RLS guard migration deliberately preserves all existing permissive policies and their parent-row / draft-state checks. As a result, it narrows access according to module grants but does not yet expand actions beyond the original role policies. Full role-independent delegation still requires a reviewed refactor of each original permissive policy, preserving its tenant and business-state checks.
- Neither migration has been run against Supabase. No production data, policies, Auth users, or store memberships were changed. Do not deploy this phase as a completed authorization solution.


## 9. Draft migrations

- `20261105133000_store_member_module_permissions.sql`: adds `store_members.is_active`, the per-user module/CRUD grant table, helper functions, and RLS for the grant table.
- `20261105134000_module_permission_rls_guards.sql`: adds restrictive guards for mapped business tables and a global Admin allow policy. It intentionally leaves the existing permissive policies in place.
- These migrations are additive drafts only. Review SQL against the live database and test on staging before applying. The delegated allow policies are limited to tables and child relationships explicitly handled in the migration; they are not a blanket replacement of every old role policy.
