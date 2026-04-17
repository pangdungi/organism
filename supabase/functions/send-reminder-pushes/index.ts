/**
 * 1분마다 호출(cron): 사용자별 IANA 타임존(user_subscriptions.iana_timezone) 기준
 * 현재 "로컬" 날짜·분과 일치하는 calendar_section_tasks 리마인더에 Web Push 발송.
 * iana_timezone 없음 → Asia/Seoul (기존 동작 호환).
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 *          REMINDER_CRON_SECRET (선택, 설정 시 요청 헤더 x-reminder-cron-secret 와 일치해야 함)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webPush from "npm:web-push@3.6.6";

const FALLBACK_TZ = "Asia/Seoul";

function getYmdHmInZone(d: Date, timeZone: string): { ymd: string; hm: string } {
  const tz = (timeZone || "").trim() || FALLBACK_TZ;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(d);
    const g = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value ?? "";
    const y = g("year");
    const mo = g("month");
    const day = g("day");
    let h = g("hour");
    let mi = g("minute");
    if (h.length === 1) h = `0${h}`;
    if (mi.length === 1) mi = `0${mi}`;
    return { ymd: `${y}-${mo}-${day}`, hm: `${h}:${mi}` };
  } catch {
    return getYmdHmInZone(d, FALLBACK_TZ);
  }
}

function normalizeReminderTime(raw: string): string | null {
  const s = String(raw || "").trim().replace(/\s/g, "");
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const h = parseInt(hh, 10);
  const min = parseInt(mm, 10);
  if (h > 23 || min > 59) return null;
  return `${hh}:${mm}`;
}

function slotKey(ymd: string, hm: string, tz: string): string {
  return `${ymd}T${hm}|${tz}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-reminder-cron-secret, content-type",
      },
    });
  }

  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (cronSecret) {
    const hdr = req.headers.get("x-reminder-cron-secret");
    if (hdr !== cronSecret) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject =
    Deno.env.get("VAPID_SUBJECT") || "mailto:organism-app@users.noreply.github.com";

  if (!vapidPublic || !vapidPrivate) {
    return new Response(
      JSON.stringify({ error: "missing_vapid_keys" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();

  const { data: tasks, error: taskErr } = await supabase
    .from("calendar_section_tasks")
    .select("id, user_id, name, reminder_date, reminder_time, done")
    .eq("done", false)
    .not("reminder_date", "is", null);

  if (taskErr) {
    return new Response(JSON.stringify({ error: taskErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const list = tasks || [];
  const userIds = [...new Set(list.map((t) => t.user_id).filter(Boolean))];
  const tzByUser = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: subsRows, error: subTzErr } = await supabase
      .from("user_subscriptions")
      .select("user_id, iana_timezone")
      .in("user_id", userIds);

    if (!subTzErr) {
      for (const r of subsRows || []) {
        const uid = r.user_id as string;
        const raw = String((r as { iana_timezone?: string }).iana_timezone || "").trim();
        tzByUser.set(uid, raw || FALLBACK_TZ);
      }
    }
  }

  const due: typeof list = [];
  /** 오늘 날짜는 맞는데 시·분만 다른 행 (curl 로 원인 파악용, 최대 8개) */
  const nearMiss: Array<{
    task_id: string;
    user_id: string;
    tz: string;
    server_hm: string;
    reminder_time_raw: string;
    reminder_time_norm: string | null;
  }> = [];

  for (const t of list) {
    const uid = String(t.user_id || "");
    const tz = tzByUser.get(uid) || FALLBACK_TZ;
    const { ymd, hm } = getYmdHmInZone(now, tz);
    const rd = String(t.reminder_date || "").slice(0, 10);
    if (rd !== ymd) continue;
    const nt = normalizeReminderTime(String(t.reminder_time || ""));
    if (nt === hm) due.push(t);
    else if (nearMiss.length < 8) {
      nearMiss.push({
        task_id: String(t.id),
        user_id: uid,
        tz,
        server_hm: hm,
        reminder_time_raw: String(t.reminder_time || "").slice(0, 32),
        reminder_time_norm: nt,
      });
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const steps: Array<{
    task_id: string;
    user_id: string;
    tz: string;
    local_ymd: string;
    local_hm: string;
    slot_key: string;
    log: string;
    subs: number;
    pushes: Array<{ ok: boolean; status?: number; err?: string }>;
  }> = [];

  for (const t of due) {
    const uid = String(t.user_id || "");
    const tz = tzByUser.get(uid) || FALLBACK_TZ;
    const { ymd, hm } = getYmdHmInZone(now, tz);
    const sk = slotKey(ymd, hm, tz);
    const step: (typeof steps)[0] = {
      task_id: String(t.id),
      user_id: uid,
      tz,
      local_ymd: ymd,
      local_hm: hm,
      slot_key: sk,
      log: "pending",
      subs: 0,
      pushes: [],
    };

    const { data: insRows, error: logErr } = await supabase
      .from("reminder_push_log")
      .insert({
        user_id: t.user_id,
        task_id: t.id,
        slot_key: sk,
      })
      .select("id");

    if (logErr) {
      if (
        logErr.code === "23505" ||
        String(logErr.message || "").toLowerCase().includes("duplicate")
      ) {
        step.log = "duplicate_skip_already_sent_this_slot";
        skipped++;
        steps.push(step);
        continue;
      }
      step.log = "log_insert_error:" + logErr.message;
      failed++;
      steps.push(step);
      continue;
    }
    if (!insRows?.[0]?.id) {
      step.log = "log_insert_no_row";
      skipped++;
      steps.push(step);
      continue;
    }
    step.log = "log_inserted";

    const { data: subs, error: subErr } = await supabase
      .from("user_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", t.user_id);

    if (subErr) {
      step.log += ";subs_error:" + subErr.message;
      skipped++;
      steps.push(step);
      continue;
    }
    if (!subs?.length) {
      step.log += ";no_push_subscriptions_for_user";
      skipped++;
      steps.push(step);
      continue;
    }
    step.subs = subs.length;

    const title = "할일 리마인더";
    const body = (t.name || "할일").slice(0, 120);
    const payload = JSON.stringify({
      title,
      body,
      url: "/",
      tag: `reminder-${t.id}-${sk}`,
    });

    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webPush.sendNotification(subscription, payload, {
          TTL: 60 * 60,
          /* 일부 모바일 게이트웨이에서 백그라운드 전달 우선순위에 영향을 줄 수 있음 */
          urgency: "high",
        });
        sent++;
        step.pushes.push({ ok: true });
      } catch (e: unknown) {
        const st = (e as { statusCode?: number })?.statusCode;
        const msg = e instanceof Error ? e.message : String(e);
        if (st === 404 || st === 410) {
          await supabase.from("user_push_subscriptions").delete().eq("id", s.id);
        }
        failed++;
        step.pushes.push({ ok: false, status: st, err: msg.slice(0, 200) });
      }
    }
    steps.push(step);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      server_now_utc: now.toISOString(),
      matched: due.length,
      sent,
      skipped,
      failed,
      debug_near_miss_same_day: nearMiss,
      debug_steps: steps,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
