import type { Timestamp } from "firebase/firestore";

export interface ChecklistQuestion {
  id: string;
  text: string;
  requiresPhoto: boolean;
}

export interface ChecklistTemplate {
  id: string;
  type: "operador" | "mecanico";
  title: string;
  version: number;
  isActive: boolean;
  questions: ChecklistQuestion[];
}

export interface ChecklistAnswer {
  questionId: string;
  response: "ok" | "nc" | "na";
  photoUrl?: string;
}

export interface ChecklistResponse {
  id: string;
  machineId: string;
  userId: string;
  templateId: string;
  createdAt: string;
  createdAtTs?: Timestamp;
  operatorMatricula?: string;
  operatorNome?: string | null;
  km?: number;
  horimetro?: number;
  answers: ChecklistAnswer[];
}
