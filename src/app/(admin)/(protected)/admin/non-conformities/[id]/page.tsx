"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import type { NcAction, NonConformity, NcStatus, Severity, TelemetryRef } from "@/types/nonconformity";

const severityOptions: Severity[] = ["alta", "media", "baixa"];
const statusOptions: NcStatus[] = ["aberta", "em_execucao", "aguardando_peca", "bloqueada", "resolvida"];

const statusLabel: Record<NcStatus, string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_peca: "Aguardando peça",
  bloqueada: "Bloqueada",
  resolvida: "Resolvida",
};

const severityLabel: Record<Severity, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

type AuditEntry = {
  id: string;
  byUserId?: string;
  byNome?: string;
  atISO?: string;
  diff?: Record<string, { before: unknown; after: unknown }>;
};

type DraftState = {
  status: NcStatus;
  severity: Severity;
  dueAt?: string;
  rootCause?: string;
  actions: NcAction[];
  safetyRisk?: boolean;
  impactAvailability?: boolean;
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateTimeFormatter.format(date);
}

function toInputDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 16);
}

function fromInputDateTime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toISOString();
}

function createDraft(record: NonConformity): DraftState {
  return {
    status: record.status,
    severity: (record.severity ?? "media") as Severity,
    dueAt: record.dueAt,
    rootCause: record.rootCause ?? "",
    actions: record.actions ? structuredClone(record.actions) : [],
    safetyRisk: record.safetyRisk ?? false,
    impactAvailability: record.impactAvailability ?? false,
  };
}

function sanitizeActions(actions: NcAction[]): NcAction[] {
  return actions.map((action) => ({
    ...action,
    description: action.description.trim(),
    owner: action.owner?.id
      ? { id: action.owner.id, nome: action.owner.nome?.trim() || action.owner.nome }
      : action.owner,
  }));
}

async function patchNc(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/nc/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, actor: { id: "admin-ui", nome: "Painel Admin" } }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Falha ao atualizar NC");
  }
}

