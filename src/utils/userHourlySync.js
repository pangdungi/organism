import { supabase } from "../supabase.js";
import {
  getTodoSettings,
  saveTodoSettings,
  applyTimeCategoryColors,
  applyTaskCategoryColors,
  DEFAULT_SECTION_COLORS,
  DEFAULT_TIME_CATEGORY_COLORS,
  DEFAULT_TASK_CATEGORY_COLORS,
} from "./todoSettings.js";

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";

/** DB appearance JSON → localStorage + CSS 변수 */
export function applyAppearanceFromServer(a) {
  if (!a || typeof a !== "object") return;
  const hasAny =
    a.sectionColors ||
    a.timeCategoryColors ||
    a.taskCategoryColors ||
    typeof a.hideCompleted === "boolean";
  if (!hasAny) return;
  const cur = getTodoSettings();
  const hideCompleted =
    typeof a.hideCompleted === "boolean" ? a.hideCompleted : cur.hideCompleted;
  const sectionColors = a.sectionColors
    ? { ...DEFAULT_SECTION_COLORS, ...a.sectionColors }
    : { ...cur.sectionColors };
  const timeCategoryColors = a.timeCategoryColors
    ? { ...DEFAULT_TIME_CATEGORY_COLORS, ...a.timeCategoryColors }
    : { ...cur.timeCategoryColors };
  const taskCategoryColors = a.taskCategoryColors
    ? { ...DEFAULT_TASK_CATEGORY_COLORS, ...a.taskCategoryColors }
    : { ...cur.taskCategoryColors };
  saveTodoSettings({
    hideCompleted,
    sectionColors,
    timeCategoryColors,
    taskCategoryColors,
  });
  if (a.sectionColors || a.timeCategoryColors || a.taskCategoryColors) {
    applyTimeCategoryColors();
    applyTaskCategoryColors();
  }
  document.dispatchEvent(new CustomEvent("app-colors-changed"));
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
}

/** @deprecated 이름 호환 — pullUserPrefsFromSupabase 와 동일 */
export async function pullHourlyRateToLocalStorage() {
  await pullUserPrefsFromSupabase();
}

/** 나의 계정 색 저장 시 서버 반영 */
export async function pushAppearanceToSupabase() {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const s = getTodoSettings();
  const { error } = await supabase.rpc("set_my_appearance", {
    p_appearance: {
      sectionColors: s.sectionColors,
      timeCategoryColors: s.timeCategoryColors,
      taskCategoryColors: s.taskCategoryColors,
      hideCompleted: !!s.hideCompleted,
    },
  });
  if (error) console.warn("[set_my_appearance]", error.message);
}
