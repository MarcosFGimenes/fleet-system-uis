import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import { mapNonConformityDoc } from "@/lib/firestore/nc";
import type { NcStatus, NonConformity, Severity } from "@/types/nonconformity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChecklistAnswer = {
  questionId: string;
  response?: string;
  photoUrls?: unknown;
};

type ChecklistResponseDoc = {
  answers?: ChecklistAnswer[];
  createdAt?: string;
  createdAtTs?: Timestamp;
  horimetro?: number;
  machineId?: string;
  operatorMatricula?: string;
  operatorNome?: string;
  templateId?: string;
  templateVersion?: number;
  templateTitle?: string;
  templateType?: string;
  userId?: string;
};

type TemplateQuestion = {
  id: string;
  text?: string;
  requiresPhoto?: boolean;
};

type ChecklistTemplateDoc = {
  title?: string;
  type?: string;
  isActive?: boolean;
  version?: number;
  questions?: TemplateQuestion[];
};

import type { NcStatus, Severity } from "@/types/nonconformity";

type NormalizedNc = {
  id: string;
  checklistResponseId: string;
  questionId: string;
  questionText: string;
  requiresPhoto: boolean;
  photoUrls: string[];
  response: "nc";
  evidenceStatus: "ok" | "missing_required_photo";
  status: NcStatus;
  severity: Severity;
  machineId: string;
  templateId: string;
  templateTitle: string;
  templateType: string | null;
  operatorMatricula: string | null;
  operatorNome: string | null;
  horimetro: number | null;
  createdAt: string;
};

type NormalizedNcWithMeta = NormalizedNc & { sortKey: number };

const MAX_RESPONSE_FETCH = 500;
const MAX_FETCH = 500;

const STATUS_VALUES: readonly NcStatus[] = [
  "aberta",
  "em_execucao",
  "aguardando_peca",
  "bloqueada",
  "resolvida",
];

const SEVERITY_VALUES: readonly Severity[] = ["baixa", "media", "alta"];

function isMissingIndexError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "FAILED_PRECONDITION" && code !== 9) {
    return false;
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return message.toLowerCase().includes("index");
}

