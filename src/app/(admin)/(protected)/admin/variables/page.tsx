"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { Machine, resolveMachineFleetType } from "@/types/machine";
import {
  ChecklistAnswer,
  ChecklistResponse,
  ChecklistTemplate,
  ChecklistQuestionVariable,
} from "@/types/checklist";

type VariableOption = {
  id: string; // templateId:questionId:variableName (unique identifier)
  templateId: string;
  templateTitle: string;
  questionId: string;
  questionText: string;
  variableName: string;
  variableType: string;
  variableCondition: string;
};

type FilterState = {
  variableId: string | "all";
  placa: string;
  from?: string;
  to?: string;
};

type VariableOccurrence = {
  responseId: string;
  responseDate: string;
  machineId: string;
  machinePlaca?: string;
  machineModelo?: string;
  templateTitle: string;
  questionText: string;
  variableName: string;
  variableValue: string | number | boolean | null;
  responseStatus: "ok" | "nc" | "na";
  operatorNome?: string | null;
  operatorMatricula?: string;
  mechanicNome?: string | null;
  mechanicMatricula?: string | null;
};

export default function VariablesAdminPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [variableOptions, setVariableOptions] = useState<VariableOption[]>([]);
  const [occurrences, setOccurrences] = useState<VariableOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>({
    variableId: "all",
    placa: "",
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

  // Carrega máquinas e templates
  useEffect(() => {
    const loadStatic = async () => {
      const [machinesSnap, templatesSnap] = await Promise.all([
        getDocs(machinesCol),
        getDocs(templatesCol),
      ]);

      const machineList = machinesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Machine, "id">;
        return {
          id: docSnap.id,
          ...data,
          fleetType: resolveMachineFleetType(data.fleetType),
        } satisfies Machine;
      });

      const templateList = templatesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistTemplate, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistTemplate;
      });

      setMachines(machineList);
      setTemplates(templateList);

      // Extrai todas as variáveis únicas dos templates
      const variables: VariableOption[] = [];
      for (const template of templateList) {
        for (const question of template.questions || []) {
          if (question.variable) {
            const variableId = `${template.id}:${question.id}:${question.variable.name}`;
            variables.push({
              id: variableId,
              templateId: template.id,
              templateTitle: template.title,
              questionId: question.id,
              questionText: question.text,
              variableName: question.variable.name,
              variableType: question.variable.type,
              variableCondition: question.variable.condition,
            });
          }
        }
      }

      // Remove duplicatas (mesma variável em diferentes templates/perguntas)
      const uniqueVariables = Array.from(
        new Map(variables.map((v) => [v.variableName, v])).values()
      );

      // Ordena alfabeticamente pelo nome da variável
      uniqueVariables.sort((a, b) => a.variableName.localeCompare(b.variableName));

      setVariableOptions(uniqueVariables);
      setDataLoaded(true);
    };

    loadStatic();
  }, [machinesCol, templatesCol]);

  // Busca ocorrências das variáveis
  const fetchOccurrences = useCallback(async () => {
    if (!dataLoaded || filter.variableId === "all") {
      setOccurrences([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const baseQuery = query(responsesCol, orderBy("createdAt", "desc"));
      const responsesSnap = await getDocs(baseQuery);
      const responseList = responsesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistResponse;
      });

      // Encontra a variável selecionada
      const selectedVariable = variableOptions.find((v) => v.id === filter.variableId);
      if (!selectedVariable) {
        setOccurrences([]);
        setLoading(false);
        return;
      }

      const machineById = new Map(machines.map((machine) => [machine.id, machine]));
      const templateById = new Map(templates.map((template) => [template.id, template]));

      const allOccurrences: VariableOccurrence[] = [];

      for (const response of responseList) {
        const template = templateById.get(response.templateId);
        const machine = machineById.get(response.machineId);

        // Filtra por data
        const createdAtDate = new Date(response.createdAt);
        if (filter.from) {
          const fromDate = new Date(`${filter.from}T00:00:00`);
          if (createdAtDate < fromDate) {
            continue;
          }
        }
        if (filter.to) {
          const toDate = new Date(`${filter.to}T23:59:59`);
          if (createdAtDate > toDate) {
            continue;
          }
        }

        // Filtra por placa
        if (filter.placa.trim()) {
          const placaFilter = filter.placa.trim().toLowerCase();
          const machinePlaca = machine?.placa?.toLowerCase() || "";
          if (!machinePlaca.includes(placaFilter)) {
            continue;
          }
        }

        // Busca respostas que contenham a variável selecionada
        for (const answer of response.answers || []) {
          // Verifica se esta resposta corresponde à variável selecionada
          // Pode ser pela mesma variável em qualquer template/pergunta com o mesmo nome
          const question = template?.questions?.find((q) => q.id === answer.questionId);
          if (
            question?.variable?.name === selectedVariable.variableName &&
            answer.variableValue !== undefined &&
            answer.variableValue !== null
          ) {
            allOccurrences.push({
              responseId: response.id,
              responseDate: response.createdAt,
              machineId: response.machineId,
              machinePlaca: machine?.placa,
              machineModelo: machine?.modelo,
              templateTitle: template?.title || response.templateId,
              questionText: question.text,
              variableName: question.variable.name,
              variableValue: answer.variableValue,
              responseStatus: answer.response,
              operatorNome: response.operatorNome,
              operatorMatricula: response.operatorMatricula,
              mechanicNome: response.actor?.mechanicNome || null,
              mechanicMatricula: response.actor?.mechanicMatricula || null,
            });
          }
        }
      }

      setOccurrences(allOccurrences);
    } catch (error) {
      console.error("Erro ao buscar ocorrências", error);
      setOccurrences([]);
    } finally {
      setLoading(false);
    }
  }, [filter, variableOptions, machines, templates, responsesCol, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      fetchOccurrences();
    }
  }, [dataLoaded, fetchOccurrences]);

  const formatVariableValue = (value: string | number | boolean | null, type: string): string => {
    if (value === null || value === undefined) {
      return "—";
    }
    if (type === "boolean") {
      return value ? "Sim" : "Não";
    }
    if (type === "date" && typeof value === "string") {
      try {
        const date = new Date(value);
        return date.toLocaleDateString("pt-BR");
      } catch {
        return String(value);
      }
    }
    if (type === "time" && typeof value === "string") {
      return value;
    }
    return String(value);
  };

  const getResponseStatusLabel = (status: "ok" | "nc" | "na"): string => {
    switch (status) {
      case "ok":
        return "Conforme";
      case "nc":
        return "Não Conforme";
      case "na":
        return "N/A";
      default:
        return status;
    }
  };

  const getResponseStatusColor = (status: "ok" | "nc" | "na"): string => {
    switch (status) {
      case "ok":
        return "bg-emerald-100 text-emerald-700";
      case "nc":
        return "bg-red-100 text-red-700";
      case "na":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const selectedVariable = variableOptions.find((v) => v.id === filter.variableId);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Variáveis Respondidas</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Visualize e gerencie os valores coletados através das variáveis condicionais dos checklists
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="text-sm font-medium">Variável</label>
            <select
              value={filter.variableId}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, variableId: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            >
              <option value="all">Selecione uma variável</option>
              {variableOptions.map((variable) => (
                <option key={variable.id} value={variable.id}>
                  {variable.variableName} {variable.templateTitle && `(${variable.templateTitle})`}
                </option>
              ))}
            </select>
            {selectedVariable && (
              <div className="mt-2 rounded-md bg-[var(--surface)] p-2 text-xs text-[var(--muted)]">
                <p>
                  <strong>Pergunta:</strong> {selectedVariable.questionText}
                </p>
                <p className="mt-1">
                  <strong>Tipo:</strong> {selectedVariable.variableType} |{" "}
                  <strong>Condição:</strong>{" "}
                  {selectedVariable.variableCondition === "ok"
                    ? "Quando Conforme"
                    : selectedVariable.variableCondition === "nc"
                      ? "Quando Não Conforme"
                      : "Sempre"}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Placa</label>
            <input
              placeholder="Ex: ABC-1234"
              value={filter.placa}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, placa: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Data (De)</label>
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, from: event.target.value || undefined }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Data (Até)</label>
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, to: event.target.value || undefined }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
        </div>
      </section>

      {filter.variableId !== "all" && (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <h2 className="text-lg font-semibold">
              Ocorrências da Variável: {selectedVariable?.variableName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {loading ? "Carregando..." : `${occurrences.length} ocorrência(s) encontrada(s)`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface)] text-left text-[var(--hint)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Data do Checklist</th>
                  <th className="px-4 py-3 font-medium">Placa do Veículo</th>
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">Valor da Variável</th>
                  <th className="px-4 py-3 font-medium">Status da Pergunta</th>
                  <th className="px-4 py-3 font-medium">Mecânico/Operador</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[var(--hint)]">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && occurrences.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-[var(--hint)]">
                      Nenhuma ocorrência encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
                {!loading &&
                  occurrences.map((occurrence, index) => (
                    <tr
                      key={`${occurrence.responseId}-${occurrence.questionText}-${index}`}
                      className="border-t border-[var(--border)] bg-white text-[var(--text)]"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(occurrence.responseDate).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {occurrence.machinePlaca || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{occurrence.machineModelo || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--primary)]">
                          {formatVariableValue(
                            occurrence.variableValue,
                            selectedVariable?.variableType || "text",
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getResponseStatusColor(occurrence.responseStatus)}`}
                        >
                          {getResponseStatusLabel(occurrence.responseStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          {occurrence.mechanicNome || occurrence.operatorNome || "—"}
                          {(occurrence.mechanicMatricula || occurrence.operatorMatricula) && (
                            <span className="text-xs text-[var(--hint)]">
                              {" "}
                              ({occurrence.mechanicMatricula || occurrence.operatorMatricula})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{occurrence.templateTitle}</div>
                        <div className="text-xs text-[var(--hint)]">{occurrence.questionText}</div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {filter.variableId === "all" && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <p className="text-[var(--muted)]">
            Selecione uma variável acima para visualizar suas ocorrências.
          </p>
        </section>
      )}
    </div>
  );
}

