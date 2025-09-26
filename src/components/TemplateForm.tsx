"use client";

import { useEffect, useState } from "react";
import { ChecklistQuestion, ChecklistTemplate } from "@/types/checklist";

type Props = {
  initial?: Partial<ChecklistTemplate>;
  onSubmit: (data: Omit<ChecklistTemplate, "id">) => Promise<void>;
  onCancel?: () => void;
};

export default function TemplateForm({ initial, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<"operador" | "mecanico">(
    initial?.type ?? "operador"
  );
  const [version, setVersion] = useState<number>(initial?.version ?? 1);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [questions, setQuestions] = useState<ChecklistQuestion[]>(
    initial?.questions ?? []
  );

  useEffect(() => {
    if (!initial) {
      setQuestions([
        {
          id: crypto.randomUUID(),
          text: "Ha vazamentos visiveis?",
          requiresPhoto: true,
        },
        {
          id: crypto.randomUUID(),
          text: "Luzes e setas funcionando?",
          requiresPhoto: false,
        },
      ]);
    }
  }, [initial]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: "", requiresPhoto: false },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<ChecklistQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, text: q.text.trim() }))
      .filter((q) => q.text);
    if (!title.trim()) {
      alert("Informe um titulo.");
      return;
    }
    if (!clean.length) {
      alert("Adicione ao menos uma pergunta.");
      return;
    }
    await onSubmit({
      title: title.trim(),
      type,
      version,
      isActive,
      questions: clean,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="text-sm">Titulo</label>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Checklist Diario Operador"
          />
        </div>
        <div>
          <label className="text-sm">Tipo</label>
          <select
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
            value={type}
            onChange={(event) => setType(event.target.value as "operador" | "mecanico")}
          >
            <option value="operador">Operador</option>
            <option value="mecanico">Mecanico</option>
          </select>
        </div>
        <div>
          <label className="text-sm">Versao</label>
          <input
            type="number"
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
            value={version}
            min={1}
            onChange={(event) => setVersion(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isActive"
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="accent-blue-500"
        />
        <label htmlFor="isActive" className="text-sm">
          Ativo
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Perguntas</h3>
          <button
            type="button"
            onClick={addQuestion}
            className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700"
          >
            + Adicionar Pergunta
          </button>
        </div>

        <div className="space-y-3">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="p-3 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm text-gray-400">{index + 1}.</span>
                <textarea
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
                  value={question.text}
                  onChange={(event) =>
                    updateQuestion(question.id, { text: event.target.value })
                  }
                  placeholder="Descreva a pergunta..."
                  rows={2}
                />
              </div>

              <div className="mt-2 flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={question.requiresPhoto}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        requiresPhoto: event.target.checked,
                      })
                    }
                    className="accent-blue-500"
                  />
                  Foto obrigatoria quando NC
                </label>

                <button
                  type="button"
                  onClick={() => removeQuestion(question.id)}
                  className="px-3 py-1 rounded-md bg-red-600 hover:bg-red-700"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}

          {questions.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma pergunta adicionada.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 font-semibold"
        >
          Salvar Template
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
