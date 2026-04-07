/**
 * 꿈·부수입·행복·건강 KPI 맵 — 서버(Supabase)를 기준으로 localStorage에 반영한다.
 *
 * - pullKpiTabFromCloud: 앱 내 메뉴로 해당 KPI 탭에 들어갈 때 1종만 pull
 * - pullAllKpiMapsFromCloud: Realtime·브라우저 탭 포커스 등에서 네 종 pull.
 *   꿈·건강·행복·부수입 탭에 포커스가 있고 입력 중이면 해당 도메인만 pull 생략(저장소가 먼저 바뀌고 화면은 예전 값인 불일치 방지).
 */

import {
  DREAM_KPI_MAP_STORAGE_KEY,
  pullDreamKpiMapFromSupabase,
} from "./dreamKpiMapSupabase.js";
import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  pullHealthKpiMapFromSupabase,
} from "./healthKpiMapSupabase.js";
import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  pullHappinessKpiMapFromSupabase,
} from "./happinessKpiMapSupabase.js";
import {
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
  pullSideincomeKpiMapFromSupabase,
} from "./sideincomeKpiMapSupabase.js";
import { shouldDeferKpiPullForDomain } from "./kpiPullTypingGuard.js";
const KPI_LOCAL_STORAGE_KEYS = {
  dream: DREAM_KPI_MAP_STORAGE_KEY,
  health: HEALTH_KPI_MAP_STORAGE_KEY,
  happiness: HAPPINESS_KPI_MAP_STORAGE_KEY,
  sideincome: SIDEINCOME_KPI_MAP_STORAGE_KEY,
};

/**
 * @param {string} tabId dream | health | happiness | sideincome
 * @returns {Promise<{ pullOk: boolean, localChanged: boolean }>}
 */
export async function pullKpiTabFromCloud(tabId) {
  const key = KPI_LOCAL_STORAGE_KEYS[tabId];
  const before = key ? localStorage.getItem(key) : null;

  let pullOk = false;
  switch (tabId) {
    case "dream":
      pullOk = await pullDreamKpiMapFromSupabase();
      break;
    case "health":
      pullOk = await pullHealthKpiMapFromSupabase();
      break;
    case "happiness":
      pullOk = await pullHappinessKpiMapFromSupabase();
      break;
    case "sideincome":
      pullOk = await pullSideincomeKpiMapFromSupabase();
      break;
    default:
      return { pullOk: false, localChanged: false };
  }

  const after = key ? localStorage.getItem(key) : null;
  const localChanged = pullOk && before !== after;
  return { pullOk, localChanged };
}

const ALL_KPI_STORAGE_KEYS = [
  DREAM_KPI_MAP_STORAGE_KEY,
  HEALTH_KPI_MAP_STORAGE_KEY,
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
];

/**
 * 꿈·건강·행복·부수입 맵을 병렬 pull. 서버를 단일 원천으로 맞출 때 사용.
 * @param {() => string} [getCurrentTabId] — 꿈·건강·행복·부수입 탭에서 입력 중이면 해당 도메인 pull만 잠시 생략
 * @returns {Promise<{ anyOk: boolean, anyChanged: boolean }>}
 */
export async function pullAllKpiMapsFromCloud(getCurrentTabId) {
  let before = [];
  try {
    before = ALL_KPI_STORAGE_KEYS.map((k) => localStorage.getItem(k));
  } catch (_) {}

  const skipDream = shouldDeferKpiPullForDomain("dream", getCurrentTabId);
  const skipHealth = shouldDeferKpiPullForDomain("health", getCurrentTabId);
  const skipHappiness = shouldDeferKpiPullForDomain("happiness", getCurrentTabId);
  const skipSideincome = shouldDeferKpiPullForDomain("sideincome", getCurrentTabId);

  const [d, h, ha, si] = await Promise.all([
    skipDream ? Promise.resolve(false) : pullDreamKpiMapFromSupabase(),
    skipHealth ? Promise.resolve(false) : pullHealthKpiMapFromSupabase(),
    skipHappiness ? Promise.resolve(false) : pullHappinessKpiMapFromSupabase(),
    skipSideincome ? Promise.resolve(false) : pullSideincomeKpiMapFromSupabase(),
  ]);
  const anyOk = !!(d || h || ha || si);

  let after = [];
  try {
    after = ALL_KPI_STORAGE_KEYS.map((k) => localStorage.getItem(k));
  } catch (_) {}

  const anyChanged =
    before.length === after.length && before.some((b, i) => b !== after[i]);
  return { anyOk, anyChanged };
}
