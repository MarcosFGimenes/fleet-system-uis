import { describe, expect, it } from "vitest";
import {
  mapChecklistResponseToDocs,
  type ChecklistResponseDoc,
  type MachineDoc,
  type TemplateQuestion,
  type ExistingNcInfo,
} from "../functions/src/mappers";

const response: ChecklistResponseDoc = {
  machineId: "asset-seed",
  userId: "user-1",
  operatorMatricula: "123",
  operatorNome: "Operador",
  templateId: "template-1",
  createdAt: "2024-03-10T08:00:00Z",
  answers: [
    { questionId: "q1", response: "nc", observation: "Ruido excessivo" },
    { questionId: "q2", response: "ok" },
  ],
  extraNonConformities: [
    { title: "Lampada queimada", severity: "baixa", description: "Lanterna direita" },
  ],
};

const machine: MachineDoc = {
  tag: "TAG-99",
  modelo: "Caminhao teste",
  tipo: "Caminhao",
  setor: "Operacao",
};

const questions = new Map<string, TemplateQuestion>([
  ["q1", { id: "q1", text: "Motor apresenta ruidos?", systemCategory: "Motor" }],
  ["q2", { id: "q2", text: "Luzes funcionam?", systemCategory: "Eletrico" }],
]);

const recent: ExistingNcInfo[] = [
  {
    id: "prev",
    createdAt: new Date("2024-03-05T10:00:00Z").getTime(),
    normalizedTitle: "motor apresenta ruidos",
    systemCategory: "Motor",
  },
];

describe("mapChecklistResponseToDocs", () => {
  it("creates records for question NCs and extras", () => {
    const createdAtISO = "2024-03-10T08:00:00Z";
    const docs = mapChecklistResponseToDocs({
      responseId: "resp-123",
      response,
      machine,
      templateQuestions: questions,
      recent,
      telemetry: undefined,
      createdAtISO,
    });

    expect(docs).toHaveLength(2);
    const [fromQuestion, fromExtra] = docs;

    expect(fromQuestion.source).toBe("checklist_question");
    expect(fromQuestion.recurrenceOfId).toBe("prev");
    expect(fromQuestion.severityRank).toBeGreaterThan(0);

    expect(fromExtra.source).toBe("checklist_extra");
    expect(fromExtra.severity).toBe("baixa");
    expect(fromExtra.linkedAsset.tag).toBe("TAG-99");
  });
});
