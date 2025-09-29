"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import DataTable from "@/components/ui/DataTable";
import Alert from "@/components/ui/Alert";
import type { NcAction, NcStatus, NonConformity } from "@/types/nonconformity";
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

const STATUS_OPTIONS: { value: "" | NcStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "aberta", label: "Abertas" },
  { value: "em_execucao", label: "Em execução" },
  { value: "aguardando_peca", label: "Aguardando peça" },
  { value: "bloqueada", label: "Bloqueadas" },
  { value: "resolvida", label: "Resolvidas" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "Todas severidades" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

const SEVERITY_STYLES: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border border-red-200",
  media: "bg-amber-100 text-amber-700 border border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const STATUS_LABEL: Record<NcStatus, string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_peca: "Aguardando peça",
  bloqueada: "Bloqueada",
  resolvida: "Resolvida",
};

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

type Filters = {
  status: "" | NcStatus;
  severity: "" | "alta" | "media" | "baixa";
  assetId: string;
  dateFrom?: string;
  dateTo?: string;
  q: string;
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

function buildOwnerAction(record: NonConformity, ownerName: string): NcAction[] {
  const normalizedOwner = ownerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32) || "responsavel";

  const clonedActions = [...(record.actions ?? [])];
  const corrective = clonedActions.find((action) => action.type === "corretiva");

  if (corrective) {
    corrective.owner = { id: normalizedOwner, nome: ownerName };
    corrective.startedAt = corrective.startedAt ?? new Date().toISOString();
    return clonedActions;
  }

  clonedActions.unshift({
    id: crypto.randomUUID(),
    type: "corretiva",
    description: "Responsável definido via painel administrador",
    owner: { id: normalizedOwner, nome: ownerName },
    startedAt: new Date().toISOString(),
  });

  return clonedActions;
}

async function buildErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    return `Falha ao carregar não conformidades (status ${response.status}) — ${payload.slice(0, 280)}`;
  } catch {
    try {
      const text = await response.clone().text();
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 280);
      return `Falha ao carregar não conformidades (status ${response.status}) — ${snippet || "sem detalhes"}`;
    } catch {
      return `Falha ao carregar não conformidades (status ${response.status})`;
    }
  }
}

function isOverdue(record: NonConformity): boolean {
  if (!record.dueAt || record.status === "resolvida") {
    return false;
  }
  return new Date(record.dueAt).getTime() < Date.now();
}

