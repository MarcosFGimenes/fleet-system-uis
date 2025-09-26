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
  { href: "/machines", label: "Máquinas" },
  { href: "/templates", label: "Templates" },
  { href: "/responses", label: "Checklists" },
  { href: "/users", label: "Usuários", badge: "em breve" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const Item = ({ href, label, badge, disabled }: NavItem) => {
    const active =
      pathname === href ||
      (href !== "/admin" && pathname?.startsWith(href));

    return (
      <li>
        <Link
          aria-disabled={disabled}
          href={disabled ? pathname ?? "/admin" : href}
          onClick={() => setOpen(false)}
          className={[
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition",
            active
              ? "bg-gray-800 text-white"
              : "text-gray-300 hover:bg-gray-800 hover:text-white",
            disabled ? "opacity-50 pointer-events-none" : "",
          ].join(" ")}
        >
          <span>{label}</span>
          {badge && (
            <span className="text-[10px] uppercase bg-gray-700 px-2 py-0.5 rounded-md tracking-wide">
              {badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 bg-gray-900/80 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-sm"
          >
            {open ? "Fechar Menu" : "Abrir Menu"}
          </button>
          <div className="text-sm text-gray-300">Painel Admin</div>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-gray-900 border-r border-gray-800 p-4">
            <Brand />
            <nav className="mt-4">
              <ul className="space-y-1">
                {NAV.map((item) => (
                  <Item key={item.href} {...item} />
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      )}

      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-72 bg-gray-900 border-r border-gray-800 p-4">
        <Brand />
        <nav className="mt-4">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <Item key={item.href} {...item} />
            ))}
          </ul>
        </nav>
        <footer className="mt-auto pt-4 text-[11px] text-gray-500">
          Cooperativa • Gestão de Frota
        </footer>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="size-8 rounded-lg bg-blue-600 grid place-items-center font-bold">GF</div>
      <div>
        <p className="text-sm font-semibold text-white">Gestão de Frota</p>
        <p className="text-xs text-gray-400">Admin</p>
      </div>
    </div>
  );
}


