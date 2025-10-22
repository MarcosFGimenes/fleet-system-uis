import {
  ChecklistActorKind,
  ChecklistResponseActorSnapshot,
  ChecklistTemplate,
  ChecklistTemplateActorConfig,
  ChecklistTemplateHeader,
} from "@/types/checklist";
import {
  Firestore,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type PreviousReading = {
  value: number | null;
  sourceId: string | null;
};

const TEMPLATE_ACTOR_DEFAULT: ChecklistTemplateActorConfig = {
  kind: "operador",
  requireDriverField: false,
  requireOperatorSignature: true,
  requireMotoristSignature: false,
};

const TEMPLATE_ACTOR_DEFAULT_BY_KIND: Record<ChecklistActorKind, ChecklistTemplateActorConfig> = {
  operador: TEMPLATE_ACTOR_DEFAULT,
  motorista: {
    kind: "motorista",
    requireDriverField: true,
    requireOperatorSignature: false,
    requireMotoristSignature: true,
  },
  mecanico: {
    kind: "mecanico",
    requireDriverField: true,
    requireOperatorSignature: false,
    requireMotoristSignature: true,
  },
};

const TEMPLATE_HEADER_DEFAULT: ChecklistTemplateHeader = {
  foNumber: "",
  issueDate: "",
  revision: "",
  documentNumber: "",
};

export const getTemplateActorConfig = (
  template?: ChecklistTemplate | null,
  options?: { fallbackKind?: ChecklistActorKind },
): ChecklistTemplateActorConfig => {
  const actor = template?.actor;
  const fallbackKind = options?.fallbackKind ?? TEMPLATE_ACTOR_DEFAULT.kind;
  const kind = actor?.kind ?? template?.type ?? fallbackKind;
  const defaults = TEMPLATE_ACTOR_DEFAULT_BY_KIND[kind] ?? TEMPLATE_ACTOR_DEFAULT;
  return {
    kind,
    requireDriverField: actor?.requireDriverField ?? defaults.requireDriverField,
    requireOperatorSignature:
      actor?.requireOperatorSignature ?? defaults.requireOperatorSignature,
    requireMotoristSignature:
      actor?.requireMotoristSignature ?? defaults.requireMotoristSignature,
  } satisfies ChecklistTemplateActorConfig;
};

export const getTemplateHeader = (
  template?: ChecklistTemplate | null,
): ChecklistTemplateHeader => {
  const header = template?.header;
  return {
    foNumber: header?.foNumber ?? TEMPLATE_HEADER_DEFAULT.foNumber,
    issueDate: header?.issueDate ?? TEMPLATE_HEADER_DEFAULT.issueDate,
    revision: header?.revision ?? TEMPLATE_HEADER_DEFAULT.revision,
    documentNumber: header?.documentNumber ?? TEMPLATE_HEADER_DEFAULT.documentNumber,
  } satisfies ChecklistTemplateHeader;
};

export const getPreviousReading = async (
  db: Firestore,
  machineId: string,
): Promise<PreviousReading> => {
  try {
    const responsesCol = collection(db, "checklistResponses");
    const q = query(
      responsesCol,
      where("machineId", "==", machineId),
      orderBy("createdAtTs", "desc"),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { value: null, sourceId: null };
    }
    const doc = snap.docs[0];
    const data = doc.data() as { km?: unknown; horimetro?: unknown };
    const value =
      typeof data.km === "number"
        ? data.km
        : typeof data.horimetro === "number"
        ? data.horimetro
        : null;
    return { value, sourceId: doc.id };
  } catch (error) {
    console.error("Failed to get previous checklist reading", error);
    return { value: null, sourceId: null };
  }
};

type ResolveDriverNameParams = {
  actorKind: ChecklistActorKind;
  formDriverName?: string | null;
  operatorUser?: { matricula: string; nome: string | null | undefined } | null;
};

export const resolveDriverName = ({
  actorKind,
  formDriverName,
  operatorUser,
}: ResolveDriverNameParams): string => {
  const trimmed = formDriverName?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (actorKind === "mecanico") {
    return "";
  }
  const name = operatorUser?.nome?.trim();
  return name ?? "";
};

export const getActorSnapshot = (
  actorKind: ChecklistActorKind,
  params: {
    mechanicMatricula?: string;
    mechanicNome?: string | null;
    driverMatricula?: string;
    driverNome?: string | null;
  },
): ChecklistResponseActorSnapshot => {
  const snapshot: ChecklistResponseActorSnapshot = { kind: actorKind };
  if (actorKind === "mecanico") {
    snapshot.mechanicMatricula = params.mechanicMatricula?.trim() || null;
    snapshot.mechanicNome = params.mechanicNome?.trim() || null;
  }
  if (params.driverMatricula) {
    snapshot.driverMatricula = params.driverMatricula.trim() || null;
  }
  if (params.driverNome) {
    snapshot.driverNome = params.driverNome.trim() || null;
  }
  return snapshot;
};

export const formatDateShort = (date: Date) => {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};
