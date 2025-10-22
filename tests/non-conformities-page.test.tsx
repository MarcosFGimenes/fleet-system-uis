import { describe, expect, it, beforeEach, beforeAll, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import NonConformitiesOverviewPage from "@/app/(admin)/admin/non-conformities/page";

const fetchMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();

type GlobalWithOptionalCrypto = typeof globalThis & {
  crypto?: Crypto & { randomUUID?: () => string };
};

const globalWithOptionalCrypto = globalThis as GlobalWithOptionalCrypto;

(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

beforeAll(() => {
  if (!globalWithOptionalCrypto.crypto) {
    globalWithOptionalCrypto.crypto = {
      randomUUID: () => "uuid",
    } as Crypto & { randomUUID: () => string };
  } else if (!globalWithOptionalCrypto.crypto.randomUUID) {
    globalWithOptionalCrypto.crypto.randomUUID = () => "uuid";
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/admin/non-conformities",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/Card", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}));

vi.mock("@/components/ui/KpiTile", () => ({
  default: ({ title, value }: { title: string; value: number | string }) => (
    <div data-testid="kpi">
      {title}: {value}
    </div>
  ),
}));

type MockTableRecord = Record<string, unknown> & {
  id: string;
  title?: string | null;
};

type MockTableColumn = {
  key: string;
  render?: (record: MockTableRecord) => React.ReactNode;
};

vi.mock("@/components/ui/DataTable", () => ({
  default: ({
    data,
    isLoading,
    columns = [],
    onRowClick,
    filters,
  }: {
    data: MockTableRecord[];
    isLoading: boolean;
    columns?: MockTableColumn[];
    onRowClick?: (record: MockTableRecord) => void;
    filters?: React.ReactNode;
  }) => (
    <div>
      {filters}
      <div data-testid="data-table">
        {isLoading
          ? "loading"
          : data.map((record) => (
              <div
                key={record.id}
                data-testid={`row-${record.id}`}
                onClick={() => onRowClick?.(record)}
              >
                {columns.map((column) => (
                  <div key={column.key} data-column={column.key}>
                    {typeof column.render === "function" ? column.render(record) : null}
                  </div>
                ))}
                <span data-testid={`row-label-${record.id}`}>{record.title ?? record.id}</span>
              </div>
            ))}
      </div>
    </div>
  ),
}));

vi.mock("@/components/ui/Alert", () => ({
  default: ({ description, action }: { description?: React.ReactNode; action?: React.ReactNode }) => (
    <div data-testid="alert">
      <span>{description}</span>
      {action}
    </div>
  ),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
}));

function createMockResponse({ ok, status, jsonBody, textBody }: { ok: boolean; status: number; jsonBody?: unknown; textBody?: string }) {
  return {
    ok,
    status,
    clone() {
      return createMockResponse({ ok, status, jsonBody, textBody });
    },
    async json() {
      if (jsonBody === undefined) {
        throw new Error("No JSON body");
      }
      return jsonBody;
    },
    async text() {
      if (textBody !== undefined) return textBody;
      if (jsonBody === undefined) return "";
      return typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody);
    },
  } as Response;
}

function flushPromises() {
  return act(async () => {
    await Promise.resolve();
  });
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<NonConformitiesOverviewPage />);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

const baseKpiPayload = {
  openTotal: 0,
  openBySeverity: {},
  onTimePercentage: 0,
  recurrence30d: 0,
  avgContainmentHours: 0,
  avgResolutionHours: 0,
  series: { daily: [], weekly: [] },
  rootCausePareto: [],
  systemBreakdown: [],
  severityBySystem: [],
};

const sampleNc = {
  id: "nc-record-1",
  title: "NC 1",
  description: "Teste",
  severity: "alta",
  safetyRisk: true,
  impactAvailability: false,
  status: "aberta",
  dueAt: "2025-10-01T16:04:15.201Z",
  createdAt: "2025-09-29T16:04:15.201Z",
  createdBy: { id: "user", matricula: "1", nome: "Usuário" },
  linkedAsset: { id: "asset-1", tag: "MCH-1", modelo: "Modelo" },
  linkedTemplateId: "template-1",
  source: "checklist_question",
  originChecklistResponseId: "resp-1",
  originQuestionId: "q-1",
  rootCause: "Falha",
  actions: [],
  recurrenceOfId: undefined,
  telemetryRef: undefined,
  yearMonth: "2025-09",
  severityRank: 3,
  systemCategory: "Sistema",
};

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  replaceMock.mockReset();
  window.localStorage.clear();
});

