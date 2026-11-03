// Supabase Edge Function: manage-users
// Deploy with: supabase functions deploy manage-users
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
      .select("role")
      .eq("store_id", storeId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (membershipError) return json({ error: membershipError.message }, 400);
    if (callerMembership?.role !== "admin") return json({ error: "Admin permission required for this store" }, 403);

    if (action === "list") {
      const { data: members, error } = await adminClient
        .from("store_members")
        .select("user_id, role, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 400);

      const ids = (members || []).map((m) => m.user_id);
      const [{ data: profiles, error: profileError }, authUsers] = await Promise.all([
        adminClient.from("profiles").select("id, full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (profileError) return json({ error: profileError.message }, 400);
      if (authUsers.error) return json({ error: authUsers.error.message }, 400);
      const profileById = new Map((profiles || []).map((p) => [p.id, p.full_name]));
      const userById = new Map((authUsers.data.users || []).map((u) => [u.id, u.email || ""]));
      return json({
        members: (members || []).map((m) => ({
          ...m,
          full_name: profileById.get(m.user_id) || "",
          email: userById.get(m.user_id) || "",
          is_active: !((authUsers.data.users || []).find((u) => u.id === m.user_id)?.banned_until &&
            new Date((authUsers.data.users || []).find((u) => u.id === m.user_id)!.banned_until!).getTime() > Date.now()),
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

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) return json({ error: createError?.message || "Création du compte impossible" }, 400);

      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: created.user.id, full_name: fullName, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }

      const { error: memberError } = await adminClient.from("store_members").insert({
        store_id: storeId, user_id: created.user.id, role,
      });
      if (memberError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return json({ error: memberError.message }, 400);
      }
      return json({ success: true, user_id: created.user.id });
    }

    if (action === "update_role") {
      const userId = String(body.user_id || "");
      const role = String(body.role || "") as Role;
      if (!userId || !allowedRoles.includes(role)) return json({ error: "Utilisateur ou rôle invalide" }, 400);
      if (userId === authData.user.id && role !== "admin") return json({ error: "Vous ne pouvez pas retirer votre propre rôle admin" }, 400);
      const { data: target, error: targetError } = await adminClient.from("store_members")
        .select("role").eq("store_id", storeId).eq("user_id", userId).maybeSingle();
      if (targetError || !target) return json({ error: targetError?.message || "Utilisateur introuvable" }, 404);
      if (target.role === "admin" && role !== "admin") {
        const { count } = await adminClient.from("store_members").select("*", { count: "exact", head: true })
          .eq("store_id", storeId).eq("role", "admin");
        if ((count || 0) <= 1) return json({ error: "Impossible de retirer le dernier administrateur" }, 400);
      }
      const { error } = await adminClient.from("store_members").update({ role }).eq("store_id", storeId).eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_active") {
      const userId = String(body.user_id || "");
      const active = body.active === true;
      if (!userId) return json({ error: "user_id is required" }, 400);
      if (userId === authData.user.id && !active) return json({ error: "Vous ne pouvez pas désactiver votre propre compte" }, 400);
      const { data: target, error: targetError } = await adminClient.from("store_members")
        .select("role").eq("store_id", storeId).eq("user_id", userId).maybeSingle();
      if (targetError || !target) return json({ error: targetError?.message || "Utilisateur introuvable" }, 404);
      if (!active && target.role === "admin") {
        const { count } = await adminClient.from("store_members").select("*", { count: "exact", head: true })
          .eq("store_id", storeId).eq("role", "admin");
        if ((count || 0) <= 1) return json({ error: "Impossible de désactiver le dernier administrateur" }, 400);
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : "876000h",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
