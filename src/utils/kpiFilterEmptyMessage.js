/**
 * KPI 필터(진행 전·진행중·완료) — 목록이 비었을 때 안내 문구
 * @param {"pending" | "active" | "completed" | string} filter
 * @param {{ noun?: "KPI" | "행동" }} [opts]
 */
export function kpiFilterEmptyListMessage(filter, opts = {}) {
  const noun = opts.noun === "행동" ? "행동" : "KPI";
  if (noun === "행동") {
    if (filter === "completed") return "완료된 행동이 없습니다.";
    if (filter === "pending") return "진행 전 행동이 없습니다.";
    if (filter === "active") return "진행 중인 행동이 없습니다.";
    return "행동을 추가해 보세요.";
  }
  if (filter === "completed") return "완료된 KPI가 없습니다.";
  if (filter === "pending") return "진행 전 KPI가 없습니다.";
  if (filter === "active") return "진행 중인 KPI가 없습니다.";
  return "KPI를 추가해 보세요.";
}
