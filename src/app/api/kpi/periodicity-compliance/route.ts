import { NextRequest, NextResponse } from "next/server";
import { loadPeriodicityCompliance } from "@/lib/kpis/periodicity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const machineIdParam = url.searchParams.get("machineId");
  const templateIdParam = url.searchParams.get("templateId");

  const from = parseDate(fromParam);
  if (fromParam && !from) {
    return NextResponse.json({ error: "Parâmetro from inválido" }, { status: 400 });
  }

  const to = parseDate(toParam);
  if (toParam && !to) {
    return NextResponse.json({ error: "Parâmetro to inválido" }, { status: 400 });
  }

  if (from && to && from.getTime() > to.getTime()) {
    return NextResponse.json({ error: "Intervalo inválido: from deve ser menor que to" }, { status: 400 });
  }

  const machineId = machineIdParam?.trim() ? machineIdParam.trim() : undefined;
  const templateId = templateIdParam?.trim() ? templateIdParam.trim() : undefined;

  try {
    const result = await loadPeriodicityCompliance({
      filters: {
        from: from,
        to: to,
        machineId,
        templateId,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/kpi/periodicity-compliance failed", error);
    return NextResponse.json({ error: "Falha ao calcular conformidade" }, { status: 500 });
  }
}
