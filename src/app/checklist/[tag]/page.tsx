"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import type {
  ChecklistAnswer,
  ChecklistRecurrenceStatus,
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistPhotoRule,
  ChecklistTemplatePeriodicity,
} from "@/types/checklist";
import {
  formatDateShort,
  getActorSnapshot,
  getPreviousReading,
  getTemplateActorConfig,
  getTemplateHeader,
  resolveDriverName,
} from "@/lib/checklist";
import type { UserRole } from "@/types/user";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useUserLookup } from "@/hooks/useUserLookup";
import { useNotification } from "@/hooks/useNotification";
import Notification from "@/components/Notification";
import Spinner from "@/components/Spinner";
import SignaturePad from "@/components/SignaturePad";

/* ============================
   Tipagens locais
============================ */

type LoadState = "idle" | "loading" | "ready" | "error";

type Params = {
  tag: string;
};

type DraftPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type AnswerDraft = {
  questionId: string;
  response?: "ok" | "nc" | "na";
  observation?: string;
  photos?: DraftPhoto[];
};

type AnswerMap = Record<string, AnswerDraft>;

type PreviousResponseMeta = {
  id: string;
  createdAt?: string | null;
  km?: number | null;
  horimetro?: number | null;
};

type PreviousNcMap = Record<string, ChecklistAnswer>;

type ExtraNc = {
  title: string;
  description?: string;
  severity?: "baixa" | "media" | "alta";
};

type PeriodicityRestriction = {
  lastSubmissionAt: string;
  nextAllowedAt: string;
  intervalLabel: string;
};

const PERIODICITY_UNIT_LABEL: Record<
  ChecklistTemplatePeriodicity["unit"],
  { singular: string; plural: string }
> = {
  day: { singular: "dia", plural: "dias" },
  week: { singular: "semana", plural: "semanas" },
  month: { singular: "mês", plural: "meses" },
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const formatDateTimePtBr = (date: Date): string => {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatPeriodicityInterval = (
  periodicity: ChecklistTemplatePeriodicity,
): string => {
  const { quantity, unit } = periodicity;
  const label = PERIODICITY_UNIT_LABEL[unit];
  if (!label) return `${quantity} ${unit}`;
  return `${quantity} ${quantity === 1 ? label.singular : label.plural}`;
};

const computeNextAllowedDate = (
  periodicity: ChecklistTemplatePeriodicity,
  lastSubmission: Date,
): Date => {
  let multiplier = 1;
  if (periodicity.unit === "week") multiplier = 7;
  if (periodicity.unit === "month") multiplier = 30;
  const intervalMs = periodicity.quantity * multiplier * MS_IN_DAY;
  return new Date(lastSubmission.getTime() + intervalMs);
};

const resolveCreatedAtIso = (
  data: Omit<ChecklistResponse, "id">,
): string | null => {
  if (typeof data.createdAt === "string") return data.createdAt;
  const ts = data.createdAtTs;
  if (ts instanceof Timestamp) {
    try {
      return ts.toDate().toISOString();
    } catch (error) {
      console.error("Falha ao converter createdAtTs", error);
    }
  } else if (ts && typeof (ts as Timestamp).toDate === "function") {
    try {
      return (ts as Timestamp).toDate().toISOString();
    } catch (error) {
      console.error("Falha ao converter createdAtTs", error);
    }
  }
  return null;
};

const formatNumericPtBr = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, data] = dataUrl.split(",");
  if (!header || !data) {
    throw new Error("INVALID_DATA_URL");
  }
  const mimeMatch = header.match(/data:(.*);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(data);
  const length = binary.length;
  const buffer = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    buffer[index] = binary.charCodeAt(index);
  }
  return new Blob([buffer], { type: mimeType });
};

type ChecklistResponsePayload = {
  machineId: string;
  userId: string;
  operatorMatricula: string;
  operatorNome: string | null;
  templateId: string;
  createdAt: string;
  createdAtTs: ReturnType<typeof serverTimestamp>;
  answers: ChecklistAnswer[];
  km?: number;
  horimetro?: number;
  extraNonConformities?: ExtraNc[];
  previousKm?: number | null;
  headerFrozen?: ChecklistResponse["headerFrozen"];
  actor?: ChecklistResponse["actor"];
  signatures?: ChecklistResponse["signatures"];
};

const resolvePhotoRule = (
  question: ChecklistTemplate["questions"][number],
): ChecklistPhotoRule => {
  if (question.photoRule) return question.photoRule;
  return question.requiresPhoto ? "required_nc" : "optional";
};

const getAnswerPhotoUrls = (answer?: ChecklistAnswer) => {
  if (!answer) return [] as string[];
  if (answer.photoUrls?.length) return answer.photoUrls;
  return answer.photoUrl ? [answer.photoUrl] : [];
};

const ROLE_LABEL: Record<UserRole, string> = {
  operador: "Operador",
  motorista: "Motorista",
  mecanico: "Mecânico",
  admin: "Administrador",
};

const TEMPLATE_ROLE_LABEL: Record<ChecklistTemplate["type"], string> = {
  operador: ROLE_LABEL.operador,
  motorista: ROLE_LABEL.motorista,
  mecanico: ROLE_LABEL.mecanico,
};

/* ============================
   Ícones inline (SVG)
============================ */
function IconCheck() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.3a1 1 0 0 1-1.43.008L3.29 9.52a1 1 0 1 1 1.42-1.41l3.02 3.01 6.494-6.59a1 1 0 0 1 1.48-.24z" fill="currentColor"/>
    </svg>
  );
}
function IconX() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="M14.348 5.652a1 1 0 0 1 0 1.414L11.414 10l2.934 2.934a1 1 0 1 1-1.414 1.414L10 11.414l-2.934 2.934a1 1 0 1 1-1.414-1.414L8.586 10 5.652 7.066A1 1 0 0 1 7.066 5.652L10 8.586l2.934-2.934a1 1 0 0 1 1.414 0z" fill="currentColor"/>
    </svg>
  );
}
function IconMinus() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <rect x="4" y="9" width="12" height="2" fill="currentColor"/>
    </svg>
  );
}

