"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { Machine } from "@/types/machine";
import MachineForm from "@/components/MachineForm";
import QrCodeGenerator from "@/components/QrCodeGenerator";
import WeeklyChecklistForm from "@/components/WeeklyChecklistForm";

type UiState = {
  mode: "list" | "create" | "edit" | "qr" | "weekly";
  selected?: Machine | null;
};

export default function MachinesAdminPage() {
  const router = useRouter();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [ui, setUi] = useState<UiState>({ mode: "list" });

  const machinesCol = useMemo(() => collection(db, "machines"), []);

  const fetchMachines = useCallback(async () => {
    const snap = await getDocs(machinesCol);
    const list = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<Machine, "id">;
      return { id: docSnap.id, ...data } satisfies Machine;
    });
    setMachines(list);
  }, [machinesCol]);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const handleCreate = async (data: Omit<Machine, "id">) => {
    await addDoc(machinesCol, data);
    await fetchMachines();
    setUi({ mode: "list" });
  };

  const handleUpdate = async (machine: Machine, data: Omit<Machine, "id">) => {
    await updateDoc(doc(db, "machines", machine.id), data as Partial<Machine>);
    await fetchMachines();
    setUi({ mode: "list" });
  };

  const handleDelete = async (machine: Machine) => {
    if (!confirm(`Excluir máquina ${machine.modelo}?`)) {
      return;
    }
    await deleteDoc(doc(db, "machines", machine.id));
    await fetchMachines();
  };

  const qrValueFor = (machine: Machine) =>
    `${window.location.origin}/checklist/${encodeURIComponent(machine.tag)}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Máquinas</h1>
          <p className="text-sm text-[var(--muted)]">
            Gerencie frota, TAGs e templates vinculados.
          </p>
        </div>
        {ui.mode === "list" && (
          <button
            onClick={() => setUi({ mode: "create" })}
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm-soft transition hover:bg-[var(--primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            Nova máquina
          </button>
        )}
      </header>

      {ui.mode === "create" && (
        <section className="light-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Cadastrar máquina</h2>
            <p className="text-sm text-[var(--muted)]">
              Informe os dados do equipamento para gerar o QR Code automaticamente.
            </p>
          </div>
          <MachineForm onSubmit={handleCreate} onCancel={() => setUi({ mode: "list" })} />
        </section>
      )}

      {ui.mode === "edit" && ui.selected && (
        <section className="light-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Editar máquina</h2>
            <p className="text-sm text-[var(--muted)]">
              Atualize as informações antes de salvar.
            </p>
          </div>
          <MachineForm
            initial={ui.selected}
            onSubmit={(data) => handleUpdate(ui.selected!, data)}
            onCancel={() => setUi({ mode: "list" })}
          />
        </section>
      )}

      {ui.mode === "qr" && ui.selected && (
        <section className="light-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              QR Code — {ui.selected.modelo} ({ui.selected.tag})
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Baixe o QR Code e fixe na máquina para acesso rápido ao checklist correspondente.
            </p>
          </div>
          <div className="flex flex-col gap-8 md:flex-row md:items-center">
            <QrCodeGenerator
              value={qrValueFor(ui.selected)}
              label={`TAG: ${ui.selected.tag}`}
              fileName={`qr-${ui.selected.tag}`}
            />
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <p>
                <strong>URL codificada no QR:</strong>
              </p>
              <code className="block break-all rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)]">
                {qrValueFor(ui.selected)}
              </code>
              <p className="text-xs text-[var(--hint)]">
                Ao escanear, o operador abre diretamente o checklist da TAG vinculada ao equipamento.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setUi({ mode: "list" })}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--primary-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              Voltar para lista
            </button>
          </div>
        </section>
      )}

      {ui.mode === "weekly" && ui.selected && (
        <WeeklyChecklistForm
          machine={ui.selected}
          onCancel={() => setUi({ mode: "list" })}
        />
      )}

      {ui.mode === "list" && (
        <section className="light-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--hint)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Modelo</th>
                  <th className="px-4 py-3 text-left font-medium">Placa</th>
                  <th className="px-4 py-3 text-left font-medium">Setor</th>
                  <th className="px-4 py-3 text-left font-medium">TAG</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((machine) => (
                  <tr
                    key={machine.id}
                    className="border-t border-[var(--border)] transition hover:bg-[var(--primary-50)]"
                  >
                    <td className="px-4 py-3 text-[var(--text)]">{machine.modelo}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{machine.placa ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{machine.setor}</td>
                    <td className="px-4 py-3">
                      <code className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]">
                        {machine.tag}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => router.push(`/admin/machines/${machine.id}/templates`)}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--primary-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                          Templates
                        </button>
                        <button
                          onClick={() => setUi({ mode: "weekly", selected: machine })}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--primary-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                          Checklist semanal
                        </button>
                        <button
                          onClick={() => setUi({ mode: "qr", selected: machine })}
                          className="rounded-md bg-[var(--success)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)] focus-visible:ring-offset-2"
                        >
                          QR
                        </button>
                        <button
                          onClick={() => setUi({ mode: "edit", selected: machine })}
                          className="rounded-md bg-[var(--warning)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)] focus-visible:ring-offset-2"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(machine)}
                          className="rounded-md bg-[var(--danger)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {machines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--hint)]">
                      Nenhuma máquina cadastrada até o momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
