import { describe, expect, it } from "vitest";
import type { NonConformity } from "@/types/nonconformity";
import { matchesFilters } from "@/app/api/nc/filters";

const sampleNc = (overrides: Partial<NonConformity>): NonConformity => ({
  id: crypto.randomUUID(),
  title: "Teste motor",
  description: "NC de teste",
  severity: "alta",
  status: "aberta",
  createdAt: "2024-02-10T08:00:00Z",
  dueAt: "2024-02-12T08:00:00Z",
  createdBy: { id: "user", matricula: "001" },
  linkedAsset: { id: "asset-1", tag: "MCH-01" },
  linkedTemplateId: "template",
  source: "checklist_question",
  originChecklistResponseId: "resp-1",
  yearMonth: "2024-02",
  severityRank: 3,
  actions: [],
  ...overrides,
});

describe("matchesFilters", () => {
  const record = sampleNc({
    severity: "media",
    severityRank: 2,
    description: "Falha hidraulica",
    createdAt: "2024-02-15T10:00:00Z",
  });

  it("filters by status and severity", () => {
    expect(
      matchesFilters(record, {
        statuses: ["aberta"],
        severities: ["media"],
        assetId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        query: undefined,
      }),
    ).toBe(true);

    expect(
      matchesFilters(record, {
        statuses: ["resolvida"],
        severities: ["media"],
        assetId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        query: undefined,
      }),
    ).toBe(false);
  });

  it("matches date range and asset filters", () => {
    expect(
      matchesFilters(record, {
        statuses: [],
        severities: [],
        assetId: "asset-1",
        dateFrom: "2024-02-01",
        dateTo: "2024-02-28",
        query: undefined,
      }),
    ).toBe(true);

    expect(
      matchesFilters(record, {
        statuses: [],
        severities: [],
        assetId: "asset-2",
        dateFrom: undefined,
        dateTo: undefined,
        query: undefined,
      }),
    ).toBe(false);
  });

  it("performs text search across title and description", () => {
    expect(
      matchesFilters(record, {
        statuses: [],
        severities: [],
        assetId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        query: "hidraulica",
      }),
    ).toBe(true);

    expect(
      matchesFilters(record, {
        statuses: [],
        severities: [],
        assetId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        query: "eletrico",
      }),
    ).toBe(false);
  });
});
