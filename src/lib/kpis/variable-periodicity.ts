import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistQuestionVariable,
  ChecklistVariablePeriodicity,
} from "@/types/checklist";
import type { Machine } from "@/types/machine";
import { resolveMachineFleetType } from "@/types/machine";

export type VariablePeriodicityStatus = "compliant" | "non_compliant";

export type VariablePeriodicityItem = {
  variableName: string;
  templateId: string;
  templateName: string;
  questionId: string;
  questionText: string;
  machineId: string;
  machineName?: string;
  machinePlaca?: string;
  lastSubmissionAt?: string;
  windowDays: number;
  unit: ChecklistVariablePeriodicity["unit"];
  quantity: number;
  anchor: ChecklistVariablePeriodicity["anchor"];
  status: VariablePeriodicityStatus;
};

export type VariablePeriodicitySummary = {
  totalTracked: number;
  compliant: number;
  nonCompliant: number;
};

export type VariablePeriodicityResult = {
  generatedAt: string;
  summary: VariablePeriodicitySummary;
  items: VariablePeriodicityItem[];
};

/**
 * Busca todas as variáveis com periodicidade configurada e verifica se estão sendo cumpridas.
 */
export async function loadVariablePeriodicity(
  options: {
    db?: Firestore;
    now?: Date;
  } = {}
): Promise<VariablePeriodicityResult> {
  const db = options.db ?? getAdminDb();
  const referenceTime = options.now ?? new Date();

  // Busca todos os templates
  const templatesSnapshot = await db.collection("checklistTemplates").get();
  const templates: ChecklistTemplate[] = [];
  templatesSnapshot.forEach((doc) => {
    const data = doc.data() as Omit<ChecklistTemplate, "id">;
    templates.push({ id: doc.id, ...data });
  });

  // Busca todas as máquinas
  const machinesSnapshot = await db.collection("machines").get();
  const machinesMap = new Map<string, Machine>();
  machinesSnapshot.forEach((doc) => {
    const data = doc.data() as Omit<Machine, "id">;
    machinesMap.set(doc.id, { id: doc.id, ...data, fleetType: resolveMachineFleetType(data.fleetType) });
  });

  // Identifica todas as combinações de variável/template/máquina com periodicidade
  const variablePeriodicities = new Map<
    string,
    {
      variableName: string;
      template: ChecklistTemplate;
      questionId: string;
      periodicity: ChecklistVariablePeriodicity;
    }
  >();

  for (const template of templates) {
    for (const question of template.questions ?? []) {
      if (question.variable?.periodicity?.active) {
        const key = `${template.id}-${question.id}-${question.variable.name}`;
        variablePeriodicities.set(key, {
          variableName: question.variable.name,
          template,
          questionId: question.id,
          periodicity: question.variable.periodicity,
        });
      }
    }
  }

  // Para cada máquina, verifica as variáveis com periodicidade
  const items: VariablePeriodicityItem[] = [];
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  for (const machine of machinesMap.values()) {
    // Verifica quais templates a máquina usa
    const machineTemplateIds = machine.checklists ?? [];
    if (machineTemplateIds.length === 0) continue;

    for (const templateId of machineTemplateIds) {
      const template = templateMap.get(templateId);
      if (!template) continue;

      // Verifica variáveis com periodicidade neste template
      for (const question of template.questions ?? []) {
        if (!question.variable?.periodicity?.active) continue;

        const key = `${template.id}-${question.id}-${question.variable.name}`;
        const varPeriodicity = variablePeriodicities.get(key);
        if (!varPeriodicity) continue;

        // Busca última resposta para esta variável/máquina/template
        const responsesSnapshot = await db
          .collection("checklistResponses")
          .where("machineId", "==", machine.id)
          .where("templateId", "==", templateId)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get();

        let lastSubmissionAt: string | undefined;
        for (const doc of responsesSnapshot.docs) {
          const response = doc.data() as ChecklistResponse;
          // Verifica se esta resposta contém a variável
          const answer = response.answers?.find((a) => a.questionId === question.id);
          if (answer && answer.variableValue !== undefined && answer.variableValue !== null) {
            lastSubmissionAt = response.createdAt;
            break;
          }
        }

        const lastDate = lastSubmissionAt ? new Date(lastSubmissionAt) : null;
        const windowMs = varPeriodicity.periodicity.windowDays * 24 * 60 * 60 * 1000;
        const status: VariablePeriodicityStatus =
          lastDate && !Number.isNaN(lastDate.getTime()) && referenceTime.getTime() - lastDate.getTime() <= windowMs
            ? "compliant"
            : "non_compliant";

        items.push({
          variableName: varPeriodicity.variableName,
          templateId: template.id,
          templateName: template.title,
          questionId: question.id,
          questionText: question.text,
          machineId: machine.id,
          machineName: machine.modelo,
          machinePlaca: machine.placa,
          lastSubmissionAt: lastSubmissionAt,
          windowDays: varPeriodicity.periodicity.windowDays,
          unit: varPeriodicity.periodicity.unit,
          quantity: varPeriodicity.periodicity.quantity,
          anchor: varPeriodicity.periodicity.anchor,
          status,
        });
      }
    }
  }

  const summary: VariablePeriodicitySummary = {
    totalTracked: items.length,
    compliant: items.filter((item) => item.status === "compliant").length,
    nonCompliant: items.filter((item) => item.status === "non_compliant").length,
  };

  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "non_compliant" ? -1 : 1;
    }
    const nameCompare = a.variableName.localeCompare(b.variableName);
    if (nameCompare !== 0) return nameCompare;
    return a.machineName?.localeCompare(b.machineName ?? "") ?? 0;
  });

  return {
    generatedAt: referenceTime.toISOString(),
    summary,
    items,
  };
}

