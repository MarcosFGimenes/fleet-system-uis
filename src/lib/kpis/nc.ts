import type { NcAction, NonConformity } from "@/types/nonconformity";

type TimeGranularity = "day" | "week";

export type TimeSeriesPoint = {
  period: string;
  opened: number;
  closed: number;
};

function getFirstCorrectiveAction(actions?: NcAction[]): NcAction | undefined {
  return actions?.find((action) => action.type === "corretiva");
}

function getCompletedCorrectiveAction(actions?: NcAction[]): NcAction | undefined {
  return actions?.find((action) => action.type === "corretiva" && Boolean(action.completedAt));
}

function hoursBetween(startISO?: string, endISO?: string): number | undefined {
  if (!startISO || !endISO) return undefined;
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  return (end - start) / (1000 * 60 * 60);
}

export function calcOnTimePercentage(records: NonConformity[]): number {
  const closed = records.filter((record) => record.status === "resolvida" && record.dueAt);
  if (!closed.length) return 0;
  const onTime = closed.filter((record) => {
    const action = getCompletedCorrectiveAction(record.actions);
    if (!action?.completedAt) return false;
    const due = new Date(record.dueAt as string);
    const completed = new Date(action.completedAt);
    if (Number.isNaN(due.getTime()) || Number.isNaN(completed.getTime())) return false;
    return completed.getTime() <= due.getTime();
  }).length;
  return Number(((onTime / closed.length) * 100).toFixed(1));
}

export function calcRecurrenceRate(records: NonConformity[]): number {
  if (!records.length) return 0;
  const recurrent = records.filter((record) => Boolean(record.recurrenceOfId)).length;
  return Number(((recurrent / records.length) * 100).toFixed(1));
}

export function calcAvgContainmentHours(records: NonConformity[]): number {
  const durations: number[] = [];
  for (const record of records) {
    const action = getFirstCorrectiveAction(record.actions);
    const duration = hoursBetween(record.createdAt, action?.startedAt);
    if (typeof duration === "number") {
      durations.push(duration);
    }
  }
  if (durations.length === 0) return 0;
  const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return Number(avg.toFixed(1));
}

export function calcAvgResolutionHours(records: NonConformity[]): number {
  const durations: number[] = [];
  for (const record of records) {
    const action = getCompletedCorrectiveAction(record.actions);
    const duration = hoursBetween(record.createdAt, action?.completedAt);
    if (typeof duration === "number") {
      durations.push(duration);
    }
  }
  if (durations.length === 0) return 0;
  const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return Number(avg.toFixed(1));
}

function formatPeriod(date: Date, granularity: TimeGranularity): string {
  if (granularity === "week") {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function collectPeriods(records: NonConformity[], granularity: TimeGranularity): Set<string> {
  const periods = new Set<string>();
  for (const record of records) {
    const created = new Date(record.createdAt);
    if (!Number.isNaN(created.getTime())) {
      periods.add(formatPeriod(created, granularity));
    }
    const action = getCompletedCorrectiveAction(record.actions);
    if (action?.completedAt) {
      const completed = new Date(action.completedAt);
      if (!Number.isNaN(completed.getTime())) {
        periods.add(formatPeriod(completed, granularity));
      }
    }
  }
  return periods;
}

export function groupByDayWeek(
  records: NonConformity[],
  granularity: TimeGranularity = "day",
): TimeSeriesPoint[] {
  if (records.length === 0) return [];
  const periods = Array.from(collectPeriods(records, granularity)).sort();
  const openedMap = new Map<string, number>();
  const closedMap = new Map<string, number>();

  for (const record of records) {
    const created = new Date(record.createdAt);
    if (!Number.isNaN(created.getTime())) {
      const period = formatPeriod(created, granularity);
      openedMap.set(period, (openedMap.get(period) ?? 0) + 1);
    }
    const action = getCompletedCorrectiveAction(record.actions);
    if (action?.completedAt) {
      const completed = new Date(action.completedAt);
      if (!Number.isNaN(completed.getTime())) {
        const period = formatPeriod(completed, granularity);
        closedMap.set(period, (closedMap.get(period) ?? 0) + 1);
      }
    }
  }

  return periods.map((period) => ({
    period,
    opened: openedMap.get(period) ?? 0,
    closed: closedMap.get(period) ?? 0,
  }));
}

export function countOpenedBySeverity(records: NonConformity[]): Record<string, number> {
  return records.reduce<Record<string, number>>((acc, record) => {
    const key = record.severity ?? "sem_classificacao";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export function groupByRootCause(records: NonConformity[]): Record<string, number> {
  return records.reduce<Record<string, number>>((acc, record) => {
    const key = record.rootCause?.trim() || "Sem causa definida";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export function groupBySystem(records: NonConformity[]): Record<string, number> {
  return records.reduce<Record<string, number>>((acc, record) => {
    const key = record.systemCategory || "Nao classificado";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
