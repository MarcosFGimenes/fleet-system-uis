"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import type {
  ChecklistAnswer,
  ChecklistRecurrenceStatus,
  ChecklistResponse,
  ChecklistTemplate,
} from "@/types/checklist";
import { useUserLookup } from "@/hooks/useUserLookup";
import { useNotification } from "@/hooks/useNotification";
import Notification from "@/components/Notification";
import Spinner from "@/components/Spinner";

/* ============================
   Tipagens locais
============================ */

type LoadState = "idle" | "loading" | "ready" | "error";

type Params = {
  tag: string;
};

type AnswerDraft = {
  questionId: string;
  response?: "ok" | "nc" | "na";
  observation?: string;
};

type AnswerMap = Record<string, AnswerDraft>;

type PreviousResponseMeta = {
  id: string;
  createdAt?: string | null;
};

type PreviousNcMap = Record<string, ChecklistAnswer>;

type ExtraNc = {
  title: string;
  description?: string;
  severity?: "baixa" | "media" | "alta";
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

  const [answers, setAnswers] = useState<AnswerMap>({});

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

  const { userLookup, userInfo, nome, setNome } = useUserLookup(matricula);
  const { notification, showNotification, hideNotification } = useNotification();

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

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

  const currentTemplate = useMemo(() => {
    return templates.find((tpl) => tpl.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

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
          setPreviousLoading(false);
          return;
        }

        const docSnap = previousSnap.docs[0];
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        const meta: PreviousResponseMeta = {
          id: docSnap.id,
          createdAt: data.createdAt ?? null,
        };

        const ncMap: PreviousNcMap = {};
        for (const answer of data.answers ?? []) {
          if (answer?.response === "nc") {
            ncMap[answer.questionId] = answer as ChecklistAnswer;
          }
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
    setAnswers({});
    setRecurrenceDecisions({});
    setPreviousNcMap({});
    setPreviousResponseMeta(null);
    setPreviousError(null);
  }, [selectedTemplateId]);

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

  const setRecurrenceDecision = (
    questionId: string,
    status: ChecklistRecurrenceStatus
  ) => {
    setRecurrenceDecisions((prev) => ({ ...prev, [questionId]: status }));
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

      const uploadedAnswers: ChecklistAnswer[] = [];
      for (const question of currentTemplate.questions) {
        const base = answers[question.id];
        if (!base || !base.response) continue;

        const answer: ChecklistAnswer = {
          questionId: question.id,
          response: base.response,
        };

        const observationText = base.observation?.trim();
        if (observationText) answer.observation = observationText;

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

      const kmValue = km.trim();
      const horimetroValue = horimetro.trim();
      const matriculaValue = matricula.trim();
      const nomeValue = nomeResolved ? nomeResolved.trim() : "";

      const payload: ChecklistResponsePayload = {
        machineId: machine.id,
        userId,
        operatorMatricula: matriculaValue,
        operatorNome: nomeValue || null,
        templateId: currentTemplate.id,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp(),
        answers: uploadedAnswers,
      };

      if (kmValue !== "") {
        const kmNumber = Number(kmValue);
        if (!Number.isNaN(kmNumber)) payload.km = kmNumber;
      }
      if (horimetroValue !== "") {
        const horimetroNumber = Number(horimetroValue);
        if (!Number.isNaN(horimetroNumber)) payload.horimetro = horimetroNumber;
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
      router.push("/login");
    } catch (error) {
      console.error(error);
      showNotification("Erro ao enviar checklist. Tente novamente.", "error");
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

  const submitDisabled = !currentTemplate || userLookup.state !== "found" || isSubmitting;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4">
      <div className="mx-auto max-w-3xl space-y-6">
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

        {/* Identificação */}
        <section className="rounded-xl light-card p-4 space-y-3">
          <h2 className="font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Matrícula</label>
              <input
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                placeholder="Ex: 1001"
                inputMode="numeric"
                aria-label="Matrícula do operador"
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
              {userLookup.state === "found" && nome && (
                <p className="text-xs text-[var(--success)]">Operador encontrado.</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Nome do operador</label>
              <input
                value={nome}
                readOnly
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-gray-600"
                placeholder="Preenchido automaticamente"
                aria-label="Nome do operador"
              />
            </div>
          </div>
        </section>

        {/* Dados de operação */}
        <section className="rounded-xl light-card p-4 space-y-3">
          <h2 className="font-semibold">Dados da operação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">KM</label>
              <input
                type="number"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Horímetro</label>
              <input
                type="number"
                value={horimetro}
                onChange={(e) => setHorimetro(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder-[var(--hint)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-[var(--hint)]">Tipo de checklist</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                aria-label="Selecionar template"
              >
                {templates.length > 0 ? (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (v{t.version})
                    </option>
                  ))
                ) : (
                  <option>Sem templates vinculados</option>
                )}
              </select>
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
                        {previousNc?.photoUrl && (
                          <a
                            href={previousNc.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-xs font-medium text-amber-800 underline"
                          >
                            Ver evidência anterior
                          </a>
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



