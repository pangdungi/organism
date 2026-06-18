/**
 * KPI 맵·과제 목록 — 서버 updated_at 워터마크(가벼운 조회) vs 로컬 캐시 비교
 * 모달 열 때 전체 select * pull 생략용
 */

import { supabase } from "../supabase.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { localEntityTimeMs, parseIsoMs } from "./kpiMapLwwMerge.js";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {string} table
 * @param {string} userId
 * @param {{ meta?: boolean }} [opts]
 */
async function fetchTableMaxUpdatedAtMs(table, userId, opts = {}) {
  if (!supabase || !userId || !table) return 0;
  try {
    if (opts.meta) {
      const { data, error } = await supabase
        .from(table)
        .select("updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return 0;
      return parseIsoMs(data?.updated_at);
    }
    const { data, error } = await supabase
      .from(table)
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return 0;
    return parseIsoMs(data?.[0]?.updated_at);
  } catch (_) {
    return 0;
  }
}

async function fetchServerWatermarkMsForTables(userId, tables) {
  if (!userId || !tables?.length) return 0;
  const msList = await Promise.all(
    tables.map(({ table, meta }) =>
      fetchTableMaxUpdatedAtMs(table, userId, { meta: !!meta }),
    ),
  );
  return msList.reduce((m, v) => Math.max(m, v || 0), 0);
}

const KPI_DOMAIN_TABLES = {
  dream: [
    { table: "dream_map_categories" },
    { table: "dream_map_kpis" },
    { table: "dream_map_kpi_logs" },
    { table: "dream_map_kpi_todos" },
    { table: "dream_map_kpi_daily_todos" },
    { table: "dream_map_meta", meta: true },
  ],
  health: [
    { table: "health_map_categories" },
    { table: "health_map_goal_logs" },
    { table: "health_map_kpis" },
    { table: "health_map_kpi_logs" },
    { table: "health_map_kpi_todos" },
    { table: "health_map_kpi_daily_todos" },
    { table: "health_map_meta", meta: true },
  ],
  happiness: [
    { table: "happiness_map_categories" },
    { table: "happiness_map_kpis" },
    { table: "happiness_map_kpi_logs" },
    { table: "happiness_map_kpi_todos" },
    { table: "happiness_map_kpi_daily_todos" },
    { table: "happiness_map_meta", meta: true },
  ],
  sideincome: [
    { table: "sideincome_map_paths" },
    { table: "sideincome_map_path_logs" },
    { table: "sideincome_map_kpis" },
    { table: "sideincome_map_kpi_logs" },
    { table: "sideincome_map_kpi_todos" },
    { table: "sideincome_map_kpi_daily_todos" },
    { table: "sideincome_map_meta", meta: true },
  ],
};

const LOCAL_KPI_PAYLOAD_ARRAY_KEYS = [
  "dreams",
  "paths",
  "categories",
  "kpis",
  "kpiLogs",
  "pathLogs",
  "goalLogs",
  "kpiTodos",
  "dailyTodos",
];

/** @param {string} storageKey */
export function readLocalKpiMapWatermarkMs(storageKey) {
  const raw = readKpiMapScopedStorageRaw(storageKey);
  if (!raw) return 0;
  try {
    const p = JSON.parse(raw);
    let max = parseIsoMs(p.metaServerUpdatedAt);
    for (const key of LOCAL_KPI_PAYLOAD_ARRAY_KEYS) {
      const arr = p[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        max = Math.max(max, localEntityTimeMs(item));
      }
    }
    return max;
  } catch (_) {
    return 0;
  }
}

/**
 * @param {"dream"|"health"|"happiness"|"sideincome"} domain
 * @param {string} [userId]
 * @returns {Promise<{ stale: boolean, serverMs: number, localMs: number }>}
 */
export async function probeKpiDomainServerStale(domain, userId) {
  const uid = userId || (await getSessionUserId());
  const tables = KPI_DOMAIN_TABLES[domain];
  if (!uid || !tables) {
    return { stale: false, serverMs: 0, localMs: 0 };
  }
  const serverMs = await fetchServerWatermarkMsForTables(uid, tables);
  const storageKey = {
    dream: "kpi-dream-map",
    health: "kpi-health-map",
    happiness: "kpi-happiness-map",
    sideincome: "kpi-sideincome-paths",
  }[domain];
  const localMs = readLocalKpiMapWatermarkMs(storageKey);
  const stale = serverMs > localMs;
  return { stale, serverMs, localMs };
}

/** @returns {Promise<number>} */
export async function probeTimeLedgerTasksServerWatermarkMs(userId) {
  const uid = userId || (await getSessionUserId());
  if (!uid) return 0;
  return fetchTableMaxUpdatedAtMs("time_ledger_tasks", uid);
}
