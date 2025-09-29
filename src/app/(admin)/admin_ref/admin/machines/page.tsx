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

type UiState = {
  mode: "list" | "create" | "edit" | "qr";
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
    if (!confirm(`Excluir maquina ${machine.modelo}?`)) {
      return;
    }
    await deleteDoc(doc(db, "machines", machine.id));
    await fetchMachines();
  };

  const qrValueFor = (machine: Machine) =>
    `${window.location.origin}/checklist/${encodeURIComponent(machine.tag)}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Máquinas</h1>
          <p className="text-sm text-gray-400">Gerencie frota, TAGs e templates vinculados.</p>
        </div>
        {ui.mode === "list" && (
          <button
            onClick={() => setUi({ mode: "create" })}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700"
          >
            Nova Máquina
          </button>
        )}
      </header>

      {ui.mode === "create" && (
        <div className="bg-gray-800 p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Cadastrar Máquina</h2>
          <MachineForm
            onSubmit={handleCreate}
            onCancel={() => setUi({ mode: "list" })}
          />
        </div>
      )}

      {ui.mode === "edit" && ui.selected && (
        <div className="bg-gray-800 p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Editar Máquina</h2>
          <MachineForm
            initial={ui.selected}
            onSubmit={(data) => handleUpdate(ui.selected!, data)}
            onCancel={() => setUi({ mode: "list" })}
          />
        </div>
      )}

      {ui.mode === "qr" && ui.selected && (
        <div className="bg-gray-800 p-6 rounded-xl space-y-6">
          <div>
            <h2 className="text-lg font-semibold">
              QR Code — {ui.selected.modelo} ({ui.selected.tag})
            </h2>
            <p className="text-sm text-gray-400">
              Baixe o QR Code para colar na máquina. O link aponta para o checklist da TAG.
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <QrCodeGenerator
              value={qrValueFor(ui.selected)}
              label={`TAG: ${ui.selected.tag}`}
              fileName={`qr-${ui.selected.tag}`}
            />
            <div className="text-sm text-gray-300 space-y-2">
              <p>
                <strong>URL codificada no QR:</strong>
              </p>
              <code className="block break-all text-xs bg-gray-900 px-2 py-1 rounded-md border border-gray-700">
                {qrValueFor(ui.selected)}
              </code>
              <p className="text-xs text-gray-400">
                Cole este QR no equipamento. Ao escanear, o operador abre o checklist correspondente.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setUi({ mode: "list" })}
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {ui.mode === "list" && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3">Modelo</th>
                <th className="text-left px-4 py-3">Placa</th>
                <th className="text-left px-4 py-3">Setor</th>
                <th className="text-left px-4 py-3">TAG</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id} className="border-t border-gray-700">
                  <td className="px-4 py-3">{machine.modelo}</td>
                  <td className="px-4 py-3">{machine.placa ?? "-"}</td>
                  <td className="px-4 py-3">{machine.setor}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-gray-900 px-2 py-1 rounded-md border border-gray-700">
                      {machine.tag}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => router.push(`/machines/${machine.id}/templates`)}
                        className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700"
                      >
                        Templates
                      </button>
                      <button
                        onClick={() => setUi({ mode: "qr", selected: machine })}
                        className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700"
                      >
                        QR
                      </button>
                      <button
                        onClick={() => setUi({ mode: "edit", selected: machine })}
                        className="px-3 py-1 rounded-md bg-yellow-600 hover:bg-yellow-700"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(machine)}
                        className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {machines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Nenhuma máquina cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
