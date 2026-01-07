import { NextRequest, NextResponse } from "next/server";
import { loadVariablePeriodicity } from "@/lib/kpis/variable-periodicity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await loadVariablePeriodicity();
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/kpi/variable-periodicity failed", error);
    const message = error instanceof Error ? error.message : "Falha ao carregar periodicidade de variáveis.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

