"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { Machine } from "@/types/machine";
import {
  ChecklistResponse,
  ChecklistTemplate,
} from "@/types/checklist";
import { downloadChecklistsZip, saveChecklistPdf } from "@/lib/pdf";

type FilterState = {
  machineId: string | "all";
  hasNC: "all" | "yes" | "no";
  matricula?: string;
  from?: string;
  to?: string;
};

type Row = ChecklistResponse & {
  machine?: Machine;
  template?: ChecklistTemplate;
  ncCount: number;
};

export default function ResponsesAdminPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>({
    machineId: "all",
    hasNC: "all",
  });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [periodExporting, setPeriodExporting] = useState(false);
  const [periodDeleting, setPeriodDeleting] = useState(false);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

  useEffect(() => {
    const loadStatic = async () => {
      const [machinesSnap, templatesSnap] = await Promise.all([
        getDocs(machinesCol),
        getDocs(templatesCol),
      ]);

      const machineList = machinesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Machine, "id">;
        return { id: docSnap.id, ...data } satisfies Machine;
      });

      const templateList = templatesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistTemplate, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistTemplate;
      });

      setMachines(machineList);
      setTemplates(templateList);
      setDataLoaded(true);
    };

    loadStatic();
  }, [machinesCol, templatesCol]);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    const baseQuery = query(responsesCol, orderBy("createdAt", "desc"));
    const responsesSnap = await getDocs(baseQuery);
    const responseList = responsesSnap.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<ChecklistResponse, "id">;
      return { id: docSnap.id, ...data } satisfies ChecklistResponse;
    });

    const filtered = responseList.filter((response) => {
      if (filter.machineId !== "all" && response.machineId !== filter.machineId) {
        return false;
      }

      const createdAtDate = new Date(response.createdAt);
      if (filter.from) {
        const fromDate = new Date(`${filter.from}T00:00:00`);
        if (createdAtDate < fromDate) {
          return false;
        }
      }

      if (filter.to) {
        const toDate = new Date(`${filter.to}T23:59:59`);
        if (createdAtDate > toDate) {
          return false;
        }
      }

      if (filter.hasNC !== "all") {
        const hasNc = response.answers?.some((answer) => answer.response === "nc");
        if (filter.hasNC === "yes" && !hasNc) {
          return false;
        }
        if (filter.hasNC === "no" && hasNc) {
          return false;
        }
      }

      if (filter.matricula) {
        const wanted = filter.matricula.trim();
        if (!response.operatorMatricula || response.operatorMatricula !== wanted) {
          return false;
        }
      }

      return true;
    });

    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const templateById = new Map(templates.map((template) => [template.id, template]));

    const enriched = filtered.map((response) => {
      const ncCount =
        response.answers?.reduce((acc, answer) => acc + (answer.response === "nc" ? 1 : 0), 0) ??
        0;

      return {
        ...response,
        machine: machineById.get(response.machineId),
        template: templateById.get(response.templateId),
        ncCount,
      } satisfies Row;
    });

    setRows(enriched);
    setLoading(false);
  }, [filter, machines, templates, responsesCol]);

  useEffect(() => {
    if (dataLoaded) {
      fetchRows();
    }
  }, [dataLoaded, fetchRows]);

  const onFilterChange = (patch: Partial<FilterState>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
  };

  const applyFilters = async () => {
    await fetchRows();
  };

  const handleExportSingle = async (row: Row) => {
    try {
      await saveChecklistPdf({ response: row, machine: row.machine, template: row.template });
    } catch (error) {
      console.error("Erro ao exportar checklist", error);
      alert("Não foi possível exportar o PDF deste checklist.");
    }
  };

  const handleExportPeriod = async () => {
    if (!filter.from || !filter.to) {
      alert("Informe a data inicial e final para exportar o período.");
      return;
    }

    if (rows.length === 0) {
      alert("Nenhum checklist encontrado para o período selecionado.");
      return;
    }

    setPeriodExporting(true);
    try {
      await downloadChecklistsZip(
        rows.map((row) => ({
          response: row,
          machine: row.machine,
          template: row.template,
        })),
        {
          filename: `checklists-${filter.from}-a-${filter.to}`,
        },
      );
    } catch (error) {
      console.error("Erro ao exportar checklists", error);
      alert("Não foi possível exportar os checklists deste período.");
    } finally {
      setPeriodExporting(false);
    }
  };

  const handleDeletePeriod = async () => {
    if (!filter.from || !filter.to) {
      alert("Informe a data inicial e final para excluir checklists do período.");
      return;
    }

    if (rows.length === 0) {
      alert("Nenhum checklist encontrado para o período selecionado.");
      return;
    }

    const confirmation = confirm(
      `Deseja realmente deletar ${rows.length} checklist(s) entre ${filter.from} e ${filter.to}? Esta ação não pode ser desfeita.`,
    );
    if (!confirmation) {
      return;
    }

    setPeriodDeleting(true);
    try {
      for (const row of rows) {
        await deleteDoc(doc(db, "checklistResponses", row.id));
      }
      alert(`Checklists deletados com sucesso (${rows.length}).`);
      await fetchRows();
    } catch (error) {
      console.error("Erro ao deletar checklists", error);
      alert("Não foi possível deletar os checklists deste período. Tente novamente.");
    } finally {
      setPeriodDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Checklists Enviados</h1>
      </header>

      <section className="bg-[var(--surface)] p-4 rounded-xl">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="text-sm">Maquina</label>
            <select
              value={filter.machineId}
              onChange={(event) =>
                onFilterChange({ machineId: event.target.value as FilterState["machineId"] })
              }
              className="w-full bg-[var(--surface)] border border-gray-700 rounded-md px-3 py-2"
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
            <label className="text-sm">Possui NC</label>
            <select
              value={filter.hasNC}
              onChange={(event) =>
                onFilterChange({ hasNC: event.target.value as FilterState["hasNC"] })
              }
              className="w-full bg-[var(--surface)] border border-gray-700 rounded-md px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="yes">Somente com NC</option>
              <option value="no">Somente sem NC</option>
            </select>
          </div>
          <div>
            <label className="text-sm">Matrícula</label>
            <input
              placeholder="ex: 1001"
              value={filter.matricula ?? ""}
              onChange={(event) =>
                onFilterChange({ matricula: event.target.value || undefined })
              }
              className="w-full bg-[var(--surface)] border border-gray-700 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm">De</label>
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(event) => onFilterChange({ from: event.target.value || undefined })}
              className="w-full bg-[var(--surface)] border border-gray-700 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm">Ate</label>
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(event) => onFilterChange({ to: event.target.value || undefined })}
              className="w-full bg-[var(--surface)] border border-gray-700 rounded-md px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void handleExportPeriod();
              }}
              disabled={periodExporting || loading || rows.length === 0}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {periodExporting ? "Exportando..." : "Exportar período (PDF)"}
            </button>
            <button
              onClick={() => {
                void handleDeletePeriod();
              }}
              disabled={periodDeleting || loading || rows.length === 0}
              className="rounded-md border border-red-600 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-600/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {periodDeleting ? "Excluindo..." : "Excluir período"}
            </button>
          </div>
          <button
            onClick={applyFilters}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Aplicar Filtros"}
          </button>
        </div>
      </section>

      <section className="bg-[var(--surface)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Máquina</th>
                <th className="text-left px-4 py-3">Template</th>
                <th className="text-left px-4 py-3">KM/Hor</th>
                <th className="text-left px-4 py-3">NC</th>
                <th className="text-left px-4 py-3">Respondido por</th>
                <th className="text-right px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Nenhum checklist encontrado.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.machine?.modelo ?? row.machineId}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-400">
                        <p>TAG: {row.machine?.tag ?? "-"}</p>
                        <p>Placa: {row.machine?.placa ?? "-"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.template?.title ?? row.templateId}
                      <div className="text-xs text-gray-400">
                        {row.template ? `${row.template.type} v${row.template.version}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-[var(--muted)]">
                        {row.km != null ? `KM ${row.km}` : ""}
                        {row.km != null && row.horimetro != null ? " - " : ""}
                        {row.horimetro != null ? `Hor ${row.horimetro}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs ${
                          row.ncCount > 0 ? "bg-red-700" : "bg-emerald-700"
                        }`}
                      >
                        {row.ncCount > 0 ? `${row.ncCount} NC` : "Sem NC"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        {row.operatorNome ? row.operatorNome : "—"}
                        {row.operatorMatricula ? (
                          <span className="text-xs text-gray-400"> ( {row.operatorMatricula} )</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleExportSingle(row);
                          }}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-500"
                        >
                          PDF
                        </button>
                        <a
                          href={`/admin/responses/${row.id}`}
                          className="rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-gray-600"
                        >
                          Ver
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
