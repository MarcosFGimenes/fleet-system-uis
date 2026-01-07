import type { Timestamp } from "firebase/firestore";

export type ChecklistPhotoRule = "none" | "optional" | "required_nc";

export type ChecklistVariableType =
  | "int"
  | "decimal"
  | "text"
  | "long_text"
  | "date"
  | "time"
  | "boolean";

export type ChecklistVariableCondition = "ok" | "nc" | "always";

/**
 * Configuração de alerta para variáveis não conformes.
 * Quando a variável é marcada como não conforme, um alerta é exibido.
 */
export interface ChecklistVariableAlertRule {
  /**
   * Cor do cartão de alerta (em formato Tailwind ou hexadecimal).
   * Ex.: "red", "amber", "orange", "#ef4444"
   */
  color: string;
  /**
   * Mensagem a ser exibida no alerta.
   */
  message: string;
  /**
   * Condição que aciona o alerta:
   * - 'nc': quando a resposta é Não Conforme
   * - 'ok': quando a resposta é Conforme (menos comum)
   * - 'always': sempre exibir
   */
  triggerCondition: "ok" | "nc" | "always";
  /**
   * Se o alerta deve ser exibido na tela inicial.
   */
  showOnHomePage?: boolean;
}

/**
 * Periodicidade própria para uma variável.
 * Permite monitorar se a variável está sendo respondida com a frequência esperada.
 */
export interface ChecklistVariablePeriodicity {
  /** Quantidade de dias/semanas/meses */
  quantity: number;
  /** Unidade de tempo */
  unit: ChecklistPeriodicityUnit;
  /** Janela de dias para considerar conforme */
  windowDays: number;
  /** Âncora da periodicidade */
  anchor: ChecklistPeriodicityAnchor;
  /** Se a periodicidade está ativa */
  active: boolean;
}

export interface ChecklistQuestionVariable {
  /**
   * Rótulo exibido ao operador quando a variável for solicitada.
   * Ex.: "Quantidade de graxa utilizada"
   */
  name: string;
  /** Tipo do valor que será solicitado. */
  type: ChecklistVariableType;
  /**
   * Condição de exibição do campo para o operador:
   * - 'ok': quando marcar Conforme
   * - 'nc': quando marcar Não Conforme
   * - 'always': sempre
   */
  condition: ChecklistVariableCondition;
  /**
   * Regra de alerta opcional para quando a variável é marcada como não conforme.
   * Se definida, um alerta será exibido na tela inicial.
   */
  alertRule?: ChecklistVariableAlertRule;
  /**
   * Periodicidade própria da variável.
   * Permite monitorar se a variável está sendo respondida com a frequência esperada.
   */
  periodicity?: ChecklistVariablePeriodicity;
}

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
   * Configuração opcional de variável associada à pergunta.
   * Quando presente, a interface do usuário poderá solicitar um valor extra
   * conforme a condição definida.
   */
  variable?: ChecklistQuestionVariable;
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

export interface ChecklistTemplateHeader {
  foNumber: string;
  issueDate: string;
  revision: string;
  documentNumber: string;
}

export type ChecklistActorKind = "operador" | "motorista" | "mecanico";

export interface ChecklistTemplateActorConfig {
  kind: ChecklistActorKind;
  requireDriverField?: boolean;
  requireOperatorSignature?: boolean;
  requireMotoristSignature?: boolean;
}

export interface ChecklistTemplate {
  id: string;
  type: ChecklistActorKind;
  title: string;
  version: number;
  isActive: boolean;
  questions: ChecklistQuestion[];
  periodicity?: ChecklistTemplatePeriodicity;
  header?: ChecklistTemplateHeader;
  actor?: ChecklistTemplateActorConfig;
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
  /**
   * Valor fornecido para a variável condicional (quando aplicável).
   * - Para tipos numéricos: number
   * - Para texto/long_text: string
   * - Para date/time: string (ISO ou 'YYYY-MM-DD' / 'HH:mm')
   * - Para boolean: boolean
   */
  variableValue?: string | number | boolean | null;
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

export interface ChecklistResponseHeaderFrozen {
  title: string;
  foNumber: string;
  issueDate: string;
  revision: string;
  documentNumber: string;
  lac: string;
  motorista: string;
  placa: string;
  kmAtual: number | null;
  kmAnterior: number | null;
  dataInspecao: string;
}

export interface ChecklistResponseActorSnapshot {
  kind: ChecklistActorKind;
  mechanicMatricula?: string | null;
  mechanicNome?: string | null;
  driverMatricula?: string | null;
  driverNome?: string | null;
}

export interface ChecklistResponseSignatures {
  operatorUrl?: string | null;
  driverUrl?: string | null;
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
  previousKm?: number | null;
  headerFrozen?: ChecklistResponseHeaderFrozen;
  actor?: ChecklistResponseActorSnapshot;
  signatures?: ChecklistResponseSignatures;
}
