import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  ChecklistPeriodicityAnchor,
  ChecklistPeriodicityUnit,
  ChecklistTemplatePeriodicity,
} from "@/types/checklist";

export const dynamic = "force-dynamic";

function computeWindowDays(quantity: number, unit: ChecklistPeriodicityUnit): number {
  if (unit === "day") return quantity;
  if (unit === "week") return quantity * 7;
  return quantity * 30;
}

function isValidUnit(value: unknown): value is ChecklistPeriodicityUnit {
  return value === "day" || value === "week" || value === "month";
}

function isValidAnchor(value: unknown): value is ChecklistPeriodicityAnchor {
  return value === "last_submission" || value === "calendar";
}

export async function PATCH(request: NextRequest, context: { params: { templateId?: string } }) {
  const templateIdRaw = context.params?.templateId;
  const templateId = typeof templateIdRaw === "string" ? templateIdRaw.trim() : "";
  if (!templateId) {
    return NextResponse.json({ error: "Parâmetro templateId inválido" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch (error) {
    console.error("PATCH /api/templates/[id]/periodicity invalid JSON", error);
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const activeValue = payload.active;
  if (typeof activeValue !== "boolean") {
    return NextResponse.json({ error: "Campo active deve ser booleano" }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection("checklistTemplates").doc(templateId);

  try {
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    const current = snapshot.data() as { periodicity?: ChecklistTemplatePeriodicity } | undefined;
    const currentPeriodicity = current?.periodicity;

    const unitRaw = payload.unit;
    const quantityRaw = payload.quantity;
    const anchorRaw = payload.anchor;

    let unit: ChecklistPeriodicityUnit = currentPeriodicity?.unit ?? "day";
    let quantity = currentPeriodicity?.quantity ?? 1;
    let anchor: ChecklistPeriodicityAnchor = currentPeriodicity?.anchor ?? "last_submission";

    if (isValidUnit(unitRaw)) {
      unit = unitRaw;
    } else if (activeValue && unitRaw !== undefined) {
      return NextResponse.json({ error: "Unidade de periodicidade inválida" }, { status: 400 });
    }

    if (typeof quantityRaw === "number" && Number.isFinite(quantityRaw)) {
      const normalized = Math.max(1, Math.floor(quantityRaw));
      quantity = normalized;
    } else if (activeValue && quantityRaw !== undefined) {
      return NextResponse.json({ error: "Quantidade inválida" }, { status: 400 });
    }

    if (isValidAnchor(anchorRaw)) {
      anchor = anchorRaw;
    } else if (anchorRaw !== undefined) {
      return NextResponse.json({ error: "Âncora inválida" }, { status: 400 });
    }

    if (anchor !== "last_submission" && activeValue) {
      return NextResponse.json({ error: "Anchor calendar ainda não suportada" }, { status: 400 });
    }

    if (activeValue && !isValidUnit(unit)) {
      return NextResponse.json({ error: "Unidade de periodicidade obrigatória" }, { status: 400 });
    }

    if (activeValue && (!Number.isFinite(quantity) || quantity < 1)) {
      return NextResponse.json({ error: "Quantidade deve ser >= 1" }, { status: 400 });
    }

    const windowDays = computeWindowDays(quantity, unit);
    const periodicity: ChecklistTemplatePeriodicity = {
      quantity,
      unit,
      windowDays,
      anchor,
      active: activeValue,
    };

    await docRef.update({ periodicity });

    return NextResponse.json({ periodicity });
  } catch (error) {
    console.error(`PATCH /api/templates/${templateId}/periodicity failed`, error);
    return NextResponse.json({ error: "Falha ao atualizar periodicidade" }, { status: 500 });
  }
}
