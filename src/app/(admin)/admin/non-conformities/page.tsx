"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
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

type ParsedQuery = {
  filters: Partial<Filters>;
  page?: number;
  pageSize?: number;
};

function parseQueryParams(searchParams: URLSearchParams | ReadonlyURLSearchParams): ParsedQuery {
  const parsedFilters: Partial<Filters> = {};

  const status = searchParams.get("status");
  if (status !== null && STATUS_OPTIONS.some((option) => option.value === status)) {
    parsedFilters.status = status as Filters["status"];
  }

  const severity = searchParams.get("severity");
  if (severity !== null && SEVERITY_OPTIONS.some((option) => option.value === severity)) {
    parsedFilters.severity = severity as Filters["severity"];
  }

  const assetId = searchParams.get("assetId");
  if (assetId !== null) parsedFilters.assetId = assetId;

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom || dateFrom === "") {
    parsedFilters.dateFrom = dateFrom || undefined;
  }

  const dateTo = searchParams.get("dateTo");
  if (dateTo || dateTo === "") {
    parsedFilters.dateTo = dateTo || undefined;
  }

  const q = searchParams.get("q");
  if (q !== null) parsedFilters.q = q;

  const pageParam = Number.parseInt(searchParams.get("page") ?? "", 10);
  const parsedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined;

  const pageSizeParam = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const parsedPageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0
      ? Math.min(pageSizeParam, MAX_PAGE_SIZE)
      : undefined;

  return {
    filters: parsedFilters,
    page: parsedPage,
    pageSize: parsedPageSize,
  };
}

function areFiltersEqual(a: Filters, b: Filters): boolean {
  return (
    a.status === b.status &&
    a.severity === b.severity &&
    a.assetId === b.assetId &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.q === b.q
  );
}

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

