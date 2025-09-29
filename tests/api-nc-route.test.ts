import { NextRequest } from "next/server";
import {
  Timestamp,
  type WhereFilterOp,
  type OrderByDirection,
} from "firebase-admin/firestore";

import { describe, expect, it, beforeEach, vi } from "vitest";

import { GET } from "@/app/api/nc/route";

class FakeDocSnapshot {
  constructor(private readonly idValue: string, private readonly dataValue: Record<string, unknown>, private readonly createTimeValue: Timestamp | null) {}

  get id() {
    return this.idValue;
  }

  get createTime() {
    return this.createTimeValue;
  }

  data() {
    return this.dataValue;
  }
}

type Filter = { field: string; op: "==" | ">=" | "<="; value: unknown };

type ResponseDoc = {
  id: string;
  data: Record<string, unknown>;
  createTime?: Timestamp | null;
};

class FakeResponseQuery {
  static triggerMissingIndexOnce = false;

  constructor(
    private readonly docs: ResponseDoc[],
    private readonly filters: Filter[] = [],
    private readonly orderByField: string | null = null,
    private readonly orderDirection: "asc" | "desc" = "desc",
    private readonly limitValue?: number,
  ) {}

  where(field: string, op: WhereFilterOp, value: unknown) {

    if (op !== "==" && op !== ">=" && op !== "<=") {
      throw new Error(`Unsupported operator ${op}`);
    }
    return new FakeResponseQuery(this.docs, [...this.filters, { field, op, value }], this.orderByField, this.orderDirection, this.limitValue);
  }

  orderBy(field: string, direction: OrderByDirection = "desc") {

    return new FakeResponseQuery(this.docs, this.filters, field, direction, this.limitValue);
  }

  limit(value: number) {
    return new FakeResponseQuery(this.docs, this.filters, this.orderByField, this.orderDirection, value);
  }

  async get() {
    if (FakeResponseQuery.triggerMissingIndexOnce) {
      FakeResponseQuery.triggerMissingIndexOnce = false;
      const error = new Error("missing index for createdAtTs");
      (error as { code?: unknown }).code = "FAILED_PRECONDITION";
      throw error;
    }

    let results = this.docs.slice();

    for (const filter of this.filters) {
      results = results.filter((doc) => {
        const fieldValue = doc.data[filter.field];
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
      results.sort((a, b) => {
        const valueA = a.data[this.orderByField as keyof typeof a.data];
        const valueB = b.data[this.orderByField as keyof typeof b.data];
        const millisA = valueA instanceof Timestamp ? valueA.toMillis() : 0;
        const millisB = valueB instanceof Timestamp ? valueB.toMillis() : 0;
        return millisA - millisB;
      });
      if (this.orderDirection === "desc") {
        results.reverse();
      }
    }

    if (typeof this.limitValue === "number") {
      results = results.slice(0, this.limitValue);
    }

    return {
      docs: results.map((doc) => new FakeDocSnapshot(doc.id, doc.data, doc.createTime ?? null)),
    };
  }
}

class FakeTemplateCollection {
  constructor(private readonly templates: Map<string, Record<string, unknown>>) {}

  doc(id: string) {
    const { templates } = this;
    return {
      async get() {
        const data = templates.get(id);
        return {
          exists: Boolean(data),
          data: () => data,
        };
      },
    };
  }
}

let currentDb: { collection: (name: string) => unknown };

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => currentDb,
}));

function createDb(responses: ResponseDoc[], templates: Map<string, Record<string, unknown>>) {
  return {
    collection(name: string) {
      if (name === "checklistResponses") {
        return new FakeResponseQuery(responses);
      }
      if (name === "checklistTemplates") {
        return new FakeTemplateCollection(templates);
      }
      throw new Error(`Unknown collection ${name}`);
    },
  };
}

const baseTemplate = {
  title: "Checklist Diário Tratores",
  type: "operador",
  questions: [
    { id: "q1", text: "Há sinais de vazamentos?", requiresPhoto: true },
    { id: "q2", text: "Painel intacto?", requiresPhoto: false },
  ],
};

const baseResponse = {
  id: "resp-1",
  data: {
    machineId: "machine-1",
    templateId: "tpl-1",
    operatorMatricula: "2047942",
    operatorNome: "Marcos F G",
    horimetro: 233,
    createdAtTs: Timestamp.fromDate(new Date("2025-09-29T16:04:15.201Z")),
    answers: [
      { questionId: "q1", response: "nc", photoUrls: ["https://example.com/photo-1.jpg"] },
      { questionId: "q2", response: "ok" },
    ],
  },
};

beforeEach(() => {
  FakeResponseQuery.triggerMissingIndexOnce = false;

  currentDb = createDb([baseResponse], new Map([["tpl-1", baseTemplate]]));
});

describe("GET /api/nc", () => {
  it("returns exploded NCs enriched with template info", async () => {
    const request = new NextRequest("http://localhost/api/nc");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
    const nc = payload.data[0];
    expect(nc.id).toBe("nc::resp-1::q1");
    expect(nc.templateTitle).toBe("Checklist Diário Tratores");
    expect(nc.questionText).toContain("vazamentos");
    expect(nc.evidenceStatus).toBe("ok");
    expect(nc.photoUrls).toEqual(["https://example.com/photo-1.jpg"]);
  });

  it("validates query params", async () => {
    const request = new NextRequest("http://localhost/api/nc?page=0&from=2024-02-10T00:00:00.000Z&to=2024-02-01T00:00:00.000Z");
    const response = await GET(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Bad Request");
  });

  it("marks evidence as missing when photo is required", async () => {
    const responseWithMissingPhoto: ResponseDoc = {
      id: "resp-2",
      data: {
        machineId: "machine-2",
        templateId: "tpl-1",
        operatorMatricula: "999",
        operatorNome: "Sem Foto",
        createdAtTs: Timestamp.fromDate(new Date("2025-10-01T12:00:00.000Z")),
        answers: [{ questionId: "q1", response: "nc" }],
      },
    };
    currentDb = createDb([responseWithMissingPhoto], new Map([["tpl-1", baseTemplate]]));

    const request = new NextRequest("http://localhost/api/nc");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data[0].evidenceStatus).toBe("missing_required_photo");
  });

  it("falls back to unindexed query when Firestore reports missing index", async () => {
    FakeResponseQuery.triggerMissingIndexOnce = true;
    const request = new NextRequest("http://localhost/api/nc");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toHaveLength(1);
  });
});
