// Supabase Edge Function: manage-users
// Deploy with: supabase functions deploy manage-users
// All privileged writes are server-side. Managers are scoped to their own store.
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
type Role = (typeof allowedRoles)[number];

const moduleKeys = [
  "dashboard", "catalogue", "sales", "stock", "returns", "clients",
  "expenses", "atelier", "deliveries", "promotions", "labels", "users", "settings",
] as const;
type ModuleKey = (typeof moduleKeys)[number];

type PermissionInput = {
  module_key: ModuleKey;
  can_view?: boolean;
  can_add?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
};

function normalizePermissions(input: unknown, userId: string, storeId: string, grantedBy: string) {
  if (input !== undefined && !Array.isArray(input)) throw new Error("permissions must be an array");
  const supplied = (Array.isArray(input) ? input : []) as PermissionInput[];
  const byKey = new Map<ModuleKey, PermissionInput>();
  for (const item of supplied) {
    if (!item || !moduleKeys.includes(item.module_key)) throw new Error("Module permission invalide");
    if (byKey.has(item.module_key)) throw new Error("Module permission dupliquée");
    for (const key of ["can_view", "can_add", "can_edit", "can_delete"] as const) {
      if (item[key] !== undefined && typeof item[key] !== "boolean") throw new Error("Permission action invalide");
    }
    byKey.set(item.module_key, item);
  }
  return moduleKeys.map((module_key) => {
    const item = byKey.get(module_key);
    return {
      store_id: storeId,
      user_id: userId,
      module_key,
      can_view: item?.can_view === true,
      can_add: item?.can_add === true,
      can_edit: item?.can_edit === true,
      can_delete: item?.can_delete === true,
      granted_by: grantedBy,
      updated_at: new Date().toISOString(),
    };
  });
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
    if (!storeId) return json({ error: "store_id is required" }, 400);

    const { data: callerMembership, error: membershipError } = await adminClient
      .from("store_members")
      .select("role, is_active")
      .eq("store_id", storeId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (membershipError) return json({ error: membershipError.message }, 400);
    if (!callerMembership || callerMembership.is_active !== true) {
      return json({ error: "Active store membership required" }, 403);
    }
    const callerRole = callerMembership.role as Role;
    if (action === "my_permissions") {
      if (callerRole === "admin") return json({ permissions: [] });
      const { data, error } = await adminClient.from("store_member_module_permissions")
        .select("module_key, can_view, can_add, can_edit, can_delete")
        .eq("store_id", storeId).eq("user_id", authData.user.id);
      if (error) return json({ error: error.message }, 400);
      return json({ permissions: data || [] });
    }
    if (callerRole !== "admin" && callerRole !== "manager") {
      return json({ error: "Manager permission required for this store" }, 403);
    }

    const canManageRole = (targetRole: Role) =>
      callerRole === "admin" || (targetRole !== "admin" && targetRole !== "manager");

    const getTarget = async (userId: string) => {
      const { data, error } = await adminClient.from("store_members")
        .select("user_id, role, is_active, created_at")
        .eq("store_id", storeId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Utilisateur introuvable dans cette boutique");
      return data;
    };

    if (action === "list") {
      const { data: members, error } = await adminClient.from("store_members")
        .select("user_id, role, is_active, created_at")
        .eq("store_id", storeId).order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 400);

      const ids = (members || []).map((m) => m.user_id);
      const [profilesResult, authUsersResult, permissionsResult] = await Promise.all([
        adminClient.from("profiles").select("id, full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        adminClient.from("store_member_module_permissions").select("user_id, module_key, can_view, can_add, can_edit, can_delete").eq("store_id", storeId),
      ]);
      if (profilesResult.error) return json({ error: profilesResult.error.message }, 400);
      if (authUsersResult.error) return json({ error: authUsersResult.error.message }, 400);
      if (permissionsResult.error) return json({ error: permissionsResult.error.message }, 400);

      const profileById = new Map((profilesResult.data || []).map((p) => [p.id, p.full_name]));
      const userById = new Map((authUsersResult.data.users || []).map((u) => [u.id, u.email || ""]));
      const permissionsByUser = new Map<string, unknown[]>();
      for (const permission of permissionsResult.data || []) {
        const rows = permissionsByUser.get(permission.user_id) || [];
        rows.push(permission);
        permissionsByUser.set(permission.user_id, rows);
      }
      return json({
        members: (members || []).map((m) => ({
          ...m,
          full_name: profileById.get(m.user_id) || "",
          email: userById.get(m.user_id) || "",
          permissions: permissionsByUser.get(m.user_id) || [],
        })),
      });
    }

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const role = String(body.role || "") as Role;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
      if (password.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, 400);
      if (!fullName) return json({ error: "Le nom est obligatoire" }, 400);
      if (!allowedRoles.includes(role)) return json({ error: "Rôle invalide" }, 400);
      if (!canManageRole(role)) return json({ error: "Un manager ne peut créer que des vendeurs ou gestionnaires de stock" }, 403);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) return json({ error: createError?.message || "Création du compte impossible" }, 400);

      const rollback = async () => { await adminClient.auth.admin.deleteUser(created.user!.id); };
      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: created.user.id, full_name: fullName, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) { await rollback(); return json({ error: profileError.message }, 400); }

      const { error: memberError } = await adminClient.from("store_members").insert({
        store_id: storeId, user_id: created.user.id, role, is_active: true,
      });
      if (memberError) { await rollback(); return json({ error: memberError.message }, 400); }

      try {
        const rows = normalizePermissions(body.permissions, created.user.id, storeId, authData.user.id);
        const { error } = await adminClient.from("store_member_module_permissions").upsert(rows, { onConflict: "store_id,user_id,module_key" });
        if (error) throw error;
      } catch (error) {
        await adminClient.from("store_members").delete().eq("store_id", storeId).eq("user_id", created.user.id);
        await rollback();
        return json({ error: error instanceof Error ? error.message : "Enregistrement des permissions impossible" }, 400);
      }
      return json({ success: true, user_id: created.user.id });
    }

    if (action === "update_role") {
      const userId = String(body.user_id || "");
      const role = String(body.role || "") as Role;
      if (!userId || !allowedRoles.includes(role)) return json({ error: "Utilisateur ou rôle invalide" }, 400);
      const target = await getTarget(userId);
      if (!canManageRole(role) || !canManageRole(target.role as Role)) {
        return json({ error: "Vous ne pouvez pas modifier le rôle d'un administrateur ou manager" }, 403);
      }
      if (userId === authData.user.id && role !== callerRole) return json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, 400);
      const { error } = await adminClient.from("store_members").update({ role })
        .eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_active") {
      const userId = String(body.user_id || "");
      const active = body.active === true;
      if (!userId) return json({ error: "user_id is required" }, 400);
      if (userId === authData.user.id && !active) return json({ error: "Vous ne pouvez pas désactiver votre propre accès" }, 400);
      const target = await getTarget(userId);
      if (!canManageRole(target.role as Role)) return json({ error: "Vous ne pouvez pas désactiver un administrateur ou manager" }, 403);
      if (!active && target.role === "admin") {
        const { count, error } = await adminClient.from("store_members").select("*", { count: "exact", head: true })
          .eq("store_id", storeId).eq("role", "admin").eq("is_active", true);
        if (error) return json({ error: error.message }, 400);
        if ((count || 0) <= 1) return json({ error: "Impossible de désactiver le dernier administrateur" }, 400);
      }
      const { error } = await adminClient.from("store_members").update({ is_active: active })
        .eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "get_permissions") {
      const userId = String(body.user_id || "");
      const target = await getTarget(userId);
      if (!canManageRole(target.role as Role)) return json({ error: "Accès refusé" }, 403);
      const { data, error } = await adminClient.from("store_member_module_permissions")
        .select("module_key, can_view, can_add, can_edit, can_delete")
        .eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ permissions: data || [] });
    }

    if (action === "set_permissions") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "user_id is required" }, 400);
      const target = await getTarget(userId);
      if (!canManageRole(target.role as Role)) return json({ error: "Vous ne pouvez pas modifier les permissions d'un administrateur ou manager" }, 403);
      let rows;
      try { rows = normalizePermissions(body.permissions, userId, storeId, authData.user.id); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Permissions invalides" }, 400); }
      const { error } = await adminClient.from("store_member_module_permissions")
        .upsert(rows, { onConflict: "store_id,user_id,module_key" });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