/* ============================
   Botão de escolha (C / NC / N/A)
   - Branco com borda preta
   - Ao selecionar: muda para verde/vermelho/cinza
   - Ícones e foco acessíveis
============================ */
function ChoiceBtn({
  active,
  tone,
  children,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  tone: "ok" | "nc" | "na";
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors transition-shadow focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 border-2";
  // Estados de cor
  // Inativo: branco com borda PRETA
  const inactive = "bg-white text-[var(--text)] border-black shadow-sm hover:bg-[var(--primary-50)] !bg-white !text-[var(--text)] !border-black hover:!bg-[var(--primary-50)]";
  // Ativo por tom
  const activeByTone: Record<typeof tone, string> = {
    ok: "bg-[var(--success)] text-white border-[var(--success)] shadow-sm-soft !bg-[var(--success)] !border-[var(--success)]",
    nc: "bg-[var(--danger)] text-white border-[var(--danger)] shadow-sm-soft !bg-[var(--danger)] !border-[var(--danger)]",
    na: "bg-gray-500 text-white border-gray-500 shadow-sm-soft !bg-gray-500 !border-gray-500",
  };
  // Anel de foco coerente
  const focusByTone: Record<typeof tone, string> = {
    ok: "focus-visible:outline-[var(--success)]",
    nc: "focus-visible:outline-[var(--danger)]",
    na: "focus-visible:outline-gray-500",
  };

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`${base} ${active ? activeByTone[tone] : inactive} ${focusByTone[tone]}`}
      onClick={onClick}
    >
      {/* Ícone muda com o tom; quando inativo mostramos o contorno via cor de texto padrão */}
      {tone === "ok" && <IconCheck />}
      {tone === "nc" && <IconX />}
      {tone === "na" && <IconMinus />}
      <span className="sr-only">{ariaLabel}</span>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

export default function ChecklistByTagPage() {
  const { tag } = useParams<Params>();
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [matricula, setMatricula] = useState("");
  const [km, setKm] = useState("");
  const [horimetro, setHorimetro] = useState("");
  const [driverMatricula, setDriverMatricula] = useState("");
  const [driverNome, setDriverNome] = useState("");

  const [operatorSignatureDataUrl, setOperatorSignatureDataUrl] = useState<string | null>(null);
  const [driverSignatureDataUrl, setDriverSignatureDataUrl] = useState<string | null>(null);
  const [operatorSavedSignatureDataUrl, setOperatorSavedSignatureDataUrl] =
    useState<string | null>(null);
  const [operatorUseSavedSignature, setOperatorUseSavedSignature] = useState(false);
  const [operatorSignatureLoading, setOperatorSignatureLoading] = useState(false);
  const [shouldSaveOperatorSignature, setShouldSaveOperatorSignature] = useState(false);

  const [answers, setAnswers] = useState<AnswerMap>({});

  const previewUrlsRef = useRef<Set<string>>(new Set());
  const kmEditedRef = useRef(false);
  const horimetroEditedRef = useRef(false);
  const previousReadingRef = useRef<{ value: number | null; sourceId: string | null } | null>(null);

  const registerPreviewUrl = (url: string) => {
    previewUrlsRef.current.add(url);
  };

  const revokePreviewUrl = (url: string) => {
    if (previewUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(url);
    }
  };

  const clearAllPreviewUrls = () => {
    previewUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    previewUrlsRef.current.clear();
  };

  const [previousResponseMeta, setPreviousResponseMeta] =
    useState<PreviousResponseMeta | null>(null);
  const [previousNcMap, setPreviousNcMap] = useState<PreviousNcMap>({});
  const [previousLoading, setPreviousLoading] = useState(false);
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [recurrenceDecisions, setRecurrenceDecisions] = useState<
    Record<string, ChecklistRecurrenceStatus | undefined>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [extraNcs, setExtraNcs] = useState<ExtraNc[]>([]);
  const [periodicityRestriction, setPeriodicityRestriction] =
    useState<PeriodicityRestriction | null>(null);
  const [previousMachineReading, setPreviousMachineReading] = useState<number | null>(null);

  const { userLookup, userInfo, nome, setNome } = useUserLookup(matricula);
  const { notification, showNotification, hideNotification } = useNotification();

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

  useEffect(() => {
    let active = true;

    const resetSignatureState = () => {
      setOperatorSavedSignatureDataUrl(null);
      setOperatorUseSavedSignature(false);
      setOperatorSignatureDataUrl(null);
      setShouldSaveOperatorSignature(false);
      setOperatorSignatureLoading(false);
    };

    if (!userInfo) {
      resetSignatureState();
      return () => {
        active = false;
      };
    }

    setOperatorSignatureLoading(true);

    const loadSavedSignature = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", userInfo.id));
        if (!active) return;

        if (userDoc.exists()) {
          const data = userDoc.data() as { signatureDataUrl?: string | null };
          const savedDataUrl =
            typeof data.signatureDataUrl === "string" && data.signatureDataUrl.trim()
              ? data.signatureDataUrl
              : null;

          setOperatorSavedSignatureDataUrl(savedDataUrl);
          if (savedDataUrl) {
            setOperatorUseSavedSignature(true);
            setOperatorSignatureDataUrl(savedDataUrl);
            setShouldSaveOperatorSignature(false);
          } else {
            setOperatorUseSavedSignature(false);
            setOperatorSignatureDataUrl(null);
          }
        } else {
          setOperatorSavedSignatureDataUrl(null);
          setOperatorUseSavedSignature(false);
          setOperatorSignatureDataUrl(null);
          setShouldSaveOperatorSignature(false);
        }
      } catch (error) {
        console.error("Erro ao carregar assinatura salva do operador", error);
        if (!active) return;
        setOperatorSavedSignatureDataUrl(null);
        setOperatorUseSavedSignature(false);
        setOperatorSignatureDataUrl(null);
        setShouldSaveOperatorSignature(false);
      } finally {
        if (active) {
          setOperatorSignatureLoading(false);
        }
      }
    };

    loadSavedSignature();

    return () => {
      active = false;
    };
  }, [userInfo]);

  useEffect(() => {
    return () => {
      clearAllPreviewUrls();
    };
  }, []);

  /* ============================
     Carregamento inicial
  ============================ */
  useEffect(() => {
    const load = async () => {
      try {
        setState("loading");

        const machineQuery = query(
          machinesCol,
          where("tag", "==", decodeURIComponent(String(tag)))
        );
        const machineSnap = await getDocs(machineQuery);
        if (machineSnap.empty) {
          throw new Error("Máquina não encontrada pelo QR ou TAG.");
        }
        const machineDoc = machineSnap.docs[0];
        const machineData = {
          id: machineDoc.id,
          ...(machineDoc.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        if (machineData.checklists?.length) {
          const fetched: ChecklistTemplate[] = [];
          for (const tplId of machineData.checklists) {
            const tplSnap = await getDoc(doc(templatesCol, tplId));
            if (tplSnap.exists()) {
              const tpl = {
                id: tplSnap.id,
                ...(tplSnap.data() as Omit<ChecklistTemplate, "id">),
              } as ChecklistTemplate;
              if (tpl.isActive) fetched.push(tpl);
            }
          }
          setTemplates(fetched);
          if (fetched.length > 0) setSelectedTemplateId(fetched[0].id);
        } else {
          setTemplates([]);
        }

        const savedMatricula = sessionStorage.getItem("matricula");
        const savedNome = sessionStorage.getItem("nome");
        if (savedMatricula) setMatricula(savedMatricula);
        if (savedNome) setNome(savedNome);

        setState("ready");
      } catch (error) {
        console.error(error);
        setState("error");
      }
    };

    load();
  }, [machinesCol, tag, templatesCol, setNome]);

  useEffect(() => {
    let cancelled = false;
    if (!machine) {
      setPreviousMachineReading(null);
      previousReadingRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    const fetchPreviousReading = async () => {
      const reading = await getPreviousReading(db, machine.id);
      if (cancelled) return;
      setPreviousMachineReading(typeof reading.value === "number" ? reading.value : null);
      previousReadingRef.current = reading;
    };

    void fetchPreviousReading();

    return () => {
      cancelled = true;
    };
  }, [machine]);

  const currentTemplate = useMemo(() => {
    return templates.find((tpl) => tpl.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const actorConfig = useMemo(() => getTemplateActorConfig(currentTemplate), [currentTemplate]);
  const showDriverFields = actorConfig.requireDriverField || actorConfig.kind === "mecanico";
  const primaryActorLabel =
    actorConfig.kind === "mecanico"
      ? "Mecânico"
      : actorConfig.kind === "motorista"
      ? "Motorista"
      : "Operador";

  const userHasAccess = useMemo(() => {
    if (!currentTemplate || !userInfo) return false;
    if (userInfo.role === "admin") return true;
    return userInfo.role === actorConfig.kind;
  }, [actorConfig.kind, currentTemplate, userInfo]);

  /* ============================
     Buscar último checklist
  ============================ */
  useEffect(() => {
    let cancelled = false;

    const fetchPrevious = async () => {
      if (!machine || !currentTemplate) {
        if (!cancelled) {
          setPreviousLoading(false);
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPreviousError(null);
          setPeriodicityRestriction(null);
        }
        return;
      }

      try {
        setPreviousLoading(true);
        setPreviousError(null);

        const previousQuery = query(
          responsesCol,
          where("machineId", "==", machine.id),
          where("templateId", "==", currentTemplate.id),
          orderBy("createdAt", "desc"),
          limit(1)
        );

        const previousSnap = await getDocs(previousQuery);
        if (cancelled) return;

        if (previousSnap.empty) {
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPeriodicityRestriction(null);
          setPreviousLoading(false);
          return;
        }

        const docSnap = previousSnap.docs[0];
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        const createdAtIso = resolveCreatedAtIso(data);
        const meta: PreviousResponseMeta = {
          id: docSnap.id,
          createdAt: createdAtIso,
          km: typeof data.km === "number" ? data.km : null,
          horimetro: typeof data.horimetro === "number" ? data.horimetro : null,
        };

        const ncMap: PreviousNcMap = {};
        for (const answer of data.answers ?? []) {
          if (answer?.response === "nc") {
            ncMap[answer.questionId] = answer as ChecklistAnswer;
          }
        }

        if (!kmEditedRef.current && typeof data.km === "number") {
          setKm(String(data.km));
        }

        if (!horimetroEditedRef.current && typeof data.horimetro === "number") {
          setHorimetro(String(data.horimetro));
        }

        setPreviousResponseMeta(meta);
        setPreviousNcMap(ncMap);
        setRecurrenceDecisions({});
      } catch (error) {
        console.error("Erro ao carregar checklist anterior", error);
        if (!cancelled) {
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPreviousError(
            "Não foi possível verificar o checklist anterior deste equipamento."
          );
          setPeriodicityRestriction(null);
        }
      } finally {
        if (!cancelled) setPreviousLoading(false);
      }
    };

    void fetchPrevious();
    return () => {
      cancelled = true;
    };
  }, [machine, currentTemplate, responsesCol]);

  // Reset ao trocar de template
  useEffect(() => {
    clearAllPreviewUrls();
    setAnswers({});
    setRecurrenceDecisions({});
    setPreviousNcMap({});
    setPreviousResponseMeta(null);
    setPreviousError(null);
    setPeriodicityRestriction(null);
    setKm("");
    setHorimetro("");
    kmEditedRef.current = false;
    horimetroEditedRef.current = false;
    setDriverMatricula("");
    setDriverNome("");
    setOperatorSignatureDataUrl(null);
    setDriverSignatureDataUrl(null);
  }, [selectedTemplateId]);

  useEffect(() => {
    const periodicity = currentTemplate?.periodicity;
    if (!periodicity || !periodicity.active || periodicity.anchor !== "last_submission") {
      setPeriodicityRestriction(null);
      return;
    }

    const createdAt = previousResponseMeta?.createdAt;
    if (!createdAt) {
      setPeriodicityRestriction(null);
      return;
    }

    const lastDate = new Date(createdAt);
    if (Number.isNaN(lastDate.getTime())) {
      setPeriodicityRestriction(null);
      return;
    }

    const nextAllowed = computeNextAllowedDate(periodicity, lastDate);
    setPeriodicityRestriction({
      lastSubmissionAt: lastDate.toISOString(),
      nextAllowedAt: nextAllowed.toISOString(),
      intervalLabel: formatPeriodicityInterval(periodicity),
    });
  }, [currentTemplate, previousResponseMeta]);

  /* ============================
     Helpers
  ============================ */
  const setResponse = (questionId: string, value: "ok" | "nc" | "na") => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { questionId }), response: value },
    }));
  };

  const setObservation = (questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { questionId }), observation: value },
    }));
  };

  const handleKmChange = (value: string) => {
    kmEditedRef.current = true;
    setKm(value);
  };

  const handleHorimetroChange = (value: string) => {
    horimetroEditedRef.current = true;
    setHorimetro(value);
  };

  const addPhotos = (questionId: string, fileList: FileList | null) => {
    if (!fileList?.length) return;

    const items: DraftPhoto[] = Array.from(fileList).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      registerPreviewUrl(previewUrl);
      return { id: crypto.randomUUID(), file, previewUrl };
    });

    setAnswers((prev) => {
      const previous = prev[questionId] ?? { questionId };
      const currentPhotos = previous.photos ?? [];
      return {
        ...prev,
        [questionId]: {
          ...previous,
          photos: [...currentPhotos, ...items],
        },
      };
    });
  };

  const removePhoto = (questionId: string, photoId: string) => {
    setAnswers((prev) => {
      const previous = prev[questionId];
      if (!previous?.photos?.length) return prev;

      const nextPhotos = previous.photos.filter((photo) => {
        if (photo.id === photoId) {
          revokePreviewUrl(photo.previewUrl);
          return false;
        }
        return true;
      });

      return {
        ...prev,
        [questionId]: {
          ...previous,
          photos: nextPhotos,
        },
      };
    });
  };

  const setRecurrenceDecision = (
    questionId: string,
    status: ChecklistRecurrenceStatus
  ) => {
    setRecurrenceDecisions((prev) => ({ ...prev, [questionId]: status }));
  };

  const handleOperatorSignatureModeChange = (mode: "saved" | "new") => {
    if (mode === "saved") {
      if (operatorSavedSignatureDataUrl) {
        setOperatorUseSavedSignature(true);
        setOperatorSignatureDataUrl(operatorSavedSignatureDataUrl);
        setShouldSaveOperatorSignature(false);
      }
      return;
    }

    setOperatorUseSavedSignature(false);
    setOperatorSignatureDataUrl(null);
  };

  const handleOperatorSignatureSavePreference = (shouldSave: boolean) => {
    setShouldSaveOperatorSignature(shouldSave);
  };

  /* ============================
     Validação usuário
  ============================ */
  const validateUser = async () => {
    const trimmed = matricula.trim();
    if (!trimmed) {
      showNotification("Informe a matrícula.", "error");
      throw new Error("Informe a matrícula.");
    }
    if (!userInfo || userLookup.state !== "found" || userInfo.matricula !== trimmed) {
      showNotification("Matrícula não cadastrada ou permitida.", "error");
      throw new Error("Matrícula não cadastrada ou permitida.");
    }
    if (!currentTemplate) {
      showNotification("Selecione um template válido.", "error");
      throw new Error("Template inválido.");
    }
    if (userInfo.role !== "admin" && userInfo.role !== actorConfig.kind) {
      showNotification("Matrícula não cadastrada ou permitida.", "error");
      throw new Error("Matrícula não cadastrada ou permitida.");
    }
    return {
      userId: userInfo.id,
      nome: userInfo.nome,
    };
  };

  /* ============================
     Envio
  ============================ */
  const handleSubmit = async () => {
    if (!machine || !currentTemplate) return;

    setIsSubmitting(true);
    try {
      const { userId, nome: nomeResolved } = await validateUser();

      if (periodicityRestriction) {
        const nextAllowedDate = new Date(periodicityRestriction.nextAllowedAt);
        if (!Number.isNaN(nextAllowedDate.getTime()) && nextAllowedDate.getTime() > Date.now()) {
          const lastSubmissionLabel = periodicityRestriction.lastSubmissionAt
            ? formatDateTimePtBr(new Date(periodicityRestriction.lastSubmissionAt))
            : null;
          const nextAllowedLabel = formatDateTimePtBr(nextAllowedDate);
          const baseMessage = `Este checklist possui periodicidade recomendada de ${periodicityRestriction.intervalLabel}.`;
          const complement = lastSubmissionLabel
            ? ` Último envio em ${lastSubmissionLabel}. Próximo envio sugerido a partir de ${nextAllowedLabel}.`
            : ` Próximo envio sugerido a partir de ${nextAllowedLabel}.`;
          showNotification(`${baseMessage}${complement} O envio antecipado será registrado normalmente.`, "info");
        }
      }

      const previousNcIds = Object.keys(previousNcMap);
      if (previousNcIds.length && previousResponseMeta) {
        const unansweredRecurrence = previousNcIds.filter(
          (questionId) => previousNcMap[questionId] && !recurrenceDecisions[questionId]
        );

        if (unansweredRecurrence.length) {
          const missingQuestions = unansweredRecurrence
            .map(
              (questionId) =>
                currentTemplate.questions.find((q) => q.id === questionId)?.text ||
                questionId
            )
            .join(", ");

          showNotification(
            `Informe se as não conformidades anteriores foram resolvidas para: ${missingQuestions}.`,
            "warning"
          );
          return;
        }
      }

      const missing = currentTemplate.questions.filter(
        (q) => !answers[q.id]?.response
      );
      if (missing.length) {
        showNotification(`Responda todas as perguntas (${missing.length} faltando).`, "warning");
        return;
      }

      const missingPhotos = currentTemplate.questions
        .map((question) => {
          const base = answers[question.id];
          const rule = resolvePhotoRule(question);
          if (rule !== "required_nc") return null;
          if (base?.response !== "nc") return null;
          if (base.photos?.length) return null;
          return question.text;
        })
        .filter((text): text is string => Boolean(text));

      if (missingPhotos.length) {
        showNotification(
          `Adicione ao menos uma foto para as perguntas em não conformidade: ${missingPhotos.join(", ")}.`,
          "warning",
        );
        return;
      }

      const uploadedAnswers: ChecklistAnswer[] = [];
      const uploadBatchId = `${Date.now()}`;
      for (const question of currentTemplate.questions) {
        const base = answers[question.id];
        if (!base || !base.response) continue;

        const answer: ChecklistAnswer = {
          questionId: question.id,
          response: base.response,
        };

        const observationText = base.observation?.trim();
        if (observationText) answer.observation = observationText;

        const draftPhotos = base.photos ?? [];
        if (draftPhotos.length) {
          const photoUrls: string[] = [];
          for (const draft of draftPhotos) {
            const storageRef = ref(
              storage,
              `checklists/${machine.id}/${currentTemplate.id}/${uploadBatchId}/${question.id}-${draft.id}`,
            );
            try {
              await uploadBytes(storageRef, draft.file);
              const url = await getDownloadURL(storageRef);
              photoUrls.push(url);
            } catch (error) {
              console.error("Erro ao enviar foto do checklist", error);
              showNotification(
                "Não foi possível fazer upload de uma das fotos. Verifique sua conexão e tente novamente.",
                "error",
              );
              const uploadError = new Error("PHOTO_UPLOAD_ERROR");
              uploadError.name = "PhotoUploadError";
              throw uploadError;
            }
          }
          if (photoUrls.length) {
            answer.photoUrls = photoUrls;
          }
        }

        if (previousResponseMeta && previousNcMap[question.id]) {
          const recurrenceStatus = recurrenceDecisions[question.id];
          if (recurrenceStatus) {
            answer.recurrence = {
              previousResponseId: previousResponseMeta.id,
              status: recurrenceStatus,
              notedAt: new Date().toISOString(),
            };
          }
        }

        uploadedAnswers.push(answer);
      }

      if (actorConfig.requireOperatorSignature && !operatorSignatureDataUrl) {
        showNotification(
          `A assinatura do ${primaryActorLabel.toLowerCase()} é obrigatória.`,
          "warning",
        );
        return;
      }

      if (
        actorConfig.requireMotoristSignature &&
        showDriverFields &&
        !driverSignatureDataUrl
      ) {
        showNotification("A assinatura do motorista é obrigatória.", "warning");
        return;
      }

      const kmValue = km.trim();
      const horimetroValue = horimetro.trim();
      const matriculaValue = matricula.trim();
      const nomeValue = nomeResolved ? nomeResolved.trim() : "";
      const driverMatriculaValue = driverMatricula.trim();
      const driverNomeValue = driverNome.trim();

      const kmNumberRaw = kmValue !== "" ? Number(kmValue) : null;
      const kmNumber =
        kmNumberRaw != null && !Number.isNaN(kmNumberRaw) ? kmNumberRaw : null;
      const horimetroNumberRaw = horimetroValue !== "" ? Number(horimetroValue) : null;
      const horimetroNumber =
        horimetroNumberRaw != null && !Number.isNaN(horimetroNumberRaw)
          ? horimetroNumberRaw
          : null;
      const readingNumber = kmNumber ?? horimetroNumber;

      const previousReading =
        previousReadingRef.current ?? (await getPreviousReading(db, machine.id));
      previousReadingRef.current = previousReading;
      const previousReadingValue =
        typeof previousReading.value === "number" ? previousReading.value : null;

      const driverResolvedName = resolveDriverName({
        actorKind: actorConfig.kind,
        formDriverName: showDriverFields ? driverNomeValue : undefined,
        operatorUser: userInfo
          ? { matricula: userInfo.matricula, nome: userInfo.nome }
          : null,
      });

      const templateHeader = getTemplateHeader(currentTemplate);
      const inspectionDateLabel = formatDateShort(new Date());

      const actorSnapshot = getActorSnapshot(actorConfig.kind, {
        mechanicMatricula: actorConfig.kind === "mecanico" ? matriculaValue : undefined,
        mechanicNome: actorConfig.kind === "mecanico" ? nomeValue || null : undefined,
        driverMatricula: showDriverFields ? driverMatriculaValue : undefined,
        driverNome: showDriverFields ? driverNomeValue : undefined,
      });

      const uploadSignature = async (
        dataUrl: string,
        role: "operator" | "driver",
      ) => {
        const blob = dataUrlToBlob(dataUrl);
        const signatureRef = ref(
          storage,
          `checklists/${machine.id}/${currentTemplate.id}/${uploadBatchId}/signatures/${role}.png`,
        );
        await uploadBytes(signatureRef, blob);
        return getDownloadURL(signatureRef);
      };

      let operatorSignatureUrl: string | null = null;
      if (operatorSignatureDataUrl) {
        try {
          operatorSignatureUrl = await uploadSignature(operatorSignatureDataUrl, "operator");
        } catch (error) {
          console.error("Erro ao enviar assinatura do operador", error);
          showNotification(
            "Não foi possível salvar a assinatura. Tente novamente.",
            "error",
          );
          const uploadError = new Error("SIGNATURE_UPLOAD_ERROR");
          uploadError.name = "SignatureUploadError";
          throw uploadError;
        }
      }

      if (shouldSaveOperatorSignature && operatorSignatureDataUrl) {
        try {
          await setDoc(
            doc(db, "users", userId),
            {
              signatureDataUrl: operatorSignatureDataUrl,
              signatureUpdatedAt: serverTimestamp(),
              matricula: userInfo?.matricula ?? matriculaValue,
            },
            { merge: true },
          );
          setOperatorSavedSignatureDataUrl(operatorSignatureDataUrl);
          setOperatorUseSavedSignature(true);
          setShouldSaveOperatorSignature(false);
        } catch (error) {
          console.error("Erro ao salvar assinatura do operador", error);
          showNotification(
            "Não foi possível salvar a assinatura para uso futuro.",
            "warning",
          );
        }
      }

      let driverSignatureUrl: string | null = null;
      if (driverSignatureDataUrl) {
        try {
          driverSignatureUrl = await uploadSignature(driverSignatureDataUrl, "driver");
        } catch (error) {
          console.error("Erro ao enviar assinatura do motorista", error);
          showNotification(
            "Não foi possível salvar a assinatura do motorista. Tente novamente.",
            "error",
          );
          const uploadError = new Error("SIGNATURE_UPLOAD_ERROR");
          uploadError.name = "SignatureUploadError";
          throw uploadError;
        }
      }

      const headerFrozen = {
        title: currentTemplate.title,
        foNumber: templateHeader.foNumber,
        issueDate: templateHeader.issueDate,
        revision: templateHeader.revision,
        documentNumber: templateHeader.documentNumber,
        lac: "012",
        motorista: driverResolvedName,
        placa: machine.placa ?? "",
        kmAtual: typeof readingNumber === "number" ? readingNumber : null,
        kmAnterior: previousReadingValue,
        dataInspecao: inspectionDateLabel,
      } satisfies NonNullable<ChecklistResponse["headerFrozen"]>;

      const payload: ChecklistResponsePayload = {
        machineId: machine.id,
        userId,
        operatorMatricula: matriculaValue,
        operatorNome: nomeValue || null,
        templateId: currentTemplate.id,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp(),
        answers: uploadedAnswers,
        previousKm: previousReadingValue,
        headerFrozen,
        actor: actorSnapshot,
        signatures: {
          operatorUrl: operatorSignatureUrl,
          driverUrl: driverSignatureUrl,
        },
      };

      if (kmNumber != null) {
        payload.km = kmNumber;
      }
      if (horimetroNumber != null) {
        payload.horimetro = horimetroNumber;
      }

      // Anexa NCs extras (se houver título preenchido)
      const extras = extraNcs
        .map((extra) => {
          const title = extra.title.trim();
          if (!title) return null;

          const normalized: ExtraNc = { title };

          const description = extra.description?.trim();
          if (description) normalized.description = description;

          if (extra.severity) normalized.severity = extra.severity;

          return normalized;
        })
        .filter((extra): extra is ExtraNc => extra !== null);

      if (extras.length) payload.extraNonConformities = extras;

      await addDoc(responsesCol, payload);

      showNotification("Checklist enviado com sucesso!", "success");
      clearAllPreviewUrls();
      if (operatorUseSavedSignature && operatorSavedSignatureDataUrl) {
        setOperatorSignatureDataUrl(operatorSavedSignatureDataUrl);
      } else {
        setOperatorSignatureDataUrl(null);
      }
      setDriverSignatureDataUrl(null);
      setDriverMatricula("");
      setDriverNome("");
      router.push("/login");
    } catch (error) {
      console.error(error);
      if (
        !(
          error instanceof Error &&
          (error.name === "PhotoUploadError" || error.name === "SignatureUploadError")
        )
      ) {
        showNotification("Erro ao enviar checklist. Tente novamente.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ============================
     Render
  ============================ */
  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--surface)] text-[var(--text)]">
        <div className="flex items-center gap-3">
          <Spinner />
          <p>Carregando checklist…</p>
        </div>
      </div>
    );
  }

  if (state === "error" || !machine) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--surface)] text-[var(--text)]">
        <div className="rounded-xl light-card p-6">
          <p className="text-[var(--danger)] font-semibold">Máquina não encontrada pelo QR ou TAG.</p>
        </div>
      </div>
    );
  }

  const hasPreviousNc = Object.keys(previousNcMap).length > 0;
  const previousChecklistDate = previousResponseMeta?.createdAt
    ? new Date(previousResponseMeta.createdAt)
    : null;
  const previousChecklistDateLabel =
    previousChecklistDate && !Number.isNaN(previousChecklistDate.getTime())
      ? previousChecklistDate.toLocaleString()
      : null;

  const periodicityNextAllowedDate = periodicityRestriction?.nextAllowedAt
    ? new Date(periodicityRestriction.nextAllowedAt)
    : null;
  const periodicityLastDate = periodicityRestriction?.lastSubmissionAt
    ? new Date(periodicityRestriction.lastSubmissionAt)
    : null;
  const periodicityAlertActive =
    periodicityNextAllowedDate && !Number.isNaN(periodicityNextAllowedDate.getTime())
      ? periodicityNextAllowedDate.getTime() > Date.now()
      : false;
  const periodicityLastLabel =
    periodicityLastDate && !Number.isNaN(periodicityLastDate.getTime())
      ? formatDateTimePtBr(periodicityLastDate)
      : null;
  const periodicityNextAllowedLabel =
    periodicityNextAllowedDate && !Number.isNaN(periodicityNextAllowedDate.getTime())
      ? formatDateTimePtBr(periodicityNextAllowedDate)
      : null;

  const submitDisabled =
    !currentTemplate || userLookup.state !== "found" || !userHasAccess || isSubmitting;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 p-5 text-blue-50 shadow-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100/80">
              Tipo de checklist
            </p>
            <h2 className="text-xl font-semibold">Selecione o checklist antes de começar</h2>
            <p className="text-sm text-blue-100/90">
              Escolha o checklist mais adequado para a máquina antes de preencher os dados.
            </p>
          </div>

          <div className="mt-4">
            {templates.length > 0 ? (
              <>
                <label htmlFor="checklist-template" className="sr-only">
                  Tipo de checklist
                </label>
                <select
                  id="checklist-template"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="w-full rounded-full border border-white/20 bg-white/95 px-5 py-3 text-base font-semibold text-blue-900 shadow-inner transition focus:border-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600"
                  aria-label="Selecionar tipo de checklist"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id} className="text-blue-900">
                      {template.title} (v{template.version})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="rounded-full bg-white/15 px-5 py-3 text-sm font-medium text-blue-100">
                Nenhum checklist está vinculado a esta máquina no momento.
              </p>
            )}
          </div>
        </section>

        {/* Cabeçalho */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Checklist – {machine.modelo}</h1>
          <p className="text-sm text-[var(--hint)]">
            TAG:{" "}
            <code className="rounded bg-[var(--surface)] px-2 py-0.5 text-[var(--muted)] border border-[var(--border)]">
              {machine.tag}
            </code>
          </p>
        </header>

        {periodicityRestriction && periodicityAlertActive && (
          <section className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-4 space-y-1 text-[var(--text)]">
            <p className="font-semibold text-[var(--warning)]">Checklist realizado recentemente</p>
            <p className="text-sm">
              Periodicidade recomendada: {periodicityRestriction.intervalLabel}.
              {periodicityLastLabel ? ` Último envio em ${periodicityLastLabel}.` : ""}
              {periodicityNextAllowedLabel
                ? ` Próximo envio sugerido a partir de ${periodicityNextAllowedLabel}.`
                : ""}
              {" O envio antecipado será computado normalmente."}
            </p>
          </section>
        )}

        {/* Identificação */}
        <section className="rounded-xl light-card p-4 space-y-3">
          <h2 className="font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Matrícula do {primaryActorLabel.toLowerCase()}</label>
              <input
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                placeholder="Ex: 1001"
                inputMode="numeric"
                aria-label={`Matrícula do ${primaryActorLabel.toLowerCase()}`}
              />
              {userLookup.state === "searching" && (
                <p className="text-xs text-[var(--hint)]">Buscando matrícula…</p>
              )}
              {userLookup.state === "not_found" && (
                <p className="text-xs text-[var(--danger)]">{userLookup.message}</p>
              )}
              {userLookup.state === "error" && (
                <p className="text-xs text-[var(--danger)]">{userLookup.message}</p>
              )}
              {userLookup.state === "found" && nome && userHasAccess && (
                <p className="text-xs text-[var(--success)]">{primaryActorLabel} encontrado.</p>
              )}
              {userLookup.state === "found" && nome && currentTemplate && !userHasAccess && userInfo && (
                <p className="text-xs text-[var(--danger)]">
                  Usuário com função {ROLE_LABEL[userInfo.role]} não possui permissão para checklists do tipo {TEMPLATE_ROLE_LABEL[actorConfig.kind]}.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Nome do {primaryActorLabel.toLowerCase()}</label>
              <input
                value={nome}
                readOnly
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-gray-600"
                placeholder="Preenchido automaticamente"
                aria-label={`Nome do ${primaryActorLabel.toLowerCase()}`}
              />
            </div>
          </div>

          {showDriverFields && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm text-[var(--hint)]">Matrícula do motorista (opcional)</label>
                <input
                  value={driverMatricula}
                  onChange={(event) => setDriverMatricula(event.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                  placeholder="Ex: 2002"
                  aria-label="Matrícula do motorista"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-[var(--hint)]">Nome do motorista (opcional)</label>
                <input
                  value={driverNome}
                  onChange={(event) => setDriverNome(event.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                  placeholder="Informe o nome, se necessário"
                  aria-label="Nome do motorista"
                />
              </div>
            </div>
          )}
        </section>

        {/* Dados de operação */}
        <section className="rounded-xl light-card p-4 space-y-3">
          <h2 className="font-semibold">Dados da operação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">KM</label>
              <input
                type="number"
                value={km}
                onChange={(e) => handleKmChange(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
              {previousResponseMeta?.km != null && (
                <p className="text-xs text-[var(--hint)]">
                  Último KM registrado: {formatNumericPtBr(previousResponseMeta.km)}
                </p>
              )}
              {previousMachineReading != null && (
                <p className="text-xs text-[var(--hint)]">
                  Última leitura da máquina: {formatNumericPtBr(previousMachineReading)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Horímetro</label>
              <input
                type="number"
                value={horimetro}
                onChange={(e) => handleHorimetroChange(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
              {previousResponseMeta?.horimetro != null && (
                <p className="text-xs text-[var(--hint)]">
                  Último horímetro registrado: {formatNumericPtBr(previousResponseMeta.horimetro)}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Perguntas */}
        <section className="rounded-xl light-card p-4 space-y-4">
          <h2 className="font-semibold">Perguntas</h2>

          {currentTemplate ? (
            <div className="space-y-4">
              {previousLoading && (
                <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
                  Verificando checklist anterior…
                </div>
              )}

              {!previousLoading && previousError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {previousError}
                </div>
              )}

              {!previousLoading && !previousError && hasPreviousNc && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  Encontramos não conformidades no checklist anterior
                  {previousChecklistDateLabel ? ` (${previousChecklistDateLabel})` : ""}. Informe se cada item foi
                  resolvido ou permanece em não conformidade.
                </div>
              )}

              {currentTemplate.questions.map((question, index) => {
                const previousNc = previousNcMap[question.id];
                const recurrenceStatus = recurrenceDecisions[question.id];
                const isRecurrence = Boolean(previousNc);
                const previousPhotos = getAnswerPhotoUrls(previousNc);
                const photoRule = resolvePhotoRule(question);
                const draftPhotos = answers[question.id]?.photos ?? [];
                const isNc = answers[question.id]?.response === "nc";
                const requirePhoto = photoRule === "required_nc";
                const allowPhotos = photoRule !== "none";
                const missingRequiredPhoto = requirePhoto && isNc && draftPhotos.length === 0;

                return (
                  <div key={question.id} className="rounded-lg border border-[var(--border)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium">
                        <span className="mr-2 rounded-full bg-[var(--surface)] px-2 py-0.5 text-sm text-[var(--hint)] border border-[var(--border)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {question.text}
                      </p>
                    </div>

                    {isRecurrence && (
                      <div className="mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                        <p>
                          Este item foi marcado como não conforme no checklist anterior
                          {previousChecklistDateLabel ? ` (${previousChecklistDateLabel})` : ""}. Informe se a não
                          conformidade foi resolvida.
                        </p>
                        {previousNc?.observation && (
                          <p className="text-xs text-amber-700/80">
                            Observação anterior: <span className="text-amber-800">{previousNc.observation}</span>
                          </p>
                        )}
                        {previousPhotos.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {previousPhotos.map((photoUrl, photoIndex) => (
                              <a
                                key={`${question.id}-previous-${photoIndex}-${photoUrl}`}
                                href={photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative block h-20 w-28 overflow-hidden rounded-md border border-amber-400/60"
                              >
                                <img
                                  src={photoUrl}
                                  alt={`Foto ${photoIndex + 1} da última não conformidade desta pergunta`}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                                <span className="absolute inset-x-0 bottom-0 bg-amber-900/80 px-1 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-amber-50">
                                  Foto anterior
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-3 text-xs sm:text-sm">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`recurrence-${question.id}`}
                              value="resolved"
                              checked={recurrenceStatus === "resolved"}
                              onChange={() => setRecurrenceDecision(question.id, "resolved")}
                              className="accent-[var(--success)]"
                            />
                            <span>Resolvido</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`recurrence-${question.id}`}
                              value="still_nc"
                              checked={recurrenceStatus === "still_nc"}
                              onChange={() => setRecurrenceDecision(question.id, "still_nc")}
                              className="accent-amber-600"
                            />
                            <span>Permanece não conforme</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--muted)]">Resultado:</span>

                        {/* Grupo de botões (C / NC / N/A) */}
                        <div className="flex gap-2">
                          <ChoiceBtn
                            tone="ok"
                            active={answers[question.id]?.response === "ok"}
                            onClick={() => setResponse(question.id, "ok")}
                            ariaLabel="Marcar como Conforme"
                          >
                            C
                          </ChoiceBtn>

                          <ChoiceBtn
                            tone="nc"
                            active={answers[question.id]?.response === "nc"}
                            onClick={() => setResponse(question.id, "nc")}
                            ariaLabel="Marcar como Não Conforme"
                          >
                            NC
                          </ChoiceBtn>

                          <ChoiceBtn
                            tone="na"
                            active={answers[question.id]?.response === "na"}
                            onClick={() => setResponse(question.id, "na")}
                            ariaLabel="Marcar como Não se Aplica"
                          >
                            N/A
                          </ChoiceBtn>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm text-[var(--hint)]">Observações</label>
                        <textarea
                          value={answers[question.id]?.observation ?? ""}
                          onChange={(e) => setObservation(question.id, e.target.value)}
                          rows={3}
                          placeholder="Registre detalhes importantes, evidências ou observações adicionais"
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--hint)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>

                      {allowPhotos && (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <label className="text-sm font-medium text-[var(--hint)]">
                              {requirePhoto
                                ? "Fotos (obrigatório em caso de NC)"
                                : "Fotos (opcional)"}
                            </label>
                            {missingRequiredPhoto && (
                              <span className="text-xs font-semibold text-[var(--danger)]">
                                Adicione ao menos uma foto quando marcar NC.
                              </span>
                            )}
                          </div>

                          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--hint)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]">
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="sr-only"
                              onChange={(event) => {
                                addPhotos(question.id, event.target.files);
                                event.target.value = "";
                              }}
                            />
                            <span className="font-semibold">Adicionar fotos</span>
                            <span className="text-xs text-[var(--muted)]">
                              Selecione uma ou mais imagens (.jpg, .png, .webp)
                            </span>
                          </label>

                          {draftPhotos.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                              {draftPhotos.map((photo, photoIndex) => (
                                <div
                                  key={photo.id}
                                  className="relative h-24 w-32 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]"
                                >
                                  <img
                                    src={photo.previewUrl}
                                    alt={`Pré-visualização da foto ${photoIndex + 1} da pergunta ${question.text}`}
                                    className="h-full w-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removePhoto(question.id, photo.id)}
                                    className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow hover:bg-black/90"
                                  >
                                    Remover
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--hint)]">Nenhum template selecionado ou vinculado.</p>
          )}
        </section>

        {/* NCs Extras */}
        <section className="rounded-xl light-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Adicionar não conformidades que não estão nas perguntas</h2>
            <button
              type="button"
              onClick={() => setExtraNcs((prev) => [...prev, { title: "" }])}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--primary-700)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
            >
              + Adicionar
            </button>
          </div>

          {extraNcs.length === 0 && (
            <p className="text-sm text-[var(--hint)]">Se necessário, registre aqui qualquer NC adicional observada.</p>
          )}

          <div className="space-y-3">
            {extraNcs.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-[var(--border)] p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-3">
                    <label className="text-sm text-[var(--hint)]">Título da NC *</label>
                    <input
                      value={item.title}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExtraNcs((prev) => prev.map((x, i) => (i === idx ? { ...x, title: v } : x)));
                      }}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      placeholder="Ex.: Vazamento em mangueira hidráulica"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-[var(--hint)]">Severidade</label>
                    <select
                      value={item.severity || ""}
                      onChange={(e) => {
                        const v = e.target.value as ExtraNc["severity"];
                        setExtraNcs((prev) => prev.map((x, i) => (i === idx ? { ...x, severity: (v || undefined) } : x)));
                      }}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                    >
                      <option value="">—</option>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <label className="text-sm text-[var(--hint)]">Descrição</label>
                    <textarea
                      value={item.description || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExtraNcs((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                      }}
                      rows={2}
                      placeholder="Detalhe a situação observada"
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--hint)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setExtraNcs((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-sm font-medium text-[var(--danger)] hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Assinaturas */}
        <section className="rounded-xl light-card p-4 space-y-4">
          <h2 className="font-semibold">Assinaturas</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text)]">
                Assinatura do {primaryActorLabel.toLowerCase()}
              </p>
              <p className="text-xs text-[var(--hint)]">
                Confirmar o checklist como {primaryActorLabel.toLowerCase()}.
              </p>
            </div>

            {operatorSignatureLoading ? (
              <p className="text-xs text-[var(--hint)]">Carregando assinatura salva...</p>
            ) : operatorSavedSignatureDataUrl ? (
              <div className="flex flex-wrap gap-4 text-sm text-[var(--text)]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="operator-signature-mode"
                    value="saved"
                    checked={operatorUseSavedSignature}
                    onChange={() => handleOperatorSignatureModeChange("saved")}
                  />
                  Usar assinatura salva
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="operator-signature-mode"
                    value="new"
                    checked={!operatorUseSavedSignature}
                    onChange={() => handleOperatorSignatureModeChange("new")}
                  />
                  Desenhar nova assinatura
                </label>
              </div>
            ) : null}

            {operatorUseSavedSignature && operatorSavedSignatureDataUrl ? (
              <div className="rounded-md border border-[var(--border)] bg-white p-4">
                <img
                  src={operatorSavedSignatureDataUrl}
                  alt={`Assinatura salva do ${primaryActorLabel.toLowerCase()}`}
                  className="mx-auto max-h-32 w-auto"
                />
                <p className="mt-2 text-center text-xs text-[var(--hint)]">
                  Matrícula vinculada: {userInfo?.matricula ?? matricula}
                </p>
              </div>
            ) : (
              <SignaturePad
                label=""
                required={actorConfig.requireOperatorSignature}
                onChange={(value) => {
                  setOperatorSignatureDataUrl(value);
                  if (!value) {
                    handleOperatorSignatureSavePreference(false);
                  }
                }}
              />
            )}

            {!operatorUseSavedSignature && !operatorSignatureLoading && (
              <label className="flex items-center gap-2 text-xs text-[var(--text)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  checked={shouldSaveOperatorSignature}
                  onChange={(event) =>
                    handleOperatorSignatureSavePreference(event.target.checked)
                  }
                />
                Salvar assinatura para os próximos checklists.
              </label>
            )}
          </div>
          {(showDriverFields || actorConfig.kind === "mecanico" || actorConfig.requireMotoristSignature) && (
            <SignaturePad
              label="Assinatura do motorista"
              description={
                actorConfig.kind === "mecanico"
                  ? "Opcional – use quando houver acompanhamento do motorista."
                  : "Assinatura do motorista responsável pelo equipamento."
              }
              required={actorConfig.requireMotoristSignature}
              onChange={setDriverSignatureDataUrl}
            />
          )}
        </section>

        {/* Ações */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--success)] px-5 py-2 font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-[var(--success)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={submitDisabled}
          >
            {isSubmitting ? <Spinner /> : "Enviar Checklist"}
          </button>
        </div>
      </div>

      {notification.show && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
        />
      )}
    </div>
  );
}



