export type ChecklistAnswer = {
  questionId: string;
  response: "ok" | "nc" | "na";
  observation?: string;
};

export type ExtraNonConformity = {
  title?: string;
  description?: string;
  severity?: string;
  safetyRisk?: boolean;
  impactAvailability?: boolean;
};

export type ChecklistResponseDoc = {
  machineId: string;
  userId: string;
  operatorMatricula?: string;
  operatorNome?: string | null;
  templateId: string;
  createdAt?: string;
  answers?: ChecklistAnswer[];
  extraNonConformities?: ExtraNonConformity[];
};

export type TemplateQuestion = {
  id: string;
  text: string;
  systemCategory?: string;
  system?: string;
  category?: string;
  group?: string;
  section?: string;
};

export type MachineDoc = {
  tag?: string;
  modelo?: string;
  tipo?: string;
  setor?: string;
};

export type ExistingNcInfo = {
  id: string;
  createdAt: number;
  normalizedTitle: string;
  systemCategory?: string;
};

export type TelemetrySnapshot = {
  hours?: number;
  odometerKm?: number;
  fuelUsedL?: number;
  idleTimeH?: number;
  faultCodes?: string[];
  windowStart?: string;
  windowEnd?: string;
} | null;

export type ExplosionDoc = {
  title: string;
  description?: string | null;
  severity: string;
  safetyRisk: boolean;
  impactAvailability: boolean;
  status: "aberta";
  dueAt: string;
  createdAt: string;
  createdBy: { id: string; matricula: string; nome?: string };
  linkedAsset: { id: string; tag: string; modelo?: string; tipo?: string; setor?: string };
  linkedTemplateId: string;
  source: "checklist_question" | "checklist_extra";
  originChecklistResponseId: string;
  originQuestionId?: string | null;
  rootCause: null;
  actions: [];
  recurrenceOfId?: string | null;
  telemetryRef: TelemetrySnapshot;
  yearMonth: string;
  severityRank: number;
  systemCategory?: string | null;
  normalizedTitle: string;
};

const SEVERITY_RANK: Record<string, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

const DUE_DAYS: Record<string, number> = {
  baixa: 10,
  media: 5,
  alta: 2,
};

function computeDueAt(createdAtISO: string, severity: string): string {
  const date = new Date(createdAtISO);
  const days = DUE_DAYS[severity] ?? DUE_DAYS.media;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function computeYearMonth(createdAtISO: string): string {
  return createdAtISO.slice(0, 7);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function severityRank(severity?: string): number {
  return SEVERITY_RANK[severity ?? "media"] ?? SEVERITY_RANK.media;
}

function extractSystem(question?: TemplateQuestion): string | undefined {
  if (!question) return undefined;
  return (
    question.systemCategory ||
    question.system ||
    question.category ||
    question.group ||
    question.section
  );
}

function findRecurrence(
  existing: ExistingNcInfo[],
  normalizedTitle: string,
  systemCategory?: string,
): string | undefined {
  return existing.find((item) => {
    if (systemCategory && item.systemCategory && item.systemCategory === systemCategory) {
      return true;
    }
    return item.normalizedTitle === normalizedTitle;
  })?.id;
}

export function mapChecklistResponseToDocs(options: {
  responseId: string;
  response: ChecklistResponseDoc;
  machine?: MachineDoc;
  templateQuestions: Map<string, TemplateQuestion>;
  recent: ExistingNcInfo[];
  telemetry?: TelemetrySnapshot;
  createdAtISO: string;
}): ExplosionDoc[] {
  const { responseId, response, machine, templateQuestions, recent, telemetry, createdAtISO } = options;
  const docs: ExplosionDoc[] = [];

  const baseAsset = {
    id: response.machineId,
    tag: machine?.tag ?? "",
    modelo: machine?.modelo,
    tipo: machine?.tipo,
    setor: machine?.setor,
  };

  const createdBy = {
    id: response.userId,
    matricula: response.operatorMatricula || response.userId,
    nome: response.operatorNome ?? undefined,
  };

  const pushRecord = (
    payload: {
      title: string;
      description?: string;
      severity?: string;
      safetyRisk?: boolean;
      impactAvailability?: boolean;
      source: "checklist_question" | "checklist_extra";
      originQuestionId?: string;
      systemCategory?: string;
    },
  ) => {
    const severity = (payload.severity ?? "media") as string;
    const normalizedTitle = normalize(payload.title);
    const recurrenceId = findRecurrence(recent, normalizedTitle, payload.systemCategory);

    docs.push({
      title: payload.title,
      description: payload.description ?? null,
      severity,
      safetyRisk: payload.safetyRisk ?? false,
      impactAvailability: payload.impactAvailability ?? false,
      status: "aberta",
      dueAt: computeDueAt(createdAtISO, severity),
      createdAt: createdAtISO,
      createdBy,
      linkedAsset: baseAsset,
      linkedTemplateId: response.templateId,
      source: payload.source,
      originChecklistResponseId: responseId,
      originQuestionId: payload.originQuestionId ?? null,
      rootCause: null,
      actions: [],
      recurrenceOfId: recurrenceId ?? null,
      telemetryRef: telemetry ?? null,
      yearMonth: computeYearMonth(createdAtISO),
      severityRank: severityRank(severity),
      systemCategory: payload.systemCategory ?? null,
      normalizedTitle,
    });
  };

  for (const answer of response.answers ?? []) {
    if (answer.response !== "nc") continue;
    const question = templateQuestions.get(answer.questionId);
    pushRecord({
      title: question?.text ?? `Pergunta ${answer.questionId}`,
      description: answer.observation,
      severity: "media",
      source: "checklist_question",
      originQuestionId: answer.questionId,
      systemCategory: extractSystem(question),
    });
  }

  for (const extra of response.extraNonConformities ?? []) {
    const title = extra.title?.trim();
    if (!title) continue;
    pushRecord({
      title,
      description: extra.description,
      severity: extra.severity,
      safetyRisk: extra.safetyRisk,
      impactAvailability: extra.impactAvailability,
      source: "checklist_extra",
    });
  }

  return docs;
}
