import { describe, expect, it } from "vitest";
import {
  calcAvgContainmentHours,
  calcAvgResolutionHours,
  calcOnTimePercentage,
  calcRecurrenceRate,
  groupByDayWeek,
} from "@/lib/kpis/nc";
import type { NcAction, NonConformity } from "@/types/nonconformity";

const baseNc = (overrides: Partial<NonConformity>): NonConformity => ({
  id: crypto.randomUUID(),
  title: "Teste",
  severity: "media",
  status: "resolvida",
  createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
  createdBy: { id: "user", matricula: "000", nome: "Seed" },
  linkedAsset: { id: "asset", tag: "TAG-1" },
  source: "checklist_question",
  originChecklistResponseId: "response-1",
  yearMonth: "2024-01",
  severityRank: 2,
  actions: [],
  ...overrides,
});

const corrective = (overrides: Partial<NcAction> = {}): NcAction => ({
  id: crypto.randomUUID(),
  type: "corretiva",
  description: "Acao corretiva",
  startedAt: new Date("2024-01-01T02:00:00Z").toISOString(),
  completedAt: new Date("2024-01-01T04:00:00Z").toISOString(),
  ...overrides,
});

describe("kpi helpers", () => {
  it("calculates on time percentage considering only resolved NCs", () => {
    const records: NonConformity[] = [
      baseNc({
        dueAt: new Date("2024-01-02T00:00:00Z").toISOString(),
        actions: [corrective()],
      }),
      baseNc({
        id: "late",
        dueAt: new Date("2024-01-01T01:00:00Z").toISOString(),
        actions: [corrective({ completedAt: new Date("2024-01-01T06:00:00Z").toISOString() })],
      }),
      baseNc({ id: "open", status: "aberta", actions: [] }),
    ];

    expect(calcOnTimePercentage(records)).toBeCloseTo(50);
  });

  it("computes recurrence rate over the provided window", () => {
    const records: NonConformity[] = [
      baseNc({ id: "a", recurrenceOfId: "x" }),
      baseNc({ id: "b", recurrenceOfId: null }),
      baseNc({ id: "c", recurrenceOfId: "y" }),
    ];
    expect(calcRecurrenceRate(records)).toBeCloseTo(66.7, 1);
  });

  it("averages containment and resolution hours", () => {
    const records: NonConformity[] = [
      baseNc({
        id: "r1",
        createdAt: "2024-01-01T00:00:00Z",
        actions: [
          {
            id: "a1",
            type: "corretiva",
            description: "Primeira acao",
            startedAt: "2024-01-01T01:00:00Z",
            completedAt: "2024-01-01T03:00:00Z",
          },
        ],
      }),
      baseNc({
        id: "r2",
        createdAt: "2024-01-02T00:00:00Z",
        actions: [
          {
            id: "a2",
            type: "corretiva",
            description: "Segunda acao",
            startedAt: "2024-01-02T02:00:00Z",
            completedAt: "2024-01-02T05:00:00Z",
          },
        ],
      }),
    ];

    expect(calcAvgContainmentHours(records)).toBeCloseTo(1.5, 5);
    expect(calcAvgResolutionHours(records)).toBeCloseTo(4.0, 5);
  });

  it("groups counts by day and week", () => {
    const records: NonConformity[] = [
      baseNc({ id: "d1", createdAt: "2024-01-01T08:00:00Z" }),
      baseNc({ id: "d2", createdAt: "2024-01-02T10:00:00Z" }),
      baseNc({ id: "d3", createdAt: "2024-01-08T09:00:00Z" }),
    ];
    const grouped = groupByDayWeek(records, "week");
    expect(grouped.length).toBeGreaterThanOrEqual(2);
    expect(grouped[0].opened).toBeGreaterThan(0);
  });
});
