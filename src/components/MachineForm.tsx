"use client";

import { useEffect, useState } from "react";
import {
  MACHINE_FLEET_TYPE_LABEL,
  Machine,
  MachineFleetType,
  resolveMachineFleetType,
} from "@/types/machine";

type Props = {
  initial?: Partial<Machine>;
  onSubmit: (data: Omit<Machine, "id">) => Promise<void>;
  onCancel?: () => void;
};

export default function MachineForm({ initial, onSubmit, onCancel }: Props) {
  const [modelo, setModelo] = useState(initial?.modelo ?? "");
  const [placa, setPlaca] = useState(initial?.placa ?? "");
  const [setor, setSetor] = useState(initial?.setor ?? "");
  const [combustivel, setCombustivel] = useState(initial?.combustivel ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [fleetType, setFleetType] = useState<MachineFleetType>(
    resolveMachineFleetType(initial?.fleetType),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial?.tag) {
      setTag(crypto.randomUUID());
    }
  }, [initial?.tag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit({
      modelo,
      placa: placa || undefined,
      setor,
      combustivel: combustivel || undefined,
      tag,
      checklists: initial?.checklists ?? [],
      fleetType,
    });
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">Modelo</label>
        <input
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">Placa (opcional)</label>
        <input
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">Setor</label>
        <input
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">Combustivel (opcional)</label>
        <input
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={combustivel}
          onChange={(e) => setCombustivel(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">TAG (UUID do QR)</label>
        <input
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          required
        />
        <p className="text-xs text-gray-400">Use este valor no QR Code da maquina.</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">Tipo de frota</label>
        <select
          className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
          value={fleetType}
          onChange={(event) => setFleetType(event.target.value as MachineFleetType)}
        >
          <option value="machine">{MACHINE_FLEET_TYPE_LABEL.machine}</option>
          <option value="vehicle">{MACHINE_FLEET_TYPE_LABEL.vehicle}</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
