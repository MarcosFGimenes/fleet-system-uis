"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import type { User } from "@/types/user";
import UserForm from "@/components/UserForm";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";

const ROLE_LABEL: Record<User["role"], string> = {
  operador: "Operador",
  motorista: "Motorista",
  mecanico: "Mecânico",
  admin: "Administrador",
};

type UiState = {
  mode: "list" | "create" | "edit";
  selected?: User | null;
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [ui, setUi] = useState<UiState>({ mode: "list" });

  const usersCol = useMemo(() => collection(db, "users"), []);

  const fetchUsers = useCallback(async () => {
    const snapshot = await getDocs(usersCol);
    const list = snapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Omit<User, "id">;
      return { id: docSnapshot.id, ...data } satisfies User;
    });
    setUsers(list);
  }, [usersCol]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (data: Omit<User, "id">) => {
    await addDoc(usersCol, data);
    await fetchUsers();
    setUi({ mode: "list" });
  };

  const handleUpdate = async (user: User, data: Omit<User, "id">) => {
    await updateDoc(doc(db, "users", user.id), data as Partial<User>);
    await fetchUsers();
    setUi({ mode: "list" });
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Excluir usuário ${user.nome}?`)) {
      return;
    }

    await deleteDoc(doc(db, "users", user.id));
    await fetchUsers();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-[var(--muted)]">
            Cadastre operadores, motoristas, mecânicos e administradores por matrícula.
          </p>
        </div>
        {ui.mode === "list" && (
          <button
            onClick={() => setUi({ mode: "create" })}
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm-soft transition hover:bg-[var(--primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            Novo usuário
          </button>
        )}
      </header>

      {ui.mode === "create" && (
        <section className="light-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Cadastrar usuário</h2>
            <p className="text-sm text-[var(--muted)]">
              Informe matrícula, nome, função e setor para liberar o acesso.
            </p>
          </div>
          <UserForm onSubmit={handleCreate} onCancel={() => setUi({ mode: "list" })} />
        </section>
      )}

      {ui.mode === "edit" && ui.selected && (
        <section className="light-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Editar usuário</h2>
            <p className="text-sm text-[var(--muted)]">Atualize as informações antes de salvar.</p>
          </div>
          <UserForm
            initial={ui.selected}
            onSubmit={(data) => handleUpdate(ui.selected!, data)}
            onCancel={() => setUi({ mode: "list" })}
          />
        </section>
      )}

      {ui.mode === "list" && (
        <section className="light-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--hint)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Matrícula</th>
                  <th className="px-4 py-3 text-left font-medium">Nome</th>
                  <th className="px-4 py-3 text-left font-medium">Função</th>
                  <th className="px-4 py-3 text-left font-medium">Setor</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-[var(--border)] transition hover:bg-[var(--primary-50)]"
                  >
                    <td className="px-4 py-3 text-[var(--text)]">{user.matricula}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{user.nome}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{ROLE_LABEL[user.role]}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{user.setor ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setUi({ mode: "edit", selected: user })}
                          className="rounded-md bg-[var(--warning)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)] focus-visible:ring-offset-2"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="rounded-md bg-[var(--danger)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--hint)]">
                      Nenhum usuário cadastrado até o momento.
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
