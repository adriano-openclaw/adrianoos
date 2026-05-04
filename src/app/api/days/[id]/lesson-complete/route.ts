import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabase().rpc("adrianoos_mark_lesson_complete", { p_session_id: await sessionId(), p_learning_day_id: id });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Failed." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