const querySchema = z
  .object({
    status: z.string().optional(),
    severity: z.string().optional(),
    assetId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(20),
    pageSize: z
      .coerce.number()
      .int()
      .refine((value) => [10, 20, 50, 100].includes(value), {
        message: "pageSize must be one of 10, 20, 50 or 100",
      })
      .default(20),
    status: z.enum(STATUS_VALUES as [NcStatus, ...NcStatus[]]).optional(),
    severity: z.enum(SEVERITY_VALUES as [Severity, ...Severity[]]).optional(),
    assetId: z.string().trim().min(1).optional(),
    machineId: z.string().trim().min(1).optional(),
    templateId: z.string().trim().min(1).optional(),
    operatorMatricula: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    dateFrom: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    dateTo: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict();

function parseDate(value: string, options: { endOfDay?: boolean } = {}): Date | null {
  const trimmed = value.trim();
  const isoCandidate = trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (options.endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function withinRange(target: Date | null, from?: Date | null, to?: Date | null): boolean {
  if (!from && !to) return true;
  if (!target) return false;
  if (from && target.getTime() < from.getTime()) return false;
  if (to && target.getTime() > to.getTime()) return false;
  return true;
}

function formatTemplateQuestionMap(template: ChecklistTemplateDoc | null | undefined) {
  const map = new Map<string, TemplateQuestion>();
  if (!template?.questions) return map;
  for (const question of template.questions) {
    if (question?.id) {
      map.set(question.id, question);
    }
  }
  return map;
}

function normalizeNc(
  responseId: string,
  answer: ChecklistAnswer,
  question: TemplateQuestion | undefined,
  response: ChecklistResponseDoc,
  createdAtISO: string,
  sortKey: number,
  templateId: string,
): NormalizedNcWithMeta {
  const requiresPhoto = Boolean(question?.requiresPhoto);
  const photoUrls = normalizePhotoUrls(answer.photoUrls);
  const evidenceStatus = requiresPhoto && photoUrls.length === 0 ? "missing_required_photo" : "ok";

  const questionText = sanitizeString(question?.text) ?? "(pergunta não encontrada)";

  // Assuming default status and severity if not explicitly available in ChecklistResponseDoc
  // In a real scenario, these might be derived from the checklist response or question itself.
  const status: NcStatus = "aberta"; // Default status
  const severity: Severity = "baixa"; // Default severity

  return {
    id: `nc::${responseId}::${answer.questionId}`,
    checklistResponseId: responseId,
    questionId: answer.questionId,
    questionText,
    requiresPhoto,
    photoUrls,
    response: "nc",
    evidenceStatus,
    status,
    severity,
    machineId: sanitizeString(response.machineId) ?? "",
    templateId,
    templateTitle: sanitizeString(response.templateTitle) ?? questionText,
    templateType: sanitizeString(response.templateType) ?? null,
    operatorMatricula: sanitizeString(response.operatorMatricula),
    operatorNome: sanitizeString(response.operatorNome),
    horimetro: typeof response.horimetro === "number" ? response.horimetro : null,
    createdAt: createdAtISO,
    sortKey,
  };
}

function pickTemplateMetadata(template: ChecklistTemplateDoc | null | undefined) {
  if (!template) {
    return { title: "(template não encontrado)", type: null as string | null };
  }

  return {
    title: sanitizeString(template.title) ?? "(template sem título)",
    type: sanitizeString(template.type),
  };
function matchesSearch(record: NonConformity, searchTerm: string | null): boolean {
  if (!searchTerm) return true;
  const normalized = searchTerm.toLowerCase();
  const haystack = [
    record.title,
    record.description ?? "",
    record.linkedAsset?.tag ?? "",
    record.linkedAsset?.modelo ?? "",
    record.linkedAsset?.setor ?? "",
    record.createdBy?.nome ?? "",
    record.createdBy?.matricula ?? "",
    record.rootCause ?? "",
    record.originChecklistResponseId ?? "",
    record.originQuestionId ?? "",
    record.systemCategory ?? "",
  ]
    .filter((value) => typeof value === "string" && value)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function deriveSortKey(record: NonConformity): number {
  const createdAtDate = new Date(record.createdAt);
  if (Number.isNaN(createdAtDate.getTime())) return 0;
  return createdAtDate.getTime();
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad Request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { page, pageSize, status, severity, assetId, dateFrom, dateTo, q } = parsed.data;

  const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
  const parsedDateTo = dateTo ? new Date(dateTo) : undefined;

  if (parsedDateFrom && parsedDateTo && parsedDateFrom.getTime() > parsedDateTo.getTime()) {
  const {
    page,
    pageSize,
    status,
    severity,
    assetId: requestedAssetId,
    machineId,
    templateId,
    operatorMatricula,
    q,
    search,
    dateFrom: rawDateFrom,
    from,
    dateTo: rawDateTo,
    to,
  } = parsed.data;

  const assetId = requestedAssetId ?? machineId ?? null;
  const searchTerm = q ?? search ?? null;
  const dateFrom = rawDateFrom ?? from ?? null;
  const dateTo = rawDateTo ?? to ?? null;

  const fromDate = dateFrom ? parseDate(dateFrom) : null;
  const toDate = dateTo ? parseDate(dateTo, { endOfDay: true }) : null;

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      {
        error: "Bad Request",
        details: {
          formErrors: ["dateFrom must be before dateTo"],
          fieldErrors: {},
        },
      },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    let baseQuery = db.collection("checklistResponses") as Query<DocumentData>;

    // Apply filters from the new query schema
    if (assetId) {
      baseQuery = baseQuery.where("machineId", "==", assetId);
    let baseQuery: Query<DocumentData> = db.collection("nonConformities");

    if (status) {
      baseQuery = baseQuery.where("status", "==", status);
    }

    if (severity) {
      baseQuery = baseQuery.where("severity", "==", severity);
    }

    let timestampQuery = baseQuery.orderBy("createdAtTs", "desc");

    if (parsedDateFrom) {
      timestampQuery = timestampQuery.where("createdAtTs", ">=", Timestamp.fromDate(parsedDateFrom));
    }
    if (parsedDateTo) {
      timestampQuery = timestampQuery.where("createdAtTs", "<=", Timestamp.fromDate(parsedDateTo));
    if (assetId) {
      baseQuery = baseQuery.where("linkedAsset.id", "==", assetId);
    }

    const fetchLimit = Math.min(
      MAX_FETCH,
      Math.max(page * pageSize + pageSize, pageSize * 2),
    );

    let timestampQuery = baseQuery.orderBy("createdAtTs", "desc");
    if (fromDate) {
      timestampQuery = timestampQuery.where("createdAtTs", ">=", Timestamp.fromDate(fromDate));
    }
    if (toDate) {
      timestampQuery = timestampQuery.where("createdAtTs", "<=", Timestamp.fromDate(toDate));
    }

    const stringOrderQuery = baseQuery.orderBy("createdAt", "desc");

    let docs: QueryDocumentSnapshot<DocumentData>[] = [];
    let usedFallback = false;

    try {
      const snapshot = await timestampQuery.limit(fetchLimit).get();
      docs = snapshot.docs;
    } catch (error) {
      if (!isMissingIndexError(error)) {
        throw error;
      }
      usedFallback = true;
      console.warn(
        "Falling back to createdAt ordering for nonConformities query; createdAtTs index missing",
        error,
      );
      const fallbackSnapshot = await stringOrderQuery.limit(fetchLimit).get();
      docs = fallbackSnapshot.docs;
    }

    if ((parsedDateFrom || parsedDateTo) && (!usedIndexFallback || responseDocs.length < fetchLimit)) {

      // Some legacy responses may only have string-based createdAt values.
      // Fetch an extra window without timestamp filters and rely on in-memory filtering.
      const fallbackSnapshot = await baseQuery.limit(fetchLimit).get();
      const seenIds = new Set(responseDocs.map((item) => item.id));
    if ((fromDate || toDate) && (!usedFallback || docs.length < fetchLimit)) {
      const fallbackSnapshot = await stringOrderQuery.limit(fetchLimit).get();
      const seen = new Set(docs.map((doc) => doc.id));
      for (const doc of fallbackSnapshot.docs) {
        if (!seen.has(doc.id)) {
          docs.push(doc);
        }
      }
    }

    const mapped = new Map<string, { record: NonConformity; sortKey: number }>();
    for (const doc of docs) {
      const record = mapNonConformityDoc(doc);
      mapped.set(record.id, { record, sortKey: deriveSortKey(record) });
    }

    const filtered = Array.from(mapped.values()).filter(({ record }) => {
      const createdAtDate = new Date(record.createdAt);
      const normalizedDate = Number.isNaN(createdAtDate.getTime()) ? null : createdAtDate;

      if (!withinDateRange(createdAtDate, parsedDateFrom, parsedDateTo)) {
        continue;
      }

      const answers = Array.isArray(data.answers) ? data.answers : [];
      if (!answers.length) continue;

      const normalizedTemplateId = sanitizeString(data.templateId);
      const templateInfo = normalizedTemplateId ? templates.get(normalizedTemplateId) ?? null : null;
      const questionMap = formatTemplateQuestionMap(templateInfo ?? undefined);
      const templateMeta = pickTemplateMetadata(templateInfo ?? undefined);

      for (const answer of answers) {
        if (!answer || answer.response !== "nc" || !answer.questionId) continue;

        const question = questionMap.get(answer.questionId);
        const sortKey = data.createdAtTs instanceof Timestamp
          ? data.createdAtTs.toMillis()
          : createdAtDate?.getTime() ?? 0;

        const baseNc = normalizeNc(
          responseId,
          answer,
          question,
          data,
          createdAtISO,
          sortKey,
          normalizedTemplateId ?? "",
        );
        baseNc.templateTitle = templateMeta.title;
        baseNc.templateType = templateMeta.type;

        items.push(baseNc);
      }
    }

    const searchTerm = q?.toLowerCase() ?? null;
    const filtered = items.filter((item) => {
      if (status && item.status !== status) return false;
      if (severity && item.severity !== severity) return false;
      if (!searchTerm) return true;
      const haystack = [item.questionText, item.machineId].map((value) => value.toLowerCase());
      return haystack.some((value) => value.includes(searchTerm));
      if (!withinRange(normalizedDate, fromDate, toDate)) {
        return false;
      }

      if (templateId && record.linkedTemplateId !== templateId) {
        return false;
      }

      if (operatorMatricula && record.createdBy?.matricula !== operatorMatricula) {
        return false;
      }

      if (!matchesSearch(record, searchTerm)) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => b.sortKey - a.sortKey || a.record.id.localeCompare(b.record.id));

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize).map((item) => item.record);
    const hasMore = start + pageSize < total;

    return NextResponse.json({ data: paginated, page, pageSize, total, hasMore });
  } catch (error) {
    console.error("GET /api/nc failed", error, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    const requestId = randomUUID();
    return NextResponse.json(
      { error: "Internal Server Error", requestId },
      { status: 500 },
    );
  }
}
