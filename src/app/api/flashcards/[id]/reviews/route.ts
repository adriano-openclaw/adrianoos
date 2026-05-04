import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

async function sessionId() { return (await cookies()).get("adrianoos_session")?.value ?? ""; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const { data, error } = await getSupabase().rpc("adrianoos_review_card", { p_session_id: await sessionId(), p_flashcard_id: id, p_rating: body?.rating });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Failed." }, { status: 400 });
  return NextResponse.json({ ok: true, ...data });
}
