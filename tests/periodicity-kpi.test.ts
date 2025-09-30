import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getPeriodicityCompliance } from "@/app/api/kpi/periodicity-compliance/route";
import { PATCH as patchTemplatePeriodicity } from "@/app/api/templates/[templateId]/periodicity/route";
import { loadPeriodicityCompliance } from "@/lib/kpis/periodicity";
import type { ChecklistTemplate } from "@/types/checklist";
import type { Machine } from "@/types/machine";

type TemplateDoc = {
  id: string;
  data: Omit<ChecklistTemplate, "id">;
};

type MachineDoc = {
  id: string;
  data: Omit<Machine, "id">;
};

type ResponseDoc = {
  id: string;
  templateId: string;
  machineId: string;
  createdAt: string;
};

class FakeDocSnapshot<T> {
  constructor(private readonly idValue: string, private readonly dataValue: T) {}

  get id() {
    return this.idValue;
  }

  data() {
    return this.dataValue;
  }
}

class FakeTemplateCollection {
  constructor(private readonly docs: TemplateDoc[]) {}

  where(field: string, op: string, value: unknown) {
    if (field !== "periodicity.active" || op !== "==") {
      throw new Error(`Unsupported template where ${field} ${op}`);
    }
    if (value !== true) {
      return new FakeTemplateCollection([]);
    }
    const filtered = this.docs.filter((doc) => doc.data.periodicity?.active);
    return new FakeTemplateCollection(filtered);
  }

  async get() {
    return { docs: this.docs.map((doc) => new FakeDocSnapshot(doc.id, doc.data)) };
  }

  doc(id: string) {
    const doc = this.docs.find((candidate) => candidate.id === id);
    return {
      async get() {
        if (!doc) {
          return { exists: false, data: () => undefined };
        }
        return { exists: true, data: () => doc.data };
      },
      async update(payload: { periodicity?: ChecklistTemplate["periodicity"] }) {
        if (!doc) {
          throw new Error("Template not found");
        }
        if (payload.periodicity) {
          doc.data.periodicity = payload.periodicity;
        }
      },
    };
  }
}

class FakeMachineCollection {
  constructor(private readonly docs: MachineDoc[]) {}

  async get() {
    return { docs: this.docs.map((doc) => new FakeDocSnapshot(doc.id, doc.data)) };
  }
}

type ResponseFilter = { field: string; op: "==" | "<="; value: unknown };

class FakeResponseQuery {
  constructor(
    private readonly docs: ResponseDoc[],
    private readonly filters: ResponseFilter[] = [],
    private readonly orderField: string | null = null,
    private readonly orderDirection: "asc" | "desc" = "desc",
    private readonly limitValue?: number,
  ) {}

  where(field: string, op: "==" | "<=", value: unknown) {
    return new FakeResponseQuery(this.docs, [...this.filters, { field, op, value }], this.orderField, this.orderDirection, this.limitValue);
  }

  orderBy(field: string, direction: "asc" | "desc" = "desc") {
    return new FakeResponseQuery(this.docs, this.filters, field, direction, this.limitValue);
  }

  limit(value: number) {
    return new FakeResponseQuery(this.docs, this.filters, this.orderField, this.orderDirection, value);
  }

  async get() {
    let results = this.docs.slice();
    for (const filter of this.filters) {
      if (filter.op === "==") {
        results = results.filter((doc) => (doc as Record<string, unknown>)[filter.field] === filter.value);
      } else if (filter.op === "<=") {
        if (typeof filter.value !== "string") {
          throw new Error("Expected ISO string for createdAt filter");
        }
        const threshold = new Date(filter.value).getTime();
        results = results.filter((doc) => new Date(doc.createdAt).getTime() <= threshold);
      }
    }

    if (this.orderField) {
      const direction = this.orderDirection;
      results.sort((a, b) => {
        if (this.orderField === "createdAt") {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return 0;
      });
      if (direction === "desc") {
        results.reverse();
      }
    }

    if (typeof this.limitValue === "number") {
      results = results.slice(0, this.limitValue);
    }

    return {
      empty: results.length === 0,
      docs: results.map((doc) => new FakeDocSnapshot(doc.id, doc)),
    };
  }
}

class FakeResponsesCollection {
  constructor(private readonly docs: ResponseDoc[]) {}

