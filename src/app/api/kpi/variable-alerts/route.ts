import { NextRequest, NextResponse } from "next/server";
import { loadVariableAlerts } from "@/lib/kpis/variable-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const result = await loadVariableAlerts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/kpi/variable-alerts failed", error);
    const message = error instanceof Error ? error.message : "Falha ao carregar alertas de variáveis.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

