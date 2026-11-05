# StylePro Manager — Access Control Baseline

Status: **design approved; implementation gated by live RLS verification**.

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
- Existing policy behavior previously inspected includes self-only profile/member reads, member store reads, and admin-only store updates. This is not a complete current policy inventory.
- The repository's `supabase/00_read_only_security_audit.sql` is a SELECT-only inventory script. No migrations directory is currently present in the checked repository tree.
- Current `manage-users` Edge Function permits only Admin membership and currently accepts the role list `admin, manager, cashier, stock_manager`. It does not yet implement Manager delegation or persisted module grants.
- Current Web/Desktop `UserManagement` UI is Admin-only and has no store picker or module checklist.
- Android has a separate user-management UI and currently contains an inconsistent role list (including `accountant`). It must be aligned with the approved server rules before release.
- Local IndexedDB is a cache/queue foundation; full safe offline mutation replay is not implemented. Do not claim complete offline synchronization.

## 6. Required verification before implementation

Run `supabase/00_read_only_security_audit.sql` against the intended live Supabase project and retain all result sets. In particular verify:
- exact primary/unique/foreign keys on `stores`, `store_members`, and all store-owned tables;
- every existing RLS policy (including permissive/restrictive mode, USING and WITH CHECK);
- whether Admin currently has a global membership representation or requires a trusted global-admin mapping;
- whether a user can belong to multiple stores and how Manager assignments are represented;
- all functions and triggers that create stores or memberships;
- whether any module-permission table or equivalent already exists.

Then prepare an additive migration and backend changes against those exact results. Existing permissive policies must be revised carefully where necessary: adding another permissive policy does not restrict access because PostgreSQL combines permissive policies with OR semantics.

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
