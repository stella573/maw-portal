import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { syncFromPersonio } from "@/services/admin/personio";

/**
 * Geplanter Personio-Sync (Vercel Cron). Schutz über ein Bearer-Secret:
 *   Authorization: Bearer <PERSONIO_SYNC_SECRET | CRON_SECRET>
 * Vercel Cron sendet bei gesetztem CRON_SECRET automatisch diesen Header.
 *
 * Der manuelle Sync läuft über die Server-Action (employees.manage); dieser
 * Endpoint ist nur für den Zeitplan gedacht.
 */
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const env = getServerEnv();
  const secret = env.PERSONIO_SYNC_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  try {
    const result = await syncFromPersonio();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[personio/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync fehlgeschlagen" },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
