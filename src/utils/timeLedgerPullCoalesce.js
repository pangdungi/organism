/**
 * 동일 Supabase pull 이 동시에 여러 번 호출될 때 네트워크 1회로 합칩니다.
 * pull 자체를 생략하지 않습니다(기능 유지).
 */

/** @type {Map<string, Promise<unknown>>} */
const _inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function coalesceInFlightPull(key, fn) {
  const k = String(key || "").trim();
  if (!k) return fn();
  const existing = _inFlight.get(k);
  if (existing) return /** @type {Promise<T>} */ (existing);
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (_inFlight.get(k) === p) _inFlight.delete(k);
    });
  _inFlight.set(k, p);
  return p;
}
