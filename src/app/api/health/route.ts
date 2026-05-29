import { NextResponse } from "next/server";

/** Einfacher Health-Check für Uptime-Monitoring / Vercel. */
export function GET() {
  return NextResponse.json({ status: "ok", service: "maw-portal" });
}
