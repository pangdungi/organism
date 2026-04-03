/**
 * 꿈·부수입·행복·건강 KPI 맵을 서버에서 한 번 가져와 localStorage에 반영한다.
 * (예: 수동 새로고침 버튼 등에서 호출 가능)
 *
 * App 탭 전환 시에는 호출하지 않는다. 탭만 바꿨는데 pull이 로컬을 서버 스냅샷으로
 * 덮어쓰면 다른 탭·미푸시 편집이 날아간다. 앱 부팅 시 hydrate + 저장 시 푸시로 충분하다.
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
