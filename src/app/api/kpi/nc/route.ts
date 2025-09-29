import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { mapNonConformityDoc } from "@/lib/firestore/nc";
import {
  calcAvgContainmentHours,
  calcAvgResolutionHours,
  calcOnTimePercentage,
  calcRecurrenceRate,
  countOpenedBySeverity,
  groupByDayWeek,
  groupByRootCause,
  groupBySystem,
} from "@/lib/kpis/nc";
import type { NcAction, NonConformity } from "@/types/nonconformity";

export const dynamic = "force-dynamic";

const MAX_FETCH = 500;

function completedAt(action?: NcAction): Date | null {
  if (!action?.completedAt) return null;
  const date = new Date(action.completedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstCompletedCorrective(actions: NcAction[] | undefined): NcAction | undefined {
  return actions?.find((action) => action.type === "corretiva" && Boolean(action.completedAt));
}

function filterClosedInMonth(records: NonConformity[], reference: Date): NonConformity[] {
  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return records.filter((record) => {
    if (record.status !== "resolvida") return false;
    const corrective = firstCompletedCorrective(record.actions);
    const completed = completedAt(corrective);
    if (!completed) return false;
    return completed >= monthStart && completed <= monthEnd;
  });
}

function filterRecent(records: NonConformity[], days: number): NonConformity[] {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return records.filter((record) => new Date(record.createdAt).getTime() >= threshold);
}

function buildSeverityBySystem(records: NonConformity[]) {
  const map = new Map<string, { alta: number; media: number; baixa: number }>();
  for (const record of records) {
    const key = record.systemCategory ?? "Não classificado";
    if (!map.has(key)) {
      map.set(key, { alta: 0, media: 0, baixa: 0 });
    }
    const bucket = map.get(key)!;
    const severity = record.severity ?? "media";
    if (severity === "alta" || severity === "media" || severity === "baixa") {
      bucket[severity] += 1;
    } else {
      bucket.media += 1;
    }
  }
  return Array.from(map.entries()).map(([system, counts]) => ({ system, ...counts }));
}

export async function GET() {
  try {
    const snapshot = await adminDb
      .collection("nonConformities")
      .orderBy("createdAt", "desc")
      .limit(MAX_FETCH)
      .get();

    const records = snapshot.docs.map((docSnap) => mapNonConformityDoc(docSnap));
    const now = new Date();

    const openRecords = records.filter((record) => record.status !== "resolvida");
    const closedThisMonth = filterClosedInMonth(records, now);
    const recentRecords = filterRecent(records, 30);

    const dailySeries = groupByDayWeek(records, "day");
    const weeklySeries = groupByDayWeek(records, "week");

    const rootCauseParetoMap = groupByRootCause(records.filter((record) => Boolean(record.rootCause)));
    const rootCausePareto = Object.entries(rootCauseParetoMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rootCause, value]) => ({ rootCause, value }));

    const systemBreakdownMap = groupBySystem(records);
    const systemBreakdown = Object.entries(systemBreakdownMap).map(([system, value]) => ({
      system,
      value,
    }));

    const severityBySystem = buildSeverityBySystem(records);

    const openBySeverity = countOpenedBySeverity(openRecords);
    const onTimePercentage = calcOnTimePercentage(closedThisMonth);
    const recurrence30d = calcRecurrenceRate(recentRecords);
    const avgContainmentHours = calcAvgContainmentHours(records);
    const avgResolutionHours = calcAvgResolutionHours(records);

    return NextResponse.json({
      openTotal: openRecords.length,
      openBySeverity,
      onTimePercentage,
      recurrence30d,
      avgContainmentHours,
      avgResolutionHours,
      series: {
        daily: dailySeries,
        weekly: weeklySeries,
      },
      rootCausePareto,
      systemBreakdown,
      severityBySystem,
    });
  } catch (error) {
    console.error("GET /api/kpi/nc failed", error);
    return NextResponse.json({ error: "Falha ao calcular KPIs" }, { status: 500 });
  }
}

