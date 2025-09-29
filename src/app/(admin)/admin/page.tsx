const CARDS = [
  {
    title: "Máquinas",
    description: "Cadastre, edite, gere QR Codes e gerencie vínculos de equipamentos.",
    href: "/admin/machines",
    cta: "Gerenciar máquinas",
    tone: "primary",
    emoji: "🚜",
  },
  {
    title: "Templates",
    description: "Crie e edite perguntas personalizadas para operador ou mecânico.",
    href: "/admin/templates",
    cta: "Criar templates",
    tone: "info",
    emoji: "📝",
  },
  {
    title: "Checklists",
    description: "Visualize respostas, fotos e registros de inconformidades.",
    href: "/admin/responses",
    cta: "Ver histórico",
    tone: "success",
    emoji: "✅",
  },
  {
    title: "Não conformidades",
    description: "Monitore e trate todas as não conformidades identificadas.",
    href: "/admin/non-conformities",
    cta: "Acompanhar NCs",
    tone: "warning",
    emoji: "⚠️",
  },
  {
    title: "Analytics & KPIs",
    description: "Acompanhe métricas de performance e indicadores de qualidade.",
    href: "/admin/analytics",
    cta: "Ver relatórios",
    tone: "info",
    emoji: "📊",
  },
  {
    title: "Usuários",
    description: "Cadastre matrículas autorizadas (operador, mecânico, admin).",
    href: "/admin/users",
    cta: "Gerenciar usuários",
    tone: "neutral",
    emoji: "👥",
    disabled: true,
  },
] as const;

const toneStyles: Record<string, string> = {
  primary: "border-[var(--primary)]/25 bg-[var(--primary-50)] text-[var(--primary)]",
  success: "border-[var(--success)]/25 bg-[var(--success)]/10 text-[var(--success)]",
  warning: "border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]",
  info: "border-sky-500/25 bg-sky-50 text-sky-700",
  neutral: "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
};

export default function AdminHomePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[var(--primary)] text-base font-semibold text-white shadow-sm-soft">
            GF
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Painel de controle</h1>
            <p className="text-[var(--muted)]">
              Bem-vindo ao sistema de gestão de frota. Escolha um módulo para iniciar o trabalho.
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => {
          const tone = toneStyles[card.tone] ?? toneStyles.neutral;
          return (
            <a
              key={card.href}
              href={card.disabled ? "#" : card.href}
              aria-disabled={card.disabled}
              className={`group relative block rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-md-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                card.disabled
                  ? "cursor-not-allowed opacity-60 border-[var(--border)] bg-[var(--surface)]"
                  : tone
              }`}
            >
              <div className="flex items-start gap-4">
                <span aria-hidden="true" className="text-2xl">
                  {card.emoji}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    {card.title}
                    {card.disabled && (
                      <span className="ml-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--hint)]">
                        Em breve
                      </span>
                    )}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">{card.description}</p>
                </div>
              </div>
              {!card.disabled && (
                <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
                  {card.cta}
                  <span aria-hidden="true" className="transition group-hover:translate-x-1">
                    →
                  </span>
                </div>
              )}
            </a>
          );
        })}
      </section>

      <section className="light-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Status do sistema</h2>
            <p className="text-sm text-[var(--muted)]">
              Todos os serviços estão funcionando normalmente.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-medium text-[var(--success)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" aria-hidden="true" />
            Sistema online
          </div>
        </div>
      </section>
    </div>
  );
}
