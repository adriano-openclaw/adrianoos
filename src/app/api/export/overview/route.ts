import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function GET() {
  const { data, error } = await getSupabase().rpc("adrianoos_active_snapshot", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    schemaVersion: 1,
    exportType: "sprint_overview",
    exportedAt: new Date().toISOString(),
    activeSprint: data.activeSprint,
    overview: data.activeSprint?.overview_json ?? null,
  });
}
