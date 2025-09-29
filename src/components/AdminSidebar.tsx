"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  badge?: string;
  disabled?: boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/analytics", label: "KPIs", badge: "Performance" },
  { href: "/admin/machines", label: "Maquinas", badge: "Cadastros" },
  { href: "/admin/templates", label: "Templates", badge: "Modelos" },
  { href: "/admin/responses", label: "Checklists", badge: "Historico" },
  { href: "/admin/non-conformities", label: "Nao conformidades", badge: "NCs" },
  { href: "/admin/users", label: "Usuarios", badge: "Em breve", disabled: true },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const renderItem = (item: NavItem) => {
    const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
    const baseClass = "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
    const stateClass = active
      ? "bg-blue-50 text-blue-600"
      : "text-gray-600 hover:bg-gray-50 hover:text-blue-600";

    return (
      <li key={item.href}>
        <Link
          href={item.disabled ? pathname ?? "/admin" : item.href}
          aria-disabled={item.disabled}
          onClick={() => setOpen(false)}
          className={[baseClass, stateClass, item.disabled ? "pointer-events-none opacity-50" : ""].join(" ")}
        >
          <span className="font-medium">{item.label}</span>
          {item.badge && (
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {item.badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 shadow-sm md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm"
        >
          {open ? "Fechar menu" : "Abrir menu"}
        </button>
        <div className="text-sm font-semibold text-gray-600">Admin</div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-xl">
            <Brand />
            <nav className="mt-6">
              <ul className="space-y-1">
                {NAV.map((item) => renderItem(item))}
              </ul>
            </nav>
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 hidden w-72 overflow-y-auto border-r border-gray-200 bg-white px-4 py-6 md:flex md:flex-col">
        <Brand />
        <nav className="mt-6">
          <ul className="space-y-1 text-sm text-gray-600">
            {NAV.map((item) => renderItem(item))}
          </ul>
        </nav>
        <footer className="mt-auto pt-8 text-xs text-gray-400">Gestao de Frota - Admin</footer>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm">
        GF
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">Gestao de Frota</p>
        <p className="text-xs text-gray-500">Centro de manutencao</p>
      </div>
    </div>
  );
}
