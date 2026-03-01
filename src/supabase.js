import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("Supabase URL/Key 없음. .env 파일 확인.");
}

export const supabase = url && key ? createClient(url, key) : null;
