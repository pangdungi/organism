/**
 * 꿈·부수입·행복·건강 탭 진입 시 서버에서 최신 KPI 맵을 한 번 더 가져온다.
 * 앱 시작 시 hydrate가 세션보다 먼저 돌아 pull이 건너뛰어진 경우·다른 기기에서 저장한 경우를 보완한다.
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
