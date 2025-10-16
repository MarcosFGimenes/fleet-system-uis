"use client";

import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

const errorMessages: Record<string, string> = {
  "auth/invalid-email": "E-mail inválido. Verifique o endereço informado.",
  "auth/user-disabled": "Este usuário está desativado. Entre em contato com o suporte.",
  "auth/user-not-found": "Usuário não encontrado. Verifique o e-mail informado.",
  "auth/wrong-password": "Senha incorreta. Tente novamente.",
};

const DEFAULT_REDIRECT = "/admin";

function getSafeRedirectPath(redirect?: string, baseOrigin?: string) {
  if (!redirect || typeof redirect !== "string") {
    return DEFAULT_REDIRECT;
  }

  const origin = baseOrigin ?? "http://localhost";

  try {
    const url = new URL(redirect, origin);

    if (baseOrigin && url.origin !== baseOrigin) {
      return DEFAULT_REDIRECT;
    }

    if (!baseOrigin && url.origin !== origin) {
      return DEFAULT_REDIRECT;
    }

    return url.pathname.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_REDIRECT;
  } catch {
    return redirect.startsWith("/") ? redirect : DEFAULT_REDIRECT;
  }
}

interface AdminLoginClientProps {
  redirectTo?: string;
}

export default function AdminLoginClient({ redirectTo }: AdminLoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeRedirect = useMemo(() => {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
    return getSafeRedirectPath(redirectTo, baseOrigin);
  }, [redirectTo]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace(safeRedirect);
      }
    });

    return () => unsubscribe();
  }, [router, safeRedirect]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      setError("Informe e-mail e senha para continuar.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace(safeRedirect);
    } catch (err) {
      const firebaseError = err as { code?: string };
      const message = firebaseError.code ? errorMessages[firebaseError.code] : undefined;
      setError(message ?? "Não foi possível realizar o login. Tente novamente mais tarde.");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-light/20 via-transparent to-info-light/20"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-large border border-border bg-surface p-8 shadow-large">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-large bg-primary text-2xl font-bold text-white shadow-medium">
              GF
            </div>
            <h1 className="text-2xl font-bold text-foreground">Painel Administrativo</h1>
            <p className="mt-2 text-sm text-foreground-secondary">
              Acesse com suas credenciais corporativas cadastradas no Firebase Auth.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground-secondary">
                E-mail corporativo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-medium border border-border bg-surface px-4 py-3 text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="seu.email@empresa.com"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground-secondary">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-medium border border-border bg-surface px-4 py-3 text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Digite sua senha"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-medium bg-primary py-3 text-sm font-semibold text-white shadow-small transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="inline-flex size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          {error && (
            <div className="mt-6 rounded-medium border border-error/30 bg-error-light p-4 text-sm text-error">
              {error}
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-foreground-tertiary">Gestão de Frota © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
