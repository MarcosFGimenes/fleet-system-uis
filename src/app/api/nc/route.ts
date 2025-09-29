import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { mapNonConformityDoc } from "@/lib/firestore/nc";
import type { Severity } from "@/types/nonconformity";
import { matchesFilters } from "./filters";

export const dynamic = "force-dynamic";

const MAX_FETCH = 500;

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

    const snapshot = await adminDb
      .collection("nonConformities")
      .orderBy("createdAt", "desc")
      .limit(MAX_FETCH)
      .get();
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
