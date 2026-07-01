/**
 * 아임웹 앱 연동 — 서비스 URL(?siteCode=) → OAuth 시작
 */
export function maybeRedirectImwebConnect() {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const siteCode = String(params.get("siteCode") || "").trim();
  if (!siteCode) return false;

  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon) return false;

  const target =
    `${base}/functions/v1/imweb-connect?apikey=${encodeURIComponent(anon)}` +
    `&siteCode=${encodeURIComponent(siteCode)}`;
  window.location.replace(target);
  return true;
}

export function readImwebConnectResult() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const flag = String(params.get("imweb") || "").trim();
  if (!flag) return null;
  return {
    status: flag,
    reason: String(params.get("reason") || "").trim(),
  };
}

export function clearImwebConnectQueryFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("imweb") && !url.searchParams.has("reason")) return;
  url.searchParams.delete("imweb");
  url.searchParams.delete("reason");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}
