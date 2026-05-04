import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function authorized(request: Request) {
  const cronSecret = process.env.ADRIANOOS_CRON_SECRET;
  if (!cronSecret) return { ok: false, error: "Cron secret is not configured.", status: 500 };
  return request.headers.get("authorization") === `Bearer ${cronSecret}`
    ? { ok: true, cronSecret }
    : { ok: false, error: "Unauthorized Adriano generation context request.", status: 401 };
}

export async function GET(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { data, error } = await getSupabase().rpc("adrianoos_cron_active_state", { p_secret: auth.cronSecret });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Generation context unavailable." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mode: "adriano_openclaw_generation_handoff",
    instruction: "Use this context to generate the current day learnable_json and flashcards_json externally, then POST them to /api/adriano/day-content with the same Bearer secret.",
    context: data,
  });
}
