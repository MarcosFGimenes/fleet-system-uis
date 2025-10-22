"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChecklistResponse } from "@/types/checklist";
import { Machine, resolveMachineFleetType } from "@/types/machine";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#a855f7"];

const PERIODICITY_UNITS = {
  day: { singular: "dia", plural: "dias" },
  week: { singular: "semana", plural: "semanas" },
  month: { singular: "mês", plural: "meses" },
} as const;

type Kpis = {
  totalChecklists: number;
  totalNC: number;
  totalOK: number;
  ncRate: number;
  avgRepairTimeHours: number;
  resolvedRate: number;
};

type TrendPoint = {
  date: string;
  nc: number;
  ok: number;
  total: number;
};

type PiePoint = {
  name: string;
  value: number;
};

type BarPoint = {
  name: string;
  nc: number;
};

type PeriodicityComplianceItem = {
  templateId: string;
  templateName: string;
  machineId: string;
  machineName?: string;
  lastSubmissionAt?: string;
  windowDays: number;
  unit: keyof typeof PERIODICITY_UNITS;
  quantity: number;
  anchor: "last_submission" | "calendar";
  status: "compliant" | "non_compliant";
};

type PeriodicityComplianceResponse = {
  generatedAt: string;
  summary: {
    totalTracked: number;
    compliant: number;
    nonCompliant: number;
  };
  items: PeriodicityComplianceItem[];
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChecklistResponse[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [periodicity, setPeriodicity] = useState<PeriodicityComplianceResponse | null>(null);
  const [periodicityLoading, setPeriodicityLoading] = useState(false);
  const [periodicityError, setPeriodicityError] = useState<string | null>(null);

  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);
  const machinesCol = useMemo(() => collection(db, "machines"), []);

  const refreshPeriodicity = useCallback(async () => {
    setPeriodicityLoading(true);
    setPeriodicityError(null);
    try {
      const response = await fetch("/api/kpi/periodicity-compliance", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar periodicidade.";
        throw new Error(message);
      }
      const data = (await response.json()) as PeriodicityComplianceResponse;
      setPeriodicity(data);
    } catch (error) {
      console.error("Failed to load periodicity compliance", error);
      setPeriodicityError((error as Error).message ?? "Falha ao carregar periodicidade.");
    } finally {
      setPeriodicityLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [responsesSnap, machinesSnap] = await Promise.all([
        getDocs(query(responsesCol, orderBy("createdAt", "asc"))),
        getDocs(machinesCol),
      ]);

      const responseList = responsesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        return { id: docSnap.id, ...data } satisfies ChecklistResponse;
      });

      const machineList = machinesSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Machine, "id">;
        return {
          id: docSnap.id,
          ...data,
          fleetType: resolveMachineFleetType(data.fleetType),
        } satisfies Machine;
      });

      setRows(responseList);
      setMachines(machineList);
      setLoading(false);
    };

    load();
  }, [machinesCol, responsesCol]);

  useEffect(() => {
    refreshPeriodicity();
  }, [refreshPeriodicity]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshPeriodicity();
    }, 90_000);
    return () => clearInterval(interval);
  }, [refreshPeriodicity]);

  const kpis: Kpis = useMemo(() => {
    let totalAnswers = 0;
    let totalNC = 0;
    let totalOK = 0;

    for (const response of rows) {
      for (const answer of response.answers || []) {
        totalAnswers += 1;
        if (answer.response === "nc") totalNC += 1;
        if (answer.response === "ok") totalOK += 1;
      }
    }

    type Key = string;
    const firstNc: Record<Key, Date> = {};
    const firstOkAfter: Record<Key, Date> = {};

    for (const response of rows) {
      const created = new Date(response.createdAt);
      for (const answer of response.answers || []) {
        const key = `${response.machineId}|${response.templateId}|${answer.questionId}`;
        if (answer.response === "nc") {
          if (!firstNc[key]) firstNc[key] = created;
        } else if (answer.response === "ok") {
          if (firstNc[key] && !firstOkAfter[key] && created > firstNc[key]) {
            firstOkAfter[key] = created;
          }
        }
      }
    }

    const repairs: number[] = [];
    for (const key of Object.keys(firstNc)) {
      if (firstOkAfter[key]) {
        const diffMs = firstOkAfter[key].getTime() - firstNc[key].getTime();
        repairs.push(diffMs / 36e5);
      }
    }

    const avgRepairTimeHours = repairs.length
      ? repairs.reduce((sum, value) => sum + value, 0) / repairs.length
      : 0;

    const totalNcIssues = Object.keys(firstNc).length;
    const resolvedRate = totalNcIssues ? (repairs.length / totalNcIssues) * 100 : 0;
    const ncRate = totalAnswers ? (totalNC / totalAnswers) * 100 : 0;

    return {
      totalChecklists: rows.length,
      totalNC,
      totalOK,
      ncRate,
      avgRepairTimeHours,
      resolvedRate,
    };
  }, [rows]);

  const trendByDay: TrendPoint[] = useMemo(() => {
    const bucket = new Map<string, TrendPoint>();

    for (const response of rows) {
      const dateKey = new Date(response.createdAt).toISOString().slice(0, 10);
      if (!bucket.has(dateKey)) {
        bucket.set(dateKey, { date: dateKey, nc: 0, ok: 0, total: 0 });
      }
      const entry = bucket.get(dateKey)!;

      for (const answer of response.answers || []) {
        if (answer.response === "nc") entry.nc += 1;
        if (answer.response === "ok") entry.ok += 1;
        entry.total += 1;
      }
    }

    return Array.from(bucket.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const pieData: PiePoint[] = useMemo(() => {
    let ok = 0;
    let nc = 0;
    let na = 0;

    for (const response of rows) {
      for (const answer of response.answers || []) {
        if (answer.response === "ok") ok += 1;
        else if (answer.response === "nc") nc += 1;
        else na += 1;
      }
    }

    return [
      { name: "Conforme (OK)", value: ok },
      { name: "Não Conforme (NC)", value: nc },
      { name: "Não se Aplica (NA)", value: na },
    ];
  }, [rows]);

  const topNcByMachine: BarPoint[] = useMemo(() => {
    const count: Record<string, number> = {};

    for (const response of rows) {
      const ncCount = response.answers?.filter((answer) => answer.response === "nc").length ?? 0;
      count[response.machineId] = (count[response.machineId] || 0) + ncCount;
    }

    const machineById = new Map(machines.map((machine) => [machine.id, machine]));

    return Object.entries(count)
      .map(([machineId, nc]) => ({
        name: machineById.get(machineId)?.modelo ?? machineId,
        nc,
      }))
      .sort((a, b) => b.nc - a.nc)
      .slice(0, 8);
  }, [rows, machines]);

  const nonCompliantItems = useMemo(
    () => periodicity?.items.filter((item) => item.status === "non_compliant") ?? [],
    [periodicity?.items],
  );

  const trackedCount = periodicity?.summary.totalTracked ?? 0;

  const renderRequirement = useCallback(
    (item: { quantity: number; unit: keyof typeof PERIODICITY_UNITS }) => {
      const unitLabel = PERIODICITY_UNITS[item.unit];
      const plural = item.quantity > 1;
      return `1 envio a cada ${item.quantity} ${plural ? unitLabel.plural : unitLabel.singular}`;
    },
    [],
  );

  const formatDatePtBr = useCallback((value?: string) => {
    if (!value) return "Nunca";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Nunca";
    return date.toLocaleString("pt-BR", { timeZone: "UTC" });
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Indicadores</h1>
        <p className="text-sm text-[var(--muted)]">
          Visao geral de conformidades, inconformidades e tempos medios de solucao.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Periodicidade mínima</h2>
          <button
            type="button"
            onClick={() => refreshPeriodicity()}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-1 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-[var(--surface)] disabled:opacity-60"
            disabled={periodicityLoading}
          >
            {periodicityLoading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {periodicityError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {periodicityError}
          </div>
        )}

        {periodicity && trackedCount === 0 && !periodicityError && (
          <div className="rounded-md border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)] shadow-sm">
            Nenhuma exigência de periodicidade ativa.
          </div>
        )}

        {periodicity && trackedCount > 0 && (
          <div
            className={`rounded-md border p-4 ${
              periodicity.summary.nonCompliant > 0
                ? "border-red-200 bg-red-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3
                  className={`text-base font-semibold ${
                    periodicity.summary.nonCompliant > 0 ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {periodicity.summary.nonCompliant > 0
                    ? "Atenção: checklists fora da periodicidade mínima"
                    : "Todos os itens estão dentro da periodicidade"}
                </h3>
                <p
                  className={`text-sm ${
                    periodicity.summary.nonCompliant > 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {periodicity.summary.nonCompliant > 0
                    ? `${periodicity.summary.nonCompliant} de ${trackedCount} itens estão atrasados.`
                    : `${trackedCount} itens monitorados estão em conformidade.`}
                </p>
                <p className="mt-1 text-xs text-[var(--hint)]">
                  Última verificação: {formatDatePtBr(periodicity.generatedAt)} (UTC)
                </p>
              </div>

              {periodicity.summary.nonCompliant > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  Fora da periodicidade
                </span>
              )}
            </div>

            {nonCompliantItems.length > 0 && (
              <div className="mt-3 space-y-3">
                {nonCompliantItems.map((item) => (
                  <div
                    key={`${item.templateId}-${item.machineId}`}
                    className="rounded-md border border-red-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-700">{item.templateName}</p>
                        <p className="text-xs text-red-600">{item.machineName ?? item.machineId}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        Fora da periodicidade
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-red-600">
                      <p>Último envio: {formatDatePtBr(item.lastSubmissionAt)}</p>
                      <p>Exigido: {renderRequirement(item)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Checklists" value={loading ? "-" : kpis.totalChecklists} />
        <KpiCard
          title="Taxa de NC"
          value={loading ? "-" : `${kpis.ncRate.toFixed(1)}%`}
          hint="Respostas NC sobre o total"
        />
        <KpiCard
          title="Tempo medio de reparacao"
          value={loading ? "-" : `${kpis.avgRepairTimeHours.toFixed(1)} h`}
          hint="Entre NC e o proximo OK"
        />
        <KpiCard
          title="NC resolvidas"
          value={loading ? "-" : `${kpis.resolvedRate.toFixed(1)}%`}
          hint="Percentual de NC que viraram OK"
        />
      </section>

      <Card title="Tendencia diaria (OK x NC)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="ok" name="OK" stroke="#22c55e" />
              <Line type="monotone" dataKey="nc" name="NC" stroke="#ef4444" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Distribuicao de respostas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} label>
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top maquinas por NC">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topNcByMachine}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="nc" name="NC">
                  {topNcByMachine.map((_, index) => (
                    <Cell key={index} fill="#ef4444" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ul className="mt-2 text-xs text-gray-400 space-y-1">
              {topNcByMachine.map((item, index) => (
                <li key={index} className="truncate">
                  {index + 1}. {item.name} - {item.nc} NC
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <p className="text-xs text-[var(--hint)]">
        Observacao: o tempo medio de reparacao considera o intervalo entre a primeira ocorrencia de NC e o
        primeiro OK subsequente para a mesma maquina, template e pergunta na janela carregada.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

