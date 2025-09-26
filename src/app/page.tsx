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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Topbar simples */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-blue-600 grid place-items-center font-bold">GF</div>
            <span className="text-sm text-gray-300">Gestão de Frota</span>
          </div>
          <nav className="hidden sm:flex items-center gap-4 text-sm">
            <Link className="text-gray-300 hover:text-white" href="/">Início</Link>
            <Link className="text-gray-300 hover:text-white" href="/admin">Admin</Link>
            <Link className="text-gray-300 hover:text-white" href="/admin/analytics">Indicadores</Link>
            <Link className="text-gray-300 hover:text-white" href="/machines">Máquinas</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Checklists de Operação e Gestão de Inconformidades
            </h1>
            <p className="mt-3 text-gray-400">
              Centralize o controle diário da frota: cadastre máquinas, gere QR Codes,
              colete checklists em campo e acompanhe inconformidades em tempo real.
            </p>

            {/* Acesso rápido: TAG */}
            <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-sm text-gray-300 font-medium">Realizar checklist via TAG/QR</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Digite a TAG/UUID da máquina"
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  onClick={goToChecklist}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
                >
                  Abrir
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Dica: a TAG está impressa no QR Code do equipamento.
              </div>
            </div>

            {/* Atalhos */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/machines"
                className="rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 px-4 py-2 text-sm"
              >
                Listar máquinas
              </Link>
              <Link
                href="/admin"
                className="rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 px-4 py-2 text-sm"
              >
                Painel administrativo
              </Link>
              <Link
                href="/admin/analytics"
                className="rounded-xl border border-gray-800 bg-gray-900 hover:bg-gray-850 px-4 py-2 text-sm"
              >
                Indicadores
              </Link>
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
      <section className="max-w-7xl mx-auto px-4 md:px-6 pb-10">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold">Como funciona</h2>
          <ol className="mt-3 grid sm:grid-cols-3 gap-4 text-sm text-gray-300">
            <li className="rounded-xl bg-gray-950 border border-gray-800 p-4">
              <p className="font-medium">1) Cadastre máquinas</p>
              <p className="mt-1 text-gray-400">No Admin, crie a máquina e gere o QR Code.</p>
            </li>
            <li className="rounded-xl bg-gray-950 border border-gray-800 p-4">
              <p className="font-medium">2) Vincule templates</p>
              <p className="mt-1 text-gray-400">Escolha os checklists de operador/mecânico.</p>
            </li>
            <li className="rounded-xl bg-gray-950 border border-gray-800 p-4">
              <p className="font-medium">3) Coleta em campo</p>
              <p className="mt-1 text-gray-400">Operador escaneia o QR, responde e envia.</p>
            </li>
          </ol>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-gray-500 border-t border-gray-800">
        Cooperativa • Gestão de Frota
      </footer>
    </div>
  );
}

function HomeCard({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-800 bg-gray-900 hover:bg-gray-850/50 p-5 transition block"
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-400 mt-1">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm text-blue-300 group-hover:underline">
        {cta} →
      </div>
    </Link>
  );
}



