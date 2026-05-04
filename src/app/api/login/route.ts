import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  const { data, error } = await getSupabase().rpc("adrianoos_login_password", { p_password: body?.password ?? "", p_legacy_token: process.env.ADRIANOOS_SETUP_TOKEN ?? "" });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: "Invalid password." }, { status: 401 });
  const cookieStore = await cookies();
  cookieStore.set("adrianoos_session", data.session_id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return NextResponse.json({ ok: true });
}
