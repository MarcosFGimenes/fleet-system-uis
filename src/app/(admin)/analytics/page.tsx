"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChecklistResponse } from "@/types/checklist";
import { Machine } from "@/types/machine";
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

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChecklistResponse[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);
  const machinesCol = useMemo(() => collection(db, "machines"), []);

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
        return { id: docSnap.id, ...data } satisfies Machine;
      });

      setRows(responseList);
      setMachines(machineList);
      setLoading(false);
    };

    load();
  }, [machinesCol, responsesCol]);

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
      { name: "Nao Conforme (NC)", value: nc },
      { name: "Nao Aplica (NA)", value: na },
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Indicadores</h1>
        <p className="text-sm text-gray-400">
          Visao geral de conformidades, inconformidades e tempos medios de solucao.
        </p>
      </header>

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

      <p className="text-xs text-gray-500">
        Observacao: o tempo medio de reparacao considera o intervalo entre a primeira ocorrencia de NC e o
        primeiro OK subsequente para a mesma maquina, template e pergunta na janela carregada.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
