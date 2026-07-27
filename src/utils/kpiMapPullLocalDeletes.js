/**
 * KPI 맵 pull — 로컬에서 이미 지운 KPI/할일 등이 서버 스냅샷으로 되살아나지 않게 병합
 * (탭 진입 force pull 중 삭제하면 ghost 카드가 남는 레이스 방지)
 */

function uniqIds(arr) {
  return [
    ...new Set(
      (Array.isArray(arr) ? arr : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function mergeIdLists(...lists) {
  return uniqIds(lists.flatMap((x) => (Array.isArray(x) ? x : [])));
}

/**
 * @param {object} snapshot pull로 만든 로컬 저장 payload
 * @param {object | null | undefined} localBefore write 직전 로컬 payload
 * @returns {object}
 */
export function applyLocalPendingKpiDeletesToPullSnapshot(snapshot, localBefore) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  if (!localBefore || typeof localBefore !== "object") return snapshot;

  const snapDr =
    snapshot.deletedRefs && typeof snapshot.deletedRefs === "object"
      ? snapshot.deletedRefs
      : {};
  const localDr =
    localBefore.deletedRefs && typeof localBefore.deletedRefs === "object"
      ? localBefore.deletedRefs
      : {};

  const deletedKpis = mergeIdLists(snapDr.kpis, localDr.kpis);
  const deletedKpiSet = new Set(deletedKpis);

  const nextDeletedRefs = {
    ...snapDr,
    categories: mergeIdLists(snapDr.categories, localDr.categories),
    healthGoalLogs: mergeIdLists(snapDr.healthGoalLogs, localDr.healthGoalLogs),
    pathLogs: mergeIdLists(snapDr.pathLogs, localDr.pathLogs),
    kpis: deletedKpis,
    kpiLogs: mergeIdLists(snapDr.kpiLogs, localDr.kpiLogs),
    kpiTodos: mergeIdLists(snapDr.kpiTodos, localDr.kpiTodos),
    kpiDailyRepeatTodos: mergeIdLists(
      snapDr.kpiDailyRepeatTodos,
      localDr.kpiDailyRepeatTodos,
    ),
  };

  const next = {
    ...snapshot,
    kpis: (Array.isArray(snapshot.kpis) ? snapshot.kpis : []).filter(
      (k) => !deletedKpiSet.has(String(k?.id ?? "")),
    ),
    kpiLogs: (Array.isArray(snapshot.kpiLogs) ? snapshot.kpiLogs : []).filter(
      (l) => !deletedKpiSet.has(String(l?.kpiId ?? "")),
    ),
    kpiTodos: (Array.isArray(snapshot.kpiTodos) ? snapshot.kpiTodos : []).filter(
      (t) => !deletedKpiSet.has(String(t?.kpiId ?? "")),
    ),
    kpiDailyRepeatTodos: (
      Array.isArray(snapshot.kpiDailyRepeatTodos)
        ? snapshot.kpiDailyRepeatTodos
        : []
    ).filter((t) => !deletedKpiSet.has(String(t?.kpiId ?? ""))),
    deletedRefs: nextDeletedRefs,
  };

  if (snapshot.kpiOrder && typeof snapshot.kpiOrder === "object") {
    const order = {};
    for (const [scope, ids] of Object.entries(snapshot.kpiOrder)) {
      order[scope] = Array.isArray(ids)
        ? ids.filter((id) => !deletedKpiSet.has(String(id)))
        : ids;
    }
    next.kpiOrder = order;
  }

  if (snapshot.kpiTaskSync && typeof snapshot.kpiTaskSync === "object") {
    const sync = { ...snapshot.kpiTaskSync };
    for (const id of deletedKpiSet) delete sync[id];
    next.kpiTaskSync = sync;
  }

  return next;
}