describe("NonConformitiesOverviewPage", () => {
  it("renders loading state then data when the request succeeds and allows row navigation", async () => {
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/kpi/nc")) {
        return Promise.resolve(createMockResponse({ ok: true, status: 200, jsonBody: baseKpiPayload }));
      }
      if (init?.method === "PATCH") {
        return Promise.resolve(createMockResponse({ ok: true, status: 200 }));
      }
      return Promise.resolve(
        createMockResponse({
          ok: true,
          status: 200,
          jsonBody: {
            data: [sampleNc],
            page: 1,
            pageSize: 20,
            total: 1,
            hasMore: false,
          },
        }),
      );
    });

    const { container, unmount } = renderPage();
    const table = () => container.querySelector("[data-testid='data-table']")!;
    expect(table().textContent).toContain("loading");

    await flushPromises();
    await flushPromises();

    expect(table().textContent).toContain("NC 1");

    const row = container.querySelector("[data-testid='row-nc-record-1']");
    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(pushMock).toHaveBeenCalledWith("/admin/non-conformities/nc-record-1");
    unmount();
  });

  it("shows detailed error and retries the request", async () => {
    const responses = [
      createMockResponse({ ok: true, status: 200, jsonBody: baseKpiPayload }),
      createMockResponse({ ok: false, status: 500, jsonBody: { error: "Internal Server Error" } }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          data: [
            { ...sampleNc, id: "nc-record-2", title: "NC 2", originChecklistResponseId: "resp-2" },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          hasMore: false,
        },
      }),
    ];

    fetchMock.mockImplementation(() => {
      const next = responses.shift();
      if (!next) throw new Error("No more mock responses");
      return Promise.resolve(next);
    });

    const { container, unmount } = renderPage();

    await flushPromises();
    await flushPromises();

    const alert = container.querySelector("[data-testid='alert']");
    expect(alert?.textContent).toContain("Não foi possível carregar as não conformidades.");

    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Tentar novamente",
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushPromises();
    await flushPromises();

    const table = container.querySelector("[data-testid='data-table']");
    expect(table?.textContent).toContain("NC 2");
    unmount();
  });

  it("applies bulk actions using existing NC identifiers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push({ url, init });
      if (url.includes("/api/kpi/nc")) {
        return Promise.resolve(createMockResponse({ ok: true, status: 200, jsonBody: baseKpiPayload }));
      }
      if (url.includes("/api/nc/") && init?.method === "PATCH") {
        return Promise.resolve(createMockResponse({ ok: true, status: 200 }));
      }
      return Promise.resolve(
        createMockResponse({
          ok: true,
          status: 200,
          jsonBody: {
            data: [sampleNc],
            page: 1,
            pageSize: 20,
            total: 1,
            hasMore: false,
          },
        }),
      );
    });

    const { container, unmount } = renderPage();

    await flushPromises();
    await flushPromises();

    const checkbox = container.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();

    await act(async () => {
      checkbox?.click();
    });

    await flushPromises();

    const bulkButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Marcar em execução",
    );
    expect(bulkButton).toBeDefined();

    await act(async () => {
      bulkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushPromises();

    const patchCall = calls.find((call) => call.url.includes("/api/nc/") && call.init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(patchCall?.url).toBe("/api/nc/nc-record-1");
    unmount();
  });
});
