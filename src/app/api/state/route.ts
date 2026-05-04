import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function GET() {
  const { data, error } = await getSupabase().rpc("adrianoos_get_state", { p_session_id: await sessionId() });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, state: data.state });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const { data, error } = await getSupabase().rpc("adrianoos_save_state", { p_session_id: await sessionId(), p_state: body });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: "Save failed" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
