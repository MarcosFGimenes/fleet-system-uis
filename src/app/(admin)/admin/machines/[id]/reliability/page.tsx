"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import DataTable from "@/components/ui/DataTable";
import type { NonConformity } from "@/types/nonconformity";
import type { Machine } from "@/types/machine";
import { db } from "@/lib/firebase";
import {
  calcAvgContainmentHours,
  calcAvgResolutionHours,
  groupByDayWeek,
} from "@/lib/kpis/nc";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const severityWeight: Record<string, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

type ResolutionPoint = {
  severity: string;
  severityWeight: number;
  resolution: number;
  title: string;
};

type IdlePoint = {
  idle: number;
  severityWeight: number;
  severity: string;
  title: string;
};

const severityLabel: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function hoursBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  return (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
}

export default function AssetReliabilityPage() {
  const params = useParams<{ id: string }>();
  const assetId = params?.id;
  const [machine, setMachine] = useState<Machine | null>(null);
  const [records, setRecords] = useState<NonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!assetId) return;
      setLoading(true);
      setError(null);
      try {
        const machineSnap = await getDoc(doc(db, "machines", assetId));
        if (!machineSnap.exists()) {
          setError("Máquina não encontrada.");
          setLoading(false);
          return;
        }
        setMachine({ id: machineSnap.id, ...(machineSnap.data() as Omit<Machine, "id">) });

        const response = await fetch(`/api/nc?assetId=${assetId}&pageSize=500`);
        if (!response.ok) throw new Error("Falha ao carregar NCs deste ativo");
        const payload = await response.json();
        setRecords(payload.data as NonConformity[]);
      } catch (err) {
        console.error(err);
        setError("Não foi possível carregar os dados de confiabilidade.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [assetId]);

  const metrics = useMemo(() => {
    if (!records.length) {
      return {
        totalNc: 0,
        openNc: 0,
        closedNc: 0,
        avgContainment: 0,
        avgResolution: 0,
        mtbf: undefined as number | undefined,
        mttr: undefined as number | undefined,
        availability: undefined as number | undefined,
        ncPer100h: undefined as number | undefined,
        ncPer1000km: undefined as number | undefined,
      };
    }

    const totalNc = records.length;
    const openNc = records.filter((record) => record.status !== "resolvida").length;
    const closedNc = totalNc - openNc;
    const avgContainment = calcAvgContainmentHours(records);
    const avgResolution = calcAvgResolutionHours(records);

    const hoursReadings = records
      .map((record) => record.telemetryRef?.hours)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);

    const kmReadings = records
      .map((record) => record.telemetryRef?.odometerKm)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);

    const hoursSpan = hoursReadings.length >= 2 ? hoursReadings.at(-1)! - hoursReadings[0]! : undefined;
    const kmSpan = kmReadings.length >= 2 ? kmReadings.at(-1)! - kmReadings[0]! : undefined;

    const mtbf = hoursSpan && closedNc > 0 ? hoursSpan / closedNc : undefined;
    const mttr = closedNc > 0 ? avgResolution : undefined;
    const availability = mtbf && mttr ? mtbf / (mtbf + mttr) : undefined;
    const ncPer100h = hoursSpan ? (totalNc / hoursSpan) * 100 : undefined;
    const ncPer1000km = kmSpan ? (totalNc / kmSpan) * 1000 : undefined;

    return {
      totalNc,
      openNc,
      closedNc,
      avgContainment,
      avgResolution,
      mtbf,
      mttr,
      availability,
      ncPer100h,
      ncPer1000km,
    };
  }, [records]);

  const resolutionScatter = useMemo<ResolutionPoint[]>(
    () =>
      records
        .map((record) => {
          const completed = record.actions?.find((action) => action.type === "corretiva" && action.completedAt);
          return {
            severity: severityLabel[record.severity ?? "media"],
            severityWeight: severityWeight[record.severity ?? "media"],
            resolution: hoursBetween(record.createdAt, completed?.completedAt) ?? 0,
            title: record.title,
          };
        })
        .filter((point): point is ResolutionPoint => point.resolution > 0),
    [records],
  );

  const idleScatter = useMemo<IdlePoint[]>(
    () =>
      records
        .filter((record) => typeof record.telemetryRef?.idleTimeH === "number")
        .map((record) => ({
          idle: record.telemetryRef?.idleTimeH ?? 0,
          severityWeight: severityWeight[record.severity ?? "media"],
          severity: severityLabel[record.severity ?? "media"],
          title: record.title,
        })),
    [records],
  );

  const timelineData = useMemo(() =>
    records
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((record) => ({
        id: record.id,
        status: record.status,
        severity: record.severity,
        title: record.title,
        createdAt: record.createdAt,
        dueAt: record.dueAt,
        recurrence: Boolean(record.recurrenceOfId),
      })),
  [records]);

  if (loading) {
    return (
      <Card padding="lg">
        <div className="text-sm text-[var(--hint)]">Carregando métricas do ativo…</div>
      </Card>
    );
  }

  if (error) {
    return <Alert variant="error" title="Erro" description={error} />;
  }

  if (!machine) {
    return <Alert variant="warning" description="Ativo não encontrado ou sem dados." />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Confiabilidade do ativo</h1>
        <p className="text-sm text-[var(--hint)]">
          {machine.modelo} • TAG {machine.tag}
        </p>
      </div>

      <Card className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" padding="lg">
        <div>
          <div className="text-sm text-gray-500">NCs registradas</div>
          <div className="text-2xl font-semibold text-gray-900">{metrics.totalNc}</div>
          <div className="text-xs text-gray-500">Aberta(s): {metrics.openNc} • Fechada(s): {metrics.closedNc}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">MTBF (h)</div>
          <div className="text-2xl font-semibold text-gray-900">
            {metrics.mtbf ? metrics.mtbf.toFixed(1) : "-"}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">MTTR (h)</div>
          <div className="text-2xl font-semibold text-gray-900">
            {metrics.mttr ? metrics.mttr.toFixed(1) : "-"}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Disponibilidade</div>
          <div className="text-2xl font-semibold text-gray-900">
            {metrics.availability ? `${(metrics.availability * 100).toFixed(1)}%` : "-"}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card padding="lg" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Severidade x tempo de resolução</h2>
            <span className="text-xs text-gray-500">Horas até conclusão</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis type="number" dataKey="severityWeight" name="Severidade" tickFormatter={(value) => ({ 1: "Baixa", 2: "Média", 3: "Alta" }[value as number] ?? String(value))} domain={[0.5, 3.5]} />
                <YAxis type="number" dataKey="resolution" name="Horas" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: number | string, _name, item) => { const numericValue = typeof value === "number" ? value : Number(value); const formatted = Number.isFinite(numericValue) ? numericValue.toFixed(1) : "0.0"; const payload = item?.payload as ResolutionPoint | undefined; return [`${formatted} h`, payload?.title ?? ""]; }} />
                <Legend />
                <Scatter name="NCs" data={resolutionScatter} fill="#2563eb" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="lg" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Ralenti x severidade</h2>
            <span className="text-xs text-gray-500">Horas em ralenti</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis type="number" dataKey="idle" name="Ralenti (h)" />
                <YAxis type="number" dataKey="severityWeight" name="Severidade" tickFormatter={(value) => ({ 1: "Baixa", 2: "Média", 3: "Alta" }[value as number] ?? String(value))} domain={[0.5, 3.5]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: number | string, _name, item) => { const numericValue = typeof value === "number" ? value : Number(value); const formatted = Number.isFinite(numericValue) ? numericValue.toFixed(1) : "0.0"; const payload = item?.payload as IdlePoint | undefined; return [formatted, payload?.title ?? ""]; }} />
                <Legend />
                <Scatter name="NCs" data={idleScatter} fill="#10b981" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card padding="lg" className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Linha do tempo de NCs</h2>
        <DataTable
          columns={[
            {
              key: "createdAt",
              label: "Registrada",
              render: (record: typeof timelineData[number]) => (
                <span className="text-sm text-[var(--hint)]">{dateFormatter.format(new Date(record.createdAt))}</span>
              ),
            },
            {
              key: "title",
              label: "Título",
              render: (record: typeof timelineData[number]) => (
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{record.title}</span>
                  <span className="text-xs text-gray-500">{severityLabel[record.severity ?? "media"] ?? record.severity}</span>
                </div>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (record: typeof timelineData[number]) => (
                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                  {record.status}
                </span>
              ),
            },
            {
              key: "dueAt",
              label: "SLA",
              render: (record: typeof timelineData[number]) => (
                <span className="text-sm text-[var(--hint)]">{record.dueAt ? dateFormatter.format(new Date(record.dueAt)) : "-"}</span>
              ),
            },
            {
              key: "recurrence",
              label: "Recorrência",
              render: (record: typeof timelineData[number]) => (
                <span className="text-sm text-[var(--hint)]">{record.recurrence ? "Sim" : "Não"}</span>
              ),
            },
          ]}
          data={timelineData}
          page={1}
          pageSize={timelineData.length || 1}
          total={timelineData.length}
          isLoading={false}
          onPageChange={() => undefined}
          onPageSizeChange={() => undefined}
        />
      </Card>

      <Card padding="lg" className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Tendência semanal</h2>
        <div className="text-sm text-[var(--hint)]">
          {groupByDayWeek(records, "week").map((item) => (
            <div key={item.period} className="flex items-center justify-between border-b border-gray-100 py-1">
              <span>{item.period}</span>
              <span>Abertas: {item.opened} • Fechadas: {item.closed}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}




