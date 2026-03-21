/** Calendar 우선순위 사분면 갱신 — TodoList ↔ Calendar 순환 참조 방지 */
let refresh = null;

export function registerEisenhowerQuadrantsRefresh(fn) {
  refresh = typeof fn === "function" ? fn : null;
}

export function refreshEisenhowerQuadrantsIfActive() {
  refresh?.();
}
