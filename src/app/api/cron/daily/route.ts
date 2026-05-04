import { NextResponse } from "next/server";

export async function GET() {
  const channelId = process.env.DISCORD_LEARNABLES_CHANNEL_ID ?? "1500687653798940822";
  const report = [
    "**Today’s Learnables — AdrianoOS MVP**",
    "",
    "- Fetch active sprint and progress from Supabase.",
    "- If yesterday is incomplete, assign catch-up work first.",
    "- If ready, generate today’s learnable JSON and flashcards.",
    "- Save generated JSON and report metadata.",
    `- Send to Discord channel <#${channelId}>.`,
    "",
    "**Summary:** This endpoint is the scheduled integration seam. Wire it to a 5 AM Asia/Manila cron once Supabase app credentials and Discord send credentials are configured.",
  ].join("\n");

  return NextResponse.json({ ok: true, channelId, timezone: "Asia/Manila", report });
}
