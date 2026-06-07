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

/** 로컬에만 있고 서버가 비었을 때 일괄 업로드 */
export async function pushAllLocalBudgetTemplatesIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return;
  if (count != null && count > 0) return;
  const locals = readBudgetScheduleTemplates();
  if (!locals.length) return;
  const payloads = buildBudgetTemplateUpsertPayloads(userId, locals);
  await supabase.from(TABLE).upsert(payloads, {
    onConflict: "user_id,template_id",
  });
}
