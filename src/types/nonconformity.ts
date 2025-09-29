export type Severity = "baixa" | "media" | "alta";

export type NcStatus =
  | "aberta"
  | "em_execucao"
  | "aguardando_peca"
  | "bloqueada"
  | "resolvida";

export type TelemetryRef = {
  hours?: number;
  odometerKm?: number;
  fuelUsedL?: number;
  idleTimeH?: number;
  faultCodes?: string[];
  windowStart?: string;
  windowEnd?: string;
};

export type NcAction = {
  id: string;
  type: "corretiva" | "preventiva";
  description: string;
  owner?: { id: string; nome?: string };
  startedAt?: string;
  completedAt?: string;
  effective?: boolean;
};

export type NonConformity = {
  id: string;
  title: string;
  description?: string;
  severity?: Severity;
  safetyRisk?: boolean;
  impactAvailability?: boolean;
  status: NcStatus;
  dueAt?: string;
  createdAt: string;
  createdBy: { id: string; matricula: string; nome?: string };
  linkedAsset: { id: string; tag: string; modelo?: string; tipo?: string; setor?: string };
  linkedTemplateId?: string;
  source: "checklist_question" | "checklist_extra";
  originChecklistResponseId: string;
  originQuestionId?: string;
  rootCause?: string;
  actions?: NcAction[];
  recurrenceOfId?: string;
  telemetryRef?: TelemetryRef;
  yearMonth: string;
  severityRank: number;
  systemCategory?: string;
};
