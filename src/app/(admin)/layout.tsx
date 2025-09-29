import AdminSidebar from "@/components/AdminSidebar";
import type { ReactNode } from "react";

export const metadata = {
  title: "Painel Administrativo - Gestão de Frota",
  description: "Painel de controle para gestão completa da frota e manutenção",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] md:flex">
      <AdminSidebar />
      <main className="flex-1 md:ml-72">
        <header className="sticky top-0 z-[1100] hidden h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 backdrop-blur md:flex">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">Painel Administrativo</p>
            <span className="h-4 w-px bg-[var(--border)]" aria-hidden="true" />
            <span className="text-xs text-[var(--hint)]">Sistema de Gestão de Frota</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--success)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" aria-hidden="true" />
            <span className="text-xs font-medium text-[var(--muted)]">Sistema online</span>
          </div>
        </header>
        <div className="px-4 py-6 md:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
