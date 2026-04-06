/**
 * 근무표 ↔ Supabase (settings / types / entries) 동기화
 */

import { supabase } from "../supabase.js";
import { applyWorkScheduleRowTimesFromTypes } from "./workScheduleEntryResolve.js";

/** localStorage `debug_work_schedule` = `1` 이면 동기화 진단 로그 */
function wsSyncLog(...args) {
  try {
    if (localStorage.getItem("debug_work_schedule") === "1") {
      console.log("[work-schedule sync]", ...args);
    }
  } catch (_) {}
}

const SETTINGS_TABLE = "work_schedule_settings";
const TYPES_TABLE = "work_schedule_types";
const ENTRIES_TABLE = "work_schedule_entries";

const WORK_SCHEDULE_KEY = "work_schedule_rows";
const WORK_TYPE_OPTIONS_KEY = "work_schedule_type_options";
const WORK_SCHEDULE_DAILY_HOURS_KEY = "work_schedule_daily_hours";

const DEFAULT_TYPE_SEED = [
  { name: "연차", start: "00:00", end: "00:00" },
  { name: "휴가", start: "00:00", end: "00:00" },
  { name: "정규근무", start: "", end: "" },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

function rowKey(r) {
  const w = String(r.workDate || "").trim();
  const s = String(r.startTime || "").trim();
  const e = String(r.endTime || "").trim();
  return `${w}|${s}|${e}`;
}

function parseLocalTypes() {
  try {
    const raw = localStorage.getItem(WORK_TYPE_OPTIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function normalizeTypeEntry(o) {
  if (typeof o === "string") return { name: (o || "").trim(), start: "", end: "" };
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
  };
}

/** 서버 근무유형 행 → 로컬 옵션 배열(기본 순서 + 서버 정렬) */
function typeOptionsFromServerRows(serverRows) {
  const rows = Array.isArray(serverRows) ? serverRows : [];
  const byName = new Map(
    rows.map((r) => [
      r.name,
      { name: r.name, start: (r.start_time != null ? String(r.start_time) : "").trim(), end: (r.end_time != null ? String(r.end_time) : "").trim() },
    ])
  );
  const out = [];
  for (const d of DEFAULT_TYPE_SEED) {
    const s = byName.get(d.name);
    out.push(s ? { name: d.name, start: s.start, end: s.end } : { name: d.name, start: d.start, end: d.end });
    byName.delete(d.name);
  }
  const rest = [...rows]
    .filter((r) => r && r.name && !DEFAULT_TYPE_SEED.some((d) => d.name === r.name))
    .sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((r) => ({
      name: r.name,
      start: (r.start_time != null ? String(r.start_time) : "").trim(),
      end: (r.end_time != null ? String(r.end_time) : "").trim(),
    }));
  return [...out, ...rest];
}

function mergeTypeOptionsLocalServer(localArr, serverRows) {
  const serverList = typeOptionsFromServerRows(serverRows);
  const serverNames = new Set(serverList.map((t) => t.name));
  const extra = (localArr || [])
    .map(normalizeTypeEntry)
    .filter((t) => t.name && !serverNames.has(t.name))
    .map((t) => ({ name: t.name, start: t.start, end: t.end }));
  return [...serverList, ...extra];
}

function loadLocalRows() {
  try {
    const raw = localStorage.getItem(WORK_SCHEDULE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function mergeEntriesLocalAndServer(localRows, serverRows) {
  const serverLocal = (Array.isArray(serverRows) ? serverRows : []).map(serverEntryToLocal);
  const serverIds = new Set(serverLocal.map((r) => r.id).filter(Boolean));
  const serverKeys = new Set(serverLocal.map((r) => rowKey(r)));

  const out = [...serverLocal];
  for (const L of localRows) {
    const id = L.id != null ? String(L.id).trim() : "";
    if (id && serverIds.has(id)) continue;
    if (id && !serverIds.has(id)) {
      out.push({ ...L });
      continue;
    }
    if (!id) {
      if (serverKeys.has(rowKey(L))) continue;
      out.push({ ...L });
    }
  }
  return out;
}

function formatLocalYmdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function serverEntryToLocal(row) {
  const d = row.work_date;
  const workDate =
    typeof d === "string"
      ? d.slice(0, 10)
      : d instanceof Date
        ? formatLocalYmdFromDate(d)
        : String(d || "").slice(0, 10);
  return {
    id: row.id,
    startTime: row.start_time != null ? String(row.start_time) : "",
    endTime: row.end_time != null ? String(row.end_time) : "",
    workType: row.work_type != null ? String(row.work_type) : "",
    memo: row.memo != null ? String(row.memo) : "",
    hours: row.hours != null ? String(row.hours) : "",
    hoursWorked: row.hours_worked != null ? String(row.hours_worked) : "",
    workDate,
  };
}

function rowHasAnyPayload(r) {
  return !!(
    String(r.startTime || "").trim() ||
    String(r.endTime || "").trim() ||
    String(r.workType || "").trim() ||
    String(r.hoursWorked || "").trim() ||
    String(r.workDate || "").trim() ||
    String(r.hours || "").trim() ||
    String(r.memo || "").trim()
  );
}

function normalizeWorkDateStr(r) {
  return String(r.workDate || "").trim().replace(/\//g, "-").slice(0, 10);
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** 로그인 시 서버 → 로컬 병합 저장 */
export async function pullWorkScheduleFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;

  const [settingsRes, typesRes, entriesRes] = await Promise.all([
    supabase.from(SETTINGS_TABLE).select("daily_work_hours").eq("user_id", userId).maybeSingle(),
    supabase.from(TYPES_TABLE).select("name, start_time, end_time, sort_order").eq("user_id", userId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from(ENTRIES_TABLE).select("id, work_date, start_time, end_time, work_type, memo, hours, hours_worked").eq("user_id", userId).order("work_date", { ascending: false }),
  ]);

  if (settingsRes.error) console.warn("[work-schedule sync] pull settings", settingsRes.error.message);
  if (typesRes.error) console.warn("[work-schedule sync] pull types", typesRes.error.message);
  if (entriesRes.error) console.warn("[work-schedule sync] pull entries", entriesRes.error.message);

  const localRows = loadLocalRows();
  const localTypes = parseLocalTypes();
  const serverTypeRows = typesRes.data || [];
  if (serverTypeRows.length > 0) {
    const mergedTypes = mergeTypeOptionsLocalServer(localTypes, serverTypeRows);
    try {
      localStorage.setItem(WORK_TYPE_OPTIONS_KEY, JSON.stringify(mergedTypes));
    } catch (_) {}
  }

  const mergedRows = mergeEntriesLocalAndServer(localRows, entriesRes.data || []);
  const resolvedRows = applyWorkScheduleRowTimesFromTypes(mergedRows);
  wsSyncLog(
    "pull: localRows",
    localRows.length,
    "server",
    (entriesRes.data || []).length,
    "merged→localStorage",
    resolvedRows.length,
  );

  try {
    localStorage.setItem(WORK_SCHEDULE_KEY, JSON.stringify(resolvedRows));
  } catch (_) {}

  const serverHours = settingsRes.data?.daily_work_hours;
  if (serverHours != null && !Number.isNaN(Number(serverHours))) {
    try {
      localStorage.setItem(WORK_SCHEDULE_DAILY_HOURS_KEY, String(Number(serverHours)));
    } catch (_) {}
  }

  return { rows: resolvedRows };
}

/** 로컬 전체를 서버에 반영 */
export async function syncWorkScheduleToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  let dailyStr = "8.5";
  try {
    const v = localStorage.getItem(WORK_SCHEDULE_DAILY_HOURS_KEY);
    if (v != null && v !== "") dailyStr = v;
  } catch (_) {}
  const dailyNum = parseFloat(dailyStr);
  const daily_work_hours = !Number.isNaN(dailyNum) && dailyNum >= 0 ? dailyNum : 8.5;

  const rawTypes = parseLocalTypes();
  const typeList =
    rawTypes.length > 0
      ? rawTypes.map(normalizeTypeEntry).filter((t) => t.name)
      : typeOptionsFromServerRows([]);

  let rows = loadLocalRows();
  rows = rows.map((r) => {
    const id = r.id != null ? String(r.id).trim() : "";
    if (isUuid(id)) return r;
    return { ...r, id: crypto.randomUUID() };
  });
  rows = applyWorkScheduleRowTimesFromTypes(rows);
  try {
    localStorage.setItem(WORK_SCHEDULE_KEY, JSON.stringify(rows));
  } catch (_) {}

  const idsStillInLocal = new Set(rows.map((r) => String(r.id || "").trim()).filter((id) => isUuid(id)));

  const entryPayloads = rows
    .filter(rowHasAnyPayload)
    .map((r) => {
      const wd = normalizeWorkDateStr(r);
      if (!isValidYmd(wd)) return null;
      const id = String(r.id || "").trim();
      return {
        id,
        user_id: userId,
        work_date: wd,
        start_time: String(r.startTime || "").trim(),
        end_time: String(r.endTime || "").trim(),
        work_type: String(r.workType || "").trim(),
        memo: String(r.memo || "").trim(),
        hours: String(r.hours != null ? r.hours : "").trim(),
        hours_worked: String(r.hoursWorked != null ? r.hoursWorked : "").trim(),
      };
    })
    .filter(Boolean);

  const { error: setErr } = await supabase.from(SETTINGS_TABLE).upsert(
    { user_id: userId, daily_work_hours },
    { onConflict: "user_id" }
  );
  if (setErr) console.warn("[work-schedule sync] settings upsert", setErr.message);

  const typeUpserts = typeList.map((t, i) => ({
    user_id: userId,
    name: t.name,
    start_time: t.start || "",
    end_time: t.end || "",
    sort_order: i,
  }));
  if (typeUpserts.length > 0) {
    const { error: tErr } = await supabase.from(TYPES_TABLE).upsert(typeUpserts, { onConflict: "user_id,name" });
    if (tErr) console.warn("[work-schedule sync] types upsert", tErr.message);
  }

  const typeNames = new Set(typeList.map((t) => t.name));
  const { data: remoteTypes, error: rtErr } = await supabase.from(TYPES_TABLE).select("name").eq("user_id", userId);
  if (!rtErr && remoteTypes) {
    for (const r of remoteTypes) {
      if (!typeNames.has(r.name)) {
        const { error: dErr } = await supabase.from(TYPES_TABLE).delete().eq("user_id", userId).eq("name", r.name);
        if (dErr) console.warn("[work-schedule sync] type delete", dErr.message);
      }
    }
  }

  if (entryPayloads.length > 0) {
    const { error: eErr } = await supabase.from(ENTRIES_TABLE).upsert(entryPayloads, { onConflict: "id" });
    if (eErr) console.warn("[work-schedule sync] entries upsert", eErr.message);
  }

  // 이번 라운드에 유효한 행 upsert가 없으면 서버 고아 삭제를 하지 않음(빈 로컬/일시 오류로 전체 삭제되는 것 방지).
  const { data: remoteEntries, error: reErr } = await supabase.from(ENTRIES_TABLE).select("id").eq("user_id", userId);
  if (!reErr && remoteEntries && entryPayloads.length > 0) {
    wsSyncLog("push: orphan entry delete check, remote", remoteEntries.length, "local ids", idsStillInLocal.size);
    for (const r of remoteEntries) {
      if (!idsStillInLocal.has(r.id)) {
        const { error: dErr } = await supabase.from(ENTRIES_TABLE).delete().eq("user_id", userId).eq("id", r.id);
        if (dErr) console.warn("[work-schedule sync] entry delete", dErr.message);
      }
    }
  } else if (!reErr && remoteEntries?.length && entryPayloads.length === 0) {
    wsSyncLog("push: SKIP orphan entry delete (entryPayloads empty), rows", rows.length);
  }
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleWorkScheduleSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncWorkScheduleToSupabase().catch((e) => console.warn("[work-schedule sync]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachWorkScheduleSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("work-schedule-saved", () => {
    scheduleWorkScheduleSyncPush();
  });
}

export async function pushAllLocalWorkScheduleIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const { count, error } = await supabase.from(ENTRIES_TABLE).select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (error || (count != null && count > 0)) return;
  await syncWorkScheduleToSupabase();
}

/** 근무표 탭 진입 시: pull → 서버 행 없으면 로컬 업로드 (표는 이 Promise 이후 한 번만 그리는 것을 권장) */
export async function hydrateWorkScheduleFromCloud() {
  attachWorkScheduleSaveListener();
  if (!supabase) return;
  await pullWorkScheduleFromSupabase();
  await pushAllLocalWorkScheduleIfServerEmpty();
}
