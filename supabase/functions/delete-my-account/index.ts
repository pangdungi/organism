/**
 * 본인 확인된 JWT로 auth.users 삭제 → public 쪽은 ON DELETE CASCADE 로 정리.
 * calendar_section_tasks_write_audit 는 FK 없음 → 선삭제.
 *
 * 배포: supabase functions deploy delete-my-account
 * (프로젝트 기본값: verify_jwt = true — 유효한 로그인 JWT 만 호출 가능)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(jwt);

  if (userErr || !user?.id) {
    return new Response(JSON.stringify({ error: "invalid_session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const uid = user.id;

  let logEmail = String(user.email || "").trim().toLowerCase();
  const { data: subRow } = await admin
    .from("user_subscriptions")
    .select("email")
    .eq("user_id", uid)
    .maybeSingle();
  if (subRow?.email) {
    logEmail = String(subRow.email).trim().toLowerCase();
  }

  const { error: logErr } = await admin.from("user_deletion_log").insert({
    user_id: uid,
    email: logEmail,
  });
  if (logErr) {
    console.error("user_deletion_log insert", logErr);
  }

  const { error: auditErr } = await admin
    .from("calendar_section_tasks_write_audit")
    .delete()
    .or(`task_user_id.eq.${uid},jwt_user.eq.${uid}`);

  if (auditErr) {
    console.error("delete audit rows", auditErr);
    return new Response(
      JSON.stringify({ error: "audit_cleanup_failed", detail: auditErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error("admin.deleteUser", delErr);
    return new Response(
      JSON.stringify({ error: "delete_failed", detail: delErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
