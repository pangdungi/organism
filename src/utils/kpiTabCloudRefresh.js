/**
 * 꿈·부수입·행복·건강 KPI 맵 — 서버(Supabase)를 기준으로 localStorage에 반영한다.
 *
 * - pullKpiTabFromCloud: 앱 내 메뉴로 해당 KPI 탭에 들어갈 때 1종만 pull
 * - pullAllKpiMapsFromCloud: 크롬에서 다른 탭에 있다가 이 사이트 탭을 다시 포커스할 때
 *   네 종을 한꺼번에 pull (옛 브라우저 탭이 옛 로컬을 서버에 올리는 문제 완화: 포커스 시 서버가 원천)
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
 * @returns {Promise<{ anyOk: boolean, anyChanged: boolean }>}
 */
export async function pullAllKpiMapsFromCloud() {
  let before = [];
  try {
    before = ALL_KPI_STORAGE_KEYS.map((k) => localStorage.getItem(k));
  } catch (_) {}

  const [d, h, ha, si] = await Promise.all([
    pullDreamKpiMapFromSupabase(),
    pullHealthKpiMapFromSupabase(),
    pullHappinessKpiMapFromSupabase(),
    pullSideincomeKpiMapFromSupabase(),
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
