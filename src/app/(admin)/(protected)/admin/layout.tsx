import AdminLayoutShell from "@/components/AdminLayoutShell";
import type { ReactNode } from "react";

export const metadata = {
  title: "Painel Administrativo - Gestão de Frota",
  description: "Painel de controle para gestão completa da frota e manutenção",
};

export default function AdminProtectedLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
