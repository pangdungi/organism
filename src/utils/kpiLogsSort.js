/**
 * KPI 로그 목록: 날짜 형식(dateRaw / 표시용 date)이 섞여도 비교 가능하도록 YYYY-MM-DD 로 정규화
 */
export function kpiLogSortKey(log) {
  const raw = log?.dateRaw;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
    return String(raw).trim();
  }
  const s = String(raw || "").trim();
  const head = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (head) return `${head[1]}-${head[2]}-${head[3]}`;
  const m = String(log?.date || "").match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  return "";
}

/**
 * 최신 날짜가 위로. 같은 날이면 배열에서 나중에 추가된 항목(보통 최근 저장)이 위로.
 * @param {object[]} logs — kpiId 로 걸러진 로그만
 * @param {object[]|null|undefined} fullKpiLogsArray — 원본 kpiLogs (저장 순서 보조 정렬용)
 */
export function sortKpiLogsNewestFirst(logs, fullKpiLogsArray) {
  const order = new Map(
    (fullKpiLogsArray || []).map((l, i) => [l.id, i]),
  );
  return [...logs].sort((a, b) => {
    const ka = kpiLogSortKey(a);
    const kb = kpiLogSortKey(b);
    const byDate = kb.localeCompare(ka);
    if (byDate !== 0) return byDate;
    return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
  });
}
