import AdminSidebar from "@/components/AdminSidebar";
import type { ReactNode } from "react";

export const metadata = {
  title: "Admin • Gestão de Frota",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <AdminSidebar />
      <main className="md:ml-72">
        <div className="hidden md:flex items-center justify-between px-6 h-14 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
          <div className="text-sm text-gray-300">Painel Admin</div>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
