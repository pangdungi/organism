/**
 * 이메일(가입 확인·비밀번호 재설정) 링크가 돌아올 URL을 운영 도메인에 고정.
 * 비우면 `window.location.origin` (지금 접속 주소).
 */
export function getAuthPublicOrigin() {
  const fromEnv = (import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL || "").trim();
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** 가입 확인 메일 → 앱 루트 (세션/코드 처리 후 메뉴) */
export function getSignupEmailRedirectUrl() {
  const o = getAuthPublicOrigin();
  if (o) return `${o}/`;
  if (typeof window !== "undefined") return `${window.location.origin}/`;
  return "/";
}

/** 비밀번호 재설정 메일 → 전용 경로 (다른 앱과 동일 패턴) */
export function getPasswordRecoveryRedirectUrl() {
  const o = getAuthPublicOrigin();
  if (o) return `${o}/auth/recovery`;
  if (typeof window !== "undefined")
    return `${window.location.origin}/auth/recovery`;
  return "/auth/recovery";
}
