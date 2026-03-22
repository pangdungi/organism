/**
 * 시간 사용 개선하기 메모 — localStorage (날짜 키) + Supabase 동기화용
 */

export const TIME_IMPROVE_FOCUS_NOTES_KEY = "time_improve_focus_notes";

const EMPTY = {
  rootCause: "",
  countermeasures: "",
  planReality: "",
  importantInvest: "",
  investReduce: "",
};

function normalizeEntryDate(d) {
  if (d == null) return "";
  const s = String(d).replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function getStoredImproveNotes(dateKey) {
  const key = normalizeEntryDate(dateKey);
  try {
    const raw = localStorage.getItem(TIME_IMPROVE_FOCUS_NOTES_KEY);
    if (!raw) return { ...EMPTY };
    const obj = JSON.parse(raw);
    const entry = key && obj[key] && typeof obj[key] === "object" ? obj[key] : null;
    if (!entry) return { ...EMPTY };
    return {
      rootCause: entry.rootCause || "",
      countermeasures: entry.countermeasures || "",
      planReality: entry.planReality ?? entry.planReality2 ?? "",
      importantInvest: entry.importantInvest || "",
      investReduce: entry.investReduce || "",
    };
  } catch (_) {}
  return { ...EMPTY };
}

const ALLOWED_FIELDS = new Set([
  "rootCause",
  "countermeasures",
  "planReality",
  "importantInvest",
  "investReduce",
]);

export function setStoredImproveNote(dateKey, field, text) {
  const key = normalizeEntryDate(dateKey);
  if (!key || !ALLOWED_FIELDS.has(field)) return;
  try {
    const raw = localStorage.getItem(TIME_IMPROVE_FOCUS_NOTES_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj[key] || typeof obj[key] !== "object") {
      obj[key] = { ...EMPTY };
    }
    obj[key][field] = (text || "").trim();
    localStorage.setItem(TIME_IMPROVE_FOCUS_NOTES_KEY, JSON.stringify(obj));
  } catch (_) {}
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("time-improve-notes-saved", { detail: { dateKey: key } }),
      );
    }
  } catch (_) {}
}

function entryHasAnyText(e) {
  if (!e || typeof e !== "object") return false;
  return Object.values(e).some((v) => String(v || "").trim().length > 0);
}

/** 서버 행들로 로컬 병합(해당 날짜는 서버 값으로 덮어씀). 이벤트 없음. */
export function mergeImproveNotesFromServerRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    const raw = localStorage.getItem(TIME_IMPROVE_FOCUS_NOTES_KEY);
    let obj = {};
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") obj = p;
    }
    for (const r of rows) {
      const d = normalizeEntryDate(r.entry_date);
      if (!d) continue;
      obj[d] = {
        rootCause: String(r.root_cause ?? "").trim(),
        countermeasures: String(r.countermeasures ?? "").trim(),
        planReality: String(r.plan_reality ?? "").trim(),
        importantInvest: String(r.important_invest ?? "").trim(),
        investReduce: String(r.invest_reduce ?? "").trim(),
      };
    }
    localStorage.setItem(TIME_IMPROVE_FOCUS_NOTES_KEY, JSON.stringify(obj));
  } catch (_) {}
}

/** 로컬에만 있고 내용이 있는 날짜 → 초기 업로드용 */
export function buildAllLocalImproveNotePayloadsForSync() {
  try {
    const raw = localStorage.getItem(TIME_IMPROVE_FOCUS_NOTES_KEY);
    if (!raw) return [];
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return [];
    const out = [];
    for (const dateKey of Object.keys(obj)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
      const e = obj[dateKey];
      if (!e || typeof e !== "object") continue;
      const normalized = {
        rootCause: String(e.rootCause || "").trim(),
        countermeasures: String(e.countermeasures || "").trim(),
        planReality: String(e.planReality ?? e.planReality2 ?? "").trim(),
        importantInvest: String(e.importantInvest || "").trim(),
        investReduce: String(e.investReduce || "").trim(),
      };
      if (entryHasAnyText(normalized)) out.push({ dateKey, ...normalized });
    }
    return out;
  } catch (_) {
    return [];
  }
}
