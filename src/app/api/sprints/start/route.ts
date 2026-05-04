import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function POST() {
  const sid = await sessionId();
  if (!validUuid(sid)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getSupabase().rpc("adrianoos_start_sprint", { p_session_id: sid });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Sprint start failed." }, { status: 400 });
  return NextResponse.json({ ok: true, ...data, dayContentTiming: "generated_by_5am_cron" });
}
