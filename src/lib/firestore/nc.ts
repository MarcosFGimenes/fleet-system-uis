import {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import type { NcAction, NonConformity, Severity, TelemetryRef } from "@/types/nonconformity";

const SEVERITY_RANK: Record<Severity, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

function ensureIsoDate(value?: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function mapAction(raw: unknown): NcAction | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const action = raw as Record<string, unknown>;
  const id = typeof action.id === "string" ? action.id : crypto.randomUUID();
  const type = action.type === "preventiva" ? "preventiva" : "corretiva";
  const description = typeof action.description === "string" ? action.description : "";
  if (!description.trim()) return undefined;

  const mapped: NcAction = {
    id,
    type,
    description,
  };

  if (action.owner && typeof action.owner === "object") {
    const owner = action.owner as Record<string, unknown>;
    const ownerId = typeof owner.id === "string" ? owner.id : undefined;
    if (ownerId) {
      mapped.owner = {
        id: ownerId,
        nome: typeof owner.nome === "string" ? owner.nome : undefined,
      };
    }
  }

  if (typeof action.startedAt === "string") mapped.startedAt = action.startedAt;
  if (typeof action.completedAt === "string") mapped.completedAt = action.completedAt;
  if (typeof action.effective === "boolean") mapped.effective = action.effective;

  return mapped;
}

function mapTelemetry(raw: unknown): TelemetryRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const telemetry: TelemetryRef = {};
  if (typeof data.hours === "number") telemetry.hours = data.hours;
  if (typeof data.odometerKm === "number") telemetry.odometerKm = data.odometerKm;
  if (typeof data.fuelUsedL === "number") telemetry.fuelUsedL = data.fuelUsedL;
  if (typeof data.idleTimeH === "number") telemetry.idleTimeH = data.idleTimeH;
  if (Array.isArray(data.faultCodes)) {
    telemetry.faultCodes = data.faultCodes.filter((code) => typeof code === "string") as string[];
  }
  if (typeof data.windowStart === "string") telemetry.windowStart = data.windowStart;
  if (typeof data.windowEnd === "string") telemetry.windowEnd = data.windowEnd;
  return telemetry;
}

function getSeverityRank(severity?: Severity, fallback?: number): number {
  if (severity && SEVERITY_RANK[severity]) {
    return SEVERITY_RANK[severity];
  }
  return fallback ?? SEVERITY_RANK.media;
}

export function mapNonConformityDoc(
  doc: QueryDocumentSnapshot | DocumentSnapshot,
): NonConformity {
  const data = doc.data() as Record<string, unknown> | undefined;
  const severity = (data?.severity as Severity | undefined) ?? undefined;
  const actionsRaw = Array.isArray(data?.actions) ? (data?.actions as unknown[]) : [];
  const actions = actionsRaw
    .map((item) => mapAction(item))
    .filter((item): item is NcAction => Boolean(item));

  const createdAtIso = ensureIsoDate(data?.createdAt ?? data?.createdAtTs);

  const linkedAssetRaw = data?.linkedAsset as Record<string, unknown> | undefined;
  const linkedAsset = {
    id: typeof linkedAssetRaw?.id === "string" ? linkedAssetRaw.id : "",
    tag: typeof linkedAssetRaw?.tag === "string" ? linkedAssetRaw.tag : "",
    modelo: typeof linkedAssetRaw?.modelo === "string" ? linkedAssetRaw.modelo : undefined,
    tipo: typeof linkedAssetRaw?.tipo === "string" ? linkedAssetRaw.tipo : undefined,
    setor: typeof linkedAssetRaw?.setor === "string" ? linkedAssetRaw.setor : undefined,
  };

  const createdByRaw = data?.createdBy as Record<string, unknown> | undefined;
  const createdBy = {
    id: typeof createdByRaw?.id === "string" ? createdByRaw.id : "",
    matricula: typeof createdByRaw?.matricula === "string" ? createdByRaw.matricula : "",
    nome: typeof createdByRaw?.nome === "string" ? createdByRaw.nome : undefined,
  };

  return {
    id: doc.id,
    title: typeof data?.title === "string" ? data?.title : "",
    description: typeof data?.description === "string" ? data?.description : undefined,
    severity,
    safetyRisk: typeof data?.safetyRisk === "boolean" ? data?.safetyRisk : undefined,
    impactAvailability:
      typeof data?.impactAvailability === "boolean" ? data?.impactAvailability : undefined,
    status: (data?.status as NonConformity["status"]) ?? "aberta",
    dueAt: typeof data?.dueAt === "string" ? data?.dueAt : undefined,
    createdAt: createdAtIso,
    createdBy,
    linkedAsset,
    linkedTemplateId:
      typeof data?.linkedTemplateId === "string" ? data?.linkedTemplateId : undefined,
    source:
      data?.source === "checklist_extra" ? "checklist_extra" : "checklist_question",
    originChecklistResponseId:
      typeof data?.originChecklistResponseId === "string"
        ? data?.originChecklistResponseId
        : "",
    originQuestionId:
      typeof data?.originQuestionId === "string" ? data?.originQuestionId : undefined,
    rootCause: typeof data?.rootCause === "string" ? data?.rootCause : undefined,
    actions,
    recurrenceOfId:
      typeof data?.recurrenceOfId === "string" ? data?.recurrenceOfId : undefined,
    telemetryRef: mapTelemetry(data?.telemetryRef),
    yearMonth:
      typeof data?.yearMonth === "string" ? data?.yearMonth : createdAtIso.slice(0, 7),
    severityRank: getSeverityRank(severity, data?.severityRank as number | undefined),
    systemCategory:
      typeof data?.systemCategory === "string" ? data?.systemCategory : undefined,
  };
}

export function serializeActions(actions: NcAction[] | undefined): NcAction[] {
  return (actions ?? []).map((action) => ({
    id: action.id,
    type: action.type,
    description: action.description,
    owner: action.owner ? { id: action.owner.id, nome: action.owner.nome } : undefined,
    startedAt: action.startedAt,
    completedAt: action.completedAt,
    effective: action.effective,
  }));
}

export function severityRank(severity: Severity | undefined): number {
  return getSeverityRank(severity, undefined);
}

export function defaultDueAt(createdAt: string, severity: Severity): string {
  const base = new Date(createdAt);
  const days = severity === "alta" ? 2 : severity === "media" ? 5 : 10;
  base.setDate(base.getDate() + days);
  return base.toISOString();
}
