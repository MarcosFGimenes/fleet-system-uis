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
  { href: "/admin", label: "Início" },
  { href: "/admin/analytics", label: "KPIs", badge: "Performance" },
  { href: "/admin/machines", label: "Máquinas", badge: "Cadastros" },
  { href: "/admin/templates", label: "Templates", badge: "Modelos" },
  { href: "/admin/responses", label: "Checklists", badge: "Histórico" },
  { href: "/admin/non-conformities", label: "Não conformidades", badge: "NCs" },
  { href: "/admin/users", label: "Usuários" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const renderItem = (item: NavItem) => {
    const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
    const classes = [
      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all" ,
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
      active
        ? "bg-[var(--primary-50)] text-[var(--primary)] border-[var(--primary)]/40 shadow-sm-soft"
        : "text-[var(--muted)] border-transparent hover:bg-[var(--primary-50)] hover:text-[var(--primary)]",
      item.disabled ? "pointer-events-none opacity-50" : ""
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <li key={item.href}>
        <Link
          href={item.disabled ? pathname ?? "/admin" : item.href}
          aria-disabled={item.disabled}
          onClick={() => setOpen(false)}
          className={classes}
        >
          <span className="font-medium">{item.label}</span>
          {item.badge && (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--hint)]">
              {item.badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="sticky top-0 z-[1200] flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--muted)] shadow-sm-soft transition hover:bg-[var(--primary-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          {open ? "Fechar menu" : "Abrir menu"}
        </button>
        <div className="text-sm font-semibold text-[var(--muted)]">Admin</div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[1300] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] p-5 shadow-md-soft">
            <Brand />
            <nav className="mt-6">
              <ul className="space-y-1 text-sm">
                {NAV.map(renderItem)}
              </ul>
            </nav>
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 hidden w-72 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] px-4 py-6 shadow-sm-soft md:flex md:flex-col">
        <Brand />
        <nav className="mt-6">
          <ul className="space-y-1 text-sm">
            {NAV.map(renderItem)}
          </ul>
        </nav>
        <footer className="mt-auto border-t border-[var(--border)] pt-4 text-xs text-[var(--hint)]">
          Gestão de Frota - Admin
        </footer>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-[var(--primary-50)]">
      <div className="grid size-9 place-items-center rounded-lg bg-[var(--primary)] text-base font-semibold text-white shadow-sm-soft">
        GF
      </div>
      <div>
        <p className="text-sm font-semibold">Gestão de Frota</p>
        <p className="text-xs text-[var(--muted)]">Centro de manutenção</p>
      </div>
    </div>
  );
}
