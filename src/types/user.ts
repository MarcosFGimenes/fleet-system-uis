export type UserRole = "operador" | "motorista" | "mecanico" | "admin";

export interface User {
  id: string;
  matricula: string;
  nome: string;
  role: UserRole;
  setor?: string;
}
