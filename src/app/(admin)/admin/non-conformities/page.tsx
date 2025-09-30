"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  ChecklistRecurrenceStatus,
  ChecklistNonConformityTreatment,
  ChecklistResponse,
  ChecklistTemplate,
  NonConformityStatus,
} from "@/types/checklist";
import { Machine } from "@/types/machine";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

type StatusFilter = "pending" | "all" | NonConformityStatus;

type PendingItem = {
  id: string;
  responseId: string;
  questionId: string;
  createdAt: string;
  machineId: string;
  machine?: Machine;
  template?: ChecklistTemplate;
  questionText: string;
  status: NonConformityStatus;
  draftStatus: NonConformityStatus;
  summary: string;
  responsible: string;
  deadline?: string;
  updatedAt?: string;
  photoUrl?: string;
  observation?: string;
  operatorNome?: string | null;
  operatorMatricula?: string;
  isRecurrence: boolean;
  recurrenceStatus?: ChecklistRecurrenceStatus;
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
};

const statusLabel: Record<NonConformityStatus, string> = {
  open: "Pendente",
  in_progress: "Em andamento",
  resolved: "Resolvido",
};

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "Somente pendentes" },
  { value: "all", label: "Todos" },
  { value: "open", label: "Apenas abertos" },
  { value: "in_progress", label: "Em andamento" },
  { value: "resolved", label: "Resolvidos" },
];

const statusOrder: NonConformityStatus[] = ["open", "in_progress", "resolved"];

