"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import DataTable from "@/components/ui/DataTable";
import Alert from "@/components/ui/Alert";
import type { NcAction, NonConformity, NcStatus } from "@/types/nonconformity";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STORAGE_KEY = "admin-nc-filters";
const MAX_PAGE_SIZE = 100;

const statusOptions: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "aberta", label: "Abertas" },
  { value: "em_execucao", label: "Em execucao" },
  { value: "aguardando_peca", label: "Aguardando peca" },
  { value: "bloqueada", label: "Bloqueadas" },
  { value: "resolvida", label: "Resolvidas" },
];

const severityOptions: { value: string; label: string }[] = [
  { value: "", label: "Todas severidades" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baixa", label: "Baixa" },
];

const severityStyles: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border border-red-200",
  media: "bg-amber-100 text-amber-700 border border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const statusLabel: Record<NcStatus, string> = {
  aberta: "Aberta",
  em_execucao: "Em execucao",
  aguardando_peca: "Aguardando peca",
  bloqueada: "Bloqueada",
  resolvida: "Resolvida",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

type Filters = {
  status: string;
  severity: string;
  assetId: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

type KpiResponse = {
  openTotal: number;
  openBySeverity: Record<string, number>;
  onTimePercentage: number;
  recurrence30d: number;
  avgContainmentHours: number;
  avgResolutionHours: number;
  series: {
    daily: { period: string; opened: number; closed: number }[];
    weekly: { period: string; opened: number; closed: number }[];
  };
  rootCausePareto: { rootCause: string; value: number }[];
  systemBreakdown: { system: string; value: number }[];
  severityBySystem: { system: string; alta: number; media: number; baixa: number }[];
};

const DEFAULT_FILTERS: Filters = {
  status: "",
  severity: "",
  assetId: "",
  dateFrom: undefined,
  dateTo: undefined,
  q: "",
};

function isOverdue(record: NonConformity): boolean {
  if (!record.dueAt || record.status === "resolvida") return false;
  return new Date(record.dueAt).getTime() < Date.now();
}

function getCorrectiveOwner(record: NonConformity): string | undefined {
  const owner = record.actions?.find((action) => action.type === "corretiva" && action.owner)?.owner;
  return owner?.nome ?? owner?.id;
}

function buildOwnerAction(record: NonConformity, ownerName: string): NcAction[] {
  const actions = [...(record.actions ?? [])];
  const normalizedOwner = {
    id: ownerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "responsavel",
    nome: ownerName,
  };
  const existing = actions.find((action) => action.type === "corretiva");
  if (existing) {
    existing.owner = normalizedOwner;
    existing.startedAt = existing.startedAt ?? new Date().toISOString();
    return actions;
  }
  actions.unshift({
    id: crypto.randomUUID(),
    type: "corretiva",
    description: "Responsavel definido via painel administrador",
    owner: normalizedOwner,
    startedAt: new Date().toISOString(),
  });
  return actions;
}

async function patchNc(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/nc/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, actor: { id: "admin-ui", nome: "Painel Admin" } }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Falha ao atualizar NC");
  }
}

