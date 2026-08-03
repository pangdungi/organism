/** 온라인 복귀 push flush 진행 상태 — pull이 끝날 때까지 기다리게 함 */

/** @type {Promise<void> | null} */
let _flushPromise = null;

export function setOfflineFlushPromise(p) {
  _flushPromise = p;
}

export function clearOfflineFlushPromise() {
  _flushPromise = null;
}

export function whenOfflineFlushIdle() {
  return _flushPromise || Promise.resolve();
}
