/**
 * 과제 기록 — 건강한 식사·식사 준비: 근무-식단표에서 등록한 식단명 체크 상태 (날짜+과제명별)
 */

const LS_KEY = "lp_meal_task_checklist_v1";

function normalizeYmd(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim().replace(/\//g, "-");
  const m = s.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (m)
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s.slice(0, 10);
}

function loadRoot() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
}

function saveRoot(root) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(root));
  } catch (_) {}
}

function compositeKey(dateYmd, taskName) {
  const d = normalizeYmd(dateYmd);
  const t = (taskName || "").trim();
  if (!d || d.length < 10 || !t) return "";
  return `${d}\t${t}`;
}

/** @returns {Record<string, boolean>} */
export function getMealChecklistState(dateYmd, taskName) {
  const key = compositeKey(dateYmd, taskName);
  if (!key) return {};
  const root = loadRoot();
  const bucket = root[key];
  if (!bucket || typeof bucket !== "object") return {};
  const out = {};
  Object.keys(bucket).forEach((k) => {
    out[k] = !!bucket[k];
  });
  return out;
}

export function setMealChecklistItem(dateYmd, taskName, dietName, checked) {
  const key = compositeKey(dateYmd, taskName);
  const meal = (dietName || "").trim();
  if (!key || !meal) return;
  const root = loadRoot();
  if (!root[key]) root[key] = {};
  root[key][meal] = !!checked;
  saveRoot(root);
}
