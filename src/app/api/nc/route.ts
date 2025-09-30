import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import { mapNonConformityDoc } from "@/lib/firestore/nc";
import type { NcStatus, NonConformity, Severity } from "@/types/nonconformity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    page: z.coerce.number().int().min(1).default(1),
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
          formErrors: ["from must be before to"],
          fieldErrors: {},
        },
      },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    let baseQuery: Query<DocumentData> = db.collection("nonConformities");

    if (status) {
      baseQuery = baseQuery.where("status", "==", status);
    }

    if (severity) {
      baseQuery = baseQuery.where("severity", "==", severity);
    }

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
    console.error("GET /api/nc failed", error);
    const requestId = randomUUID();
    return NextResponse.json(
      { error: "Internal Server Error", requestId },
      { status: 500 },
    );
  }
}
