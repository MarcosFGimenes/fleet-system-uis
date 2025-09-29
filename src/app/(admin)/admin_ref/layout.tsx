import AdminSidebar from "@/components/AdminSidebar";
import type { ReactNode } from "react";

export const metadata = {
  title: "Painel Administrativo - Gestão de Frota",
  description: "Painel de controle para gestão completa da frota e manutenção",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminSidebar />
      <main className="md:ml-72">
        {/* Header do painel administrativo */}
        <header className="sticky top-0 z-sticky hidden h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-6 shadow-small md:flex">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-foreground">
              Painel Administrativo
            </div>
            <div className="h-4 w-px bg-border"></div>
            <div className="text-xs text-foreground-tertiary">
              Sistema de Gestão de Frota
            </div>
          </div>
          
          {/* Indicador de status do sistema */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-success">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
              <span className="font-medium">Sistema Online</span>
            </div>
          </div>
        </header>
        
        {/* Conteúdo principal */}
        <div className="px-4 py-6 md:px-8 lg:px-12">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
