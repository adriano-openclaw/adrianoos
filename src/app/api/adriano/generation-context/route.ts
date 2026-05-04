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

  const { data, error } = await getSupabase().rpc("adrianoos_generation_context", { p_secret: auth.cronSecret });
  if (error || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? error?.message ?? "Generation context unavailable." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mode: "adriano_openclaw_research_generation_handoff",
    instruction: data.generationTask === "research_sprint_overview"
      ? "Research the requested topic externally as Adriano/OpenClaw, then POST a researched 7-day overview to /api/adriano/overview with the same Bearer secret. The app has no embedded LLM provider key."
      : "Research focused source material externally as Adriano/OpenClaw, then POST learnable_json and flashcards_json to /api/adriano/day-content with the same Bearer secret. The app has no embedded LLM provider key.",
    context: data,
  });
}
