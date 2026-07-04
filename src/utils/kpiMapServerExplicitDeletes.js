/**
 * KPI 맵 push — deleted_refs(사용자 명시 삭제 id)만 서버에서 DELETE.
 * 로컬 목록에 남아 있는 id는 삭제하지 않음(빈 로컬로 서버 전체 삭제 방지).
 */

function uniqIds(arr) {
  return [...new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function idsMinusActive(deletedIds, activeIds) {
  const active =
    activeIds instanceof Set ? activeIds : new Set(uniqIds(activeIds));
  return uniqIds(deletedIds).filter((id) => !active.has(id));
}

async function deleteRowsById(supabase, table, userId, ids) {
  const clean = uniqIds(ids);
  if (!clean.length || !table) return null;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in("id", clean);
  return error;
}

async function deleteRowsByKpiId(supabase, table, userId, kpiIds) {
  const clean = uniqIds(kpiIds);
  if (!clean.length || !table) return null;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in("kpi_id", clean);
  return error;
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   userId: string,
 *   deletedRefs: object,
 *   active?: { categoryIds?: string[], goalLogIds?: string[], pathLogIds?: string[], kpiIds?: string[] },
 *   tables: {
 *     categories?: string,
 *     goalLogs?: string,
 *     pathLogs?: string,
 *     kpis?: string,
 *     kpiLogs?: string,
 *     kpiTodos?: string,
 *     kpiDailyRepeatTodos?: string,
 *   },
 * }} opts
 */
export async function applyKpiMapExplicitDeletesOnServer(opts) {
  const { supabase, userId, deletedRefs, active = {}, tables } = opts;
  if (!supabase || !userId || !deletedRefs || !tables) {
    return { ok: true, deleted: {} };
  }

  const dr = deletedRefs;
  const categoryIds = idsMinusActive(dr.categories, active.categoryIds);
  const goalLogIds = idsMinusActive(dr.healthGoalLogs, active.goalLogIds);
  const pathLogIds = idsMinusActive(dr.pathLogs, active.pathLogIds);
  const kpiIds = idsMinusActive(dr.kpis, active.kpiIds);
  const kpiLogIds = uniqIds(dr.kpiLogs);
  const kpiTodoIds = uniqIds(dr.kpiTodos);
  const kpiDailyIds = uniqIds(dr.kpiDailyRepeatTodos);

  const hasWork =
    categoryIds.length > 0 ||
    goalLogIds.length > 0 ||
    pathLogIds.length > 0 ||
    kpiIds.length > 0 ||
    kpiLogIds.length > 0 ||
    kpiTodoIds.length > 0 ||
    kpiDailyIds.length > 0;
  if (!hasWork) return { ok: true, deleted: {} };

  /** @type {{ step: string, message: string }[]} */
  const errors = [];
  /** @type {Record<string, number>} */
  const deleted = {};

  if (tables.kpiLogs && kpiLogIds.length) {
    const error = await deleteRowsById(supabase, tables.kpiLogs, userId, kpiLogIds);
    if (error) errors.push({ step: "kpiLogsById", message: error.message });
    else deleted.kpiLogsById = kpiLogIds.length;
  }
  if (tables.kpiTodos && kpiTodoIds.length) {
    const error = await deleteRowsById(supabase, tables.kpiTodos, userId, kpiTodoIds);
    if (error) errors.push({ step: "kpiTodosById", message: error.message });
    else deleted.kpiTodosById = kpiTodoIds.length;
  }
  if (tables.kpiDailyRepeatTodos && kpiDailyIds.length) {
    const error = await deleteRowsById(
      supabase,
      tables.kpiDailyRepeatTodos,
      userId,
      kpiDailyIds,
    );
    if (error) errors.push({ step: "kpiDailyById", message: error.message });
    else deleted.kpiDailyById = kpiDailyIds.length;
  }
  if (tables.goalLogs && goalLogIds.length) {
    const error = await deleteRowsById(supabase, tables.goalLogs, userId, goalLogIds);
    if (error) errors.push({ step: "goalLogs", message: error.message });
    else deleted.goalLogs = goalLogIds.length;
  }
  if (tables.pathLogs && pathLogIds.length) {
    const error = await deleteRowsById(supabase, tables.pathLogs, userId, pathLogIds);
    if (error) errors.push({ step: "pathLogs", message: error.message });
    else deleted.pathLogs = pathLogIds.length;
  }

  if (kpiIds.length) {
    if (tables.kpiLogs) {
      const error = await deleteRowsByKpiId(supabase, tables.kpiLogs, userId, kpiIds);
      if (error) errors.push({ step: "kpiLogsByKpiId", message: error.message });
    }
    if (tables.kpiTodos) {
      const error = await deleteRowsByKpiId(supabase, tables.kpiTodos, userId, kpiIds);
      if (error) errors.push({ step: "kpiTodosByKpiId", message: error.message });
    }
    if (tables.kpiDailyRepeatTodos) {
      const error = await deleteRowsByKpiId(
        supabase,
        tables.kpiDailyRepeatTodos,
        userId,
        kpiIds,
      );
      if (error) errors.push({ step: "kpiDailyByKpiId", message: error.message });
    }
    if (tables.kpis) {
      const error = await deleteRowsById(supabase, tables.kpis, userId, kpiIds);
      if (error) errors.push({ step: "kpis", message: error.message });
      else deleted.kpis = kpiIds.length;
    }
  }

  if (tables.categories && categoryIds.length) {
    const error = await deleteRowsById(supabase, tables.categories, userId, categoryIds);
    if (error) errors.push({ step: "categories", message: error.message });
    else deleted.categories = categoryIds.length;
  }

  if (errors.length) {
    throw new Error(
      `explicit_deleted_refs: ${errors.map((x) => `${x.step}: ${x.message}`).join("; ")}`,
    );
  }
  return { ok: true, deleted };
}

export const HEALTH_KPI_MAP_DELETE_TABLES = {
  categories: "health_map_categories",
  goalLogs: "health_map_goal_logs",
  kpis: "health_map_kpis",
  kpiLogs: "health_map_kpi_logs",
  kpiTodos: "health_map_kpi_todos",
  kpiDailyRepeatTodos: "health_map_kpi_daily_todos",
};

export const DREAM_KPI_MAP_DELETE_TABLES = {
  categories: "dream_map_categories",
  kpis: "dream_map_kpis",
  kpiLogs: "dream_map_kpi_logs",
  kpiTodos: "dream_map_kpi_todos",
  kpiDailyRepeatTodos: "dream_map_kpi_daily_todos",
};

export const HAPPINESS_KPI_MAP_DELETE_TABLES = {
  categories: "happiness_map_categories",
  kpis: "happiness_map_kpis",
  kpiLogs: "happiness_map_kpi_logs",
  kpiTodos: "happiness_map_kpi_todos",
  kpiDailyRepeatTodos: "happiness_map_kpi_daily_todos",
};

export const SIDEINCOME_KPI_MAP_DELETE_TABLES = {
  categories: "sideincome_map_paths",
  pathLogs: "sideincome_map_path_logs",
  kpis: "sideincome_map_kpis",
  kpiLogs: "sideincome_map_kpi_logs",
  kpiTodos: "sideincome_map_kpi_todos",
  kpiDailyRepeatTodos: "sideincome_map_kpi_daily_todos",
};

export function healthMapActiveIdsFromPayload(p) {
  return {
    categoryIds: (p?.healths || []).map((h) => h.id),
    goalLogIds: (p?.healthGoalLogs || []).map((l) => l.id),
    kpiIds: (p?.kpis || []).map((k) => k.id),
  };
}

export function dreamMapActiveIdsFromPayload(p) {
  return {
    categoryIds: (p?.dreams || []).map((d) => d.id),
    kpiIds: (p?.kpis || []).map((k) => k.id),
  };
}

export function happinessMapActiveIdsFromPayload(p) {
  return {
    categoryIds: (p?.happinesses || []).map((c) => c.id),
    kpiIds: (p?.kpis || []).map((k) => k.id),
  };
}

export function sideincomeMapActiveIdsFromPayload(p) {
  return {
    categoryIds: (p?.paths || []).map((path) => path.id),
    pathLogIds: (p?.pathLogs || []).map((l) => l.id),
    kpiIds: (p?.kpis || []).map((k) => k.id),
  };
}