function getCorrectiveOwner(record: NonConformity): string | undefined {
  const action = record.actions?.find((item) => item.type === "corretiva" && item.owner);
  return action?.owner?.nome ?? action?.owner?.id;
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

export default function NonConformitiesOverviewPage(): JSX.Element {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [records, setRecords] = useState<NonConformity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [massBusy, setMassBusy] = useState(false);
  const [massMessage, setMassMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as Partial<Filters>;
      setFilters((prev) => ({ ...prev, ...parsed }));
    } catch (err) {
      console.warn("Não foi possível restaurar filtros salvos", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const fetchKpis = useCallback(async () => {
    try {
      const response = await fetch("/api/kpi/nc");
      if (!response.ok) {
        throw new Error(`Falha ao carregar KPIs (status ${response.status})`);
      }
      const payload = (await response.json()) as KpiResponse;
      setKpis(payload);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;

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

    const url = `/api/nc?${params.toString()}`;

    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(await buildErrorMessage(response));
        }

        const payload = await response.json();
        setRecords((payload.data as NonConformity[]) ?? []);
        setTotal((payload.total as number) ?? 0);
        setSelectedIds((prev) => prev.filter((id) => (payload.data as NonConformity[]).some((item) => item.id === id)));
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.error(err);
        setRecords([]);
        setTotal(0);
        setSelectedIds([]);
        setError(err instanceof Error ? err.message : "Falha ao carregar não conformidades.");
      } finally {
        window.clearTimeout(timeoutId);
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [filters, page, pageSize, refreshToken]);

  const handleRetry = useCallback(() => {
    controllerRef.current?.abort();
    setError(null);
    setLoading(true);
    setRefreshToken((prev) => prev + 1);
  }, []);

  const executeMassUpdate = useCallback(
    async (updater: (record: NonConformity) => Promise<void>) => {
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
        setMassMessage({ type: "success", text: "Atualização aplicada com sucesso." });
        setSelectedIds([]);
        setRefreshToken((prev) => prev + 1);
        fetchKpis();
      } catch (error) {
        console.error(error);
        setMassMessage({ type: "error", text: "Falha ao aplicar a ação em massa." });
      } finally {
        setMassBusy(false);
      }
    },
    [fetchKpis, selectedRecords],
  );

  const applyMassStatus = (status: NcStatus) =>
    executeMassUpdate(async (record) => {
      await patchNc(record.id, { status });
    });

  const applyMassDueAt = (dueAt: string) =>
    executeMassUpdate(async (record) => {
      await patchNc(record.id, { dueAt });
    });

  const applyMassOwner = (owner: string) =>
    executeMassUpdate(async (record) => {
      const actions = buildOwnerAction(record, owner);
      await patchNc(record.id, { actions });
    });

  const handleSelectToggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const filterControls = (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.status}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, status: event.target.value as Filters["status"] }));
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.severity}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, severity: event.target.value as Filters["severity"] }));
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          {SEVERITY_OPTIONS.map((option) => (
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
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, dateFrom: event.target.value || undefined }));
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, dateTo: event.target.value || undefined }));
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <input
          value={filters.q}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, q: event.target.value }));
            setPage(1);
          }}
          placeholder="Buscar por título, ativo ou causa"
          className="w-48 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span className="font-medium">Ações em massa para {selectedIds.length} selecionadas:</span>
          <button
            type="button"
            disabled={massBusy}
            onClick={() => applyMassStatus("em_execucao")}
            className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Marcar em execução
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
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>Responsável:</span>
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
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
          className="size-4 rounded border border-gray-300 text-blue-600 focus:ring-[var(--primary)]"
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (record: NonConformity) => (
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
          {STATUS_LABEL[record.status] ?? record.status}
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
            SEVERITY_STYLES[record.severity ?? ""] ?? "bg-[var(--surface)] text-[var(--hint)] border border-[var(--border)]",
          ].join(" ")}
        >
          {record.severity ? record.severity.toUpperCase() : "-"}
        </span>
      ),
    },
    {
      key: "title",
      label: "Título",
      render: (record: NonConformity) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-800">{record.title}</span>
          {record.description && <span className="text-xs text-gray-500">{record.description}</span>}
        </div>
      ),
    },
    {
      key: "asset",
      label: "Ativo",
      render: (record: NonConformity) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">{record.linkedAsset.tag}</span>
          {record.linkedAsset.modelo && <span className="text-xs text-gray-500">{record.linkedAsset.modelo}</span>}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Criado em",
      render: (record: NonConformity) => (
        <span className="text-sm text-[var(--hint)]">{LONG_DATE_FORMATTER.format(new Date(record.createdAt))}</span>
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
              {SHORT_DATE_FORMATTER.format(new Date(record.dueAt))}
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
      label: "Responsável",
      render: (record: NonConformity) => (
        <span className="text-sm text-[var(--hint)]">{getCorrectiveOwner(record) ?? "–"}</span>
      ),
    },
    {
      key: "recurrence",
      label: "Recorrência",
      render: (record: NonConformity) => (
        <span className="text-sm text-[var(--hint)]">{record.recurrenceOfId ? "Sim" : "Não"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Gestão de não conformidades</h1>
        <p className="text-sm text-[var(--hint)]">
          Consolide NCs de checklists e adicionais, acompanhe SLA, recorrência e CAPA.
        </p>
      </div>

      {kpis && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="NCs abertas" value={kpis.openTotal} helperText="Total em andamento" />
          <KpiTile
            label="% no prazo (mês)"
            value={`${kpis.onTimePercentage.toFixed(1)}%`}
            helperText="Fechadas dentro do SLA"
          />
          <KpiTile
            label="Recorrência últimos 30d"
            value={`${kpis.recurrence30d.toFixed(1)}%`}
            helperText="NCs reabertas"
          />
          <KpiTile
            label="Tempo até resolução"
            value={`${kpis.avgResolutionHours.toFixed(1)} h`}
            helperText={`Containment médio ${kpis.avgContainmentHours.toFixed(1)} h`}
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
                    <Bar dataKey="value" name="Ocorrências" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
                    <Bar dataKey="media" stackId="a" fill="#f59e0b" name="Média" />
                    <Bar dataKey="baixa" stackId="a" fill="#10b981" name="Baixa" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Distribuição por severidade</h2>
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-700">
                {Object.entries(kpis.openBySeverity).map(([severity, value]) => (
                  <div key={severity} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
                    <div className="text-xl font-semibold text-gray-900">{value}</div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{severity}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Métricas calculadas com base nas {Math.min(MAX_PAGE_SIZE, total)} últimas ocorrências carregadas.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card padding="lg" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">Lista de não conformidades</h2>
            <p className="text-sm text-[var(--hint)]">
              Filtre e atualize status, responsáveis e SLAs das NCs provenientes dos checklists.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Total: {total}</span>
            <span>•</span>
            <span>Selecionadas: {selectedIds.length}</span>
          </div>
        </div>

        {error && (
          <Alert
            variant="error"
            title="Erro"
            description={<span className="block whitespace-pre-wrap">{error}</span>}
            action={
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                Tentar novamente
              </button>
            }
          />
        )}

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
