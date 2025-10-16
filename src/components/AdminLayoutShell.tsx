"use client";

import AdminSidebar from "@/components/AdminSidebar";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const ADMIN_LOGIN_PATH = "/admin/login";

interface AdminLayoutShellProps {
  children: ReactNode;
}

type AuthStatus = "checking" | "authenticated" | "redirecting";

export default function AdminLayoutShell({ children }: AdminLayoutShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setStatus("authenticated");
      } else {
        setStatus("redirecting");
        const redirect = encodeURIComponent(pathname ?? "/admin");
        router.replace(`${ADMIN_LOGIN_PATH}?redirect=${redirect}`);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao encerrar sessão", error);
      setSigningOut(false);
    }
  };

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--muted)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="text-sm font-medium">Carregando painel...</p>
        </div>
      </div>
    );
  }

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[var(--success)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" aria-hidden="true" />
              <span className="text-xs font-medium text-[var(--muted)]">Sistema online</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] shadow-sm-soft transition hover:bg-[var(--primary-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Saindo..." : "Encerrar sessão"}
            </button>
          </div>
        </header>
        <div className="px-4 py-6 md:px-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
