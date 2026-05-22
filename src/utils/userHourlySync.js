import { supabase } from "../supabase.js";
import { applyAppFontIdFromServer } from "./appUiFont.js";
import {
  getTodoSettings,
  saveTodoSettings,
  normalizeSectionTaskListFilter,
} from "./todoSettings.js";

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";

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

/** 브라우저/OS 타임존 → DB (리마인더 푸시가 사용자 로컬 시각과 맞도록) */
export async function syncUserIanaTimezoneToSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (_) {}
  if (!tz) return;
  const { error } = await supabase.rpc("set_my_iana_timezone", { p_tz: tz });
}

/** 로그인·앱 진입: 시급 + appearance + 화면 글꼴 → localStorage·UI 반영 */
export async function pullUserPrefsFromSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("hourly_rate, appearance, ui_font_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !data) return;

  applyAppFontIdFromServer(data.ui_font_id);

  if (data.hourly_rate != null) {
    const n = Number(data.hourly_rate);
    if (!Number.isNaN(n) && n > 0) {
      try {
        localStorage.setItem(USER_HOURLY_RATE_KEY, String(n));
      } catch (_) {}
      document.dispatchEvent(
        new CustomEvent("app-hourly-rate-changed", { detail: { rate: n } }),
      );
    }
  }

  if (applyAppearanceFromServer(data.appearance)) {
    try {
      window.dispatchEvent(new CustomEvent("app-colors-changed"));
    } catch (_) {}
  }
  await syncUserIanaTimezoneToSupabase();
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
  } = await supabase.auth.getSession();
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
