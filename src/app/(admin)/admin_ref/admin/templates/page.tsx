"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { ChecklistTemplate } from "@/types/checklist";
import TemplateForm from "@/components/TemplateForm";

type UiState = {
  mode: "list" | "create" | "edit";
  selected?: ChecklistTemplate | null;
};

export default function TemplatesAdminPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [ui, setUi] = useState<UiState>({ mode: "list" });

  const col = useMemo(() => collection(db, "checklistTemplates"), []);

  const fetchAll = useCallback(async () => {
    const snap = await getDocs(col);
    const list = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<ChecklistTemplate, "id">;
      return { id: docSnap.id, ...data } satisfies ChecklistTemplate;
    });
    setTemplates(list);
  }, [col]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = async (data: Omit<ChecklistTemplate, "id">) => {
    await addDoc(col, data);
    await fetchAll();
    setUi({ mode: "list" });
  };

  const handleUpdate = async (
    template: ChecklistTemplate,
    data: Omit<ChecklistTemplate, "id">
  ) => {
    await updateDoc(doc(db, "checklistTemplates", template.id), data as Partial<ChecklistTemplate>);
    await fetchAll();
    setUi({ mode: "list" });
  };

  const handleDelete = async (template: ChecklistTemplate) => {
    if (!confirm(`Excluir template "${template.title}"?`)) {
      return;
    }
    await deleteDoc(doc(db, "checklistTemplates", template.id));
    await fetchAll();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Checklist</h1>
          <p className="text-sm text-gray-400">Modele perguntas para operadores e mecânicos.</p>
        </div>
        {ui.mode === "list" && (
          <button
            onClick={() => setUi({ mode: "create" })}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700"
          >
            Novo Template
          </button>
        )}
      </header>

      {ui.mode === "create" && (
        <div className="bg-gray-800 p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Cadastrar Template</h2>
          <TemplateForm
            onSubmit={handleCreate}
            onCancel={() => setUi({ mode: "list" })}
          />
        </div>
      )}

      {ui.mode === "edit" && ui.selected && (
        <div className="bg-gray-800 p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Editar Template</h2>
          <TemplateForm
            initial={ui.selected}
            onSubmit={(data) => handleUpdate(ui.selected!, data)}
            onCancel={() => setUi({ mode: "list" })}
          />
        </div>
      )}

      {ui.mode === "list" && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Versão</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-t border-gray-700">
                  <td className="px-4 py-3">{template.title}</td>
                  <td className="px-4 py-3 capitalize">{template.type}</td>
                  <td className="px-4 py-3">v{template.version}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-md text-xs ${
                        template.isActive ? "bg-emerald-700" : "bg-gray-700"
                      }`}
                    >
                      {template.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setUi({ mode: "edit", selected: template })}
                        className="px-3 py-1 rounded-md bg-yellow-600 hover:bg-yellow-700"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Nenhum template cadastrado.
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
