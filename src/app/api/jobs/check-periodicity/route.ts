import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadPeriodicityCompliance } from "@/lib/kpis/periodicity";

export const dynamic = "force-dynamic";

const TTL_MINUTES = 15;

export async function GET() {
  try {
    const result = await loadPeriodicityCompliance();
    const db = getAdminDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60 * 1000);

    await db
      .collection("kpiCache")
      .doc("periodicity")
      .set({
        generatedAt: result.generatedAt,
        summary: result.summary,
        items: result.items,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

    return NextResponse.json({ ok: true, generatedAt: result.generatedAt, summary: result.summary });
  } catch (error) {
    console.error("GET /api/jobs/check-periodicity failed", error);
    return NextResponse.json({ error: "Falha ao executar job" }, { status: 500 });
  }
}
