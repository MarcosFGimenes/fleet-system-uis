import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { mapNonConformityDoc } from "@/lib/firestore/nc";
import type { NonConformity, Severity } from "@/types/nonconformity";

export const dynamic = "force-dynamic";

const MAX_FETCH = 500;

function normalizeText(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeParam(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function matchesFilters(
  record: NonConformity,
  filters: {
    statuses: string[];
    severities: string[];
    assetId?: string;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  },
): boolean {
  if (filters.statuses.length && !filters.statuses.includes(record.status)) {
    return false;
  }

  if (filters.severities.length && (!record.severity || !filters.severities.includes(record.severity))) {
    return false;
  }

  if (filters.assetId) {
    if (record.linkedAsset.id !== filters.assetId && record.linkedAsset.tag !== filters.assetId) {
      return false;
    }
  }

  if (filters.dateFrom) {
    const createdAt = new Date(record.createdAt).getTime();
    if (Number.isNaN(createdAt) || createdAt < new Date(filters.dateFrom).getTime()) {
      return false;
    }
  }

  if (filters.dateTo) {
    const createdAt = new Date(record.createdAt).getTime();
    if (Number.isNaN(createdAt) || createdAt > new Date(filters.dateTo).getTime()) {
      return false;
    }
  }

  if (filters.query) {
    const target = filters.query.toLowerCase();
    const haystack = [
      record.title,
      record.description,
      record.linkedAsset.tag,
      record.linkedAsset.modelo,
      record.createdBy.matricula,
      record.rootCause,
    ]
      .map((value) => value?.toLowerCase?.() ?? "")
      .join(" ");

    if (!haystack.includes(target)) {
      return false;
    }
  }

  return true;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    const sizeParam = Number(params.get("pageSize") ?? "20");
    const pageSize = Number.isNaN(sizeParam) ? 20 : Math.min(Math.max(sizeParam, 5), 100);

    const statuses = parseListParam(params.get("status"));
    const severities = parseListParam(params.get("severity")) as Severity[];
    const assetId = normalizeParam(params.get("assetId"));
    const dateFrom = normalizeParam(params.get("dateFrom"));
    const dateTo = normalizeParam(params.get("dateTo"));
    const queryText = normalizeParam(params.get("q"));

    const baseQuery = query(
      collection(db, "nonConformities"),
      orderBy("createdAt", "desc"),
      limit(MAX_FETCH),
    );

    const snapshot = await getDocs(baseQuery);
    const records = snapshot.docs.map((docSnap) => mapNonConformityDoc(docSnap));

    const filtered = records.filter((record) =>
      matchesFilters(record, {
        statuses,
        severities,
        assetId,
        dateFrom,
        dateTo,
        query: queryText,
      }),
    );

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return NextResponse.json({ data: paginated, page, pageSize, total });
  } catch (error) {
    console.error("GET /api/nc failed", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as NCs" },
      { status: 500 },
    );
  }
}
