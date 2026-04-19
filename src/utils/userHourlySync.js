import { supabase } from "../supabase.js";
import { getTodoSettings, saveTodoSettings } from "./todoSettings.js";

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";

/**
 * DB appearance JSON → 로컬 할일 설정 중 동기화 대상만 반영.
 * 색상은 앱 코드 고정값만 쓰므로 서버에 있든 없든 여기서 다루지 않는다.
 */
export function applyAppearanceFromServer(a) {
  if (!a || typeof a !== "object") return;
  if (typeof a.hideCompleted !== "boolean") return;
  const cur = getTodoSettings();
  saveTodoSettings({
    ...cur,
    hideCompleted: a.hideCompleted,
  });
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

/** 로그인 직후: 시급 + appearance → localStorage, UI 변수 반영 */
export async function pullUserPrefsFromSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("hourly_rate, appearance")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !data) return;

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

  applyAppearanceFromServer(data.appearance);
  await syncUserIanaTimezoneToSupabase();
}

/** @deprecated 이름 호환 — pullUserPrefsFromSupabase 와 동일 */
export async function pullHourlyRateToLocalStorage() {
  await pullUserPrefsFromSupabase();
}

/** 할 일 '완료 항목 숨기기'만 서버 appearance에 저장 (색상 필드 없음) */
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
    },
  });
}
