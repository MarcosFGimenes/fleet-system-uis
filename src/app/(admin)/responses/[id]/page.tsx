"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Machine } from "@/types/machine";
import {
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistNonConformityTreatment,
  NonConformityStatus,
} from "@/types/checklist";

type Params = {
  id: string;
};

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
          setMachine({ id: machineSnap.id, ...(machineSnap.data() as Omit<Machine, "id">) });
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
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Carregando...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        {loadError}
      </div>
    );
  }

  if (!response) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Checklist não encontrado.
      </div>
    );
  }

  const questionText = (questionId: string) =>
    template?.questions.find((question) => question.id === questionId)?.text ?? questionId;

  const nonConformities = response.answers.filter((answer) => answer.response === "nc");

  const getTreatment = (questionId: string): ChecklistNonConformityTreatment => {
    const existing = treatmentDrafts[questionId];
    if (existing) {
      return existing;
    }

    return {
      questionId,
      status: "open",
    } satisfies ChecklistNonConformityTreatment;
  };

  const updateTreatmentDraft = (
    questionId: string,
    patch: Partial<ChecklistNonConformityTreatment>,
  ) => {
    setTreatmentDrafts((prev) => {
      const current = prev[questionId] ?? {
        questionId,
        status: "open" as NonConformityStatus,
      };

      return {
        ...prev,
        [questionId]: {
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
      const toPersist = nonConformities
        .map((answer) => {
          const draft = getTreatment(answer.questionId);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 sm:px-0">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Detalhes do Checklist</h1>
            <p className="text-sm text-gray-400">
              Enviado em {new Date(response.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="self-start rounded-lg border border-gray-700 px-4 py-2 text-sm transition hover:border-gray-500 hover:bg-gray-800"
          >
            Voltar
          </button>
        </div>
      </header>

      <section className="rounded-2xl bg-gray-800 p-5 shadow-lg shadow-black/10">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Máquina</p>
            <p className="mt-1 text-lg font-semibold text-white">{machine?.modelo ?? response.machineId}</p>
            <dl className="mt-2 space-y-1 text-xs text-gray-400">
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
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Operador</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {response.operatorNome ?? "Não informado"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Matrícula: {response.operatorMatricula ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Template</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {template?.title ?? response.templateId}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {template ? `${template.type} · versão ${template.version}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Leituras</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {response.km != null ? `KM ${response.km}` : "-"}
              {response.km != null && response.horimetro != null ? " · " : ""}
              {response.horimetro != null ? `Hor ${response.horimetro}` : ""}
            </p>
          </div>
        </div>
      </section>

      {nonConformities.length > 0 && (
        <section className="space-y-4 rounded-2xl bg-gray-800 p-5 shadow-lg shadow-black/10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-white">Tratativas de não conformidade</h2>
            <button
              onClick={handleSaveTreatments}
              disabled={saveStatus === "saving"}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus === "saving" ? "Salvando..." : "Salvar tratativas"}
            </button>
          </div>
          <p className="text-sm text-gray-400">
            Registre as ações planejadas para cada não conformidade identificada neste checklist.
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
            {nonConformities.map((answer, index) => {
              const treatment = getTreatment(answer.questionId);

              return (
                <div
                  key={answer.questionId}
                  className="flex flex-col gap-4 rounded-xl border border-red-700/40 bg-red-900/20 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        {index + 1}. {questionText(answer.questionId)}
                      </p>
                      <span className="mt-1 inline-flex items-center rounded-full bg-red-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                        NC identificado
                      </span>
                    </div>
                    {answer.photoUrl && (
                      <a
                        href={answer.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-300 underline"
                      >
                        Ver evidência
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-xs uppercase tracking-wide text-gray-300">
                        Tratativa planejada
                      </span>
                      <textarea
                        value={treatment.summary ?? ""}
                        onChange={(event) =>
                          updateTreatmentDraft(answer.questionId, {
                            summary: event.target.value,
                          })
                        }
                        placeholder="Descreva a ação corretiva e preventiva"
                        className="min-h-[96px] resize-y rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-xs uppercase tracking-wide text-gray-300">
                          Responsável
                        </span>
                        <input
                          value={treatment.responsible ?? ""}
                          onChange={(event) =>
                            updateTreatmentDraft(answer.questionId, {
                              responsible: event.target.value,
                            })
                          }
                          placeholder="Nome do responsável"
                          className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        <span className="text-xs uppercase tracking-wide text-gray-300">
                          Prazo
                        </span>
                        <input
                          type="date"
                          value={treatment.deadline ?? ""}
                          onChange={(event) =>
                            updateTreatmentDraft(answer.questionId, {
                              deadline: event.target.value || undefined,
                            })
                          }
                          className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm sm:col-span-2">
                        <span className="text-xs uppercase tracking-wide text-gray-300">
                          Status
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {statusOrder.map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                updateTreatmentDraft(answer.questionId, {
                                  status,
                                })
                              }
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                treatment.status === status
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
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

      <section className="space-y-4 rounded-2xl bg-gray-800 p-5 shadow-lg shadow-black/10">
        <h2 className="text-lg font-semibold text-white">Respostas do checklist</h2>
        <div className="grid grid-cols-1 gap-4">
          {response.answers.map((answer, index) => (
            <article
              key={answer.questionId}
              className="rounded-xl border border-gray-700 bg-gray-900/40 p-4 transition hover:border-gray-500"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">
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
                </div>
                {answer.photoUrl && (
                  <a
                    href={answer.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-300 underline"
                  >
                    Abrir foto
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}


