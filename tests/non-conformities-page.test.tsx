import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const firestoreMockState = {
  machinesDocs: [] as Array<{ id: string; data: () => unknown }>,
  templatesDocs: [] as Array<{ id: string; data: () => unknown }>,
  responsesDocs: [] as Array<{ id: string; data: () => unknown }>,
};

const makeDoc = (id: string, data: unknown) => ({ id, data: () => data });

vi.mock("next/image", () => ({
  default: ({ src, alt, ...rest }: { src: unknown; alt?: string } & Record<string, unknown>) => (
    <img alt={alt ?? ""} src={typeof src === "string" ? src : ""} {...rest} />
  ),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  query: (col: { __collection: string }) => ({ __collection: col.__collection }),
  orderBy: () => ({}),
  getDocs: async (ref: { __collection?: string }) => {
    const name = ref?.__collection;
    const docs =
      name === "machines"
        ? firestoreMockState.machinesDocs
        : name === "checklistTemplates"
        ? firestoreMockState.templatesDocs
        : name === "checklistResponses"
        ? firestoreMockState.responsesDocs
        : [];
    return { docs };
  },
  doc: (_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` }),
  updateDoc: vi.fn(async () => {}),
}));

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderPage() {
  const module = await import("@/app/(admin)/(protected)/admin/non-conformities/page");
  const NonConformitiesAdminPage = module.default;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<NonConformitiesAdminPage />);
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  firestoreMockState.machinesDocs = [];
  firestoreMockState.templatesDocs = [];
  firestoreMockState.responsesDocs = [];
});

describe("NonConformitiesAdminPage", () => {
  it("renderiza e mostra estado vazio quando não há NCs", async () => {
    const { container, unmount } = await renderPage();

    expect(container.textContent).toContain("Não conformidades");
    expect(container.textContent).toContain("Carregando não conformidades");

    await flushPromises();
    await flushPromises();

    expect(container.textContent).toContain(
      "Nenhuma não conformidade encontrada para os filtros selecionados.",
    );

    unmount();
  });

  it("lista uma não conformidade derivada de um checklist com resposta NC", async () => {
    firestoreMockState.machinesDocs = [
      makeDoc("m1", {
        modelo: "Modelo",
        tag: "MCH-1",
        setor: "Setor",
        checklists: ["t1"],
        fleetType: "machine",
      }),
    ];
    firestoreMockState.templatesDocs = [
      makeDoc("t1", {
        type: "operador",
        title: "Checklist diário",
        version: 1,
        isActive: true,
        questions: [{ id: "q1", text: "Pergunta 1", photoRule: "optional" }],
      }),
    ];
    firestoreMockState.responsesDocs = [
      makeDoc("r1", {
        machineId: "m1",
        userId: "u1",
        templateId: "t1",
        createdAt: "2025-10-01T10:00:00.000Z",
        answers: [{ questionId: "q1", response: "nc", observation: "Obs", photoUrls: [] }],
        nonConformityTreatments: [],
      }),
    ];

    const { container, unmount } = await renderPage();

    await flushPromises();
    await flushPromises();

    expect(container.textContent).toContain("1. Pergunta 1");
    expect(container.textContent).toContain("Template: Checklist diário (v1)");

    unmount();
  });
});
