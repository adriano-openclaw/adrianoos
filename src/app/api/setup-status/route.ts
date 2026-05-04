import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await getSupabase().rpc("adrianoos_setup_status");
  if (error) return NextResponse.json({ ok: false, setupComplete: true, error: error.message }, { status: 200 });
  return NextResponse.json({ ok: true, setupComplete: Boolean(data?.setup_complete) });
}
