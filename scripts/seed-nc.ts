import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { NcAction, NcStatus, Severity, TelemetryRef } from "@/types/nonconformity";

const severityRank: Record<Severity, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
};

const severityPool: Severity[] = ["alta", "media", "baixa"];
const statusPool: NcStatus[] = ["aberta", "em_execucao", "aguardando_peca", "bloqueada", "resolvida"];

const assets = [
  { id: "asset-truck-01", tag: "TRK-01", modelo: "Caminhão 3132", tipo: "Caminhão", setor: "Logística" },
  { id: "asset-fork-02", tag: "FORK-02", modelo: "Empilhadeira H50", tipo: "Empilhadeira", setor: "Armazém" },
  { id: "asset-loader-03", tag: "LD-03", modelo: "Pá-carregadeira 966K", tipo: "Pá-carregadeira", setor: "Pedreira" },
];

const titles = [
  "Vibração anormal no motor",
  "Sensor de temperatura intermitente",
  "Vazamento no sistema hidráulico",
  "Desgaste prematuro de pneu",
  "Falha na iluminação de cabine",
  "Código de falha 1234 do ECM",
];

function randomOf<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomDateWithin(days: number): Date {
  const now = Date.now();
  const past = now - days * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

function createTelemetry(): TelemetryRef {
  const hours = Number((Math.random() * 5000 + 100).toFixed(1));
  const idle = Number((Math.random() * 200).toFixed(1));
  return {
    hours,
    idleTimeH: idle,
    fuelUsedL: Number((Math.random() * 400 + 50).toFixed(1)),
    odometerKm: Number((Math.random() * 80000 + 1000).toFixed(1)),
    faultCodes: Math.random() > 0.6 ? ["E123", "P2047"] : [],
    windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date().toISOString(),
  };
}

function buildCorrectiveAction(createdAt: string, status: NcStatus): NcAction[] {
  const corrective: NcAction = {
    id: crypto.randomUUID(),
    type: "corretiva",
    description: "Realizado ajuste corretivo e teste operacional",
    owner: { id: "tech-01", nome: "Técnico Leonardo" },
    startedAt: new Date(new Date(createdAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
  if (status === "resolvida") {
    corrective.completedAt = new Date(new Date(corrective.startedAt!).getTime() + 3 * 60 * 60 * 1000).toISOString();
  }
  const preventive: NcAction = {
    id: crypto.randomUUID(),
    type: "preventiva",
    description: "Inspeção adicional e lubrificação programada",
    owner: { id: "mant-02", nome: "Supervisor Carla" },
    startedAt: new Date(new Date(createdAt).getTime() + 4 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    effective: Math.random() > 0.3,
  };
  return [corrective, preventive];
}

async function main() {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : applicationDefault();

  initializeApp({ credential });
  const firestore = getFirestore();

  const batchSize = 10;
  const operations = Array.from({ length: batchSize }).map(async (_, index) => {
    const severity = randomOf(severityPool);
    const asset = randomOf(assets);
    const createdAt = randomDateWithin(90);
    const status = randomOf(statusPool);
    const actions = buildCorrectiveAction(createdAt.toISOString(), status);
    const dueDays = severity === "alta" ? 2 : severity === "media" ? 5 : 10;
    const dueAt = new Date(createdAt.getTime() + dueDays * 24 * 60 * 60 * 1000);

    await firestore.collection("nonConformities").add({
      title: randomOf(titles),
      description: "Gerado via seed de desenvolvimento",
      severity,
      safetyRisk: severity === "alta" ? Math.random() > 0.4 : Math.random() > 0.8,
      impactAvailability: Math.random() > 0.5,
      status,
      dueAt: dueAt.toISOString(),
      createdAt: createdAt.toISOString(),
      createdAtTs: Timestamp.fromDate(createdAt),
      createdBy: { id: "seed-user", matricula: "0000", nome: "Usuário Seed" },
      linkedAsset: asset,
      linkedTemplateId: "template-seed",
      source: Math.random() > 0.5 ? "checklist_extra" : "checklist_question",
      originChecklistResponseId: `seed-response-${index}`,
      originQuestionId: Math.random() > 0.5 ? `q-${index}` : null,
      rootCause: Math.random() > 0.5 ? "Fadiga de componente" : null,
      actions,
      recurrenceOfId: Math.random() > 0.8 ? `seed-prev-${index}` : null,
      telemetryRef: createTelemetry(),
      yearMonth: createdAt.toISOString().slice(0, 7),
      severityRank: severityRank[severity],
      normalizedTitle: randomOf(titles).toLowerCase(),
    });
  });

  await Promise.all(operations);
  console.log(`Seed concluído: ${batchSize} NCs inseridas.`);
}

main().catch((error) => {
  console.error("Seed falhou", error);
  process.exit(1);
});
