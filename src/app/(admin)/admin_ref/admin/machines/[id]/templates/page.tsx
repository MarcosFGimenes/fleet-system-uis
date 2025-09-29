"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { Machine } from "@/types/machine";
import { ChecklistTemplate } from "@/types/checklist";

type Params = {
  id: string;
};

type Selection = Record<string, boolean>;

export default function MachineTemplatesLinkPage() {
  const { id } = useParams<Params>();
  const router = useRouter();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selected, setSelected] = useState<Selection>({});
  const [loading, setLoading] = useState(true);

  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        return;
      }
      try {
        setLoading(true);

        const machineRef = doc(db, "machines", String(id));
        const machineSnap = await getDoc(machineRef);
        if (!machineSnap.exists()) {
          throw new Error("Máquina não encontrada.");
        }
        const machineData = {
          id: machineSnap.id,
          ...(machineSnap.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        const templatesSnap = await getDocs(templatesCol);
        const templatesList = templatesSnap.docs.map(
          (tplDoc) =>
            ({
              id: tplDoc.id,
              ...(tplDoc.data() as Omit<ChecklistTemplate, "id">),
            } as ChecklistTemplate)
        );
        setTemplates(templatesList);

        const initialSelection: Selection = {};
        for (const tpl of templatesList) {
          initialSelection[tpl.id] = machineData.checklists?.includes(tpl.id) ?? false;
        }
        setSelected(initialSelection);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, templatesCol]);

  const toggle = (templateId: string) => {
    setSelected((prev) => ({
      ...prev,
      [templateId]: !prev[templateId],
    }));
  };

  const save = async () => {
    if (!machine) {
      return;
    }
    const chosen = Object.entries(selected)
      .filter(([, isChecked]) => isChecked)
      .map(([templateId]) => templateId);
    await updateDoc(doc(db, "machines", machine.id), { checklists: chosen });
    alert("Templates vinculados com sucesso!");
    router.push("/machines");
  };

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Carregando...
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Máquina não encontrada.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Vincular Templates</h1>
        <p className="text-sm text-gray-400">
          Máquina: <strong>{machine.modelo}</strong> — TAG:{" "}
          <code className="bg-gray-800 px-2 py-1 rounded border border-gray-700">
            {machine.tag}
          </code>
        </p>
      </header>

      <section className="bg-gray-800 p-4 rounded-xl space-y-2">
        {templates.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum template cadastrado.</p>
        )}

        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-700"
            >
              <div>
                <p className="font-medium">
                  {template.title}{" "}
                  <span className="text-xs text-gray-400">
                    ({template.type}, v{template.version})
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {template.isActive ? "Ativo" : "Inativo"}
                </p>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!selected[template.id]}
                  onChange={() => toggle(template.id)}
                  className="accent-blue-500"
                />
                <span className="text-sm">Vincular</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
        >
          Voltar
        </button>
        <button
          onClick={save}
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 font-semibold"
        >
          Salvar Vínculos
        </button>
      </div>
    </div>
  );
}
