import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { fetchTelemetrySnapshot } from "./telemetryStub";

initializeApp();

const db = getFirestore();

const SEVERITY_RANK: Record<string, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

const DUE_DAYS: Record<string, number> = {
  baixa: 10,
  media: 5,
  alta: 2,
};

const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;

type ChecklistAnswer = {
  questionId: string;
  response: "ok" | "nc" | "na";
  observation?: string;
};

type ExtraNonConformity = {
  title?: string;
  description?: string;
  severity?: string;
  safetyRisk?: boolean;
  impactAvailability?: boolean;
};

type ChecklistResponseDoc = {
  machineId: string;
  userId: string;
  operatorMatricula?: string;
  operatorNome?: string | null;
  templateId: string;
  createdAt?: string;
  km?: number;
  horimetro?: number;
  answers?: ChecklistAnswer[];
  extraNonConformities?: ExtraNonConformity[];
};

type TemplateQuestion = {
  id: string;
  text: string;
  systemCategory?: string;
  system?: string;
  category?: string;
  group?: string;
  section?: string;
};

type TemplateDoc = {
  title?: string;
  questions?: TemplateQuestion[];
};

type MachineDoc = {
  tag?: string;
  modelo?: string;
  tipo?: string;
  setor?: string;
};

type ExistingNcInfo = {
  id: string;
  createdAt: number;
  normalizedTitle: string;
  systemCategory?: string;
};

