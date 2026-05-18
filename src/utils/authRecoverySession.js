/**
 * 비밀번호 재설정 이메일 링크(PKCE 등)는 `PASSWORD_RECOVERY` 이벤트 없이
 * `SIGNED_IN` / `INITIAL_SESSION` 만 올 수 있음. GoTrue JWT `amr`로 판별.
 * @see https://supabase.com/docs/guides/auth/jwt-fields
 */

function base64UrlToJson(segment) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function amrListsRecovery(amr) {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (entry === "recovery") return true;
    if (typeof entry === "string" && entry.toLowerCase() === "recovery") return true;
    if (entry && typeof entry === "object") {
      const m = entry.method ?? entry.Method;
      if (m === "recovery") return true;
      if (typeof m === "string" && m.toLowerCase() === "recovery") return true;
    }
    return false;
  });
}

/** @param {{ access_token?: string } | null | undefined} session */
export function isPasswordRecoverySession(session) {
  if (!session?.access_token || typeof session.access_token !== "string") return false;
  try {
    const parts = session.access_token.split(".");
    if (parts.length < 2) return false;
    const payload = base64UrlToJson(parts[1]);
    return amrListsRecovery(payload?.amr);
  } catch {
    return false;
  }
}

/** 재설정 전용 경로(Supabase redirectTo 와 동일하게 쓰면 다른 앱과 설정 패턴 통일) */
export function isPasswordRecoveryPathname(pathname) {
  try {
    const p = String(pathname || (typeof window !== "undefined" ? window.location.pathname : "") || "/")
      .replace(/\/+$/, "") || "/";
    return p === "/auth/recovery";
  } catch {
    return false;
  }
}

/** implicit / 일부 리다이렉트: 해시·쿼리에 type=recovery */
export function hasPasswordRecoveryUrlHint() {
  try {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    if (rawHash) {
      const fromHash = new URLSearchParams(rawHash);
      if (fromHash.get("type") === "recovery") return true;
    }
    const fromSearch = new URLSearchParams(window.location.search || "");
    return fromSearch.get("type") === "recovery";
  } catch {
    return false;
  }
}
