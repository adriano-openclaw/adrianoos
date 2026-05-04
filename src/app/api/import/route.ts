import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  return NextResponse.json({ ok: true, note: "JSON received. Production path validates with Zod and persists to Supabase." });
}