export default function NonConformityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<NonConformity | null>(null);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryRef | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const ncId = params?.id;

  const loadData = useCallback(async () => {
    if (!ncId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/nc/${ncId}`);
      if (!response.ok) throw new Error("Falha ao carregar informações da NC");
      const payload = await response.json();
      const nc = payload.data as NonConformity;
      setRecord(nc);
      setDraft(createDraft(nc));
      setTelemetry(nc.telemetryRef ?? null);
      setAudits(payload.audits as AuditEntry[]);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar esta não conformidade.");
    } finally {
      setLoading(false);
    }
  }, [ncId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshToken]);

  const requiresCapa = record?.recurrenceOfId ? true : false;

  const timeline = useMemo(() => {
    if (!record) return [] as { title: string; timestamp: string; description?: string }[];
    const events: { title: string; timestamp: string; description?: string }[] = [];
    events.push({ title: "Checklist", timestamp: record.createdAt, description: "NC registrada" });
    for (const action of record.actions ?? []) {
      if (action.startedAt) {
        events.push({
          title: `Ação ${action.type === "corretiva" ? "corretiva" : "preventiva"} iniciada`,
          timestamp: action.startedAt,
          description: action.description,
        });
      }
      if (action.completedAt) {
        events.push({
          title: `Ação ${action.type === "corretiva" ? "corretiva" : "preventiva"} concluída`,
          timestamp: action.completedAt,
          description: action.description,
        });
      }
    }
    if (record.status === "resolvida" && record.actions?.some((action) => action.completedAt)) {
      const concluded = record.actions
        .filter((action) => action.completedAt)
        .map((action) => action.completedAt as string)
        .sort()
        .at(-1);
      if (concluded) {
        events.push({ title: "NC encerrada", timestamp: concluded });
      }
    }
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [record]);

  const updateDraft = (patch: Partial<DraftState>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateAction = (actionId: string, patch: Partial<NcAction>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map((action) =>
          action.id === actionId ? { ...action, ...patch } : action,
        ),
      };
    });
  };

  const removeAction = (actionId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.filter((action) => action.id !== actionId),
      };
    });
  };

  const addAction = (type: "corretiva" | "preventiva") => {
    setDraft((prev) => {
      if (!prev) return prev;
      const newAction: NcAction = {
        id: crypto.randomUUID(),
        type,
        description: "",
      };
      return { ...prev, actions: [...prev.actions, newAction] };
    });
  };

  const handleSave = async () => {
    if (!ncId || !draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      await patchNc(ncId, {
        status: draft.status,
        severity: draft.severity,
        dueAt: draft.dueAt,
        rootCause: draft.rootCause,
        actions: sanitizeActions(draft.actions),
        safetyRisk: draft.safetyRisk,
        impactAvailability: draft.impactAvailability,
      });
      setFeedback({ type: "success", text: "Não conformidade atualizada." });
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      setFeedback({ type: "error", text: "Erro ao salvar alterações." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (record) {
      setDraft(createDraft(record));
      setFeedback(null);
    }
  };

  if (loading || !draft || !record) {
    return (
      <div className="space-y-4">
        {error ? (
          <Alert variant="error" title="Erro" description={error} />
        ) : (
          <Card padding="lg">
            <div className="text-sm text-[var(--hint)]">Carregando detalhes da não conformidade…</div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        ? Voltar
      </button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">{record.title}</h1>
        <p className="text-sm text-[var(--hint)]">
          Ativo {record.linkedAsset.tag}
          {record.linkedAsset.modelo ? ` • ${record.linkedAsset.modelo}` : ""}
        </p>
      </div>

      {feedback && <Alert variant={feedback.type === "success" ? "success" : "error"} description={feedback.text} />}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="space-y-6" padding="lg">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Status</span>
              <select
                value={draft.status}
                onChange={(event) => updateDraft({ status: event.target.value as NcStatus })}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Severidade</span>
              <select
                value={draft.severity}
                onChange={(event) => updateDraft({ severity: event.target.value as Severity })}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                {severityOptions.map((option) => (
                  <option key={option} value={option}>
                    {severityLabel[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">SLA (due date)</span>
              <input
                type="date"
                value={draft.dueAt ? draft.dueAt.slice(0, 10) : ""}
                onChange={(event) => updateDraft({ dueAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={draft.safetyRisk}
                  onChange={(event) => updateDraft({ safetyRisk: event.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-[var(--primary)]"
                />
                Risco de segurança
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={draft.impactAvailability}
                  onChange={(event) => updateDraft({ impactAvailability: event.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-[var(--primary)]"
                />
                Impacta disponibilidade
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Causa raiz</h2>
              {requiresCapa && (!draft.rootCause || !draft.rootCause.trim()) && (
                <span className="text-xs font-semibold text-red-600">Obrigatória (recorrência)</span>
              )}
            </div>
            <textarea
              value={draft.rootCause ?? ""}
              onChange={(event) => updateDraft({ rootCause: event.target.value })}
              placeholder="Descreva a causa raiz identificada"
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Plano de ação (CAPA)</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addAction("corretiva")}
                  className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                >
                  + Ação corretiva
                </button>
                <button
                  type="button"
                  onClick={() => addAction("preventiva")}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                >
                  + Ação preventiva
                </button>
              </div>
            </div>

            {draft.actions.length === 0 && (
              <Alert
                variant="info"
                description="Nenhuma ação cadastrada. Adicione ações corretivas e preventivas para acompanhar o CAPA."
              />
            )}

            <div className="space-y-3">
              {draft.actions.map((action) => (
                <div key={action.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-center gap-2">
                      <select
                        value={action.type}
                        onChange={(event) => updateAction(action.id, { type: event.target.value as NcAction["type"] })}
                        className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      >
                        <option value="corretiva">Corretiva</option>
                        <option value="preventiva">Preventiva</option>
                      </select>
                      {action.type === "preventiva" && (
                        <label className="flex items-center gap-1 text-xs text-[var(--hint)]">
                          <input
                            type="checkbox"
                            checked={action.effective ?? false}
                            onChange={(event) => updateAction(action.id, { effective: event.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-[var(--primary)]"
                          />
                          Eficaz
                        </label>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAction(action.id)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    <label className="block text-xs uppercase tracking-wide text-gray-500">
                      Descrição
                      <textarea
                        value={action.description}
                        onChange={(event) => updateAction(action.id, { description: event.target.value })}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                    </label>
                    <label className="block text-xs uppercase tracking-wide text-gray-500">
                      Responsável
                      <input
                        value={action.owner?.nome ?? ""}
                        onChange={(event) =>
                          updateAction(action.id, {
                            owner: event.target.value
                              ? { id: action.owner?.id ?? crypto.randomUUID(), nome: event.target.value }
                              : undefined,
                          })
                        }
                        placeholder="Nome do responsável"
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-xs uppercase tracking-wide text-gray-500">
                        Início
                        <input
                          type="datetime-local"
                          value={toInputDateTime(action.startedAt)}
                          onChange={(event) => updateAction(action.id, { startedAt: fromInputDateTime(event.target.value) })}
                          className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wide text-gray-500">
                        Conclusão
                        <input
                          type="datetime-local"
                          value={toInputDateTime(action.completedAt)}
                          onChange={(event) => updateAction(action.id, { completedAt: fromInputDateTime(event.target.value) })}
                          className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="text-sm font-medium text-gray-500 hover:underline"
            >
              Restaurar dados do Firestore
            </button>
            {requiresCapa && (
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                Recorrência exige CAPA completo
              </span>
            )}
          </div>
        </Card>

        <div className="xl:col-span-1 space-y-6">
          <Card padding="lg" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Linha do tempo</h2>
            <div className="space-y-3">
              {timeline.length === 0 && (
                <p className="text-sm text-gray-500">Sem eventos registrados.</p>
              )}
              {timeline.map((event, index) => (
                <div key={`${event.title}-${index}`} className="border-l border-[var(--border)] pl-4">
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    {formatDateTime(event.timestamp)}
                  </div>
                  <div className="text-sm font-medium text-gray-800">{event.title}</div>
                  {event.description && (
                    <div className="text-sm text-[var(--hint)]">{event.description}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card padding="lg" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Telemetry (ISO 15143-3)</h2>
            {telemetry ? (
              <dl className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                {telemetry.hours !== undefined && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Horas</dt>
                    <dd className="font-medium">{telemetry.hours.toLocaleString("pt-BR")}</dd>
                  </div>
                )}
                {telemetry.odometerKm !== undefined && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Odômetro (km)</dt>
                    <dd className="font-medium">{telemetry.odometerKm.toLocaleString("pt-BR")}</dd>
                  </div>
                )}
                {telemetry.fuelUsedL !== undefined && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Combustível (L)</dt>
                    <dd className="font-medium">{telemetry.fuelUsedL.toLocaleString("pt-BR")}</dd>
                  </div>
                )}
                {telemetry.idleTimeH !== undefined && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Ralenti (h)</dt>
                    <dd className="font-medium">{telemetry.idleTimeH.toLocaleString("pt-BR")}</dd>
                  </div>
                )}
                {telemetry.faultCodes && telemetry.faultCodes.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Fault codes</dt>
                    <dd className="font-medium">{telemetry.faultCodes.join(", ")}</dd>
                  </div>
                )}
                {telemetry.windowStart && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Janela início</dt>
                    <dd className="font-medium">{dateFormatter.format(new Date(telemetry.windowStart))}</dd>
                  </div>
                )}
                {telemetry.windowEnd && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Janela fim</dt>
                    <dd className="font-medium">{dateFormatter.format(new Date(telemetry.windowEnd))}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-500">Sem dados de telemetria vinculados.</p>
            )}
          </Card>

          <Card padding="lg" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Auditoria</h2>
            {audits.length === 0 ? (
              <p className="text-sm text-gray-500">Sem registros de alteração.</p>
            ) : (
              <div className="space-y-3 text-sm text-gray-700">
                {audits.map((audit) => (
                  <div key={audit.id} className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{audit.byNome ?? audit.byUserId ?? "Usuário"}</span>
                      {audit.atISO && (
                        <span className="text-xs text-gray-500">{formatDateTime(audit.atISO)}</span>
                      )}
                    </div>
                    {audit.diff && (
                      <ul className="mt-2 space-y-1 text-xs text-[var(--hint)]">
                        {Object.entries(audit.diff).map(([field, change]) => (
                          <li key={field}>
                            <span className="font-semibold text-gray-700">{field}:</span> {String(change.before ?? "-")} ? {String(change.after ?? "-")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

