"use client";

import { useState } from "react";
import type { User, UserRole } from "@/types/user";

type Props = {
  initial?: Partial<User>;
  onSubmit: (data: Omit<User, "id">) => Promise<void>;
  onCancel?: () => void;
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "operador", label: "Operador" },
  { value: "mecanico", label: "Mecânico" },
  { value: "admin", label: "Administrador" },
];

export default function UserForm({ initial, onSubmit, onCancel }: Props) {
  const [matricula, setMatricula] = useState(initial?.matricula ?? "");
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [role, setRole] = useState<UserRole>(initial?.role ?? "operador");
  const [setor, setSetor] = useState(initial?.setor ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    await onSubmit({
      matricula,
      nome,
      role,
      setor: setor || undefined,
    });
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-[var(--text)]">Matrícula</label>
        <input
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          value={matricula}
          onChange={(event) => setMatricula(event.target.value)}
          placeholder="Ex.: 2638894"
          required
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-[var(--text)]">Nome completo</label>
        <input
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Ex.: Reginaldo"
          required
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-[var(--text)]">Função</label>
        <select
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-[var(--text)]">Setor</label>
        <input
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          value={setor}
          onChange={(event) => setSetor(event.target.value)}
          placeholder="Ex.: Extração de Madeiras"
        />
        <span className="text-xs text-[var(--hint)]">Campo opcional, preencha se desejar segmentar acessos por área.</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm-soft transition hover:bg-[var(--primary-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar usuário"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--primary-50)]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
