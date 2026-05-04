import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST() {
  const { data, error } = await getSupabase().rpc("adrianoos_start_sprint", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Sprint start failed." }, { status: 400 });
  return NextResponse.json({ ok: true, ...data, dayContentTiming: "generated_by_5am_cron" });
}
