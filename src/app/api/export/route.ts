import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, note: "Client-side export is available in the Import / Export tab. Supabase-backed export will stream persisted sprint JSON here." });
}
