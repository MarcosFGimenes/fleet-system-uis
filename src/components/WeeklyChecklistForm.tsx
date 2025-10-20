"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Machine } from "@/types/machine";
import type {
  ChecklistTemplate,
  ChecklistQuestion,
  ChecklistAnswer,
  ChecklistResponse,
  ChecklistResponseHeaderFrozen,
} from "@/types/checklist";
import { downloadWeeklyTemplatePdf } from "@/lib/pdf";
import {
  formatDateShort,
  getActorSnapshot,
  getTemplateActorConfig,
  getTemplateHeader,
} from "@/lib/checklist";

const DAYS_IN_WEEK = 7;

const toDateOnly = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const resolveDefaultStartDate = () => {
  const today = new Date();
  const weekday = today.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday; // aim Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
};

const numberFromInput = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const cloneQuestionsState = (
  questions: ChecklistQuestion[],
  previous?: Record<string, { response: "ok" | "na" | "nc" | ""; observation: string }>,
) => {
  const base: Record<string, { response: "ok" | "na" | "nc" | ""; observation: string }> = {};
  questions.forEach((question) => {
    const existing = previous?.[question.id];
    base[question.id] = {
      response: existing?.response ?? "",
      observation: existing?.observation ?? "",
    };
  });
  return base;
};

const buildAnswer = (
  question: ChecklistQuestion,
  data: { response: "ok" | "na" | "nc" | ""; observation: string },
): ChecklistAnswer => {
  const normalized = data.response || "na";
  const answer: ChecklistAnswer = {
    questionId: question.id,
    response: normalized,
  };
  const observation = data.observation.trim();
  if (observation) {
    answer.observation = observation;
  }
  return answer;
};

type WeeklyChecklistFormProps = {
  machine: Machine;
  onCancel: () => void;
  onComplete?: () => void;
};

type DayAnswers = Record<string, { response: "ok" | "na" | "nc" | ""; observation: string }>;

type DayMetadata = {
  km: string;
  horimetro: string;
};

type WeeklyChecklistPayload = {
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
  previousKm?: number | null;
  headerFrozen?: ChecklistResponse["headerFrozen"];
  actor?: ChecklistResponse["actor"];
  signatures?: ChecklistResponse["signatures"];
};

