import type { Timestamp } from "firebase/firestore";

export type ChecklistPhotoRule = "none" | "optional" | "required_nc";

export interface ChecklistQuestion {
  id: string;
  text: string;
  /**
   * Define se a pergunta permite fotos (opcional) ou se exige ao menos uma
   * evidência quando marcada como não conforme. Para compatibilidade com
   * dados antigos, mantemos o campo `requiresPhoto` que será derivado deste.
   */
  photoRule?: ChecklistPhotoRule;
  /**
   * @deprecated Usado apenas para manter compatibilidade com registros
   *             existentes. Utilize `photoRule`.
   */
  requiresPhoto?: boolean;
}

export type ChecklistPeriodicityUnit = "day" | "week" | "month";

export type ChecklistPeriodicityAnchor = "last_submission" | "calendar";

export interface ChecklistTemplatePeriodicity {
  quantity: number;
  unit: ChecklistPeriodicityUnit;
  windowDays: number;
  anchor: ChecklistPeriodicityAnchor;
  active: boolean;
}

export interface ChecklistTemplate {
  id: string;
  type: "operador" | "mecanico";
  title: string;
  version: number;
  isActive: boolean;
  questions: ChecklistQuestion[];
  periodicity?: ChecklistTemplatePeriodicity;
}

export type ChecklistRecurrenceStatus = "resolved" | "still_nc";

export interface ChecklistAnswerRecurrence {
  previousResponseId: string;
  status: ChecklistRecurrenceStatus;
  notedAt: string;
}

export interface ChecklistAnswer {
  questionId: string;
  response: "ok" | "nc" | "na";
  /**
   * URLs das fotos anexadas à resposta. Em respostas antigas pode existir
   * apenas `photoUrl`.
   */
  photoUrls?: string[];
  /**
   * @deprecated Campo legado mantido para leitura de checklists antigos.
   */
  photoUrl?: string;
  observation?: string;
  recurrence?: ChecklistAnswerRecurrence;
}

export type NonConformityStatus = "open" | "in_progress" | "resolved";

export interface ChecklistExtraNonConformity {
  title: string;
  description?: string;
  severity?: "baixa" | "media" | "alta";
  safetyRisk?: boolean;
  impactAvailability?: boolean;
}

export interface ChecklistNonConformityTreatment {
  questionId: string;
  summary?: string;
  responsible?: string;
  deadline?: string;
  status: NonConformityStatus;
  updatedAt?: string;
}

export interface ChecklistResponse {
  id: string;
  machineId: string;
  userId: string;
  templateId: string;
  createdAt: string;
  createdAtTs?: Timestamp;
  operatorMatricula?: string;
  operatorNome?: string | null;
  km?: number;
  horimetro?: number;
  answers: ChecklistAnswer[];
  nonConformityTreatments?: ChecklistNonConformityTreatment[];
  extraNonConformities?: ChecklistExtraNonConformity[];
}
