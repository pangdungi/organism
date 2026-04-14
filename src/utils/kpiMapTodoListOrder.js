/**
 * KPI 할일(kpiTodos[]) — DB 조회 순서는 불안정하므로, sync 시 배열 인덱스를 extra.sortOrder로 저장하고
 * pull 시 이 값으로 복원한다.
 */

/**
 * @param {Array<{ id?: string, extra?: object, updated_at?: string }>} rows
 * @returns {Array}
 */
export function sortNormalizedKpiTodoRows(rows) {
  return [...(rows || [])].sort((ra, rb) => {
    const exa = ra.extra && typeof ra.extra === "object" && !Array.isArray(ra.extra) ? ra.extra : {};
    const exb = rb.extra && typeof rb.extra === "object" && !Array.isArray(rb.extra) ? rb.extra : {};
    const oa = typeof exa.sortOrder === "number" && Number.isFinite(exa.sortOrder) ? exa.sortOrder : null;
    const ob = typeof exb.sortOrder === "number" && Number.isFinite(exb.sortOrder) ? exb.sortOrder : null;
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa !== null && ob === null) return -1;
    if (oa === null && ob !== null) return 1;
    const ta = ra.updated_at ? new Date(ra.updated_at).getTime() : 0;
    const tb = rb.updated_at ? new Date(rb.updated_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(ra.id || "").localeCompare(String(rb.id || ""));
  });
}
