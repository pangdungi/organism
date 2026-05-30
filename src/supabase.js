import { createClient } from "@supabase/supabase-js";
import { lpSupabaseAuthStorage } from "./utils/authRememberMe.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * 브라우저 Navigator Lock 은 새로고침 시 getSession 이 겹치면 10초씩 막힐 수 있음.
 * 같은 탭 안에서만 직렬화(탭 간 동기화는 localStorage 이벤트·다음 pull 로 맞춤).
 */
let _authLockTail = Promise.resolve();
function sameTabAuthLock(_name, _acquireTimeout, fn) {
  const run = _authLockTail.then(() => fn());
  _authLockTail = run.then(
    () => {},
    () => {},
  );
  return run;
}

/** persistSession: 자동 로그인 체크 시 localStorage, 해제 시 sessionStorage(탭·창 종료 시 세션 소멸) */
export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        storage: lpSupabaseAuthStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        lock: sameTabAuthLock,
      },
    })
  : null;
