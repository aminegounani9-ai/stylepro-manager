// Supabase Edge Function: manage-users
// Deploy with: supabase functions deploy manage-users
// Requires migration 20261105133000_store_member_module_permissions.sql first.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const allowedRoles = ["admin", "manager", "cashier", "stock_manager"] as const;
const moduleKeys = [
  "dashboard", "catalogue", "sales", "stock", "returns", "clients",
  "expenses", "atelier", "deliveries", "promotions", "labels", "users", "settings",
] as const;

type Role = (typeof allowedRoles)[number];
type ModuleKey = (typeof moduleKeys)[number];
type Grant = {
  module_key: ModuleKey;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

function parseGrants(value: unknown): Grant[] {
  if (!Array.isArray(value)) return [];
  const result: Grant[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("Format des permissions invalide");
    const row = item as Record<string, unknown>;
    const moduleKey = String(row.module_key || "") as ModuleKey;
    if (!moduleKeys.includes(moduleKey) || seen.has(moduleKey)) {
      throw new Error("Module invalide ou dupliqué");
    }
    const grant: Grant = {
      module_key: moduleKey,
      can_view: row.can_view === true,
      can_create: row.can_create === true,
      can_update: row.can_update === true,
      can_delete: row.can_delete === true,
    };
    if ((grant.can_create || grant.can_update || grant.can_delete) && !grant.can_view) {
      throw new Error(`Le module ${moduleKey} doit être visible pour autoriser ses opérations`);
    }
    seen.add(moduleKey);
    result.push(grant);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !authHeader) {
    return json({ error: "Server configuration or authorization missing" }, 500);
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const storeId = String(body.store_id || "");
    const action = String(body.action || "");
    if (!storeId && action !== "list_stores") return json({ error: "store_id is required" }, 400);

    if (action === "list_stores") {
      const { data: adminMemberships, error: adminError } = await adminClient.from("store_members")
        .select("store_id").eq("user_id", authData.user.id).eq("role", "admin").eq("is_active", true);
      if (adminError) return json({ error: adminError.message }, 400);
      if ((adminMemberships || []).length > 0) {
        const { data, error } = await adminClient.from("stores").select("id,name,currency").order("created_at");
        if (error) return json({ error: error.message }, 400);
        return json({ stores: data || [], is_global_admin: true });
      }
      const { data: memberships, error: membershipsError } = await adminClient.from("store_members")
        .select("store_id").eq("user_id", authData.user.id).eq("is_active", true);
      if (membershipsError) return json({ error: membershipsError.message }, 400);
      const storeIds = (memberships || []).map((row) => row.store_id);
      if (!storeIds.length) return json({ stores: [], is_global_admin: false });
      const { data, error } = await adminClient.from("stores")
        .select("id,name,currency").in("id", storeIds).order("created_at");
      if (error) return json({ error: error.message }, 400);
      return json({ stores: data || [], is_global_admin: false });
    }

    // Read-only permission bootstrap for every signed-in store member.
    // This action intentionally runs before user-administration checks.
    if (action === "my_permissions") {
      const [{ data: ownMembership, error: ownMembershipError }, { data: ownAdminMemberships, error: ownAdminError }] =
        await Promise.all([
          adminClient.from("store_members")
            .select("role,is_active")
            .eq("store_id", storeId)
            .eq("user_id", authData.user.id)
            .maybeSingle(),
          adminClient.from("store_members")
            .select("store_id")
            .eq("user_id", authData.user.id)
            .eq("role", "admin")
            .eq("is_active", true),
        ]);
      if (ownMembershipError) return json({ error: ownMembershipError.message }, 400);
      if (ownAdminError) return json({ error: ownAdminError.message }, 400);
      if ((ownAdminMemberships || []).length > 0) {
        // A global Admin may select a store without having a separate membership row in it.
        return json({
          is_global_admin: true,
          role: ownMembership?.role || "admin",
          permissions: moduleKeys.map((module_key) => ({
            module_key, can_view: true, can_create: true, can_update: true, can_delete: true,
          })),
        });
      }
      if (!ownMembership || ownMembership.is_active === false) {
        return json({ error: "Aucune adhésion active dans cette boutique" }, 403);
      }
      const { data: ownGrants, error: ownGrantsError } = await adminClient
        .from("store_member_module_permissions")
        .select("module_key,can_view,can_create,can_update,can_delete")
        .eq("store_id", storeId)
        .eq("user_id", authData.user.id);
      if (ownGrantsError) return json({ error: ownGrantsError.message }, 400);
      return json({
        is_global_admin: false,
        role: ownMembership.role,
        permissions: ownGrants || [],
      });
    }

    const [{ data: selectedMembership, error: selectedError }, { data: adminMemberships, error: adminError }] =
      await Promise.all([
        adminClient.from("store_members")
          .select("role,is_active")
          .eq("store_id", storeId)
          .eq("user_id", authData.user.id)
          .maybeSingle(),
        adminClient.from("store_members")
          .select("store_id")
          .eq("user_id", authData.user.id)
          .eq("role", "admin")
          .eq("is_active", true),
      ]);
    if (selectedError) return json({ error: selectedError.message }, 400);
    if (adminError) return json({ error: adminError.message }, 400);

    const isGlobalAdmin = (adminMemberships || []).length > 0;
    const isStoreManager =
      selectedMembership?.role === "manager" && selectedMembership?.is_active !== false;

    if (!isGlobalAdmin && !isStoreManager) {
      return json({ error: "Accès refusé : rôle Admin global ou Manager de cette boutique requis" }, 403);
    }

    if (!isGlobalAdmin) {
      const requiredUsersAction =
        action === "create" ? "create" :
        ["update_role", "set_active", "set_permissions"].includes(action) ? "update" : "view";
      const { data: userGrant, error: grantError } = await adminClient
        .from("store_member_module_permissions")
        .select("can_view,can_create,can_update")
        .eq("store_id", storeId)
        .eq("user_id", authData.user.id)
        .eq("module_key", "users")
        .maybeSingle();
      if (grantError) return json({ error: grantError.message }, 400);
      const allowed =
        requiredUsersAction === "create" ? userGrant?.can_create === true :
        requiredUsersAction === "update" ? userGrant?.can_update === true :
        userGrant?.can_view === true;
      if (!allowed) return json({ error: `Permission Utilisateurs insuffisante : ${requiredUsersAction}` }, 403);
    }

    const canManageTarget = async (userId: string) => {
      const { data, error } = await adminClient.from("store_members")
        .select("role,is_active")
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Utilisateur introuvable dans cette boutique");
      if (data.is_active === false && action !== "set_active") {
        // Inactive members can still be reactivated, but other changes remain blocked.
        throw new Error("Ce membre est désactivé dans cette boutique");
      }
      if (!isGlobalAdmin && !["cashier", "stock_manager"].includes(data.role)) {
        throw new Error("Un Manager ne peut gérer que les Vendeurs et Gestionnaires de stock");
      }
      return data as { role: string; is_active: boolean | null };
    };

    const validateManagerGrants = async (grants: Grant[]) => {
      if (isGlobalAdmin || grants.length === 0) return;
      const { data, error } = await adminClient.from("store_member_module_permissions")
        .select("module_key,can_view,can_create,can_update,can_delete")
        .eq("store_id", storeId)
        .eq("user_id", authData.user.id)
        .in("module_key", grants.map((g) => g.module_key));
      if (error) throw new Error(error.message);
      const ownByModule = new Map((data || []).map((row) => [row.module_key, row]));
      for (const grant of grants) {
        const own = ownByModule.get(grant.module_key);
        if (!own?.can_view) throw new Error(`Vous ne pouvez pas attribuer le module ${grant.module_key}`);
        if (grant.can_create && !own.can_create) throw new Error(`Vous ne pouvez pas déléguer Ajouter pour ${grant.module_key}`);
        if (grant.can_update && !own.can_update) throw new Error(`Vous ne pouvez pas déléguer Modifier pour ${grant.module_key}`);
        if (grant.can_delete && !own.can_delete) throw new Error(`Vous ne pouvez pas déléguer Supprimer pour ${grant.module_key}`);
      }
    };

    if (action === "list") {
      const { data: members, error } = await adminClient.from("store_members")
        .select("user_id,role,created_at,is_active")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 400);

      const ids = (members || []).map((member) => member.user_id);
      const [profilesResult, authUsersResult] = await Promise.all([
        adminClient.from("profiles").select("id,full_name")
          .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (profilesResult.error) return json({ error: profilesResult.error.message }, 400);
      if (authUsersResult.error) return json({ error: authUsersResult.error.message }, 400);

      const profileById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile.full_name]));
      const userById = new Map((authUsersResult.data.users || []).map((user) => [user.id, user.email || ""]));
      let grantablePermissions: Array<Record<string, unknown>> = moduleKeys.map((module_key) => ({
        module_key, can_view: true, can_create: true, can_update: true, can_delete: true,
      }));
      if (!isGlobalAdmin) {
        const { data: ownGrants, error: ownGrantError } = await adminClient
          .from("store_member_module_permissions")
          .select("module_key,can_view,can_create,can_update,can_delete")
          .eq("store_id", storeId)
          .eq("user_id", authData.user.id);
        if (ownGrantError) return json({ error: ownGrantError.message }, 400);
        grantablePermissions = (ownGrants || []) as Array<Record<string, unknown>>;
      }
      return json({
        members: (members || []).map((member) => ({
          ...member,
          full_name: profileById.get(member.user_id) || "",
          email: userById.get(member.user_id) || "",
          is_active: member.is_active !== false,
        })),
        is_global_admin: isGlobalAdmin,
        is_store_manager: isStoreManager,
        grantable_permissions: grantablePermissions,
      });
    }

    if (action === "get_permissions") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id is required" }, 400);
      await canManageTarget(userId);
      const { data, error } = await adminClient.from("store_member_module_permissions")
        .select("module_key,can_view,can_create,can_update,can_delete")
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .order("module_key");
      if (error) return json({ error: error.message }, 400);
      return json({ permissions: data || [] });
    }

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const role = String(body.role || "") as Role;
      const grants = parseGrants(body.permissions);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
      if (password.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, 400);
      if (!fullName) return json({ error: "Le nom est obligatoire" }, 400);
      if (!allowedRoles.includes(role)) return json({ error: "Rôle invalide" }, 400);
      if (!isGlobalAdmin && !["cashier", "stock_manager"].includes(role)) {
        return json({ error: "Un Manager peut créer uniquement un Vendeur ou un Gestionnaire de stock" }, 403);
      }
      if (role !== "manager" && role !== "admin" && grants.some((grant) => grant.module_key === "users")) {
        return json({ error: "Le module Utilisateurs est réservé aux rôles Admin et Manager" }, 400);
      }
      await validateManagerGrants(grants);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) {
        return json({ error: createError?.message || "Création du compte impossible" }, 400);
      }

      const rollback = async () => {
        await adminClient.from("store_member_module_permissions").delete()
          .eq("store_id", storeId).eq("user_id", created.user!.id);
        await adminClient.from("store_members").delete()
          .eq("store_id", storeId).eq("user_id", created.user!.id);
        await adminClient.from("profiles").delete().eq("id", created.user!.id);
        await adminClient.auth.admin.deleteUser(created.user!.id);
      };

      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: created.user.id,
        full_name: fullName,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) {
        await rollback();
        return json({ error: profileError.message }, 400);
      }

      const { error: memberError } = await adminClient.from("store_members").insert({
        store_id: storeId,
        user_id: created.user.id,
        role,
        is_active: true,
      });
      if (memberError) {
        await rollback();
        return json({ error: memberError.message }, 400);
      }

      if (grants.length) {
        const { error: permissionError } = await adminClient.from("store_member_module_permissions")
          .insert(grants.map((grant) => ({
            ...grant,
            store_id: storeId,
            user_id: created.user!.id,
            created_by: authData.user.id,
          })));
        if (permissionError) {
          await rollback();
          return json({ error: permissionError.message }, 400);
        }
      }
      return json({ success: true, user_id: created.user.id });
    }

    if (action === "update_role") {
      const userId = String(body.user_id || "");
      const role = String(body.role || "") as Role;
      if (!userId || !allowedRoles.includes(role)) return json({ error: "Utilisateur ou rôle invalide" }, 400);
      const target = await canManageTarget(userId);
      if (!isGlobalAdmin && !["cashier", "stock_manager"].includes(role)) {
        return json({ error: "Un Manager ne peut pas attribuer les rôles Admin ou Manager" }, 403);
      }
      if (!isGlobalAdmin && !["cashier", "stock_manager"].includes(target.role)) {
        return json({ error: "Un Manager ne peut pas modifier ce rôle" }, 403);
      }
      if (userId === authData.user.id && role !== "admin") {
        return json({ error: "Vous ne pouvez pas retirer votre propre rôle Admin" }, 400);
      }
      if (target.role === "admin" && role !== "admin") {
        const { data: targetAdminMemberships, error: targetAdminError } = await adminClient.from("store_members")
          .select("store_id").eq("user_id", userId).eq("role", "admin").eq("is_active", true);
        if (targetAdminError) return json({ error: targetAdminError.message }, 400);
        if ((targetAdminMemberships || []).length <= 1) {
          const { data: otherAdmins, error: otherAdminError } = await adminClient.from("store_members")
            .select("user_id").eq("role", "admin").eq("is_active", true).neq("user_id", userId);
          if (otherAdminError) return json({ error: otherAdminError.message }, 400);
          if (!(otherAdmins || []).length) return json({ error: "Impossible de retirer le dernier Admin global" }, 400);
        }
      }
      const { error } = await adminClient.from("store_members")
        .update({ role }).eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_active") {
      const userId = String(body.user_id || "");
      const active = body.active === true;
      if (!userId) return json({ error: "user_id is required" }, 400);
      if (userId === authData.user.id && !active) return json({ error: "Vous ne pouvez pas désactiver votre propre accès" }, 400);
      const target = await canManageTarget(userId);
      if (!active && target.role === "admin") {
        const { data: otherMemberships, error: otherMembershipError } = await adminClient.from("store_members")
          .select("store_id").eq("user_id", userId).eq("role", "admin").eq("is_active", true);
        if (otherMembershipError) return json({ error: otherMembershipError.message }, 400);
        if ((otherMemberships || []).length <= 1) {
          const { data: otherAdmins, error: otherAdminError } = await adminClient.from("store_members")
            .select("user_id").eq("role", "admin").eq("is_active", true).neq("user_id", userId);
          if (otherAdminError) return json({ error: otherAdminError.message }, 400);
          if (!(otherAdmins || []).length) return json({ error: "Impossible de désactiver le dernier Admin global" }, 400);
        }
      }
      const { error } = await adminClient.from("store_members")
        .update({ is_active: active }).eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_permissions") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id is required" }, 400);
      const target = await canManageTarget(userId);
      const grants = parseGrants(body.permissions);
      if (target.role !== "manager" && target.role !== "admin" && grants.some((grant) => grant.module_key === "users")) {
        return json({ error: "Le module Utilisateurs est réservé aux rôles Admin et Manager" }, 400);
      }
      await validateManagerGrants(grants);

      if (grants.length) {
        const { error: upsertError } = await adminClient.from("store_member_module_permissions")
          .upsert(grants.map((grant) => ({
            ...grant,
            store_id: storeId,
            user_id: userId,
            created_by: authData.user.id,
            updated_at: new Date().toISOString(),
          })), { onConflict: "store_id,user_id,module_key" });
        if (upsertError) return json({ error: upsertError.message }, 400);
      }

      const { data: existing, error: existingError } = await adminClient.from("store_member_module_permissions")
        .select("module_key").eq("store_id", storeId).eq("user_id", userId);
      if (existingError) return json({ error: existingError.message }, 400);
      const selected = new Set(grants.map((grant) => grant.module_key));
      const removed = (existing || []).map((row) => row.module_key).filter((key) => !selected.has(key));
      if (removed.length) {
        const { error: deleteError } = await adminClient.from("store_member_module_permissions")
          .delete().eq("store_id", storeId).eq("user_id", userId).in("module_key", removed);
        if (deleteError) return json({ error: deleteError.message }, 400);
      }
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
