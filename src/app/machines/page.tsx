"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@lib/firebase";
import { Machine } from "@types/machine";

export default function MachinesPublicPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [q, setQ] = useState("");

  const machinesCol = useMemo(() => collection(db, "machines"), []);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(machinesCol);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Machine, "id">) })) as Machine[];
      setMachines(list);
    };
    load();
  }, [machinesCol]);

  const filtered = machines.filter((m) => {
    const text = `${m.modelo} ${m.placa ?? ""} ${m.tag} ${m.setor}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Máquinas</h1>
          <Link href="/" className="text-sm text-gray-300 hover:text-white">
            Voltar ao início
          </Link>
        </header>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por modelo, placa, TAG ou setor"
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="text-xs text-gray-500">
              {filtered.length} de {machines.length} equipamentos
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                <p className="font-medium">{m.modelo}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {m.placa ? <span>Placa: {m.placa} - </span> : null}
                  Setor: {m.setor}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  TAG: <code className="bg-gray-900 border border-gray-800 px-2 py-0.5 rounded">{m.tag}</code>
                </p>

                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/(checklist)/${encodeURIComponent(m.tag)}`}
                    className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-sm"
                  >
                    Abrir checklist
                  </Link>
                  <Link
                    href={`/admin/machines/${m.id}/templates`}
                    className="px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-sm"
                  >
                    Templates
                  </Link>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full text-sm text-gray-400">
                Nenhuma maquina encontrada para &quot;{q}&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

