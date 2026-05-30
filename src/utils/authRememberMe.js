/** 로그인「자동 로그인」— '1'이면 localStorage(브라우저 닫아도 유지), '0'이면 sessionStorage(탭·창 종료 시 해제) */
export const LP_AUTH_REMEMBER_ME_KEY = "lp_auth_remember_me";

export function isAuthRememberMeEnabled() {
  try {
    const v = localStorage.getItem(LP_AUTH_REMEMBER_ME_KEY);
    if (v === "0") return false;
    return true;
  } catch (_) {
    return true;
  }
}

export function setAuthRememberMePreference(rememberMe) {
  try {
    localStorage.setItem(LP_AUTH_REMEMBER_ME_KEY, rememberMe ? "1" : "0");
  } catch (_) {}
}

function authStoragePrimary() {
  return isAuthRememberMeEnabled() ? localStorage : sessionStorage;
}

function authStorageSecondary() {
  return isAuthRememberMeEnabled() ? sessionStorage : localStorage;
}

/** Supabase Auth persistSession storage — 체크 시 localStorage, 해제 시 sessionStorage */
export const lpSupabaseAuthStorage = {
  getItem(key) {
    try {
      const primary = authStoragePrimary();
      const hit = primary.getItem(key);
      if (hit != null) return hit;
      return authStorageSecondary().getItem(key);
    } catch (_) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const target = authStoragePrimary();
      const other = authStorageSecondary();
      target.setItem(key, value);
      other.removeItem(key);
    } catch (_) {}
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (_) {}
  },
};

export function syncLoginRememberMeCheckbox() {
  const el = document.getElementById("login-remember-me");
  if (!(el instanceof HTMLInputElement)) return;
  el.checked = isAuthRememberMeEnabled();
}
