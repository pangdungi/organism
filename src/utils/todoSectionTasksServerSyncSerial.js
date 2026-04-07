/**
 * 할일 섹션 태스크 Supabase pull·sync 한 줄 직렬화.
 */

let _chain = Promise.resolve();

export function runTodoSectionTasksSerialized(fn) {
  const next = _chain.then(fn, fn);
  _chain = next.catch(() => {});
  return next;
}
