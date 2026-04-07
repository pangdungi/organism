/**
 * KPI 원격 pull이 입력 중인 같은 탭 화면을 덮어쓰지 않도록 할 때 사용.
 * (localStorage만 갱신되고 리렌더는 막히면 다음 저장이 낡은 DOM 기준으로 서버를 덮을 수 있음)
 *
 * 꿈·건강·행복·부수입 네 KPI 탭에 동일 규칙 적용.
 */

function isDomTypingActive() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * @param {"dream"|"health"|"happiness"|"sideincome"} domain
 * @param {() => string} [getCurrentTabId]
 */
export function shouldDeferKpiPullForDomain(domain, getCurrentTabId) {
  if (!isDomTypingActive()) return false;
  const tab = typeof getCurrentTabId === "function" ? getCurrentTabId() : "";
  if (domain === "dream" && tab === "dream") return true;
  if (domain === "health" && tab === "health") return true;
  if (domain === "happiness" && tab === "happiness") return true;
  if (domain === "sideincome" && tab === "sideincome") return true;
  return false;
}

/** 자산관리 탭에서 입력 중이면 가계부 거래 full pull 만 잠시 생략 */
export function shouldDeferAssetExpensePull(getCurrentTabId) {
  if (!isDomTypingActive()) return false;
  const tab = typeof getCurrentTabId === "function" ? getCurrentTabId() : "";
  return tab === "asset";
}
