import AdminSidebar from "@/components/AdminSidebar";
import type { ReactNode } from "react";

export const metadata = {
  title: "Admin - Gestao de Frota",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AdminSidebar />
      <main className="md:ml-72">
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-6 backdrop-blur md:flex">
          <div className="text-sm font-medium text-gray-600">Painel administrativo</div>
        </header>
        <div className="px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
