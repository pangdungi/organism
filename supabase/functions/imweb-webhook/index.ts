/**
 * 아임웹 주문 웹훅 — ORDER_DEPOSIT_COMPLETE / ORDER_CREATE 등
 *
 * 배포: supabase functions deploy imweb-webhook --no-verify-jwt
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   IMWEB_WEBHOOK_SECRET = 개발자센터 웹훅 「인증 정보 → 보기」
 *
 * URL: https://<project-ref>.supabase.co/functions/v1/imweb-webhook
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeImwebOrderPayload } from "../_shared/imwebPayload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-imweb-webhook-secret, webhook-secret",
};

const TARGET_PROD_NO = Number(Deno.env.get("IMWEB_TARGET_PROD_NO") || "66");
const EXPECTED_SITE_CODE = (Deno.env.get("IMWEB_SITE_CODE") || "").trim();

function readWebhookSecret(req: Request): string {
  const direct =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-imweb-webhook-secret") ||
    req.headers.get("webhook-secret") ||
    "";
  return direct.replace(/^Bearer\s+/i, "").trim();
}

function verifyWebhookSecret(req: Request): boolean {
  const expected = (Deno.env.get("IMWEB_WEBHOOK_SECRET") || "").trim();
  if (!expected) {
    console.warn("IMWEB_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  if (readWebhookSecret(req) === expected) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("imweb_secret") === expected) return true;
  } catch (_) {}
  return false;
}

function hasTargetProduct(payload: Record<string, unknown>): boolean {
  const sections = payload.sections;
  if (!Array.isArray(sections)) return false;
  for (const sec of sections) {
    if (!sec || typeof sec !== "object") continue;
    const items =
      (sec as Record<string, unknown>).sectionItems ??
      (sec as Record<string, unknown>).orderSectionItems;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const info = (item as Record<string, unknown>).productInfo;
      const prodNo =
        (info && typeof info === "object"
          ? (info as Record<string, unknown>).prodNo
          : null) ?? (item as Record<string, unknown>).prodNo;
      if (Number(prodNo) === TARGET_PROD_NO) return true;
    }
  }
  return false;
}

function isPaymentComplete(payload: Record<string, unknown>): boolean {
  const payments = payload.payments;
  if (Array.isArray(payments)) {
    const ok = payments.some((p) => {
      if (!p || typeof p !== "object") return false;
      return (
        String((p as Record<string, unknown>).paymentStatus || "").toUpperCase() ===
        "PAYMENT_COMPLETE"
      );
    });
    if (ok) return true;
  }
  const paid = Number(payload.totalPaymentPrice ?? 0);
  return Number.isFinite(paid) && paid > 0;
}

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

  if (!verifyWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = normalizeImwebOrderPayload(parsed);

  if (payload.orderNo == null && payload.ordererEmail == null) {
    console.warn("imweb-webhook: unrecognized payload keys", {
      topKeys: Object.keys(parsed),
    });
  }

  if (
    EXPECTED_SITE_CODE &&
    String(payload.siteCode || "").trim() !== EXPECTED_SITE_CODE
  ) {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: "site_code_mismatch" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data, error } = await admin.rpc("process_imweb_order_webhook", {
    p_payload: payload,
  });

  if (error) {
    console.error("process_imweb_order_webhook", error);
    return new Response(
      JSON.stringify({ error: "grant_failed", detail: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify(data ?? { ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
