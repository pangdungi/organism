import { supabase } from "../supabase.js";
import { getSupabaseSession } from "./supabaseSession.js";
import { applyAppFontIdFromServer } from "./appUiFont.js";
import {
  getScopedLocalStorageItem,
  removeScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import {
  getTodoSettings,
  saveTodoSettings,
  normalizeSectionTaskListFilter,
} from "./todoSettings.js";

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";
export const USER_HOURLY_RATE_MODE_KEY = "user_hourly_rate_mode";

export const HOURLY_RATE_MODE_CALC = "calc";
export const HOURLY_RATE_MODE_DIRECT = "direct";

/** 계정별 scoped 시급 캐시 읽기 */
export function readUserHourlyRateLocal() {
  return getScopedLocalStorageItem(USER_HOURLY_RATE_KEY) || "";
}

/** 계정별 scoped 시급 입력 방식 읽기 (calc | direct) */
export function readUserHourlyRateModeLocal() {
  const mode = getScopedLocalStorageItem(USER_HOURLY_RATE_MODE_KEY) || "";
  return mode === HOURLY_RATE_MODE_DIRECT ? HOURLY_RATE_MODE_DIRECT : HOURLY_RATE_MODE_CALC;
}

export function setUserHourlyRateModeLocal(mode) {
  const next =
    mode === HOURLY_RATE_MODE_DIRECT ? HOURLY_RATE_MODE_DIRECT : HOURLY_RATE_MODE_CALC;
  setScopedLocalStorageItem(USER_HOURLY_RATE_MODE_KEY, next);
  return next;
}

export function clearUserHourlyRateLocal() {
  removeScopedLocalStorageItem(USER_HOURLY_RATE_KEY);
  removeScopedLocalStorageItem(USER_HOURLY_RATE_MODE_KEY);
  try {
    localStorage.removeItem(USER_HOURLY_RATE_KEY);
    localStorage.removeItem(USER_HOURLY_RATE_MODE_KEY);
  } catch (_) {}
}

/**
 * DB appearance JSON → 로컬 할일 설정 중 동기화 대상만 반영 (완료 숨김·표시 필터).
 */
export function applyAppearanceFromServer(a) {
  if (!a || typeof a !== "object") return false;
  const cur = getTodoSettings();
  const next = { ...cur };
  let changed = false;
  if (typeof a.hideCompleted === "boolean") {
    next.hideCompleted = a.hideCompleted;
    changed = true;
  }
  if (a.sectionTaskListFilter != null) {
    next.sectionTaskListFilter = normalizeSectionTaskListFilter(
      a.sectionTaskListFilter,
    );
    changed = true;
  }
  if (changed) saveTodoSettings(next);
  return changed;
}

/** 브라우저/OS 타임존 → DB (사용자 로컬 시각 기록) */
export async function syncUserIanaTimezoneToSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await getSupabaseSession();
  if (!session?.user?.id) return;
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (_) {}
  if (!tz) return;
  const { error } = await supabase.rpc("set_my_iana_timezone", { p_tz: tz });
}

/**
 * 로그인·앱 진입: 시급 + appearance + 화면 글꼴 + 구독 필드 → localStorage·UI 반영
 * @param {{ applyServerFont?: boolean }} [opts] — false 면 글꼴은 로컬 유지(나의 계정 탭 pull)
 */
export async function pullUserPrefsFromSupabase(opts = {}) {
  const applyServerFont = opts.applyServerFont !== false;
  if (!supabase) return null;
  const {
    data: { session },
  } = await getSupabaseSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "hourly_rate, hourly_rate_mode, appearance, ui_font_id, subscription_status, access_until",
    )
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !data) return null;

  if (applyServerFont) applyAppFontIdFromServer(data.ui_font_id);

  if (data.hourly_rate != null) {
    const n = Number(data.hourly_rate);
    if (!Number.isNaN(n) && n > 0) {
      try {
      setScopedLocalStorageItem(USER_HOURLY_RATE_KEY, String(n));
      } catch (_) {}
      document.dispatchEvent(
        new CustomEvent("app-hourly-rate-changed", { detail: { rate: n } }),
      );
    }
  }

  if (data.hourly_rate_mode === HOURLY_RATE_MODE_DIRECT || data.hourly_rate_mode === HOURLY_RATE_MODE_CALC) {
    try {
      setUserHourlyRateModeLocal(data.hourly_rate_mode);
    } catch (_) {}
  }

  if (applyAppearanceFromServer(data.appearance)) {
    try {
      window.dispatchEvent(new CustomEvent("app-colors-changed"));
    } catch (_) {}
  }
  await syncUserIanaTimezoneToSupabase();
  return data;
}

/** @deprecated 이름 호환 — pullUserPrefsFromSupabase 와 동일 */
export async function pullHourlyRateToLocalStorage() {
  await pullUserPrefsFromSupabase();
}

/** 할 일 목록 appearance: 완료 숨기기 + 할 일/일정 표시 필터 */
export async function pushAppearanceToSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await getSupabaseSession();
  if (!session?.user?.id) return;
  const s = getTodoSettings();
  const { error } = await supabase.rpc("set_my_appearance", {
    p_appearance: {
      hideCompleted: !!s.hideCompleted,
      sectionTaskListFilter: normalizeSectionTaskListFilter(
        s.sectionTaskListFilter,
      ),
    },
  });
}
