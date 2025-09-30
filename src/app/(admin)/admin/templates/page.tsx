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
import TemplateForm, { TemplateFormPayload } from "@/components/TemplateForm";

const UNIT_LABEL = {
  day: { singular: "dia", plural: "dias" },
  week: { singular: "semana", plural: "semanas" },
  month: { singular: "mês", plural: "meses" },
} as const;

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

  const syncPeriodicity = async (templateId: string, config: TemplateFormPayload["periodicity"]) => {
    try {
      const response = await fetch(`/api/templates/${templateId}/periodicity`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...config, anchor: "last_submission" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Falha ao salvar periodicidade.";
        throw new Error(message);
      }
    } catch (error) {
      console.error(`Failed to sync periodicity for template ${templateId}`, error);
      throw error;
    }
  };

  const handleCreate = async ({ template, periodicity }: TemplateFormPayload) => {
    try {
      const docRef = await addDoc(col, template);
      try {
        await syncPeriodicity(docRef.id, periodicity);
      } catch (error) {
        alert((error as Error).message ?? "Falha ao atualizar periodicidade.");
      }
      await fetchAll();
      setUi({ mode: "list" });
    } catch (error) {
      console.error("Failed to create checklist template", error);
      alert("Falha ao criar template. Verifique os dados e tente novamente.");
    }
  };

  const handleUpdate = async (templateRecord: ChecklistTemplate, { template, periodicity }: TemplateFormPayload) => {
    try {
      await updateDoc(doc(db, "checklistTemplates", templateRecord.id), template as Partial<ChecklistTemplate>);
      try {
        await syncPeriodicity(templateRecord.id, periodicity);
      } catch (error) {
        alert((error as Error).message ?? "Falha ao atualizar periodicidade.");
      }
      await fetchAll();
      setUi({ mode: "list" });
    } catch (error) {
      console.error("Failed to update checklist template", error);
      alert("Falha ao atualizar template.");
    }
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
        <div className="bg-[var(--surface)] p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Cadastrar Template</h2>
          <TemplateForm onSubmit={handleCreate} onCancel={() => setUi({ mode: "list" })} />
        </div>
      )}

      {ui.mode === "edit" && ui.selected && (
        <div className="bg-[var(--surface)] p-6 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">Editar Template</h2>
          <TemplateForm
            initial={ui.selected}
            onSubmit={(data) => handleUpdate(ui.selected!, data)}
            onCancel={() => setUi({ mode: "list" })}
          />
        </div>
      )}

      {ui.mode === "list" && (
        <div className="bg-[var(--surface)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Versão</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Periodicidade</th>
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
                    {template.periodicity?.active ? (
                      <div className="flex flex-col gap-1 text-xs text-gray-200">
                        <span className="inline-flex w-fit items-center rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-emerald-50">
                          Ativa
                        </span>
                        <span>
                          {`1 envio a cada ${template.periodicity.quantity} ${
                            template.periodicity.quantity > 1
                              ? UNIT_LABEL[template.periodicity.unit].plural
                              : UNIT_LABEL[template.periodicity.unit].singular
                          }`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Desativada</span>
                    )}
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
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
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