  where(field: string, op: "==" | "<=", value: unknown) {
    return new FakeResponseQuery(this.docs, [{ field, op, value }]);
  }
}

type FakeDb = {
  collection: (name: string) => unknown;
  templates: TemplateDoc[];
};

let currentDb: FakeDb;

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => currentDb,
}));

function createDb() {
  const templates: TemplateDoc[] = [
    {
      id: "tpl-a",
      data: {
        title: "Checklist Diário",
        type: "operador",
        version: 1,
        isActive: true,
        questions: [],
        periodicity: {
          active: true,
          quantity: 2,
          unit: "day",
          windowDays: 2,
          anchor: "last_submission",
        },
      },
    },
    {
      id: "tpl-b",
      data: {
        title: "Checklist Semanal",
        type: "mecanico",
        version: 1,
        isActive: true,
        questions: [],
        periodicity: {
          active: true,
          quantity: 1,
          unit: "week",
          windowDays: 7,
          anchor: "last_submission",
        },
      },
    },
  ];

  const machines: MachineDoc[] = [
    {
      id: "machine-1",
      data: {
        modelo: "Pá Carregadeira",
        tag: "MCH-1",
        setor: "Operação",
        combustivel: "diesel",
        checklists: ["tpl-a", "tpl-b"],
      },
    },
  ];

  const responses: ResponseDoc[] = [
    {
      id: "resp-1",
      templateId: "tpl-a",
      machineId: "machine-1",
      createdAt: "2024-01-09T12:00:00.000Z",
    },
    {
      id: "resp-older",
      templateId: "tpl-a",
      machineId: "machine-1",
      createdAt: "2024-01-05T10:00:00.000Z",
    },
    {
      id: "resp-b",
      templateId: "tpl-b",
      machineId: "machine-1",
      createdAt: "2023-12-20T10:00:00.000Z",
    },
  ];

  return {
    templates,
    collection(name: string) {
      if (name === "checklistTemplates") {
        return new FakeTemplateCollection(templates);
      }
      if (name === "machines") {
        return new FakeMachineCollection(machines);
      }
      if (name === "checklistResponses") {
        return new FakeResponsesCollection(responses);
      }
      throw new Error(`Unknown collection ${name}`);
    },
  } satisfies FakeDb;
}

beforeEach(() => {
  currentDb = createDb();
});

describe("periodicity compliance", () => {
  it("computes compliance status based on last submissions", async () => {
    const now = new Date("2024-01-10T12:00:00.000Z");
    const result = await loadPeriodicityCompliance({ db: currentDb as never, now });
    expect(result.summary.totalTracked).toBe(2);
    expect(result.summary.compliant).toBe(1);
    expect(result.summary.nonCompliant).toBe(1);

    const compliant = result.items.find((item) => item.templateId === "tpl-a");
    expect(compliant?.status).toBe("compliant");
    expect(compliant?.lastSubmissionAt).toBe("2024-01-09T12:00:00.000Z");

    const nonCompliant = result.items.find((item) => item.templateId === "tpl-b");
    expect(nonCompliant?.status).toBe("non_compliant");
  });

  it("serves compliance data through the API", async () => {
    const request = new NextRequest(
      "http://localhost/api/kpi/periodicity-compliance?to=2024-01-10T12:00:00.000Z",
    );
    const response = await getPeriodicityCompliance(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.summary.nonCompliant).toBe(1);
    expect(payload.items).toHaveLength(2);
  });

  it("persists periodicity updates via PATCH", async () => {
    const payload = { active: true, quantity: 2, unit: "day" };
    const request = { json: async () => payload } as unknown as NextRequest;
    const response = await patchTemplatePeriodicity(request, { params: { templateId: "tpl-a" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.periodicity.windowDays).toBe(2);
    const updated = currentDb.templates.find((doc) => doc.id === "tpl-a");
    expect(updated?.data.periodicity?.quantity).toBe(2);
    expect(updated?.data.periodicity?.windowDays).toBe(2);
    expect(updated?.data.periodicity?.active).toBe(true);
  });
});
