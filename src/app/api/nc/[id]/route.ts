import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  defaultDueAt,
  mapNonConformityDoc,
  serializeActions,
  severityRank as computeSeverityRank,
} from "@/lib/firestore/nc";
import type { NcAction, NonConformity, Severity, TelemetryRef } from "@/types/nonconformity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIT_LIMIT = 50;

function parseActions(raw: unknown, fallback: NcAction[]): NcAction[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const description = typeof record.description === "string" ? record.description.trim() : "";
      if (!description) return undefined;
      const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
      const type = record.type === "preventiva" ? "preventiva" : "corretiva";
      const parsed: NcAction = { id, type, description };

      if (record.owner && typeof record.owner === "object") {
        const owner = record.owner as Record<string, unknown>;
        const ownerId = typeof owner.id === "string" ? owner.id : undefined;
        if (ownerId) {
          parsed.owner = {
            id: ownerId,
            nome: typeof owner.nome === "string" ? owner.nome : undefined,
          };
        }
      }
      if (typeof record.startedAt === "string") parsed.startedAt = record.startedAt;
      if (typeof record.completedAt === "string") parsed.completedAt = record.completedAt;
      if (typeof record.effective === "boolean") parsed.effective = record.effective;

      return parsed;
    })
    .filter((action): action is NcAction => Boolean(action));
}

function sanitizeTelemetry(raw: unknown): TelemetryRef | null {
  if (!raw || typeof raw !== "object") return null;
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
  return Object.keys(telemetry).length ? telemetry : null;
}

function resolveDueAt(existing: NonConformity, severity: Severity, requested?: string): string {
  const fallback = defaultDueAt(existing.createdAt, severity);
  if (!requested) {
    return fallback;
  }
  const requestedDate = new Date(requested);
  if (Number.isNaN(requestedDate.getTime())) {
    return fallback;
  }
  const createdAtDate = new Date(existing.createdAt);
  if (requestedDate.getTime() < createdAtDate.getTime()) {
    return fallback;
  }
  if (severity === "alta") {
    const maxDue = new Date(existing.createdAt);
    maxDue.setDate(maxDue.getDate() + 2);
    if (requestedDate.getTime() > maxDue.getTime()) {
      return maxDue.toISOString();
    }
  }
  return requestedDate.toISOString();
}

function hasCompletedCorrective(actions: NcAction[]): boolean {
  return actions.some((action) => action.type === "corretiva" && Boolean(action.completedAt));
}

function hasEffectivePreventive(actions: NcAction[]): boolean {
  return actions.some((action) => action.type === "preventiva" && action.effective === true);
}

function diffChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function fetchDoc(id: string) {
  const ref = getAdminDb().collection("nonConformities").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }
  return { ref, snapshot } as const;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveId(context: RouteContext): Promise<string | null> {
  const params = await context.params;
  const value = params.id;
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json({ error: "Parâmetro id inválido" }, { status: 400 });
  }

  try {
    const recordRef = await fetchDoc(id);
    if (!recordRef) {
      return NextResponse.json({ error: "NC não encontrada" }, { status: 404 });
    }

    const data = mapNonConformityDoc(recordRef.snapshot);

    const auditsRef = recordRef.ref.collection("audits");
    const auditsSnap = await auditsRef.orderBy("atISO", "desc").limit(AUDIT_LIMIT).get();
    const audits = auditsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ data, audits });
  } catch (error) {
    console.error(`GET /api/nc/${id} failed`, error);
    return NextResponse.json({ error: "Falha ao carregar a NC" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json({ error: "Parâmetro id inválido" }, { status: 400 });
  }

  try {
    const recordRef = await fetchDoc(id);
    if (!recordRef) {
      return NextResponse.json({ error: "NC não encontrada" }, { status: 404 });
    }

    const existing = mapNonConformityDoc(recordRef.snapshot);
    const payload = await request.json();

    const nextSeverity = (payload.severity ?? existing.severity ?? "media") as Severity;
    const nextStatus = (payload.status ?? existing.status) as NonConformity["status"];
    const requestedDueAt = typeof payload.dueAt === "string" ? payload.dueAt : undefined;
    const nextDueAt = resolveDueAt(existing, nextSeverity, requestedDueAt);

    const nextRootCause = typeof payload.rootCause === "string" ? payload.rootCause.trim() : existing.rootCause;

    const incomingActions = parseActions(payload.actions, existing.actions ?? []);
    const nextActions = incomingActions.length ? incomingActions : existing.actions ?? [];

    const telemetry = sanitizeTelemetry(payload.telemetryRef ?? payload.telemetry);

    const requiresCapa = Boolean(existing.recurrenceOfId);

    if (nextStatus === "resolvida") {
      if (!hasCompletedCorrective(nextActions)) {
        return NextResponse.json(
          { error: "Finalize ao menos uma ação corretiva antes de encerrar a NC." },
          { status: 400 },
        );
      }
      if (requiresCapa) {
        if (!nextRootCause || !nextRootCause.trim()) {
          return NextResponse.json(
            { error: "Preencha a causa raiz para encerrar uma NC recorrente." },
            { status: 400 },
          );
        }
        if (!hasEffectivePreventive(nextActions)) {
          return NextResponse.json(
            { error: "Marque pelo menos uma ação preventiva como eficaz (effective=true)." },
            { status: 400 },
          );
        }
      }
    }

    const updates: Record<string, unknown> = {};
    const diff: Record<string, { before: unknown; after: unknown }> = {};

    const applyChange = (key: string, before: unknown, after: unknown) => {
      if (diffChanged(before, after)) {
        updates[key] = after;
        diff[key] = { before, after };
      }
    };

    applyChange("status", existing.status, nextStatus);
    applyChange("severity", existing.severity, nextSeverity);
    applyChange("severityRank", existing.severityRank, computeSeverityRank(nextSeverity));
    applyChange("dueAt", existing.dueAt, nextDueAt);

    if (nextRootCause !== undefined) {
      const normalizedRootCause = nextRootCause?.trim() ? nextRootCause.trim() : null;
      applyChange("rootCause", existing.rootCause ?? null, normalizedRootCause);
    }

    if (payload.safetyRisk !== undefined) {
      applyChange("safetyRisk", existing.safetyRisk ?? false, Boolean(payload.safetyRisk));
    }

    if (payload.impactAvailability !== undefined) {
      applyChange(
        "impactAvailability",
        existing.impactAvailability ?? false,
        Boolean(payload.impactAvailability),
      );
    }

    const serializedActions = serializeActions(nextActions);
    applyChange("actions", existing.actions ?? [], serializedActions);

    if (telemetry !== null) {
      applyChange("telemetryRef", existing.telemetryRef ?? null, telemetry);
    }

    applyChange(
      "updatedAt",
      (recordRef.snapshot.data() as Record<string, unknown>)?.updatedAt ?? null,
      new Date().toISOString(),
    );

    if (Object.keys(diff).length === 0) {
      return NextResponse.json({ data: existing, audits: [] });
    }

    await recordRef.ref.update(updates);

    const actor = payload.actor ?? payload.updatedBy ?? {};
    await recordRef.ref.collection("audits").add({
      byUserId: actor.id ?? actor.uid ?? "system",
      byNome: actor.nome ?? actor.name ?? null,
      atISO: new Date().toISOString(),
      diff,
    });

    const refreshed = await recordRef.ref.get();
    const updated = mapNonConformityDoc(refreshed);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error(`PATCH /api/nc/${id} failed`, error);
    return NextResponse.json({ error: "Falha ao atualizar a NC" }, { status: 500 });
  }
}
