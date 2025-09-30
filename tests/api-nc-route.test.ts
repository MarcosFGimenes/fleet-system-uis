import { NextRequest } from "next/server";
import { Timestamp, type OrderByDirection, type WhereFilterOp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/nc/route";

class FakeDocSnapshot {
  constructor(private readonly idValue: string, private readonly dataValue: Record<string, unknown>) {}

  get id() {
    return this.idValue;
  }

  data() {
    return this.dataValue;
  }
}

type Filter = { field: string; op: WhereFilterOp; value: unknown };

type NcDoc = { id: string; data: Record<string, unknown> };

function getValueByPath(data: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = data;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

class FakeNcQuery {
  static triggerMissingIndexOnce = false;

  constructor(
    private readonly docs: NcDoc[],
    private readonly filters: Filter[] = [],
    private readonly orderByField: string | null = null,
    private readonly orderDirection: OrderByDirection = "desc",
    private readonly limitValue?: number,
  ) {}

  where(field: string, op: WhereFilterOp, value: unknown) {
    if (op !== "==" && op !== ">=" && op !== "<=") {
      throw new Error(`Unsupported operator ${op}`);
    }
    return new FakeNcQuery(this.docs, [...this.filters, { field, op, value }], this.orderByField, this.orderDirection, this.limitValue);
  }

  orderBy(field: string, direction: OrderByDirection = "desc") {
    return new FakeNcQuery(this.docs, this.filters, field, direction, this.limitValue);
  }

  limit(value: number) {
    return new FakeNcQuery(this.docs, this.filters, this.orderByField, this.orderDirection, value);
  }

  async get() {
    if (FakeNcQuery.triggerMissingIndexOnce && this.orderByField === "createdAtTs") {
      FakeNcQuery.triggerMissingIndexOnce = false;
      const error = new Error("missing index");
      (error as { code?: unknown }).code = "FAILED_PRECONDITION";
      throw error;
    }

    let results = this.docs.slice();

    for (const filter of this.filters) {
      results = results.filter((doc) => {
        const fieldValue = getValueByPath(doc.data, filter.field);
        if (filter.op === "==") {
          return fieldValue === filter.value;
        }
        if (!(fieldValue instanceof Timestamp) || !(filter.value instanceof Timestamp)) {
          return false;
        }
        if (filter.op === ">=") {
          return fieldValue.toMillis() >= filter.value.toMillis();
        }
        if (filter.op === "<=") {
          return fieldValue.toMillis() <= filter.value.toMillis();
        }
        return false;
      });
    }

    if (this.orderByField) {
      const field = this.orderByField;
      const direction = this.orderDirection;
      results.sort((a, b) => {
        const valueA = getValueByPath(a.data, field);
        const valueB = getValueByPath(b.data, field);

        if (valueA instanceof Timestamp && valueB instanceof Timestamp) {
          return valueA.toMillis() - valueB.toMillis();
        }

        const dateA = typeof valueA === "string" ? new Date(valueA).getTime() : 0;
        const dateB = typeof valueB === "string" ? new Date(valueB).getTime() : 0;
        return dateA - dateB;
      });
      if (direction === "desc") {
        results.reverse();
      }
    }

    if (typeof this.limitValue === "number") {
      results = results.slice(0, this.limitValue);
    }

    return {
      docs: results.map((doc) => new FakeDocSnapshot(doc.id, doc.data)),
    };
  }
}

let currentDb: { collection: (name: string) => unknown };

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => currentDb,
}));

const baseDoc: NcDoc = {
  id: "nc-1",
  data: {
    title: "Falha no sensor",
    description: "Sensor de temperatura",
    severity: "alta",
    safetyRisk: true,
    impactAvailability: false,
    status: "aberta",
    dueAt: "2025-10-01T16:04:15.201Z",
    createdAt: "2025-09-29T16:04:15.201Z",
    createdAtTs: Timestamp.fromDate(new Date("2025-09-29T16:04:15.201Z")),
    createdBy: { id: "user-1", matricula: "123", nome: "Marcos" },
    linkedAsset: { id: "asset-1", tag: "MCH-1", modelo: "Modelo" },
    linkedTemplateId: "template-1",
    source: "checklist_question",
    originChecklistResponseId: "resp-1",
    originQuestionId: "q1",
    rootCause: "Fadiga",
    actions: [
      { id: "act-1", type: "corretiva", description: "Reparo", owner: { id: "tech-1", nome: "Técnico" } },
    ],
    systemCategory: "Motor",
  },
};

const olderDoc: NcDoc = {
  id: "nc-2",
  data: {
    title: "Ruído na transmissão",
    description: "Verificar engrenagens",
    severity: "baixa",
    status: "resolvida",
    dueAt: "2025-08-01T08:00:00.000Z",
    createdAt: "2025-08-25T09:15:00.000Z",
    createdAtTs: Timestamp.fromDate(new Date("2025-08-25T09:15:00.000Z")),
    createdBy: { id: "user-2", matricula: "999", nome: "Joana" },
    linkedAsset: { id: "asset-2", tag: "TRK-2", modelo: "Transmissão" },
    linkedTemplateId: "template-2",
    source: "checklist_extra",
    originChecklistResponseId: "resp-2",
    systemCategory: "Transmissão",
  },
};

function createDb(docs: NcDoc[]) {
  return {
    collection(name: string) {
      if (name === "nonConformities") {
        return new FakeNcQuery(docs);
      }
      throw new Error(`Unknown collection ${name}`);
    },
  };
}

beforeEach(() => {
  FakeNcQuery.triggerMissingIndexOnce = false;
  currentDb = createDb([baseDoc, olderDoc]);
});

describe("GET /api/nc", () => {
  it("returns paginated non conformities filtered by query params", async () => {
    const request = new NextRequest(
      "http://localhost/api/nc?page=1&pageSize=20&status=aberta&severity=alta&assetId=asset-1&templateId=template-1&operatorMatricula=123&q=sensor&dateFrom=2025-09-01&dateTo=2025-09-30",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    const [record] = payload.data;
    expect(record.id).toBe("nc-1");
    expect(record.title).toBe("Falha no sensor");
    expect(record.actions?.[0]?.description).toBe("Reparo");
    expect(payload.total).toBe(1);
    expect(payload.hasMore).toBe(false);
  });

  it("allows filtering using machineId", async () => {
    const request = new NextRequest(
      "http://localhost/api/nc?page=1&pageSize=20&status=aberta&machineId=asset-1",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe("nc-1");
    expect(payload.total).toBe(1);
    expect(payload.hasMore).toBe(false);
  });

  it("validates query params", async () => {
    const request = new NextRequest("http://localhost/api/nc?page=0&dateFrom=2024-02-10&dateTo=2024-02-01");
    const response = await GET(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Bad Request");
  });

  it("falls back to createdAt ordering when createdAtTs index is missing", async () => {
    FakeNcQuery.triggerMissingIndexOnce = true;
    const request = new NextRequest("http://localhost/api/nc");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0].id).toBe("nc-1");
    expect(payload.data[1].id).toBe("nc-2");
  });
});