function ensureIsoDate(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function computeDueAt(createdAtISO: string, severity: string): string {
  const date = new Date(createdAtISO);
  const days = DUE_DAYS[severity] ?? DUE_DAYS.media;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function computeYearMonth(createdAtISO: string): string {
  return createdAtISO.slice(0, 7);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function severityRank(severity?: string): number {
  return SEVERITY_RANK[severity ?? "media"] ?? SEVERITY_RANK.media;
}

function extractSystem(question?: TemplateQuestion): string | undefined {
  if (!question) return undefined;
  return (
    question.systemCategory ||
    question.system ||
    question.category ||
    question.group ||
    question.section
  );
}

async function loadRecentNonConformities(assetId: string, cutoff: number): Promise<ExistingNcInfo[]> {
  const snapshot = await db.collection("nonConformities").where("linkedAsset.id", "==", assetId).get();
  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const createdAtValue: string | Timestamp | undefined = data.createdAt ?? data.createdAtTs;
      let createdAtMillis = 0;
      if (createdAtValue instanceof Timestamp) {
        createdAtMillis = createdAtValue.toMillis();
      } else if (typeof createdAtValue === "string") {
        const parsed = new Date(createdAtValue).getTime();
        createdAtMillis = Number.isNaN(parsed) ? 0 : parsed;
      }
      return {
        id: docSnap.id,
        createdAt: createdAtMillis,
        normalizedTitle: normalize(String(data.normalizedTitle ?? data.title ?? "")),
        systemCategory: typeof data.systemCategory === "string" ? data.systemCategory : undefined,
      } satisfies ExistingNcInfo;
    })
    .filter((item) => item.createdAt >= cutoff);
}

function findRecurrence(
  existing: ExistingNcInfo[],
  normalizedTitle: string,
  systemCategory?: string,
): string | undefined {
  return existing.find((item) => {
    if (systemCategory && item.systemCategory && item.systemCategory === systemCategory) {
      return true;
    }
    return item.normalizedTitle === normalizedTitle;
  })?.id;
}

export const onChecklistResponseCreate = onDocumentCreated(
  "checklistResponses/{responseId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const responseId = snapshot.id;
    const response = snapshot.data() as ChecklistResponseDoc | undefined;
    if (!response) {
      logger.warn("Checklist response without data", { responseId });
      return;
    }

    const createdAtISO = ensureIsoDate(response.createdAt);
    const createdAtDate = new Date(createdAtISO);

    const [machineSnap, templateSnap] = await Promise.all([
      db.collection("machines").doc(response.machineId).get(),
      db.collection("checklistTemplates").doc(response.templateId).get(),
    ]);

    const machineData = (machineSnap.data() as MachineDoc | undefined) ?? {};
    const templateData = (templateSnap.data() as TemplateDoc | undefined) ?? {};
    const questionMap = new Map(
      (templateData.questions ?? []).map((question) => [question.id, question]),
    );

    const assetId = response.machineId;
    const recentCutoff = createdAtDate.getTime() - THIRTY_DAYS_IN_MS;
    const recent = await loadRecentNonConformities(assetId, recentCutoff);

    const telemetryRef = await fetchTelemetrySnapshot(assetId, createdAtISO).catch((error) => {
      logger.warn("Telemetry snapshot failed", { assetId, responseId, error });
      return undefined;
    });

    const createdBy = {
      id: response.userId,
      matricula: response.operatorMatricula || response.userId,
      nome: response.operatorNome ?? undefined,
    };

    const baseAsset = {
      id: assetId,
      tag: machineData.tag ?? "",
      modelo: machineData.modelo,
      tipo: machineData.tipo,
      setor: machineData.setor,
    };

    const answers = response.answers ?? [];
    const extras = response.extraNonConformities ?? [];
    const writes: Promise<unknown>[] = [];

    const processRecord = async (
      payload: {
        title: string;
        description?: string;
        severity?: string;
        safetyRisk?: boolean;
        impactAvailability?: boolean;
        source: "checklist_question" | "checklist_extra";
        originQuestionId?: string;
        systemCategory?: string;
      },
    ) => {
      const severity = (payload.severity ?? "media") as string;
      const normalizedTitle = normalize(payload.title);
      const recurrenceId = findRecurrence(recent, normalizedTitle, payload.systemCategory);

      const ncDoc = {
        title: payload.title,
        description: payload.description ?? null,
        severity: severity,
        safetyRisk: payload.safetyRisk ?? false,
        impactAvailability: payload.impactAvailability ?? false,
        status: "aberta",
        dueAt: computeDueAt(createdAtISO, severity),
        createdAt: createdAtISO,
        createdAtTs: Timestamp.fromDate(createdAtDate),
        createdBy,
        linkedAsset: baseAsset,
        linkedTemplateId: response.templateId,
        source: payload.source,
        originChecklistResponseId: responseId,
        originQuestionId: payload.originQuestionId ?? null,
        rootCause: null,
        actions: [],
        recurrenceOfId: recurrenceId ?? null,
        telemetryRef: telemetryRef ?? null,
        yearMonth: computeYearMonth(createdAtISO),
        severityRank: severityRank(severity),
        systemCategory: payload.systemCategory ?? null,
        normalizedTitle,
        kdSeed: `${assetId}-${normalizedTitle}`,
      } as Record<string, unknown>;

      writes.push(
        db.collection("nonConformities").add(ncDoc).catch((error) => {
          logger.error("Failed to create nonConformity", { responseId, error, payload });
          throw error;
        }),
      );
    };

    for (const answer of answers) {
      if (answer.response !== "nc") continue;
      const question = questionMap.get(answer.questionId);
      const title = question?.text ?? `Pergunta ${answer.questionId}`;
      await processRecord({
        title,
        description: answer.observation,
        severity: "media",
        source: "checklist_question",
        originQuestionId: answer.questionId,
        systemCategory: extractSystem(question),
      });
    }

    for (const extra of extras) {
      const title = extra.title?.trim();
      if (!title) continue;
      await processRecord({
        title,
        description: extra.description,
        severity: extra.severity,
        safetyRisk: extra.safetyRisk,
        impactAvailability: extra.impactAvailability,
        source: "checklist_extra",
      });
    }

    if (writes.length === 0) {
      logger.info("No nonConformities to create for response", { responseId });
      return;
    }

    await Promise.all(writes);
    logger.info("Created nonConformities from checklist response", {
      responseId,
      total: writes.length,
    });
  },
);
