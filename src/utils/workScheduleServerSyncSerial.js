/**
 * 근무표 Supabase pull·sync 한 줄 직렬화 (자산 runAssetSerialized 와 동일 패턴).
 */

let _chain = Promise.resolve();

export function runWorkScheduleSerialized(fn) {
  const next = _chain.then(fn, fn);
  _chain = next.catch(() => {});
  return next;
}
