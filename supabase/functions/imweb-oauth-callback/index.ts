/**
 * 아임웹 OAuth 콜백 → 토큰 발급 → 연동완료(PATCH /site-info/integration-complete)
 *
 * 개발자센터 리다이렉트 URI 로 등록:
 * https://<project>.supabase.co/functions/v1/imweb-oauth-callback?apikey=<anon_key>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  completeIntegration,
  decodeOAuthState,
  exchangeAuthorizationCode,
  imwebConnectSuccessUrl,
} from "../_shared/imwebOAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function errorRedirect(message: string): Response {
  const base = imwebConnectSuccessUrl();
  const sep = base.includes("?") ? "&" : "?";
  const target = `${base}${sep}imweb=error&reason=${encodeURIComponent(message)}`;
  return Response.redirect(target, 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const errorCode = url.searchParams.get("errorCode");
  if (errorCode) {
    const message = url.searchParams.get("message") || errorCode;
    return errorRedirect(message);
  }

  const code = String(url.searchParams.get("code") || "").trim();
  const stateRaw = String(url.searchParams.get("state") || "").trim();
  if (!code || !stateRaw) {
    return errorRedirect("missing_code_or_state");
  }

  const state = decodeOAuthState(stateRaw);
  if (!state?.siteCode) {
    return errorRedirect("invalid_state");
  }

  try {
    const token = await exchangeAuthorizationCode(code);
    const accessToken = String(token.accessToken || "").trim();
    const refreshToken = String(token.refreshToken || "").trim();
    if (!accessToken) {
      const detail = String(token.message || token.errorCode || "").trim();
      return errorRedirect(detail ? `no_access_token:${detail}` : "no_access_token");
    }

    const completed = await completeIntegration(accessToken);
    if (!completed.ok) {
      const detail = completed.detail as { error?: { message?: string } } | null;
      const msg = String(detail?.error?.message || "integration_complete_failed");
      return errorRedirect(msg);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const scopeValue = Array.isArray(token.scope)
      ? token.scope.join(" ")
      : String(token.scope || "");

    const { error: dbError } = await admin.from("imweb_site_connections").upsert(
      {
        site_code: state.siteCode,
        access_token: accessToken,
        refresh_token: refreshToken || null,
        scope: scopeValue || null,
        integration_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_code" },
    );

    if (dbError) {
      console.error("imweb_site_connections upsert", dbError);
      return errorRedirect("save_failed");
    }

    const success = imwebConnectSuccessUrl();
    const sep = success.includes("?") ? "&" : "?";
    return Response.redirect(`${success}${sep}imweb=connected`, 302);
  } catch (err) {
    console.error("imweb-oauth-callback", err);
    const msg = err instanceof Error ? err.message : "callback_failed";
    return errorRedirect(msg);
  }
});
