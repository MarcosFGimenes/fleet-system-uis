export type UserRole = "operador" | "mecanico" | "admin";

export interface User {
  id: string;
  matricula: string;
  nome: string;
  role: UserRole;
  setor?: string;
}
