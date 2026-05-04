import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { tokenName?: string; password?: string } | null;
  const tokenName = body?.tokenName?.trim() ?? "";
  const password = body?.password?.trim() ?? "";
  if (!tokenName || password.length < 8) return NextResponse.json({ ok: false, error: "Token name and 8+ character password are required." }, { status: 400 });
  const { data, error } = await getSupabase().rpc("adrianoos_setup", { p_token_name: tokenName, p_password: password });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Setup failed." }, { status: 400 });
  const cookieStore = await cookies();
  cookieStore.set("adrianoos_session", data.session_id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return NextResponse.json({ ok: true, setupComplete: true });
}