export default function NonConformitiesAdminPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [responsesMap, setResponsesMap] = useState<Record<string, ChecklistResponse>>({});
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const [machinesSnap, templatesSnap, responsesSnap] = await Promise.all([
        getDocs(machinesCol),
        getDocs(templatesCol),
        getDocs(query(responsesCol, orderBy("createdAt", "desc"))),
      ]);

      const machineList = machinesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Machine, "id">;
        return { id: docSnap.id, ...data } satisfies Machine;
      });

      const templateList = templatesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistTemplate, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistTemplate;
      });

      const machineById = new Map(machineList.map((machine) => [machine.id, machine]));
      const templateById = new Map(templateList.map((template) => [template.id, template]));

      const responsesList = responsesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistResponse;
      });

      const nextResponsesMap: Record<string, ChecklistResponse> = {};
      const pendingItems: PendingItem[] = [];

      for (const response of responsesList) {
        nextResponsesMap[response.id] = response;
        const template = templateById.get(response.templateId);
        const questionTextById = new Map(
          (template?.questions ?? []).map((question) => [question.id, question.text]),
        );
        const treatmentByQuestion = new Map(
          (response.nonConformityTreatments ?? []).map((treatment) => [treatment.questionId, treatment]),
        );

        for (const answer of response.answers ?? []) {
          if (answer.response !== "nc") {
            continue;
          }

          const treatment = treatmentByQuestion.get(answer.questionId);
          const statusValue = treatment?.status ?? "open";
          const recurrenceInfo = answer.recurrence;

          pendingItems.push({
            id: `${response.id}-${answer.questionId}`,
            responseId: response.id,
            questionId: answer.questionId,
            createdAt: response.createdAt,
            machineId: response.machineId,
            machine: machineById.get(response.machineId),
            template,
            questionText: questionTextById.get(answer.questionId) ?? answer.questionId,
            status: statusValue,
            draftStatus: statusValue,
            summary: treatment?.summary ?? "",
            responsible: treatment?.responsible ?? "",
            deadline: treatment?.deadline,
            updatedAt: treatment?.updatedAt,
            photoUrl: answer.photoUrl,
            observation: answer.observation,
            operatorNome: response.operatorNome ?? null,
            operatorMatricula: response.operatorMatricula,
            isRecurrence: Boolean(recurrenceInfo),
            recurrenceStatus: recurrenceInfo?.status,
          });
        }
      }

      pendingItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setMachines(machineList);
      setItems(pendingItems);
      setResponsesMap(nextResponsesMap);
    } catch (error) {
      console.error("Erro ao carregar não conformidades", error);
      setFeedback({
        type: "error",
        message: "Não foi possível carregar as não conformidades. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }, [machinesCol, responsesCol, templatesCol]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (machineFilter !== "all" && item.machineId !== machineFilter) {
        return false;
      }

      if (statusFilter === "pending") {
        return item.status === "open" || item.status === "in_progress";
      }

      if (statusFilter === "all") {
        return true;
      }

      return item.status === statusFilter;
    });
  }, [items, machineFilter, statusFilter]);

  const updateItemField = (id: string, patch: Partial<PendingItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    setFeedback(null);
  };

  const handleSaveItem = async (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    const response = responsesMap[item.responseId];
    if (!response) {
      alert("Checklist não encontrado para atualizar a tratativa.");
      return;
    }

    setSavingItemId(itemId);
    setFeedback(null);

    try {
          const summaryValue = item.summary.trim();
          const responsibleValue = item.responsible.trim();
          const updatedTreatment: ChecklistNonConformityTreatment = {
            questionId: item.questionId,
            status: item.draftStatus,
            summary: summaryValue === "" ? undefined : summaryValue,
            responsible: responsibleValue === "" ? undefined : responsibleValue,
            deadline: item.deadline || undefined,
            updatedAt: new Date().toISOString(),
          };

      const existingTreatments = response.nonConformityTreatments ?? [];
      const nextTreatments = [
        ...existingTreatments.filter((treatment) => treatment.questionId !== item.questionId),
        updatedTreatment,
      ];

      await updateDoc(doc(db, "checklistResponses", item.responseId), {
        nonConformityTreatments: nextTreatments,
      });

      setResponsesMap((prev) => ({
        ...prev,
        [item.responseId]: { ...response, nonConformityTreatments: nextTreatments },
      }));

      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? {
                ...current,
                summary: summaryValue,
                responsible: responsibleValue,
                deadline: item.deadline,
                status: item.draftStatus,
                draftStatus: item.draftStatus,
                updatedAt: updatedTreatment.updatedAt,
              }
            : current,
        ),
      );

      setFeedback({ type: "success", message: "Tratativa atualizada com sucesso." });
    } catch (error) {
      console.error("Erro ao salvar tratativa", error);
      setFeedback({
        type: "error",
        message: "Não foi possível salvar a tratativa. Tente novamente.",
      });
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Não conformidades</h1>
          <p className="text-sm text-gray-600">
            Acompanhe e atualize as tratativas de não conformidades abertas nos checklists.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Recarregar"}
        </button>
      </header>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm">Máquina</label>
            <select
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">Todas</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.modelo} — {machine.tag}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Apenas perguntas respondidas como &quot;NC&quot; são exibidas nesta lista para acompanhamento contínuo.
            </p>
          </div>
        </div>
      </section>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500 shadow-sm">
            Carregando não conformidades...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500 shadow-sm">
            Nenhuma não conformidade encontrada para os filtros selecionados.
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <article
              key={item.id}
              className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {index + 1}. {item.questionText}
                  </p>
                  <div className="text-xs text-gray-500">
                    <span>Checklist enviado em {new Date(item.createdAt).toLocaleString()}</span>
                    {item.template && (
                      <span className="ml-2 block sm:inline">
                        Template: {item.template.title} (v{item.template.version})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Máquina: {item.machine?.modelo ?? item.machineId}
                    {item.machine?.tag ? ` • TAG ${item.machine.tag}` : ""}
                  </div>
                  <div className="text-xs text-gray-500">
                    Operador: {item.operatorNome ?? "Não informado"}
                    {item.operatorMatricula ? ` (Mat. ${item.operatorMatricula})` : ""}
                  </div>
                  {item.observation && (
                    <p className="text-sm text-gray-700">
                      Observações do operador: {item.observation}
                    </p>
                  )}
                  {item.photoUrl && (
                    <a
                      href={item.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-blue-600 underline"
                    >
                      Ver evidência
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      item.draftStatus === "open"
                        ? "bg-red-100 text-red-700"
                        : item.draftStatus === "in_progress"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {statusLabel[item.draftStatus]}
                  </span>
                  {item.isRecurrence && (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        item.recurrenceStatus === "still_nc"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Reincidência ·
                      {" "}
                      {item.recurrenceStatus === "still_nc"
                        ? "Permanece em NC"
                        : "Informada como resolvida"}
                    </span>
                  )}
                  <a
                    href={`/responses/${item.responseId}`}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
                  >
                    Ver checklist
                  </a>
                </div>
              </header>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs uppercase tracking-wide text-gray-600">Tratativa planejada</span>
                  <textarea
                    value={item.summary}
                    onChange={(event) => updateItemField(item.id, { summary: event.target.value })}
                    className="min-h-[96px] rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Descreva a ação corretiva e preventiva"
                  />
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-xs uppercase tracking-wide text-gray-600">Responsável</span>
                    <input
                      value={item.responsible}
                      onChange={(event) => updateItemField(item.id, { responsible: event.target.value })}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Nome do responsável"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-xs uppercase tracking-wide text-gray-600">Prazo</span>
                    <input
                      type="date"
                      value={item.deadline ?? ""}
                      onChange={(event) =>
                        updateItemField(item.id, { deadline: event.target.value || undefined })
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {statusOrder.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateItemField(item.id, { draftStatus: status })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        item.draftStatus === status
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {statusLabel[status]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {item.updatedAt && (
                    <span className="text-xs text-gray-500">
                      Atualizado em {new Date(item.updatedAt).toLocaleString()}
                    </span>
                  )}
                  <button
                    onClick={() => handleSaveItem(item.id)}
                    disabled={savingItemId === item.id}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingItemId === item.id ? "Salvando..." : "Salvar tratativa"}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
