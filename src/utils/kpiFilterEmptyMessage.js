/**
 * KPI 필터(전체·진행중·완료) — 목록이 비었을 때 안내 문구
 * @param {"all" | "active" | "completed" | string} filter
 */
export function kpiFilterEmptyListMessage(filter) {
  if (filter === "completed") return "완료된 KPI가 없습니다.";
  if (filter === "active") return "진행 중인 KPI가 없습니다.";
  return "KPI를 추가해 보세요.";
}
