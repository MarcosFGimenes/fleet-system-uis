import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistQuestionVariable,
} from "@/types/checklist";
import type { Machine } from "@/types/machine";

export type VariableAlertItem = {
  variableName: string;
  templateId: string;
  templateName: string;
  questionId: string;
  questionText: string;
  machineId: string;
  machineName?: string;
  machinePlaca?: string;
  responseId: string;
  responseDate: string;
  alertRule: {
    color: string;
    message: string;
    triggerCondition: "ok" | "nc" | "always";
    showOnHomePage?: boolean;
  };
};

export type VariableAlertsResult = {
  generatedAt: string;
  items: VariableAlertItem[];
};

/**
 * Busca todas as variáveis com alertas ativos (não conformes que devem exibir alerta na tela inicial).
 */
export async function loadVariableAlerts(
  options: {
    db?: Firestore;
    now?: Date;
  } = {}
): Promise<VariableAlertsResult> {
  const db = options.db ?? getAdminDb();
  const referenceTime = options.now ?? new Date();

  // Busca todos os templates
  const templatesSnapshot = await db.collection("checklistTemplates").get();
  const templates: ChecklistTemplate[] = [];
  templatesSnapshot.forEach((doc) => {
    const data = doc.data() as Omit<ChecklistTemplate, "id">;
    templates.push({ id: doc.id, ...data });
  });

  // Busca todas as respostas recentes (últimos 30 dias)
  // Nota: Sem orderBy para evitar necessidade de índice composto
  const thirtyDaysAgo = new Date(referenceTime);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const responsesSnapshot = await db
    .collection("checklistResponses")
    .where("createdAt", ">=", thirtyDaysAgo.toISOString())
    .limit(1000)
    .get();

  const responses: ChecklistResponse[] = [];
  responsesSnapshot.forEach((doc) => {
    const data = doc.data() as Omit<ChecklistResponse, "id">;
    responses.push({ id: doc.id, ...data });
  });

  // Busca todas as máquinas
  const machinesSnapshot = await db.collection("machines").get();
  const machinesMap = new Map<string, Machine>();
  machinesSnapshot.forEach((doc) => {
    const data = doc.data() as Omit<Machine, "id">;
    machinesMap.set(doc.id, { id: doc.id, ...data });
  });

  const alerts: VariableAlertItem[] = [];
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  for (const response of responses) {
    const template = templateMap.get(response.templateId);
    if (!template) continue;

    const machine = machinesMap.get(response.machineId);
    if (!machine) continue;

    // Verifica cada resposta da pergunta
    for (const answer of response.answers ?? []) {
      const question = template.questions?.find((q) => q.id === answer.questionId);
      if (!question || !question.variable) continue;

      // Verifica se a variável tem regra de alerta
      const alertRule = question.variable.alertRule;
      if (!alertRule || alertRule.showOnHomePage === false) continue;

      // Verifica se a condição de acionamento está satisfeita
      const shouldTrigger =
        alertRule.triggerCondition === "always" ||
        (alertRule.triggerCondition === "nc" && answer.response === "nc") ||
        (alertRule.triggerCondition === "ok" && answer.response === "ok");

      if (shouldTrigger) {
        alerts.push({
          variableName: question.variable.name,
          templateId: template.id,
          templateName: template.title,
          questionId: question.id,
          questionText: question.text,
          machineId: machine.id,
          machineName: machine.modelo,
          machinePlaca: machine.placa,
          responseId: response.id,
          responseDate: response.createdAt,
          alertRule: {
            color: alertRule.color,
            message: alertRule.message,
            triggerCondition: alertRule.triggerCondition,
            showOnHomePage: alertRule.showOnHomePage ?? true,
          },
        });
      }
    }
  }

  // Remove duplicatas (mantém apenas o mais recente por variável/máquina)
  const uniqueAlerts = new Map<string, VariableAlertItem>();
  for (const alert of alerts) {
    const key = `${alert.variableName}-${alert.machineId}-${alert.templateId}-${alert.questionId}`;
    const existing = uniqueAlerts.get(key);
    if (!existing || new Date(alert.responseDate) > new Date(existing.responseDate)) {
      uniqueAlerts.set(key, alert);
    }
  }

  return {
    generatedAt: referenceTime.toISOString(),
    items: Array.from(uniqueAlerts.values()).sort(
      (a, b) => new Date(b.responseDate).getTime() - new Date(a.responseDate).getTime()
    ),
  };
}

