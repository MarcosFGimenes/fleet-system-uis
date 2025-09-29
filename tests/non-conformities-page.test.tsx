import { describe, expect, it, beforeEach, beforeAll, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import NonConformitiesOverviewPage from "@/app/(admin)/admin/non-conformities/page";

const fetchMock = vi.fn();

global.fetch = fetchMock as unknown as typeof fetch;

beforeAll(() => {
  if (typeof globalThis.crypto === "undefined") {
    (globalThis as any).crypto = { randomUUID: () => "uuid" };
  } else if (typeof globalThis.crypto.randomUUID === "undefined") {
    (globalThis.crypto as Crypto).randomUUID = () => "uuid";
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock("@/components/ui/DataTable", () => ({
  default: ({ data, isLoading }: { data: any[]; isLoading: boolean }) => (
    <div data-testid="data-table">{isLoading ? "loading" : data.map((item) => item.title ?? item.questionText ?? item.id).join(", ")}</div>
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

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
});

describe("NonConformitiesOverviewPage", () => {
  it("renders loading state then data when the request succeeds", async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/kpi/nc")) {
        return Promise.resolve(createMockResponse({ ok: true, status: 200, jsonBody: { openTotal: 0, openBySeverity: {}, onTimePercentage: 0, recurrence30d: 0, avgContainmentHours: 0, avgResolutionHours: 0, series: { daily: [], weekly: [] }, rootCausePareto: [], systemBreakdown: [], severityBySystem: [] } }));
      }
      return Promise.resolve(
        createMockResponse({
          ok: true,
          status: 200,
          jsonBody: {
            data: [
              {
                id: "nc::resp-1::q1",
                title: "NC 1",
                questionText: "NC 1",
                status: "aberta",
                createdAt: "2025-09-29T16:04:15.201Z",
                createdBy: { id: "user", matricula: "1" },
                linkedAsset: { id: "asset", tag: "machine-1" },
                source: "checklist_question",
                originChecklistResponseId: "resp-1",
                yearMonth: "2025-09",
                severityRank: 0,
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
            hasMore: false,
          },
        }),
      );
    });

    const { container, unmount } = renderPage();
    const dataTable = () => container.querySelector("[data-testid='data-table']")!;
    expect(dataTable().textContent).toContain("loading");

    await flushPromises();
    await flushPromises();

    expect(dataTable().textContent).toContain("NC 1");
    unmount();
  });

  it("shows detailed error and retries the request", async () => {
    const responses = [
      createMockResponse({ ok: true, status: 200, jsonBody: { openTotal: 0, openBySeverity: {}, onTimePercentage: 0, recurrence30d: 0, avgContainmentHours: 0, avgResolutionHours: 0, series: { daily: [], weekly: [] }, rootCausePareto: [], systemBreakdown: [], severityBySystem: [] } }),
      createMockResponse({ ok: false, status: 500, jsonBody: { error: "Internal Server Error" } }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          data: [
            {
              id: "nc::resp-2::q1",
              title: "NC 2",
              questionText: "NC 2",
              status: "aberta",
              createdAt: "2025-09-29T16:04:15.201Z",
              createdBy: { id: "user", matricula: "1" },
              linkedAsset: { id: "asset", tag: "machine-2" },
              source: "checklist_question",
              originChecklistResponseId: "resp-2",
              yearMonth: "2025-09",
              severityRank: 0,
            },
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
    expect(alert?.textContent).toContain("Falha ao carregar não conformidades (status 500)");

    const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Tentar novamente");
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushPromises();
    await flushPromises();

    const dataTable = container.querySelector("[data-testid='data-table']");
    expect(dataTable?.textContent).toContain("NC 2");
    unmount();
  });
});