const buildWeekDates = (start: string | null) => {
  if (!start) return [];
  const base = new Date(`${start}T12:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  base.setHours(12, 0, 0, 0);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    return date;
  });
};

export default function WeeklyChecklistForm({ machine, onCancel, onComplete }: WeeklyChecklistFormProps) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(resolveDefaultStartDate());
  const [foNumber, setFoNumber] = useState<string>("");
  const [operatorMatricula, setOperatorMatricula] = useState("");
  const [operatorNome, setOperatorNome] = useState("");
  const [driverMatricula, setDriverMatricula] = useState("");
  const [driverNome, setDriverNome] = useState("");
  const [mechanicMatricula, setMechanicMatricula] = useState("");
  const [mechanicNome, setMechanicNome] = useState("");
  const [answers, setAnswers] = useState<Record<number, DayAnswers>>({});
  const [dayMetadata, setDayMetadata] = useState<Record<number, DayMetadata>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const templateKey = useMemo(() => (machine.checklists ?? []).join("|"), [machine.checklists]);

  useEffect(() => {
    const loadTemplates = async () => {
      if (!machine.checklists?.length) {
        setTemplates([]);
        setTemplateId("");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const loaded: ChecklistTemplate[] = [];
        await Promise.all(
          machine.checklists.map(async (id) => {
            try {
              const snap = await getDoc(doc(db, "checklistTemplates", id));
              if (snap.exists()) {
                loaded.push({ id: snap.id, ...(snap.data() as Omit<ChecklistTemplate, "id">) });
              }
            } catch (err) {
              console.error("Erro ao carregar template", err);
            }
          }),
        );
        setTemplates(loaded);
        setTemplateId((current) => {
          if (loaded.find((item) => item.id === current)) {
            return current;
          }
          return loaded[0]?.id ?? "";
        });
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, [machine.id, templateKey, machine.checklists]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setAnswers({});
      return;
    }
    setAnswers((prev) => {
      const next: Record<number, DayAnswers> = {};
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        next[day] = cloneQuestionsState(selectedTemplate.questions, prev[day]);
      }
      return next;
    });
  }, [selectedTemplate]);

  useEffect(() => {
    setDayMetadata((prev) => {
      const next: Record<number, DayMetadata> = {};
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        next[day] = prev[day] ?? { km: "", horimetro: "" };
      }
      return next;
    });
  }, [selectedTemplate]);

  const weekDates = useMemo(() => buildWeekDates(startDate), [startDate]);

  const actorConfig = useMemo(() => getTemplateActorConfig(selectedTemplate ?? undefined), [selectedTemplate]);

  const templateHeader = useMemo(() => getTemplateHeader(selectedTemplate ?? undefined), [selectedTemplate]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [templateId, startDate]);

  const handleAnswerChange = (day: number, questionId: string, field: "response" | "observation", value: string) => {
    setAnswers((prev) => {
      const current = prev[day] ?? {};
      const existing = current[questionId] ?? { response: "", observation: "" };
      const updatedEntry = { ...existing };
      if (field === "response") {
        updatedEntry.response = value as DayAnswers[string]["response"];
      } else {
        updatedEntry.observation = value;
      }
      return {
        ...prev,
        [day]: {
          ...current,
          [questionId]: updatedEntry,
        },
      };
    });
  };

  const handleDayMetadataChange = (day: number, field: keyof DayMetadata, value: string) => {
    setDayMetadata((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const handleDownloadPdf = () => {
    if (!selectedTemplate) {
      alert("Selecione um template para baixar o PDF semanal.");
      return;
    }
    downloadWeeklyTemplatePdf({
      template: selectedTemplate,
      machine,
      startDate,
      foNumber: foNumber.trim(),
    });
  };

  const validateForm = () => {
    if (!selectedTemplate) {
      setError("Selecione um template para continuar.");
      return false;
    }
    if (!weekDates.length) {
      setError("Informe a data inicial da semana.");
      return false;
    }
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      const dayAnswer = answers[day];
      if (!dayAnswer) {
        setError(`Preencha todas as respostas do dia ${day + 1}.`);
        return false;
      }
      for (const question of selectedTemplate.questions) {
        const detail = dayAnswer[question.id];
        if (!detail || !detail.response) {
          setError(`Selecione uma resposta para "${question.text}" no dia ${day + 1}.`);
          return false;
        }
      }
    }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validateForm() || !selectedTemplate) {
      return;
    }
    try {
      setSubmitting(true);
      setSuccess(null);
      const responsesCol = collection(db, "checklistResponses");
      const uid = auth.currentUser?.uid ?? "admin";
      const headerTitle = selectedTemplate.title || "Checklist";
      const actorKind = actorConfig.kind;

      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const date = weekDates[day];
        const createdAt = new Date(date);
        createdAt.setHours(12, 0, 0, 0);
        const kmNumber = numberFromInput(dayMetadata[day]?.km ?? "");
        const horimetroNumber = numberFromInput(dayMetadata[day]?.horimetro ?? "");
        const dayAnswers = answers[day] ?? cloneQuestionsState(selectedTemplate.questions);
        const answersList = selectedTemplate.questions.map((question) =>
          buildAnswer(question, dayAnswers[question.id]),
        );
        const previousKm = day > 0 ? numberFromInput(dayMetadata[day - 1]?.km ?? "") : null;
        const headerFrozen: ChecklistResponseHeaderFrozen = {
          title: headerTitle,
          foNumber: templateHeader.foNumber,
          issueDate: templateHeader.issueDate,
          revision: templateHeader.revision,
          documentNumber: templateHeader.documentNumber,
          lac: "012",
          motorista: driverNome.trim() || operatorNome.trim(),
          placa: machine.placa ?? machine.tag,
          kmAtual: kmNumber,
          kmAnterior: previousKm,
          dataInspecao: formatDateShort(toDateOnly(date)),
        };
        const payload: WeeklyChecklistPayload = {
          machineId: machine.id,
          userId: uid,
          operatorMatricula: operatorMatricula.trim(),
          operatorNome: operatorNome.trim() || null,
          templateId: selectedTemplate.id,
          createdAt: createdAt.toISOString(),
          createdAtTs: serverTimestamp(),
          answers: answersList,
          previousKm,
          headerFrozen,
          actor: getActorSnapshot(actorKind, {
            mechanicMatricula: mechanicMatricula.trim() || undefined,
            mechanicNome: mechanicNome.trim() || undefined,
            driverMatricula: driverMatricula.trim() || undefined,
            driverNome: driverNome.trim() || undefined,
          }),
        };

        if (kmNumber != null) {
          payload.km = kmNumber;
        }
        if (horimetroNumber != null) {
          payload.horimetro = horimetroNumber;
        }

        await addDoc(responsesCol, payload);
      }

      setSuccess("Checklists semanais enviados com sucesso!");
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error("Erro ao enviar checklists semanais", err);
      setError("Não foi possível enviar os checklists. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestions = (day: number, questions: ChecklistQuestion[]) => {
    return (
      <div className="space-y-3">
        {questions.map((question) => {
          const dayState = answers[day]?.[question.id] ?? { response: "", observation: "" };
          return (
            <div key={question.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-sm font-medium text-[var(--text)]">{question.text}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {(
                  [
                    { value: "ok", label: "Conforme" },
                    { value: "nc", label: "Não conforme" },
                    { value: "na", label: "Não se aplica" },
                  ] as const
                ).map((option) => (
                  <label key={option.value} className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`day-${day}-q-${question.id}`}
                      value={option.value}
                      checked={dayState.response === option.value}
                      onChange={(event) => handleAnswerChange(day, question.id, "response", event.target.value)}
                      className="accent-[var(--primary)]"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
                Observações
                <textarea
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  rows={2}
                  value={dayState.observation}
                  onChange={(event) => handleAnswerChange(day, question.id, "observation", event.target.value)}
                />
              </label>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="light-card">
        <p className="text-sm text-[var(--muted)]">Carregando templates vinculados...</p>
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="light-card space-y-3">
        <p className="text-sm text-[var(--muted)]">
          Nenhum template vinculado a esta máquina. Vincule um template para habilitar o checklist semanal.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="light-card space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text)]">Checklist semanal</h2>
        <p className="text-sm text-[var(--muted)]">
          Gere o PDF para impressão e registre rapidamente as respostas da semana para o template selecionado.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
          Template do checklist
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">Selecione um template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title} (v{template.version})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
          Data inicial da semana
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
          Número da FO para impressão
          <input
            type="text"
            value={foNumber}
            onChange={(event) => setFoNumber(event.target.value)}
            placeholder="Informe para personalizar o PDF"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          />
          <span className="text-xs font-normal text-[var(--muted)]">
            O número informado aparece no cabeçalho do checklist semanal impresso.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-sm-soft transition hover:bg-[var(--primary-50)]"
        >
          Baixar checklist semanal (PDF)
        </button>
      </div>

      {selectedTemplate && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
              Matrícula do operador
              <input
                type="text"
                value={operatorMatricula}
                onChange={(event) => setOperatorMatricula(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
              Nome do operador
              <input
                type="text"
                value={operatorNome}
                onChange={(event) => setOperatorNome(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
            {actorConfig.kind === "mecanico" && (
              <>
                <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
                  Matrícula do mecânico
                  <input
                    type="text"
                    value={mechanicMatricula}
                    onChange={(event) => setMechanicMatricula(event.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
                  Nome do mecânico
                  <input
                    type="text"
                    value={mechanicNome}
                    onChange={(event) => setMechanicNome(event.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </label>
              </>
            )}
            {actorConfig.requireDriverField && (
              <>
                <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
                  Matrícula do motorista
                  <input
                    type="text"
                    value={driverMatricula}
                    onChange={(event) => setDriverMatricula(event.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-[var(--muted)]">
                  Nome do motorista
                  <input
                    type="text"
                    value={driverNome}
                    onChange={(event) => setDriverNome(event.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </label>
              </>
            )}
          </div>

          <div className="space-y-6">
            {weekDates.map((date, index) => (
              <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text)]">
                      Dia {index + 1} — {formatDateShort(toDateOnly(date))}
                    </h3>
                    <p className="text-xs text-[var(--muted)]">
                      Preencha as leituras e respostas deste dia antes de avançar para o próximo.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      <span>KM</span>
                      <input
                        type="number"
                        value={dayMetadata[index]?.km ?? ""}
                        onChange={(event) => handleDayMetadataChange(index, "km", event.target.value)}
                        className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span>Horímetro</span>
                      <input
                        type="number"
                        value={dayMetadata[index]?.horimetro ?? ""}
                        onChange={(event) => handleDayMetadataChange(index, "horimetro", event.target.value)}
                        className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                      />
                    </label>
                  </div>
                </header>
                <div className="mt-4">{renderQuestions(index, selectedTemplate.questions)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--primary-50)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm-soft transition hover:bg-[var(--primary-700)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Enviando semana..." : "Enviar semana"}
        </button>
      </div>
    </section>
  );
}
