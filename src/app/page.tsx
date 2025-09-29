"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [tag, setTag] = useState("");

  const goToChecklist = () => {
    const t = tag.trim();
    if (!t) return;
    router.push(`/(checklist)/${encodeURIComponent(t)}`);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Topbar claro */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-[var(--primary)] grid place-items-center font-bold text-white shadow-sm-soft">GF</div>
            <span className="text-sm text-[var(--muted)]">Gestão de Frota</span>
          </div>
          <nav className="hidden sm:flex items-center gap-4 text-sm">
            <HeaderLink href="/">Início</HeaderLink>
            <HeaderLink href="/admin">Admin</HeaderLink>
            <HeaderLink href="/admin/analytics">Indicadores</HeaderLink>
            <HeaderLink href="/machines">Máquinas</HeaderLink>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 py-10 md:py-14">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight">
              Checklists de Operação e Gestão de Inconformidades
            </h1>
            <p className="mt-3 text-[var(--muted)]">
              Centralize o controle diário da frota: cadastre máquinas, gere QR Codes,
              colete checklists em campo e acompanhe inconformidades em tempo real.
            </p>

            {/* Acesso rápido: TAG */}
            <div className="mt-6 rounded-2xl light-card p-4">
              <p className="text-sm font-medium">Realizar checklist via TAG/QR</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Digite a TAG/UUID da máquina"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  aria-label="TAG ou UUID da máquina"
                />
                <button
                  onClick={goToChecklist}
                  className="px-4 py-2 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-700)] text-white text-sm font-semibold shadow-sm-soft transition"
                >
                  Abrir
                </button>
              </div>
              <div className="mt-2 text-xs text-[var(--hint)]">
                Dica: a TAG está impressa no QR Code do equipamento.
              </div>
            </div>

            {/* Atalhos */}
            <div className="mt-6 flex flex-wrap gap-3">
              <PillLink href="/machines">Listar máquinas</PillLink>
              <PillLink href="/admin">Painel administrativo</PillLink>
              <PillLink href="/admin/analytics">Indicadores</PillLink>
            </div>
          </div>

          {/* Cards de resumo / atalhos */}
          <div className="grid sm:grid-cols-2 gap-4">
            <HomeCard
              title="Máquinas"
              desc="Cadastrar, editar e gerar QR Codes."
              href="/admin/dashboard"
              cta="Abrir módulo"
            />
            <HomeCard
              title="Templates"
              desc="Criar perguntas para operador/mecânico."
              href="/admin/templates"
              cta="Gerenciar"
            />
            <HomeCard
              title="Checklists"
              desc="Ver respostas, fotos e NCs."
              href="/admin/responses"
              cta="Visualizar"
            />
            <HomeCard
              title="Indicadores"
              desc="Conformidades, NCs e tempo de reparo."
              href="/admin/analytics"
              cta="Abrir"
            />
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 pb-10">
        <div className="rounded-2xl light-card p-5">
          <h2 className="text-lg font-semibold">Como funciona</h2>
          <ol className="mt-3 grid sm:grid-cols-3 gap-4 text-sm text-[var(--muted)]">
            <li className="rounded-xl light-surface p-4">
              <p className="font-medium text-[var(--text)]">1) Cadastre máquinas</p>
              <p className="mt-1">No Admin, crie a máquina e gere o QR Code.</p>
            </li>
            <li className="rounded-xl light-surface p-4">
              <p className="font-medium text-[var(--text)]">2) Vincule templates</p>
              <p className="mt-1">Escolha os checklists de operador/mecânico.</p>
            </li>
            <li className="rounded-xl light-surface p-4">
              <p className="font-medium text-[var(--text)]">3) Coleta em campo</p>
              <p className="mt-1">Operador escaneia o QR, responde e envia.</p>
            </li>
          </ol>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-[var(--hint)] border-t border-[var(--border)]">
        Cooperativa • Gestão de Frota
      </footer>
    </div>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="text-[var(--muted)] hover:text-[var(--primary)] hover:underline underline-offset-4 transition"
      href={href}
    >
      {children}
    </Link>
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--primary-50)] px-4 py-2 text-sm text-[var(--text)] shadow-sm-soft transition"
    >
      {children}
    </Link>
  );
}

function HomeCard({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl light-card p-5 transition block hover:shadow-md-soft"
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-[var(--muted)] mt-1">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--primary)] group-hover:underline">
        {cta} →
      </div>
    </Link>
  );
}
