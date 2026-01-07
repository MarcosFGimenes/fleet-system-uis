"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChecklistPeriodicityUnit,
  ChecklistPhotoRule,
  ChecklistQuestion,
  ChecklistTemplate,
  ChecklistTemplateActorConfig,
  ChecklistTemplateHeader,
  ChecklistVariableAlertRule,
  ChecklistVariableCondition,
  ChecklistVariablePeriodicity,
  ChecklistVariableType,
} from "@/types/checklist";

type QuestionDraft = {
  id: string;
  text: string;
  photoRule: ChecklistPhotoRule;
  variableEnabled?: boolean;
  variableName?: string;
  variableType?: ChecklistVariableType;
  variableCondition?: ChecklistVariableCondition;
  // Regras de alerta
  alertRuleEnabled?: boolean;
  alertRuleColor?: string;
  alertRuleMessage?: string;
  alertRuleTriggerCondition?: "ok" | "nc" | "always";
  alertRuleShowOnHomePage?: boolean;
  // Periodicidade da variável
  variablePeriodicityEnabled?: boolean;
  variablePeriodicityQuantity?: number;
  variablePeriodicityUnit?: ChecklistPeriodicityUnit;
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
  const fallbackActor: ChecklistTemplateActorConfig = {
    kind: initial?.actor?.kind ?? initial?.type ?? "operador",
    requireDriverField: initial?.actor?.requireDriverField ?? false,
    requireOperatorSignature: initial?.actor?.requireOperatorSignature ?? true,
    requireMotoristSignature: initial?.actor?.requireMotoristSignature ?? false,
  };

  const fallbackHeader: ChecklistTemplateHeader = {
    foNumber: initial?.header?.foNumber ?? "",
    issueDate: initial?.header?.issueDate ?? "",
    revision: initial?.header?.revision ?? "",
    documentNumber: initial?.header?.documentNumber ?? "",
  };

  const [actorKind, setActorKind] = useState<ChecklistTemplate["type"]>(
    fallbackActor.kind,
  );
  const actorKindLabel = useMemo(() => {
    switch (actorKind) {
      case "motorista":
        return "Motorista";
      case "mecanico":
        return "Mecânico";
      default:
        return "Operador";
    }
  }, [actorKind]);
  const [requireDriverField, setRequireDriverField] = useState<boolean>(
    fallbackActor.requireDriverField ?? false,
  );
  const [requireOperatorSignature, setRequireOperatorSignature] =
    useState<boolean>(fallbackActor.requireOperatorSignature ?? true);
  const [requireMotoristSignature, setRequireMotoristSignature] =
    useState<boolean>(fallbackActor.requireMotoristSignature ?? false);
  const [header, setHeader] = useState<ChecklistTemplateHeader>(fallbackHeader);
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
      variableEnabled: Boolean(question.variable),
      variableName: question.variable?.name ?? "",
      variableType: question.variable?.type ?? undefined,
      variableCondition: question.variable?.condition ?? undefined,
      // Regras de alerta
      alertRuleEnabled: Boolean(question.variable?.alertRule),
      alertRuleColor: question.variable?.alertRule?.color ?? "#ef4444",
      alertRuleMessage: question.variable?.alertRule?.message ?? "",
      alertRuleTriggerCondition: question.variable?.alertRule?.triggerCondition ?? "nc",
      alertRuleShowOnHomePage: question.variable?.alertRule?.showOnHomePage ?? true,
      // Periodicidade
      variablePeriodicityEnabled: Boolean(question.variable?.periodicity?.active),
      variablePeriodicityQuantity: question.variable?.periodicity?.quantity ?? 1,
      variablePeriodicityUnit: question.variable?.periodicity?.unit ?? "day",
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

    const normalizedHeader: ChecklistTemplateHeader = {
      foNumber: header.foNumber.trim(),
      issueDate: header.issueDate.trim(),
      revision: header.revision.trim(),
      documentNumber: header.documentNumber.trim(),
    };

    const normalizedActor: ChecklistTemplateActorConfig = {
      kind: actorKind,
      requireDriverField,
      requireOperatorSignature,
      requireMotoristSignature,
    };

    await onSubmit({
      template: {
        title: title.trim(),
        type: actorKind,
        version,
        isActive,
        questions: clean.map((question) => {
          const base: ChecklistQuestion = {
            id: question.id,
            text: question.text,
            photoRule: question.photoRule,
            requiresPhoto: question.photoRule === "required_nc",
          };
          // Anexa variável somente quando habilitada e com dados válidos
          const name = (question.variableName ?? "").trim();
          if (
            question.variableEnabled &&
            name &&
            question.variableType &&
            (question.variableCondition === "ok" ||
              question.variableCondition === "nc" ||
              question.variableCondition === "always")
          ) {
            const variable: typeof base.variable = {
              name,
              type: question.variableType,
              condition: question.variableCondition,
            };

            // Adiciona regra de alerta se habilitada
            if (question.alertRuleEnabled && question.alertRuleColor && question.alertRuleMessage) {
              variable.alertRule = {
                color: question.alertRuleColor.trim(),
                message: question.alertRuleMessage.trim(),
                triggerCondition: question.alertRuleTriggerCondition ?? "nc",
                showOnHomePage: question.alertRuleShowOnHomePage ?? true,
              };
            }

            // Adiciona periodicidade se habilitada
            if (
              question.variablePeriodicityEnabled &&
              question.variablePeriodicityQuantity &&
              question.variablePeriodicityUnit
            ) {
              const normalizedQty = Math.max(1, Math.floor(Number(question.variablePeriodicityQuantity) || 1));
              // Calcula windowDays similar ao template
              let multiplier = 1;
              if (question.variablePeriodicityUnit === "week") multiplier = 7;
              if (question.variablePeriodicityUnit === "month") multiplier = 30;
              const windowDays = normalizedQty * multiplier;

              variable.periodicity = {
                quantity: normalizedQty,
                unit: question.variablePeriodicityUnit,
                windowDays,
                anchor: "last_submission",
                active: true,
              };
            }

            base.variable = variable;
          }
          return base;
        }),
        header: normalizedHeader,
        actor: normalizedActor,
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-sm">Titulo</label>
          <input
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`Checklist diário ${actorKindLabel.toLowerCase()}`}
          />
        </div>
        <div>
          <label className="text-sm">Versao</label>
          <input
            type="number"
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            value={version}
            min={1}
            onChange={(event) => setVersion(Number(event.target.value))}
          />
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <header>
          <h3 className="font-semibold">Cabeçalho do PDF</h3>
          <p className="text-xs text-[var(--muted)]">
            Configure os valores exibidos no topo do relatório.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>FO</span>
            <input
              value={header.foNumber}
              onChange={(event) =>
                setHeader((prev) => ({ ...prev, foNumber: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="FO 012 050 -12"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Emissão (DD/MM/AA)</span>
            <input
              value={header.issueDate}
              onChange={(event) =>
                setHeader((prev) => ({ ...prev, issueDate: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="29/04/25"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Revisão (DD/MM/AA)</span>
            <input
              value={header.revision}
              onChange={(event) =>
                setHeader((prev) => ({ ...prev, revision: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="00/00/00"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Nº do documento</span>
            <input
              value={header.documentNumber}
              onChange={(event) =>
                setHeader((prev) => ({ ...prev, documentNumber: event.target.value }))
              }
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <header>
          <h3 className="font-semibold">Ator principal</h3>
          <p className="text-xs text-[var(--muted)]">
            Defina quem executa o checklist e quais campos adicionais devem
            aparecer no formulário.
          </p>
        </header>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Quem executa o checklist?</span>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              value={actorKind}
              onChange={(event) =>
                setActorKind(event.target.value as ChecklistTemplate["type"])
              }
            >
              <option value="operador">Operador</option>
              <option value="motorista">Motorista</option>
              <option value="mecanico">Mecânico</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-blue-500"
                checked={requireDriverField}
              onChange={(event) => setRequireDriverField(event.target.checked)}
            />
            Exibir campos para motorista no formulário
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={requireOperatorSignature}
              onChange={(event) =>
                setRequireOperatorSignature(event.target.checked)
              }
            />
            Exigir assinatura do {actorKindLabel.toLowerCase()}
          </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-blue-500"
                checked={requireMotoristSignature}
                onChange={(event) =>
                  setRequireMotoristSignature(event.target.checked)
                }
              />
              Exigir assinatura do motorista
            </label>
          </div>
        </div>
      </section>

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

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Periodicidade mínima</h3>
            <p className="text-xs text-[var(--muted)]">{periodicityHelper}</p>
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
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Unidade</span>
              <select
                value={periodicityUnit}
                onChange={(event) =>
                  setPeriodicityUnit(event.target.value as ChecklistPeriodicityUnit)
                }
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
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
            className="rounded-md bg-[var(--primary)] px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--primary-700)]"
          >
            + Adicionar Pergunta
          </button>
        </div>

        <div className="space-y-3">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm text-[var(--muted)]">{index + 1}.</span>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
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
                  <span className="text-xs uppercase tracking-wide text-[var(--hint)]">
                    Fotos
                  </span>
                  <select
                    value={question.photoRule}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        photoRule: event.target.value as ChecklistPhotoRule,
                      })
                    }
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
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
                  className="rounded-md border border-[var(--danger)] px-3 py-1 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/10"
                >
                  Remover
                </button>
              </div>

              <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-blue-500"
                    checked={Boolean(question.variableEnabled)}
                    onChange={(e) =>
                      updateQuestion(question.id, {
                        variableEnabled: e.target.checked,
                        // Se habilitar agora, definir defaults sensatos
                        variableType: e.target.checked
                          ? (question.variableType ?? "text")
                          : question.variableType,
                        variableCondition: e.target.checked
                          ? (question.variableCondition ?? "always")
                          : question.variableCondition,
                      })
                    }
                  />
                  Incluir variável?
                </label>

                {question.variableEnabled && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span>Nome da Variável</span>
                      <input
                        value={question.variableName ?? ""}
                        onChange={(e) =>
                          updateQuestion(question.id, { variableName: e.target.value })
                        }
                        placeholder="Ex.: Quantidade de graxa utilizada"
                        className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span>Tipo da Variável</span>
                      <select
                        value={question.variableType ?? "text"}
                        onChange={(e) =>
                          updateQuestion(question.id, {
                            variableType: e.target.value as ChecklistVariableType,
                          })
                        }
                        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      >
                        <option value="int">Número Inteiro</option>
                        <option value="decimal">Número Decimal</option>
                        <option value="text">Texto Curto</option>
                        <option value="long_text">Texto Longo</option>
                        <option value="date">Data</option>
                        <option value="time">Hora</option>
                        <option value="boolean">Booleano</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span>Condição de Exibição</span>
                      <select
                        value={question.variableCondition ?? "always"}
                        onChange={(e) =>
                          updateQuestion(question.id, {
                            variableCondition:
                              e.target.value as ChecklistVariableCondition,
                          })
                        }
                        className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      >
                        <option value="ok">Se a resposta for &quot;Conforme&quot;</option>
                        <option value="nc">Se a resposta for &quot;Não Conforme&quot;</option>
                        <option value="always">Sempre</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Regra de Alerta */}
                {question.variableEnabled && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-white p-3">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-blue-500"
                        checked={Boolean(question.alertRuleEnabled)}
                        onChange={(e) =>
                          updateQuestion(question.id, {
                            alertRuleEnabled: e.target.checked,
                            alertRuleColor: e.target.checked ? (question.alertRuleColor ?? "#ef4444") : question.alertRuleColor,
                            alertRuleMessage: e.target.checked ? (question.alertRuleMessage ?? "") : question.alertRuleMessage,
                            alertRuleTriggerCondition: e.target.checked ? (question.alertRuleTriggerCondition ?? "nc") : question.alertRuleTriggerCondition,
                            alertRuleShowOnHomePage: e.target.checked ? (question.alertRuleShowOnHomePage ?? true) : question.alertRuleShowOnHomePage,
                          })
                        }
                      />
                      Exibir cartão de alerta quando não conforme?
                    </label>

                    {question.alertRuleEnabled && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm">
                          <span>Cor do cartão</span>
                          <select
                            value={question.alertRuleColor ?? "#ef4444"}
                            onChange={(e) =>
                              updateQuestion(question.id, { alertRuleColor: e.target.value })
                            }
                            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          >
                            <option value="#ef4444">Vermelho</option>
                            <option value="#f59e0b">Âmbar/Laranja</option>
                            <option value="#eab308">Amarelo</option>
                            <option value="#dc2626">Vermelho Escuro</option>
                            <option value="#ea580c">Laranja Escuro</option>
                          </select>
                        </label>

                        <label className="flex flex-col gap-1 text-sm">
                          <span>Condição de acionamento</span>
                          <select
                            value={question.alertRuleTriggerCondition ?? "nc"}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                alertRuleTriggerCondition: e.target.value as "ok" | "nc" | "always",
                              })
                            }
                            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          >
                            <option value="nc">Quando Não Conforme</option>
                            <option value="ok">Quando Conforme</option>
                            <option value="always">Sempre</option>
                          </select>
                        </label>

                        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                          <span>Mensagem do alerta</span>
                          <input
                            value={question.alertRuleMessage ?? ""}
                            onChange={(e) =>
                              updateQuestion(question.id, { alertRuleMessage: e.target.value })
                            }
                            placeholder="Ex.: Atenção: esta variável foi marcada como não conforme"
                            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          />
                        </label>

                        <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                          <input
                            type="checkbox"
                            className="accent-blue-500"
                            checked={question.alertRuleShowOnHomePage ?? true}
                            onChange={(e) =>
                              updateQuestion(question.id, { alertRuleShowOnHomePage: e.target.checked })
                            }
                          />
                          Exibir alerta na tela inicial
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Periodicidade da Variável */}
                {question.variableEnabled && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-white p-3">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-blue-500"
                        checked={Boolean(question.variablePeriodicityEnabled)}
                        onChange={(e) =>
                          updateQuestion(question.id, {
                            variablePeriodicityEnabled: e.target.checked,
                            variablePeriodicityQuantity: e.target.checked ? (question.variablePeriodicityQuantity ?? 1) : question.variablePeriodicityQuantity,
                            variablePeriodicityUnit: e.target.checked ? (question.variablePeriodicityUnit ?? "day") : question.variablePeriodicityUnit,
                          })
                        }
                      />
                      Definir periodicidade para esta variável?
                    </label>

                    {question.variablePeriodicityEnabled && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm">
                          <span>Quantidade</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={question.variablePeriodicityQuantity ?? 1}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (Number.isFinite(value)) {
                                updateQuestion(question.id, { variablePeriodicityQuantity: value });
                              }
                            }}
                            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-sm">
                          <span>Unidade</span>
                          <select
                            value={question.variablePeriodicityUnit ?? "day"}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                variablePeriodicityUnit: e.target.value as ChecklistPeriodicityUnit,
                              })
                            }
                            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          >
                            <option value="day">Dia</option>
                            <option value="week">Semana</option>
                            <option value="month">Mês</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {questions.length === 0 && (
            <p className="text-sm text-[var(--hint)]">Nenhuma pergunta adicionada.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-500"
        >
          Salvar Template
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-semibold text-[var(--text)] shadow-sm transition hover:bg-white"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
