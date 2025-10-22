"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { saveChecklistPdf } from "@/lib/pdf";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  getTemplateActorConfig,
  resolvePrimaryActorLabel,
} from "@/lib/checklist";
import {
  Machine,
  resolveMachineActorKind,
  resolveMachineActorLabel,
  resolveMachineFleetType,
} from "@/types/machine";
import {
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistNonConformityTreatment,
  ChecklistExtraNonConformity,
  NonConformityStatus,
} from "@/types/checklist";

const getAnswerPhotos = (answer: ChecklistResponse["answers"][number]) => {
  if (answer.photoUrls?.length) {
    return answer.photoUrls;
  }
  return answer.photoUrl ? [answer.photoUrl] : [];
};

type Params = {
  id: string;
};

type QuestionNonConformityItem = {
  key: string;
  type: "question";
  answer: ChecklistResponse["answers"][number];
  title: string;
  photos: string[];
};

type ExtraNonConformityItem = {
  key: string;
  type: "extra";
  extra: ChecklistExtraNonConformity;
  title: string;
};

type NonConformityItem = QuestionNonConformityItem | ExtraNonConformityItem;

export default function ResponseDetailPage() {
  const { id } = useParams<Params>();
  const router = useRouter();
  const [response, setResponse] = useState<ChecklistResponse | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [treatmentDrafts, setTreatmentDrafts] = useState<
    Record<string, ChecklistNonConformityTreatment>
  >({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const responseSnap = await getDoc(doc(db, "checklistResponses", String(id)));
        if (!responseSnap.exists()) {
          if (!cancelled) {
            setResponse(null);
            setMachine(null);
            setTemplate(null);
            setTreatmentDrafts({});
            setLoadError("Checklist não encontrado.");
          }
          return;
        }
        const responseRaw = responseSnap.data() as Omit<ChecklistResponse, "id">;
        const responseData: ChecklistResponse = { id: responseSnap.id, ...responseRaw };
        if (cancelled) {
          return;
        }

        setResponse(responseData);
        setTreatmentDrafts(() =>
          Object.fromEntries(
            (responseData.nonConformityTreatments ?? []).map((item) => [
              item.questionId,
              item,
            ]),
          ),
        );

        const [machineSnap, templateSnap] = await Promise.all([
          getDoc(doc(db, "machines", responseData.machineId)),
          getDoc(doc(db, "checklistTemplates", responseData.templateId)),
        ]);

        if (cancelled) {
          return;
        }

        if (machineSnap.exists()) {
          const machineData = machineSnap.data() as Omit<Machine, "id">;
          setMachine({
            id: machineSnap.id,
            ...machineData,
            fleetType: resolveMachineFleetType(machineData.fleetType),
          });
        } else {
          setMachine(null);
        }

        if (templateSnap.exists()) {
          setTemplate({
            id: templateSnap.id,
            ...(templateSnap.data() as Omit<ChecklistTemplate, "id">),
          });
        } else {
          setTemplate(null);
        }
      } catch (error) {
        console.error("Erro ao carregar checklist", error);
        if (!cancelled) {
          setLoadError("Não foi possível carregar o checklist. Tente novamente mais tarde.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[200px] text-[var(--muted)]">
        Carregando...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid place-items-center min-h-[200px] text-[var(--muted)]">
        {loadError}
      </div>
    );
  }

  if (!response) {
    return (
      <div className="grid place-items-center min-h-[200px] text-[var(--muted)]">
        Checklist não encontrado.
      </div>
    );
  }

  const fallbackActorKind = resolveMachineActorKind(machine ?? undefined);
  const actorConfig = getTemplateActorConfig(template, {
    fallbackKind: fallbackActorKind,
  });
  const machineActorLabel = resolveMachineActorLabel(machine ?? undefined);
  const primaryActorLabel = resolvePrimaryActorLabel(
    actorConfig.kind,
    machineActorLabel,
  );
  const primaryActorLower = primaryActorLabel.toLowerCase();

  const questionText = (questionId: string) =>
    template?.questions.find((question) => question.id === questionId)?.text ?? questionId;

  const questionNonConformities: QuestionNonConformityItem[] = response.answers
    .filter((answer) => answer.response === "nc")
    .map((answer) => ({
      key: answer.questionId,
      type: "question" as const,
      answer,
      title: questionText(answer.questionId),
      photos: getAnswerPhotos(answer),
    }));

  const extraNonConformities: ExtraNonConformityItem[] = (response.extraNonConformities ?? []).map(
    (extra, index) => ({
      key: `extra:${index}`,
      type: "extra" as const,
      extra,
      title: extra.title?.trim() || `NC adicional ${index + 1}`,
    }),
  );

  const nonConformityItems: NonConformityItem[] = [
    ...questionNonConformities,
    ...extraNonConformities,
  ];

  const getTreatment = (itemKey: string): ChecklistNonConformityTreatment => {
    const existing = treatmentDrafts[itemKey];
    if (existing) {
      return existing;
    }

    return {
      questionId: itemKey,
      status: "open",
    } satisfies ChecklistNonConformityTreatment;
  };

  const updateTreatmentDraft = (itemKey: string, patch: Partial<ChecklistNonConformityTreatment>) => {
    setTreatmentDrafts((prev) => {
      const current = prev[itemKey] ?? {
        questionId: itemKey,
        status: "open" as NonConformityStatus,
      };

      return {
        ...prev,
        [itemKey]: {
          ...current,
          ...patch,
        },
      };
    });
    setSaveStatus("idle");
    setFeedbackMessage(null);
  };

  const handleSaveTreatments = async () => {
    if (!response) return;

    setSaveStatus("saving");
    setFeedbackMessage(null);

    try {
      const toPersist = nonConformityItems
        .map((item) => {
          const draft = getTreatment(item.key);
          return {
            ...draft,
            status: draft.status ?? "open",
            updatedAt: new Date().toISOString(),
          } satisfies ChecklistNonConformityTreatment;
        })
        .filter((item) =>
          Boolean(item.summary?.trim()) || Boolean(item.responsible?.trim()) || item.status !== "open",
        );

      await updateDoc(doc(db, "checklistResponses", response.id), {
        nonConformityTreatments: toPersist,
      });

      setResponse((prev) => (prev ? { ...prev, nonConformityTreatments: toPersist } : prev));
      setSaveStatus("saved");
      setFeedbackMessage("Tratativas atualizadas com sucesso.");
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
      setFeedbackMessage("Não foi possível salvar as tratativas. Tente novamente.");
    }
  };

  const statusLabel: Record<NonConformityStatus, string> = {
    open: "Pendente",
    in_progress: "Em andamento",
    resolved: "Resolvido",
  };

  const statusOrder: NonConformityStatus[] = ["open", "in_progress", "resolved"];

  const handleExportPdf = async () => {
    try {
      await saveChecklistPdf({
        response,
        machine: machine ?? undefined,
        template: template ?? undefined,
      });
    } catch (error) {
      console.error("Erro ao exportar checklist", error);
      alert("Não foi possível exportar o PDF deste checklist.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 sm:px-0 text-[var(--text)]">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Detalhes do Checklist</h1>
            <p className="text-sm text-[var(--hint)]">
              Enviado em {new Date(response.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              onClick={() => router.back()}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-50)]"
            >
              Voltar
            </button>
            <button
              onClick={() => {
                void handleExportPdf();
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Exportar PDF
            </button>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg shadow-slate-900/5">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--hint)]">Máquina</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">{machine?.modelo ?? response.machineId}</p>
            <dl className="mt-2 space-y-1 text-xs text-[var(--hint)]">
              <div className="flex justify-between">
                <dt>TAG</dt>
                <dd>{machine?.tag ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Placa</dt>
                <dd>{machine?.placa ?? "-"}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--hint)]">{primaryActorLabel}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {response.operatorNome ?? "Não informado"}
            </p>
            <p className="mt-1 text-xs text-[var(--hint)]">
              Matrícula: {response.operatorMatricula ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--hint)]">Template</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {template?.title ?? response.templateId}
            </p>
            <p className="mt-1 text-xs text-[var(--hint)]">
              {template ? `${template.type} · versão ${template.version}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--hint)]">Leituras</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {response.km != null ? `KM ${response.km}` : "-"}
              {response.km != null && response.horimetro != null ? " · " : ""}
              {response.horimetro != null ? `Hor ${response.horimetro}` : ""}
            </p>
          </div>
        </div>

        {response.extraNonConformities && response.extraNonConformities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--hint)]">
              Não conformidades adicionais registradas
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {response.extraNonConformities.map((extra, index) => (
                <article
                  key={`extra-${index}-${extra.title ?? "nc"}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {index + 1}. {extra.title?.trim() || "NC adicional"}
                  </p>
                  {extra.description && (
                    <p className="mt-2 text-sm text-[var(--hint)]">
                      Descrição: <span className="text-[var(--text)]">{extra.description}</span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
                    {extra.severity && (
                      <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-amber-900">
                        Severidade: {extra.severity}
                      </span>
                    )}
                    {extra.safetyRisk && (
                      <span className="inline-flex items-center rounded-full bg-red-200 px-2.5 py-1 text-red-900">
                        Risco de segurança
                      </span>
                    )}
                    {extra.impactAvailability && (
                      <span className="inline-flex items-center rounded-full bg-blue-200 px-2.5 py-1 text-blue-900">
                        Impacto na disponibilidade
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {nonConformityItems.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg shadow-slate-900/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Tratativas de não conformidade</h2>
            <button
              onClick={handleSaveTreatments}
              disabled={saveStatus === "saving"}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus === "saving" ? "Salvando..." : "Salvar tratativas"}
            </button>
          </div>
          <p className="text-sm text-[var(--hint)]">
            Registre as ações planejadas para cada uma das {nonConformityItems.length} não conformidades identificadas neste checklist.
          </p>
          {feedbackMessage && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                saveStatus === "error"
                  ? "border-red-600 bg-red-900/30 text-red-200"
                  : "border-emerald-600 bg-emerald-900/30 text-emerald-200"
              }`}
            >
              {feedbackMessage}
            </div>
          )}
          <div className="space-y-4">
            {nonConformityItems.map((item, index) => {
              const treatment = getTreatment(item.key);

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {index + 1}. {item.title}
                      </p>
                      <span className="mt-1 inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                        NC identificado
                      </span>
                      {item.type === "question" && item.answer.recurrence && (
                        <span
                          className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                            item.answer.recurrence.status === "still_nc"
                              ? "bg-amber-200 text-amber-900"
                              : "bg-emerald-200 text-emerald-900"
                          }`}
                        >
                          Reincidência ·
                          {" "}
                          {item.answer.recurrence.status === "still_nc"
                            ? "Permanece em NC"
                            : "Informada como resolvida"}
                        </span>
                      )}
                      {item.type === "question" && item.answer.observation && (
                        <p className="mt-3 text-sm text-[var(--hint)]">
                          Observações do {primaryActorLower}:{" "}
                          <span className="text-[var(--text)]">{item.answer.observation}</span>
                        </p>
                      )}
                      {item.type === "extra" && (
                        <div className="mt-3 space-y-2 text-sm text-[var(--hint)]">
                          {item.extra.description && (
                            <p>
                              Descrição: <span className="text-[var(--text)]">{item.extra.description}</span>
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {item.extra.severity && (
                              <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
                                Severidade: {item.extra.severity}
                              </span>
                            )}
                            {item.extra.safetyRisk && (
                              <span className="inline-flex items-center rounded-full bg-red-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-red-900">
                                Risco de segurança
                              </span>
                            )}
                            {item.extra.impactAvailability && (
                              <span className="inline-flex items-center rounded-full bg-blue-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-900">
                                Impacto na disponibilidade
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {item.type === "question" && item.photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-3 sm:mt-0 sm:justify-end">
                        {item.photos.map((photoUrl, photoIndex) => (
                          <a
                            key={`${item.answer.questionId}-photo-${photoIndex}-${photoUrl}`}
                            href={photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block h-24 w-32 overflow-hidden rounded-lg border border-[var(--border)] bg-black/5"
                          >
                            <img
                              src={photoUrl}
                              alt={`Foto ${photoIndex + 1} da questão ${item.title}`}
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-wide text-white">
                              Ver foto {photoIndex + 1}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-xs uppercase tracking-wide text-[var(--hint)]">
                        Tratativa planejada
                      </span>
                      <textarea
                        value={treatment.summary ?? ""}
                        onChange={(event) =>
                          updateTreatmentDraft(item.key, {
                            summary: event.target.value,
                          })
                        }
                        placeholder="Descreva a ação corretiva e preventiva"
                        className="min-h-[96px] resize-y rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-xs uppercase tracking-wide text-[var(--hint)]">
                          Responsável
                        </span>
                        <input
                          value={treatment.responsible ?? ""}
                          onChange={(event) =>
                            updateTreatmentDraft(item.key, {
                              responsible: event.target.value,
                            })
                          }
                          placeholder="Nome do responsável"
                          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--hint)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-xs uppercase tracking-wide text-[var(--hint)]">
                          Prazo
                        </span>
                        <input
                          type="date"
                          value={treatment.deadline ?? ""}
                          onChange={(event) =>
                            updateTreatmentDraft(item.key, {
                              deadline: event.target.value || undefined,
                            })
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm sm:col-span-2">
                        <span className="text-xs uppercase tracking-wide text-[var(--hint)]">
                          Status
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {statusOrder.map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                updateTreatmentDraft(item.key, {
                                  status,
                                })
                              }
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                treatment.status === status
                                  ? "bg-blue-600 text-white"
                                  : "bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--primary-50)]"
                              }`}
                            >
                              {statusLabel[status]}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg shadow-slate-900/5">
        <h2 className="text-lg font-semibold">Respostas do checklist</h2>
        <div className="grid grid-cols-1 gap-4">
          {response.answers.map((answer, index) => {
            const photos = getAnswerPhotos(answer);

            return (
              <article
                key={answer.questionId}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]/60"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {index + 1}. {questionText(answer.questionId)}
                    </p>
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                        answer.response === "nc"
                          ? "bg-red-700 text-white"
                          : answer.response === "ok"
                          ? "bg-emerald-700 text-white"
                          : "bg-gray-700 text-gray-100"
                      }`}
                    >
                      {answer.response === "nc"
                        ? "Não conforme"
                        : answer.response === "ok"
                        ? "Conforme"
                        : "Não se aplica"}
                    </span>
                    {answer.observation && (
                      <p className="text-sm text-[var(--hint)]">
                        Observações: <span className="text-[var(--text)]">{answer.observation}</span>
                      </p>
                    )}
                  </div>
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-3 sm:justify-end">
                      {photos.map((photoUrl, photoIndex) => (
                        <a
                          key={`${answer.questionId}-photo-${photoIndex}-${photoUrl}`}
                          href={photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block h-24 w-32 overflow-hidden rounded-lg border border-[var(--border)] bg-black/5"
                        >
                          <img
                            src={photoUrl}
                            alt={`Foto ${photoIndex + 1} da questão ${questionText(answer.questionId)}`}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-wide text-white">
                            Foto {photoIndex + 1}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}


