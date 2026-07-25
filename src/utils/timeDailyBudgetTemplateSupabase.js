/**
 * 예상 일정 템플릿 ↔ Supabase time_daily_budget_templates
 */

import { supabase } from "../supabase.js";
import {
  buildBudgetTemplateUpsertPayloads,
  mergeBudgetScheduleTemplatesFromServer,
  readBudgetScheduleTemplates,
} from "./timeDailyBudgetTemplateModel.js";

const TABLE = "time_daily_budget_templates";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function pullBudgetScheduleTemplatesFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .select("user_id, template_id, name, blocks, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) return false;
  if (!data?.length) return false;
  return mergeBudgetScheduleTemplatesFromServer(data);
}

export async function syncBudgetScheduleTemplateToSupabase(template) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !template?.id) return false;
  const payloads = buildBudgetTemplateUpsertPayloads(userId, [template]);
  if (!payloads.length) return false;
  const { error } = await supabase.from(TABLE).upsert(payloads[0], {
    onConflict: "user_id,template_id",
  });
  return !error;
}

export async function deleteBudgetScheduleTemplateOnSupabase(templateId) {
  const userId = await getSessionUserId();
  const id = String(templateId || "").trim();
  if (!userId || !supabase || !id) return false;
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("template_id", id);
  return !error;
}

/** @deprecated 서버 비어 있을 때 로컬 통째 시드 금지 — 서버는 사용자 저장만 */
export async function pushAllLocalBudgetTemplatesIfServerEmpty() {
  return;
}