export default function NonConformitiesOverviewPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshToken, setRefreshToken] = useState(0);
  const [records, setRecords] = useState<NonConformity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [massBusy, setMassBusy] = useState(false);
  const [massMessage, setMassMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<Filters>;
        setFilters((prev) => ({ ...prev, ...parsed }));
      } catch (parseError) {
        console.warn("Nao foi possivel carregar filtros salvos", parseError);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const loadKpis = useCallback(async () => {
    try {
      const response = await fetch("/api/kpi/nc");
      if (!response.ok) throw new Error("Falha ao carregar KPIs");
      const data = (await response.json()) as KpiResponse;
      setKpis(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.assetId) params.set("assetId", filters.assetId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.q) params.set("q", filters.q);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    fetch(`/api/nc?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Falha ao carregar nao conformidades");
        const payload = await res.json();
        if (cancelled) return;
        setRecords(payload.data as NonConformity[]);
        setTotal(payload.total as number);
        setSelectedIds((prev) => prev.filter((id) => (payload.data as NonConformity[]).some((item) => item.id === id)));
      })
      .catch((err) => {
        if (cancelled || err.name === "AbortError") return;
        console.error(err);
        setError("Nao foi possivel carregar as nao conformidades.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filters, page, pageSize, refreshToken]);

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );

  const handleSelectToggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const executeMassUpdate = async (updater: (record: NonConformity) => Promise<void>) => {
    if (!selectedRecords.length) {
      setMassMessage({ type: "error", text: "Selecione ao menos uma NC." });
      return;
    }
    setMassBusy(true);
    setMassMessage(null);
    try {
      for (const record of selectedRecords) {
        await updater(record);
      }
      setMassMessage({ type: "success", text: "Atualizacao aplicada com sucesso." });
      setSelectedIds([]);
      setRefreshToken((prev) => prev + 1);
      loadKpis();
    } catch (error) {
      console.error(error);
      setMassMessage({ type: "error", text: "Falha ao aplicar a acao em massa." });
    } finally {
      setMassBusy(false);
    }
  };

  const applyMassStatus = (status: NcStatus) =>
    executeMassUpdate(async (record) => {
      await patchNc(record.id, { status });
    });

  const applyMassDueAt = (dueAt: string) =>
    executeMassUpdate(async (record) => {
      await patchNc(record.id, { dueAt });
    });

  const applyMassOwner = (ownerName: string) =>
    executeMassUpdate(async (record) => {
      const actions = buildOwnerAction(record, ownerName);
      await patchNc(record.id, { actions });
    });

  const filterControls = (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.status}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, status: event.target.value }));
            setPage(1);
          }}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.severity}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, severity: event.target.value }));
            setPage(1);
          }}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {severityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={filters.assetId}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, assetId: event.target.value }));
            setPage(1);
          }}
          placeholder="Filtrar por ativo ou TAG"
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, dateFrom: event.target.value || undefined }));
            setPage(1);
          }}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, dateTo: event.target.value || undefined }));
            setPage(1);
          }}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <input
          value={filters.q}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, q: event.target.value }));
            setPage(1);
          }}
          placeholder="Buscar por titulo, ativo ou causa"
          className="w-48 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span className="font-medium">Acoes em massa para {selectedIds.length} selecionadas:</span>
          <button
            type="button"
            disabled={massBusy}
            onClick={() => applyMassStatus("em_execucao")}
            className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Marcar em execucao
          </button>
          <button
            type="button"
            disabled={massBusy}
            onClick={() => applyMassStatus("resolvida")}
            className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Marcar resolvida
          </button>
          <label className="flex items-center gap-2">
            <span>Atualizar SLA:</span>
            <input
              type="date"
              disabled={massBusy}
              onChange={(event) => {
                if (event.target.value) {
                  applyMassDueAt(event.target.value);
                  event.target.value = "";
                }
              }}
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>Responsavel:</span>
            <input
              type="text"
              disabled={massBusy}
              placeholder="Nome"
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.currentTarget.value.trim()) {
                  applyMassOwner(event.currentTarget.value.trim());
                  event.currentTarget.value = "";
                }
              }}
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </label>
        </div>
      )}
    </div>
  );

  const columns = [
    {
      key: "select",
      label: "",
      className: "w-8",
      render: (record: NonConformity) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(record.id)}
          onChange={(event) => handleSelectToggle(record.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="size-4 rounded border border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (record: NonConformity) => (
        <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
          {statusLabel[record.status] ?? record.status}
        </span>
      ),
    },
    {
      key: "severity",
      label: "Severidade",
      render: (record: NonConformity) => (
        <span
          className={[
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
            severityStyles[record.severity ?? ""] ?? "bg-gray-100 text-gray-600 border border-gray-200",
          ].join(" ")}
        >
          {record.severity ? record.severity.toUpperCase() : "-"}
        </span>
      ),
    },
    {
      key: "title",
      label: "Titulo",
      render: (record: NonConformity) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-800">{record.title}</span>
          {record.description && (
            <span className="text-xs text-gray-500">{record.description}</span>
          )}
        </div>
      ),
    },
    {
      key: "asset",
      label: "Ativo",
      render: (record: NonConformity) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">{record.linkedAsset.tag}</span>
          {record.linkedAsset.modelo && (
            <span className="text-xs text-gray-500">{record.linkedAsset.modelo}</span>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Criado em",
      render: (record: NonConformity) => (
        <span className="text-sm text-gray-600">{dateFormatter.format(new Date(record.createdAt))}</span>
      ),
    },
    {
      key: "dueAt",
      label: "SLA",
      render: (record: NonConformity) => (
        <div className="flex flex-col gap-1">
          {record.dueAt ? (
            <span
              className={[
                "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
                isOverdue(record)
                  ? "bg-red-100 text-red-700 border border-red-200"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200",
              ].join(" ")}
            >
              {shortDateFormatter.format(new Date(record.dueAt))}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
          {isOverdue(record) && <span className="text-[11px] font-semibold text-red-600">Estourado</span>}
        </div>
      ),
    },
    {
      key: "owner",
      label: "Responsavel",
      render: (record: NonConformity) => (
        <span className="text-sm text-gray-600">{getCorrectiveOwner(record) ?? "–"}</span>
      ),
    },
    {
      key: "recurrence",
      label: "Recorrencia",
      render: (record: NonConformity) => (
        <span className="text-sm text-gray-600">{record.recurrenceOfId ? "Sim" : "Nao"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Gestao de nao conformidades</h1>
        <p className="text-sm text-gray-600">
          Consolide NCs de checklists e adicionais, acompanhe SLA, recorrencia e CAPA.
        </p>
      </div>

      {kpis && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="NCs abertas"
            value={kpis.openTotal}
            helperText="Total em andamento"
          />
          <KpiTile
            label="% no prazo (mes)"
            value={`${kpis.onTimePercentage.toFixed(1)}%`}
            helperText="Fechadas dentro do SLA"
          />
          <KpiTile
            label="Recorrencia ultimos 30d"
            value={`${kpis.recurrence30d.toFixed(1)}%`}
            helperText="NCs reabertas"
          />
          <KpiTile
            label="Tempo ate resolucao"
            value={`${kpis.avgResolutionHours.toFixed(1)} h`}
            helperText={`Containment medio ${kpis.avgContainmentHours.toFixed(1)} h`}
          />
        </div>
      )}

      {kpis && (
        <Card className="space-y-6" padding="lg">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Abertura x fechamento (dia)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpis.series.daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="opened" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="closed" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Legend />
                    <Area type="monotone" dataKey="opened" name="Abertas" stroke="#2563eb" fill="url(#opened)" />
                    <Area type="monotone" dataKey="closed" name="Fechadas" stroke="#10b981" fill="url(#closed)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Pareto de causas raiz</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.rootCausePareto} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="rootCause" stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Ocorrencias" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">NCs por sistema</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.severityBySystem} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="system" stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Legend />
                    <Tooltip />
                    <Bar dataKey="alta" stackId="a" fill="#ef4444" name="Alta" />
                    <Bar dataKey="media" stackId="a" fill="#f59e0b" name="Media" />
                    <Bar dataKey="baixa" stackId="a" fill="#10b981" name="Baixa" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Distribuicao por severidade</h2>
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-700">
                {Object.entries(kpis.openBySeverity).map(([severity, value]) => (
                  <div key={severity} className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                    <div className="text-xl font-semibold text-gray-900">{value}</div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{severity}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Metricas calculadas com base nas {Math.min(MAX_PAGE_SIZE, total)} ultimas ocorrencias carregadas.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card padding="lg" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">Lista de nao conformidades</h2>
            <p className="text-sm text-gray-600">
              Filtre e atualize status, responsaveis e SLAs das NCs provenientes dos checklists.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Total: {total}</span>
            <span>|</span>
            <span>Selecionadas: {selectedIds.length}</span>
          </div>
        </div>

        {error && <Alert variant="error" title="Erro" description={error} />}
        {massMessage && <Alert variant={massMessage.type === "success" ? "success" : "error"} description={massMessage.text} />}

        <DataTable
          columns={columns}
          data={records}
          filters={filterControls}
          page={page}
          pageSize={pageSize}
          total={total}
          isLoading={loading}
          onPageChange={(nextPage) => setPage(nextPage)}
          onPageSizeChange={(nextSize) => {
            setPageSize(Math.min(nextSize, MAX_PAGE_SIZE));
            setPage(1);
          }}
          getRowId={(record) => record.id}
          onRowClick={(record) => router.push(`/admin/non-conformities/${record.id}`)}
        />
      </Card>
    </div>
  );
}





