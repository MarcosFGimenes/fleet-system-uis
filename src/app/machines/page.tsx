"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@lib/firebase";
import {
  MACHINE_FLEET_TYPE_LABEL,
  Machine,
  resolveMachineFleetType,
} from "@/types/machine";

export default function MachinesPublicPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [q, setQ] = useState("");

  const machinesCol = useMemo(() => collection(db, "machines"), []);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(machinesCol);
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<Machine, "id">;
        return {
          id: d.id,
          ...data,
          fleetType: resolveMachineFleetType(data.fleetType),
        } satisfies Machine;
      });
      setMachines(list);
    };
    void load();
  }, [machinesCol]);

  const filtered = machines.filter((m) => {
    const text = `${m.modelo} ${m.placa ?? ""} ${m.tag} ${m.setor}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
        <header className="flex items-start justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Máquinas</h1>
          <Link
            href="/"
            className="text-sm font-semibold text-[var(--primary-700)] transition hover:text-[var(--primary)] hover:underline underline-offset-4"
          >
            Voltar ao início
          </Link>
        </header>

        <section className="rounded-2xl light-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por modelo, placa, TAG ou setor"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--hint)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              aria-label="Buscar máquinas por modelo, placa, TAG ou setor"
            />
            <span className="text-xs font-medium text-[var(--muted)]">
              {filtered.length} de {machines.length} equipamentos
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => {
              const fleetLabel = MACHINE_FLEET_TYPE_LABEL[resolveMachineFleetType(m.fleetType)];
              return (
              <div key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <p className="font-semibold text-[var(--text)]">{m.modelo}</p>
                <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                  {m.placa ? (
                    <span>
                      Placa: {m.placa} —
                    </span>
                  ) : null}
                  {" "}
                  Setor: {m.setor}
                </p>
                <p className="mt-1 text-xs text-[var(--hint)]">
                  TAG:{" "}
                  <code className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-medium text-[var(--text)]">
                    {m.tag}
                  </code>
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">{fleetLabel}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/checklist/${encodeURIComponent(m.tag)}`}
                    className="rounded-md border border-[var(--primary-700)] bg-[var(--primary-50)] px-3 py-2 text-sm font-semibold text-[var(--primary-700)] shadow-sm-soft transition hover:bg-[var(--primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
                  >
                    Abrir checklist
                  </Link>
                  <Link
                    href={`/admin/machines/${m.id}/templates`}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--primary-700)] transition hover:bg-[var(--primary-50)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    Templates
                  </Link>
                </div>
              </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-full text-sm font-medium text-[var(--muted)]">
                Nenhuma máquina encontrada para &quot;{q}&quot;.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


