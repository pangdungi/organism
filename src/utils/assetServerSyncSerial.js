/**
 * 자산관리 Supabase pull·sync 한 줄 직렬화 (KPI runSerialized* 와 동일 역할).
 * pullAllAssetFromCloud 안에서는 *Impl 만 호출해 중첩 대기(교착)를 피합니다.
 */

let _chain = Promise.resolve();

export function runAssetSerialized(fn) {
  const next = _chain.then(fn, fn);
  _chain = next.catch(() => {});
  return next;
}
