import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const sessionId = (await cookies()).get("adrianoos_session")?.value ?? "";
  if (!sessionId) return NextResponse.json({ ok: true, authenticated: false });
  const { data, error } = await getSupabase().rpc("adrianoos_active_snapshot", { p_session_id: sessionId });
  return NextResponse.json({ ok: true, authenticated: Boolean(!error && data?.ok) });
}
