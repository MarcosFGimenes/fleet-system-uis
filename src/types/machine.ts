import type { ChecklistActorKind } from "./checklist";

export type MachineFleetType = "machine" | "vehicle";

export const MACHINE_FLEET_TYPE_LABEL: Record<MachineFleetType, string> = {
  machine: "Frota Máquinas",
  vehicle: "Frota Veículos",
};

export const MACHINE_PRIMARY_ACTOR_LABEL: Record<MachineFleetType, string> = {
  machine: "Operador",
  vehicle: "Motorista",
};

export const MACHINE_PRIMARY_ACTOR_KIND: Record<MachineFleetType, ChecklistActorKind> = {
  machine: "operador",
  vehicle: "motorista",
};

export const resolveMachineFleetType = (
  fleetType?: MachineFleetType | null,
): MachineFleetType => {
  return fleetType === "vehicle" ? "vehicle" : "machine";
};

export const resolveMachineActorKind = (
  machine?: { fleetType?: MachineFleetType | null },
): ChecklistActorKind => {
  return MACHINE_PRIMARY_ACTOR_KIND[resolveMachineFleetType(machine?.fleetType)];
};

export const resolveMachineActorLabel = (
  machine?: { fleetType?: MachineFleetType | null },
): string => {
  return MACHINE_PRIMARY_ACTOR_LABEL[resolveMachineFleetType(machine?.fleetType)];
};

export interface Machine {
  id: string;
  modelo: string;
  placa?: string;
  tag: string;
  setor: string;
  combustivel?: string;
  checklists: string[];
  fleetType?: MachineFleetType | null;
}
