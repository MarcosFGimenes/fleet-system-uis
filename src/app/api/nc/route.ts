import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import type { DocumentData, Query } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";

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

type NormalizedNc = {
  id: string;
  checklistResponseId: string;
  questionId: string;
  questionText: string;
  requiresPhoto: boolean;
  photoUrls: string[];
  response: "nc";
  evidenceStatus: "ok" | "missing_required_photo";
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
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z
      .coerce.number()
      .int()
      .refine((value) => [10, 20, 50, 100].includes(value), {
        message: "pageSize must be one of 10, 20, 50 or 100",
      })
      .default(20),
    machineId: z.string().trim().min(1).optional(),
    templateId: z.string().trim().min(1).optional(),
    operatorMatricula: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    from: z
      .string()
      .trim()
      .min(1)
      .transform((value) => new Date(value))
      .refine((date) => !Number.isNaN(date.getTime()), {
        message: "from must be a valid ISO date",
      })
      .optional(),
    to: z
      .string()
      .trim()
      .min(1)
      .transform((value) => new Date(value))
      .refine((date) => !Number.isNaN(date.getTime()), {
        message: "to must be a valid ISO date",
      })
      .optional(),
  })
  .strict();

function sanitizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePhotoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function deriveCreatedAt(
  doc: ChecklistResponseDoc,
  snapshotCreatedAt: Timestamp | null,
): { iso: string | null; date: Date | null } {
  if (doc.createdAtTs instanceof Timestamp) {
    const date = doc.createdAtTs.toDate();
    return { iso: date.toISOString(), date };
  }

  const fromString = sanitizeString(doc.createdAt ?? null);
  if (fromString) {
    const parsed = new Date(fromString);
    if (!Number.isNaN(parsed.getTime())) {
      return { iso: parsed.toISOString(), date: parsed };
    }
  }

  if (snapshotCreatedAt) {
    const date = snapshotCreatedAt.toDate();
    return { iso: date.toISOString(), date };
  }

  return { iso: null, date: null };
}

function withinDateRange(
  target: Date | null,
  from?: Date,
  to?: Date,
): boolean {
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

  return {
    id: `nc::${responseId}::${answer.questionId}`,
    checklistResponseId: responseId,
    questionId: answer.questionId,
    questionText,
    requiresPhoto,
    photoUrls,
    response: "nc",
    evidenceStatus,
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

  const { page, pageSize, machineId, templateId, operatorMatricula, search, from, to } = parsed.data;

  if (from && to && from.getTime() > to.getTime()) {
    return NextResponse.json(
      {
        error: "Bad Request",
        details: {
          formErrors: ["from must be before to"],
          fieldErrors: {},
        },
      },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    let baseQuery = db.collection("checklistResponses") as Query<DocumentData>;

    if (machineId) {
      baseQuery = baseQuery.where("machineId", "==", machineId);
    }
    if (templateId) {
      baseQuery = baseQuery.where("templateId", "==", templateId);
    }
    if (operatorMatricula) {
      baseQuery = baseQuery.where("operatorMatricula", "==", operatorMatricula);
    }

    let timestampQuery = baseQuery.orderBy("createdAtTs", "desc");

    if (from) {
      timestampQuery = timestampQuery.where("createdAtTs", ">=", Timestamp.fromDate(from));
    }
    if (to) {
      timestampQuery = timestampQuery.where("createdAtTs", "<=", Timestamp.fromDate(to));
    }

    const fetchLimit = Math.min(
      MAX_RESPONSE_FETCH,
      Math.max(page * pageSize + pageSize, pageSize * 2),
    );

    let responseDocs = [] as {
      id: string;
      data: ChecklistResponseDoc;
      createTime: Timestamp | null;
    }[];
    let usedIndexFallback = false;

    try {
      const snapshot = await timestampQuery.limit(fetchLimit).get();
      responseDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as ChecklistResponseDoc,
        createTime: doc.createTime ?? null,
      }));
    } catch (error) {
      if (!isMissingIndexError(error)) {
        throw error;
      }

      usedIndexFallback = true;
      console.warn(
        "Falling back to unindexed checklistResponses query; createdAtTs index missing",
        error,
      );
      const fallbackSnapshot = await baseQuery.limit(fetchLimit).get();
      responseDocs = fallbackSnapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as ChecklistResponseDoc,
        createTime: doc.createTime ?? null,
      }));
    }

    if ((from || to) && (!usedIndexFallback || responseDocs.length < fetchLimit)) {
      // Some legacy responses may only have string-based createdAt values.
      // Fetch an extra window without timestamp filters and rely on in-memory filtering.
      const fallbackSnapshot = await baseQuery.limit(fetchLimit).get();
      const seenIds = new Set(responseDocs.map((item) => item.id));
      for (const doc of fallbackSnapshot.docs) {
        if (seenIds.has(doc.id)) continue;
        responseDocs.push({ id: doc.id, data: doc.data() as ChecklistResponseDoc, createTime: doc.createTime ?? null });
      }
    }

    const templateIds = new Set(
      responseDocs
        .map(({ data }) => sanitizeString(data.templateId))
        .filter((value): value is string => Boolean(value)),
    );

    const templateCollection = db.collection("checklistTemplates");
    const templateEntries = await Promise.all(
      Array.from(templateIds).map(async (id) => {
        const snapshot = await templateCollection.doc(id).get();
        if (!snapshot.exists) return [id, null] as const;
        return [id, snapshot.data() as ChecklistTemplateDoc] as const;
      }),
    );

    const templates = new Map<string, ChecklistTemplateDoc | null>(templateEntries);

    const items: NormalizedNcWithMeta[] = [];
    for (const { id: responseId, data, createTime } of responseDocs) {
      const { iso: createdAtISO, date: createdAtDate } = deriveCreatedAt(data, createTime);
      if (!createdAtISO) continue;

      if (!withinDateRange(createdAtDate, from, to)) {
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

    const searchTerm = search?.toLowerCase() ?? null;
    const filtered = items.filter((item) => {
      if (!searchTerm) return true;
      const haystack = [item.questionText, item.machineId].map((value) => value.toLowerCase());
      return haystack.some((value) => value.includes(searchTerm));
    });

    filtered.sort((a, b) => b.sortKey - a.sortKey);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize).map(({ sortKey, ...rest }) => {
      void sortKey;
      return rest;
    });
    const hasMore = start + pageSize < total;

    return NextResponse.json({ data: paginated, page, pageSize, total, hasMore });
  } catch (error) {
    console.error("GET /api/nc failed", error);
    const requestId = randomUUID();
    return NextResponse.json(
      { error: "Internal Server Error", requestId },
      { status: 500 },
    );
  }
}