async function extractErrorDetails(response: Response): Promise<string> {
  let bodySnippet = "";
  try {
    const data = await response.clone().json();
    bodySnippet = typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    try {
      bodySnippet = await response.clone().text();
    } catch {
      bodySnippet = "";
    }
  }

  const normalized = bodySnippet.replace(/\s+/g, " ").trim().slice(0, 800);
  return `Status ${response.status}${normalized ? ` — ${normalized}` : ""}`;
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

export default function NonConformitiesOverviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [records, setRecords] = useState<NonConformity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [massBusy, setMassBusy] = useState(false);
  const [massMessage, setMassMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );

  const kpiOpenTotal = typeof kpis?.openTotal === "number" ? kpis.openTotal : 0;
  const kpiOnTime = typeof kpis?.onTimePercentage === "number" ? `${kpis.onTimePercentage.toFixed(1)}%` : "—";
  const kpiRecurrence = typeof kpis?.recurrence30d === "number" ? `${kpis.recurrence30d.toFixed(1)}%` : "—";
  const kpiResolution = typeof kpis?.avgResolutionHours === "number" ? `${kpis.avgResolutionHours.toFixed(1)} h` : "—";
  const kpiContainment =
    typeof kpis?.avgContainmentHours === "number" ? `${kpis.avgContainmentHours.toFixed(1)} h` : "—";
  const kpiDailySeries = useMemo(
    () => {
      const daily = kpis?.series?.daily;
      return Array.isArray(daily) ? daily : [];
    },
    [kpis],
  );
  const kpiPareto = useMemo(() => (Array.isArray(kpis?.rootCausePareto) ? kpis.rootCausePareto : []), [kpis]);
  const kpiSeverityBySystem = useMemo(
    () => (Array.isArray(kpis?.severityBySystem) ? kpis.severityBySystem : []),
    [kpis],
  );
  const kpiOpenBySeverity = useMemo(() => kpis?.openBySeverity ?? {}, [kpis]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const parsedQuery = parseQueryParams(searchParams);

    if (!hydratedRef.current) {
      let storedFilters: Partial<Filters> = {};
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          storedFilters = JSON.parse(stored) as Partial<Filters>;
        } catch (err) {
          console.warn("Não foi possível restaurar filtros salvos", err);
        }
      }

      const resolvedFilters: Filters = {
        ...DEFAULT_FILTERS,
        ...storedFilters,
        ...parsedQuery.filters,
      };

      setFilters(resolvedFilters);
      setPage(parsedQuery.page ?? 1);
      setPageSize(parsedQuery.pageSize ?? 20);
      setDebouncedQuery(resolvedFilters.q ?? "");
      hydratedRef.current = true;
      return;
    }

    const nextFilters: Filters = { ...DEFAULT_FILTERS, ...parsedQuery.filters };
    let filtersChanged = false;
    setFilters((prev) => {
      if (areFiltersEqual(prev, nextFilters)) {
        return prev;
      }
      filtersChanged = true;
      return nextFilters;
    });

    if (filtersChanged) {
      setDebouncedQuery(nextFilters.q ?? "");
    }

    if (parsedQuery.page !== undefined) {
      setPage((prev) => (prev === parsedQuery.page ? prev : parsedQuery.page!));
    } else {
      setPage((prev) => (prev === 1 ? prev : 1));
    }

    if (parsedQuery.pageSize !== undefined) {
      setPageSize((prev) => (prev === parsedQuery.pageSize ? prev : parsedQuery.pageSize!));
    } else {
      setPageSize((prev) => (prev === 20 ? prev : 20));
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedRef.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      setDebouncedQuery(filters.q.trim());
    }, 400);

    return () => {
      window.clearTimeout(handle);
    };
  }, [filters.q]);

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

  const applyFilterPatch = useCallback((patch: Partial<Filters>, options: { resetPage?: boolean } = {}) => {
    const { resetPage = true } = options;
    let changed = false;
    setFilters((prev) => {
      const next = { ...prev, ...patch } as Filters;
      if (areFiltersEqual(prev, next)) {
        return prev;
      }
      changed = true;
      return next;
    });

    if (changed && resetPage) {
      setPage(1);
    }
  }, []);

  const { status, severity, assetId, dateFrom, dateTo } = filters;

  useEffect(() => {
    if (!hydratedRef.current) return;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Date.now());

    latestRequestIdRef.current = requestId;

    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setShowErrorDetails(false);

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (assetId) params.set("assetId", assetId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (debouncedQuery) params.set("q", debouncedQuery);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const url = `/api/nc?${params.toString()}`;
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    (async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "x-request-id": requestId },
        });

        if (latestRequestIdRef.current !== requestId) return;

        if (!response.ok) {
          const details = await extractErrorDetails(response);
          console.error(`Falha ao carregar não conformidades: ${details}`);
          setRecords([]);
          setTotal(0);
          setSelectedIds([]);
          setError("Não foi possível carregar as não conformidades.");
          setErrorDetails(details);
          setShowErrorDetails(false);
          return;
        }

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch (jsonError) {
          console.error(jsonError);
          setRecords([]);
          setTotal(0);
          setSelectedIds([]);
          setError("Não foi possível carregar as não conformidades.");
          setErrorDetails(`Status ${response.status} — Resposta inválida do servidor.`);
          setShowErrorDetails(false);
          return;
        }

        if (latestRequestIdRef.current !== requestId) return;

        const data = Array.isArray((payload as { data?: NonConformity[] })?.data)
          ? ((payload as { data: NonConformity[] }).data ?? [])
          : null;

        if (!data) {
          let serialized = "";
          try {
            serialized = JSON.stringify(payload);
          } catch {
            serialized = String(payload);
          }
          setRecords([]);
          setTotal(0);
          setSelectedIds([]);
          setError("Não foi possível carregar as não conformidades.");
          setErrorDetails(`Status ${response.status} — Resposta inválida: ${serialized.slice(0, 800)}`);
          setShowErrorDetails(false);
          return;
        }

        const totalValue =
          typeof (payload as { total?: number })?.total === "number"
            ? (payload as { total: number }).total
            : data.length;

        setRecords(data);
        setTotal(totalValue);
        setSelectedIds((prev) => prev.filter((id) => data.some((item) => item.id === id)));
        setError(null);
        setErrorDetails(null);
        setShowErrorDetails(false);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        if (latestRequestIdRef.current !== requestId) return;
        console.error(err);
        setRecords([]);
        setTotal(0);
        setSelectedIds([]);
        setError("Não foi possível carregar as não conformidades.");
        const detail = err instanceof Error ? err.message : String(err);
        setErrorDetails(detail.slice(0, 800));
        setShowErrorDetails(false);
      } finally {
        window.clearTimeout(timeoutId);
        if (latestRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
      if (latestRequestIdRef.current === requestId) {
        latestRequestIdRef.current = null;
      }
    };
  }, [assetId, dateFrom, dateTo, debouncedQuery, page, pageSize, refreshToken, severity, status]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.assetId) params.set("assetId", filters.assetId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.q) params.set("q", filters.q);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const nextSearch = params.toString();
    const currentSearch = window.location.search.replace(/^[?]/, "");

    if (currentSearch === nextSearch) return;

    const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [filters.assetId, filters.dateFrom, filters.dateTo, filters.q, filters.severity, filters.status, page, pageSize, pathname, router]);

  const handleRetry = useCallback(() => {
    controllerRef.current?.abort();
    setError(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setRefreshToken((prev) => prev + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(Math.max(1, nextPage));
  }, []);

  const handlePageSizeChange = useCallback((nextSize: number) => {
    setPageSize(Math.min(nextSize, MAX_PAGE_SIZE));
    setPage(1);
  }, []);

  const handleSelectToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  }, []);

  const filterControls = useMemo(
    () => (
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.status}
            onChange={(event) => {
              applyFilterPatch({ status: event.target.value as Filters["status"] });
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
              applyFilterPatch({ severity: event.target.value as Filters["severity"] });
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
              applyFilterPatch({ assetId: event.target.value });
            }}
            placeholder="Filtrar por ativo ou TAG"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(event) => {
              applyFilterPatch({ dateFrom: event.target.value || undefined });
            }}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(event) => {
              applyFilterPatch({ dateTo: event.target.value || undefined });
            }}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <input
            value={filters.q}
            onChange={(event) => {
              applyFilterPatch({ q: event.target.value });
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
    ),
    [applyFilterPatch, applyMassDueAt, applyMassOwner, applyMassStatus, filters.assetId, filters.dateFrom, filters.dateTo, filters.q, filters.severity, filters.status, massBusy, selectedIds.length],
  );

  const columns = useMemo(
    () => [
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
            {record.status ? STATUS_LABEL[record.status] ?? record.status : "-"}
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
            <span className="font-medium text-gray-800">{record.title ?? "-"}</span>
            {record.description ? <span className="text-xs text-gray-500">{record.description}</span> : null}
          </div>
        ),
      },
      {
        key: "asset",
        label: "Ativo",
        render: (record: NonConformity) => {
          const tag = record.linkedAsset?.tag ?? "-";
          const modelo = record.linkedAsset?.modelo ?? null;
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">{tag}</span>
              {modelo ? <span className="text-xs text-gray-500">{modelo}</span> : null}
            </div>
          );
        },
      },
      {
        key: "createdAt",
        label: "Criado em",
        render: (record: NonConformity) => {
          const createdAtDate = record.createdAt ? new Date(record.createdAt) : null;
          return (
            <span className="text-sm text-[var(--hint)]">
              {createdAtDate ? LONG_DATE_FORMATTER.format(createdAtDate) : "—"}
            </span>
          );
        },
      },
      {
        key: "dueAt",
        label: "SLA",
        render: (record: NonConformity) => {
          const dueDate = record.dueAt ? new Date(record.dueAt) : null;
          const overdue = isOverdue(record);
          return (
            <div className="flex flex-col gap-1">
              {dueDate ? (
                <span
                  className={[
                    "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    overdue
                      ? "bg-red-100 text-red-700 border border-red-200"
                      : "bg-emerald-100 text-emerald-700 border border-emerald-200",
                  ].join(" ")}
                >
                  {SHORT_DATE_FORMATTER.format(dueDate)}
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
              {overdue && <span className="text-[11px] font-semibold text-red-600">Estourado</span>}
            </div>
          );
        },
      },
      {
        key: "owner",
        label: "Responsável",
        render: (record: NonConformity) => (
          <span className="text-sm text-gray-600">{getCorrectiveOwner(record) ?? "–"}</span>
        ),
      },
      {
        key: "recurrence",
        label: "Recorrência",
        render: (record: NonConformity) => (
          <span className="text-sm text-gray-600">{record.recurrenceOfId ? "Sim" : "Não"}</span>
        ),
      },
    ],
    [handleSelectToggle, selectedIds],
  );

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
          <KpiTile label="NCs abertas" value={kpiOpenTotal} helperText="Total em andamento" />
          <KpiTile label="% no prazo (mês)" value={kpiOnTime} helperText="Fechadas dentro do SLA" />
          <KpiTile label="Recorrência últimos 30d" value={kpiRecurrence} helperText="NCs reabertas" />
          <KpiTile
            label="Tempo até resolução"
            value={kpiResolution}
            helperText={`Containment médio ${kpiContainment}`}
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
                  <AreaChart data={kpiDailySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                  <BarChart data={kpiPareto} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                  <BarChart data={kpiSeverityBySystem} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                {Object.entries(kpiOpenBySeverity).map(([severity, value]) => (
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

        <div aria-live="polite" className="space-y-2">
          {error && (
            <Alert
              variant="error"
              title="Erro"
              description={
                <div className="space-y-2">
                  <span>{error}</span>
                  {errorDetails && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                        className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
                      >
                        {showErrorDetails ? "Ocultar detalhes" : "Ver detalhes"}
                      </button>
                      {showErrorDetails && (
                        <pre className="whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          {errorDetails}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              }
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
          {!error && !loading && records.length === 0 && (
            <p className="text-sm text-[var(--hint)]">Nenhuma não conformidade encontrada para os filtros selecionados.</p>
          )}
        </div>

        {massMessage && <Alert variant={massMessage.type === "success" ? "success" : "error"} description={massMessage.text} />}

        <DataTable
          columns={columns}
          data={records}
          filters={filterControls}
          page={page}
          pageSize={pageSize}
          total={total}
          isLoading={loading}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          getRowId={(record) => record.id}
          onRowClick={(record) => router.push(`/admin/non-conformities/${record.id}`)}
        />
      </Card>
    </div>
  );
}
