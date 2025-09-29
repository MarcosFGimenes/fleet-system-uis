import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { fetchTelemetrySnapshot } from "./telemetryStub";
import {
  type ChecklistResponseDoc,
  type ExistingNcInfo,
  type MachineDoc,
  type TemplateQuestion,
  mapChecklistResponseToDocs,
} from "./mappers";

initializeApp();

const db = getFirestore();

const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;

type TemplateDoc = {
  title?: string;
  questions?: TemplateQuestion[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function loadRecentNonConformities(assetId: string, cutoff: number): Promise<ExistingNcInfo[]> {
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

function ensureIsoDate(value?: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
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

    const recent = await loadRecentNonConformities(
      response.machineId,
      createdAtDate.getTime() - THIRTY_DAYS_IN_MS,
    );

    const telemetry = await fetchTelemetrySnapshot(response.machineId, createdAtISO).catch((error) => {
      logger.warn("Telemetry snapshot failed", { responseId, error });
      return undefined;
    });

    const documents = mapChecklistResponseToDocs({
      responseId,
      response,
      machine: machineData,
      templateQuestions: questionMap,
      recent,
      telemetry,
      createdAtISO,
    });

    if (documents.length === 0) {
      logger.info("No nonConformities to create for response", { responseId });
      return;
    }

    const writes = documents.map((docData) =>
      db
        .collection("nonConformities")
        .add({
          ...docData,
          createdAtTs: Timestamp.fromDate(createdAtDate),
        })
        .catch((error) => {
          logger.error("Failed to create nonConformity", { responseId, error, payload: docData.title });
          throw error;
        }),
    );

    await Promise.all(writes);
    logger.info("Created nonConformities from checklist response", {
      responseId,
      total: documents.length,
    });
  },
);
