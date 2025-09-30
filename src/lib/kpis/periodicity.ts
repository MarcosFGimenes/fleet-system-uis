import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  ChecklistTemplate,
  ChecklistTemplatePeriodicity,
} from "@/types/checklist";
import type { Machine } from "@/types/machine";

export type PeriodicityComplianceStatus = "compliant" | "non_compliant";

export type PeriodicityComplianceItem = {
  templateId: string;
  templateName: string;
  machineId: string;
  machineName?: string;
  lastSubmissionAt?: string;
  windowDays: number;
  unit: ChecklistTemplatePeriodicity["unit"];
  quantity: number;
  anchor: ChecklistTemplatePeriodicity["anchor"];
  status: PeriodicityComplianceStatus;
};

export type PeriodicityComplianceSummary = {
  totalTracked: number;
  compliant: number;
  nonCompliant: number;
};

export type PeriodicityComplianceResult = {
  generatedAt: string;
  summary: PeriodicityComplianceSummary;
  items: PeriodicityComplianceItem[];
};

export type PeriodicityComplianceFilters = {
  from?: Date;
  to?: Date;
  machineId?: string;
  templateId?: string;
};

type TemplateRecord = Pick<ChecklistTemplate, "id" | "title"> & {
  periodicity: ChecklistTemplatePeriodicity;
};

type MachineRecord = Pick<Machine, "id" | "modelo" | "tag" | "setor" | "checklists">;

function resolveMachineName(machine: MachineRecord): string {
  if (machine.modelo && machine.modelo.trim()) return machine.modelo;
  if (machine.tag && machine.tag.trim()) return machine.tag;
  return machine.id;
}

function sanitizeDate(value: unknown): string | undefined {
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return undefined;
}

async function fetchTemplates(db: Firestore, filters: PeriodicityComplianceFilters): Promise<TemplateRecord[]> {
  if (filters.templateId) {
    const doc = await db.collection("checklistTemplates").doc(filters.templateId).get();
    if (!doc.exists) {
      return [];
    }
    const data = doc.data() as ChecklistTemplate | undefined;
    if (!data?.periodicity || !data.periodicity.active) {
      return [];
    }
    return [
      {
        id: doc.id,
        title: data.title,
        periodicity: data.periodicity,
      },
    ];
  }

  const snapshot = await db
    .collection("checklistTemplates")
    .where("periodicity.active", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as ChecklistTemplate | undefined;
      if (!data?.periodicity) return null;
      return {
        id: doc.id,
        title: data.title,
        periodicity: data.periodicity,
      } satisfies TemplateRecord;
    })
    .filter((value): value is TemplateRecord => Boolean(value));
}

async function fetchMachines(db: Firestore, filters: PeriodicityComplianceFilters): Promise<MachineRecord[]> {
  if (filters.machineId) {
    const doc = await db.collection("machines").doc(filters.machineId).get();
    if (!doc.exists) {
      return [];
    }
    const data = doc.data() as Machine | undefined;
    return [
      {
        id: doc.id,
        modelo: data?.modelo,
        tag: data?.tag ?? data?.placa ?? doc.id,
        setor: data?.setor,
        checklists: Array.isArray(data?.checklists) ? data?.checklists : [],
      },
    ];
  }

  const snapshot = await db.collection("machines").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Machine | undefined;
    return {
      id: doc.id,
      modelo: data?.modelo,
      tag: data?.tag ?? data?.placa ?? doc.id,
      setor: data?.setor,
      checklists: Array.isArray(data?.checklists) ? data?.checklists : [],
    } satisfies MachineRecord;
  });
}

async function fetchLastSubmission(
  db: Firestore,
  templateId: string,
  machineId: string,
  until?: Date,
): Promise<string | undefined> {
  let query = db
    .collection("checklistResponses")
    .where("templateId", "==", templateId)
    .where("machineId", "==", machineId);

  if (until) {
    query = query.where("createdAt", "<=", until.toISOString());
  }

  const snapshot = await query.orderBy("createdAt", "desc").limit(1).get();
  if (snapshot.empty) {
    return undefined;
  }
  const data = snapshot.docs[0].data();
  return sanitizeDate(data.createdAt ?? data.createdAtTs);
}

export async function loadPeriodicityCompliance(options: {
  filters?: PeriodicityComplianceFilters;
  now?: Date;
  db?: Firestore;
} = {}): Promise<PeriodicityComplianceResult> {
  const db = options.db ?? getAdminDb();
  const filters = options.filters ?? {};
  const now = options.now ?? new Date();
  const referenceTime = filters.to ?? now;

  const [templates, machines] = await Promise.all([
    fetchTemplates(db, filters),
    fetchMachines(db, filters),
  ]);

  const combos: Array<{ template: TemplateRecord; machine: MachineRecord }> = [];

  for (const machine of machines) {
    const checklists = new Set(machine.checklists ?? []);
    for (const template of templates) {
      const explicitlyRequested = filters.templateId === template.id && filters.machineId === machine.id;
      if (checklists.has(template.id) || explicitlyRequested) {
        combos.push({ template, machine });
      }
    }
  }

  const chunkSize = 10;
  const items: PeriodicityComplianceItem[] = [];

  for (let index = 0; index < combos.length; index += chunkSize) {
    const chunk = combos.slice(index, index + chunkSize);
    const results = await Promise.all(
      chunk.map(async ({ template, machine }) => {
        const lastSubmissionAt = await fetchLastSubmission(db, template.id, machine.id, referenceTime);
        const lastDate = lastSubmissionAt ? new Date(lastSubmissionAt) : null;
        const windowMs = template.periodicity.windowDays * 24 * 60 * 60 * 1000;
        const status: PeriodicityComplianceStatus =
          lastDate && !Number.isNaN(lastDate.getTime()) && referenceTime.getTime() - lastDate.getTime() <= windowMs
            ? "compliant"
            : "non_compliant";

        return {
          templateId: template.id,
          templateName: template.title,
          machineId: machine.id,
          machineName: resolveMachineName(machine),
          lastSubmissionAt: lastSubmissionAt,
          windowDays: template.periodicity.windowDays,
          unit: template.periodicity.unit,
          quantity: template.periodicity.quantity,
          anchor: template.periodicity.anchor,
          status,
        } satisfies PeriodicityComplianceItem;
      }),
    );
    items.push(...results);
  }

  const summary: PeriodicityComplianceSummary = {
    totalTracked: items.length,
    compliant: items.filter((item) => item.status === "compliant").length,
    nonCompliant: items.filter((item) => item.status === "non_compliant").length,
  };

  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "non_compliant" ? -1 : 1;
    }
    const nameCompare = a.templateName.localeCompare(b.templateName);
    if (nameCompare !== 0) return nameCompare;
    return a.machineName?.localeCompare(b.machineName ?? "") ?? 0;
  });

  return {
    generatedAt: now.toISOString(),
    summary,
    items,
  };
}
