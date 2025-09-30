"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChecklistPeriodicityUnit,
  ChecklistPhotoRule,
  ChecklistQuestion,
  ChecklistTemplate,
} from "@/types/checklist";

type QuestionDraft = {
  id: string;
  text: string;
  photoRule: ChecklistPhotoRule;
};

export type TemplateFormPayload = {
  template: Omit<ChecklistTemplate, "id" | "periodicity">;
  periodicity: {
    active: boolean;
    quantity: number;
    unit: ChecklistPeriodicityUnit;
  };
};

type Props = {
  initial?: Partial<ChecklistTemplate>;
  onSubmit: (data: TemplateFormPayload) => Promise<void>;
  onCancel?: () => void;
};

export default function TemplateForm({ initial, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<"operador" | "mecanico">(
    initial?.type ?? "operador"
  );
  const [version, setVersion] = useState<number>(initial?.version ?? 1);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => {
    if (!initial?.questions?.length) {
      return [];
    }
    return initial.questions.map((question) => ({
      id: question.id,
      text: question.text,
      photoRule: question.photoRule
        ? question.photoRule
        : question.requiresPhoto
        ? "required_nc"
        : "optional",
    }));
  });

  const [periodicityActive, setPeriodicityActive] = useState<boolean>(
    initial?.periodicity?.active ?? false,
  );
  const [periodicityQuantity, setPeriodicityQuantity] = useState<number>(
    initial?.periodicity?.quantity ?? 1,
  );
  const [periodicityUnit, setPeriodicityUnit] = useState<ChecklistPeriodicityUnit>(
    initial?.periodicity?.unit ?? "day",
  );

  useEffect(() => {
    if (!initial) {
      setQuestions([
        {
          id: crypto.randomUUID(),
          text: "Há vazamentos visíveis?",
          photoRule: "required_nc",
        },
        {
          id: crypto.randomUUID(),
          text: "Luzes e setas funcionando?",
          photoRule: "optional",
        },
      ]);
    }
  }, [initial]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: "", photoRule: "optional" },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) => {
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
    const normalizedQuantity = Math.max(1, Math.floor(Number(periodicityQuantity) || 0));
    if (periodicityActive) {
      if (!Number.isFinite(periodicityQuantity) || normalizedQuantity < 1) {
        alert("Informe uma periodicidade válida (quantidade >= 1).");
        return;
      }
    }

    await onSubmit({
      template: {
        title: title.trim(),
        type,
        version,
        isActive,
        questions: clean.map((question) => ({
          id: question.id,
          text: question.text,
          photoRule: question.photoRule,
          requiresPhoto: question.photoRule === "required_nc",
        } satisfies ChecklistQuestion)),
      },
      periodicity: {
        active: periodicityActive,
        quantity: normalizedQuantity,
        unit: periodicityUnit,
      },
    });
  };

  const photoRuleLabel: Record<QuestionDraft["photoRule"], string> = {
    none: "Não permite foto",
    optional: "Foto opcional",
    required_nc: "Foto obrigatória se marcar NC",
  };

  const periodicityUnitLabel = useMemo(
    () => ({
      day: { singular: "dia", plural: "dias" },
      week: { singular: "semana", plural: "semanas" },
      month: { singular: "mês", plural: "meses" },
    }),
    [],
  );

  const periodicityHelper = periodicityActive
    ? `Será exigido ao menos 1 envio a cada ${Math.max(1, Math.floor(periodicityQuantity))} ${
        Math.max(1, Math.floor(periodicityQuantity)) === 1
          ? periodicityUnitLabel[periodicityUnit].singular
          : periodicityUnitLabel[periodicityUnit].plural
      }.`
    : "Nenhuma exigência de periodicidade ativa.";

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

      <section className="space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Periodicidade mínima</h3>
            <p className="text-xs text-gray-400">{periodicityHelper}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={periodicityActive}
              onChange={(event) => setPeriodicityActive(event.target.checked)}
              className="accent-blue-500"
            />
            Exigir periodicidade
          </label>
        </header>

        {periodicityActive && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_200px]">
            <label className="flex flex-col gap-1 text-sm">
              <span>Quantidade</span>
              <input
                type="number"
                min={1}
                step={1}
                value={periodicityQuantity}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    setPeriodicityQuantity(value);
                  }
                }}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Unidade</span>
              <select
                value={periodicityUnit}
                onChange={(event) =>
                  setPeriodicityUnit(event.target.value as ChecklistPeriodicityUnit)
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              >
                <option value="day">Dia</option>
                <option value="week">Semana</option>
                <option value="month">Mês</option>
              </select>
            </label>
          </div>
        )}
      </section>

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
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Fotos
                  </span>
                  <select
                    value={question.photoRule}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        photoRule: event.target.value as ChecklistPhotoRule,
                      })
                    }
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
                  >
                    {Object.entries(photoRuleLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
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
