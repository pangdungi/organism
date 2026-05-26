import { supabase } from "../supabase.js";

/** @type {import("@supabase/supabase-js").Session | null | undefined} undefined = 아직 미조회 */
let _cachedSession = undefined;
let _inflightSession = null;

export function clearSupabaseSessionCache() {
  _cachedSession = undefined;
  _inflightSession = null;
}

export function primeSupabaseSession(session) {
  _cachedSession = session ?? null;
}

/** 동시 getSession 호출을 하나로 묶고, 부팅 직후에는 캐시를 재사용 */
export async function getSupabaseSession() {
  if (!supabase) return { data: { session: null }, error: null };
  if (_cachedSession !== undefined) {
    return { data: { session: _cachedSession }, error: null };
  }
  if (_inflightSession) return _inflightSession;
  _inflightSession = supabase.auth
    .getSession()
    .then((res) => {
      _cachedSession = res?.data?.session ?? null;
      _inflightSession = null;
      return res;
    })
    .catch((err) => {
      _inflightSession = null;
      throw err;
    });
  return _inflightSession;
}

if (supabase?.auth?.onAuthStateChange) {
  supabase.auth.onAuthStateChange((_event, session) => {
    primeSupabaseSession(session);
  });
}
