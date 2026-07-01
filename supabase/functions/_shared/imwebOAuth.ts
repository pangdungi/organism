const AUTHORIZE_URL = "https://openapi.imweb.me/oauth2/authorize";
const TOKEN_URL = "https://openapi.imweb.me/oauth2/token";
const INTEGRATION_COMPLETE_URL =
  "https://openapi.imweb.me/site-info/integration-complete";

export function imwebClientId(): string {
  return (Deno.env.get("IMWEB_CLIENT_ID") || "").trim();
}

export function imwebClientSecret(): string {
  return (Deno.env.get("IMWEB_CLIENT_SECRET") || "").trim();
}

export function imwebRedirectUri(): string {
  return (Deno.env.get("IMWEB_REDIRECT_URI") || "").trim();
}

export function imwebOAuthScope(): string {
  return (
    Deno.env.get("IMWEB_OAUTH_SCOPE") ||
    "order:read site-info:read site-info:write"
  ).trim();
}

export function imwebConnectSuccessUrl(): string {
  return (
    Deno.env.get("IMWEB_CONNECT_SUCCESS_URL") ||
    "https://timeisprice.com/?imweb=connected"
  ).trim();
}

export function encodeOAuthState(siteCode: string): string {
  const payload = {
    siteCode,
    nonce: crypto.randomUUID(),
  };
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeOAuthState(state: string): { siteCode: string } | null {
  try {
    const padded = state.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + "=".repeat(padLen));
    const parsed = JSON.parse(json) as { siteCode?: string };
    const siteCode = String(parsed.siteCode || "").trim();
    if (!siteCode) return null;
    return { siteCode };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(siteCode: string, state: string): string {
  const clientId = imwebClientId();
  const redirectUri = imwebRedirectUri();
  const scope = imwebOAuthScope();
  if (!clientId || !redirectUri) {
    throw new Error("imweb_oauth_not_configured");
  }

  const params = new URLSearchParams({
    responseType: "code",
    clientId,
    redirectUri,
    scope,
    siteCode,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type ImwebTokenResponse = {
  accessToken?: string;
  refreshToken?: string;
  scope?: string[] | string;
  errorCode?: string;
  message?: string;
};

function normalizeImwebTokenResponse(raw: unknown): ImwebTokenResponse {
  const root =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const accessToken = String(
    nested.accessToken || nested.access_token || "",
  ).trim();
  const refreshToken = String(
    nested.refreshToken || nested.refresh_token || "",
  ).trim();
  const scope = nested.scope as string[] | string | undefined;

  return {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    scope,
    errorCode: String(root.errorCode || nested.errorCode || "").trim() ||
      undefined,
    message: String(root.message || nested.message || "").trim() || undefined,
  };
}

async function requestImwebToken(
  params: URLSearchParams,
): Promise<{ ok: boolean; status: number; raw: unknown; data: ImwebTokenResponse }> {
  const queryAttempt = await fetch(`${TOKEN_URL}?${params.toString()}`, {
    method: "POST",
  });
  let raw: unknown = await queryAttempt.json().catch(() => ({}));
  let data = normalizeImwebTokenResponse(raw);
  if (queryAttempt.ok && data.accessToken) {
    return { ok: true, status: queryAttempt.status, raw, data };
  }

  const bodyAttempt = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  raw = await bodyAttempt.json().catch(() => ({}));
  data = normalizeImwebTokenResponse(raw);
  return {
    ok: bodyAttempt.ok && !!data.accessToken,
    status: bodyAttempt.status,
    raw,
    data,
  };
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<ImwebTokenResponse> {
  const clientId = imwebClientId();
  const clientSecret = imwebClientSecret();
  const redirectUri = imwebRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("imweb_oauth_not_configured");
  }

  const params = new URLSearchParams({
    grantType: "authorization_code",
    clientId,
    clientSecret,
    redirectUri,
    code,
  });

  const result = await requestImwebToken(params);
  if (!result.ok) {
    console.error("imweb token exchange failed", result.status, result.raw);
    throw new Error(
      String(
        result.data.message ||
          result.data.errorCode ||
          "token_exchange_failed",
      ),
    );
  }
  return result.data;
}

export async function completeIntegration(
  accessToken: string,
): Promise<{ ok: boolean; detail?: unknown }> {
  const attempts: Array<{ method: string; body?: string }> = [
    { method: "PATCH", body: JSON.stringify({ status: "complete" }) },
    { method: "PATCH", body: "{}" },
    { method: "PATCH" },
  ];

  let lastDetail: unknown = null;
  for (const attempt of attempts) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (attempt.body != null) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(INTEGRATION_COMPLETE_URL, {
      method: attempt.method,
      headers,
      body: attempt.body,
    });
    const detail = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, detail };
    }
    lastDetail = detail;
    console.error(
      "imweb integration-complete failed",
      attempt.method,
      res.status,
      detail,
    );
  }
  return { ok: false, detail: lastDetail };
}
