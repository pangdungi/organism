/**
 * 아임웹 앱 연동 시작 — 서비스 URL(?siteCode=) 또는 직접 호출
 *
 * Secrets: IMWEB_CLIENT_ID, IMWEB_CLIENT_SECRET, IMWEB_REDIRECT_URI
 * Optional: IMWEB_OAUTH_SCOPE
 */
import {
  buildAuthorizeUrl,
  encodeOAuthState,
  imwebClientId,
  imwebRedirectUri,
} from "../_shared/imwebOAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

  if (!imwebClientId() || !imwebRedirectUri()) {
    return new Response(
      JSON.stringify({
        error: "not_configured",
        hint: "Set IMWEB_CLIENT_ID and IMWEB_REDIRECT_URI in Edge Function secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(req.url);
  const siteCode = String(url.searchParams.get("siteCode") || "").trim();
  if (!siteCode) {
    return new Response(JSON.stringify({ error: "missing_site_code" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const state = encodeOAuthState(siteCode);
    const target = buildAuthorizeUrl(siteCode, state);
    return Response.redirect(target, 302);
  } catch (err) {
    console.error("imweb-connect", err);
    return new Response(JSON.stringify({ error: "connect_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
