const cards = [
  {
    title: "MÃ¡quinas",
    desc: "Cadastre, edite, gere QR Codes e gerencie vÃ­nculos de equipamentos.",
    href: "/admin/machines",
    cta: "Gerenciar MÃ¡quinas",
    icon: "ð",
    color: "primary",
  },
  {
    title: "Templates",
    desc: "Crie e edite perguntas personalizadas para operador ou mecÃ¢nico.",
    href: "/admin/templates",
    cta: "Criar Templates",
    icon: "ð",
    color: "info",
  },
  {
    title: "Checklists",
    desc: "Visualize checklists enviados, fotos e registros de inconformidades.",
    href: "/admin/responses",
    cta: "Ver HistÃ³rico",
    icon: "â",
    color: "success",
  },
  {
    title: "NÃ£o Conformidades",
    desc: "Monitore e gerencie todas as nÃ£o conformidades identificadas.",
    href: "/admin/non-conformities",
    cta: "Ver NCs",
    icon: "â ï¸",
    color: "warning",
  },
  {
    title: "Analytics & KPIs",
    desc: "Acompanhe mÃ©tricas de performance e indicadores de qualidade.",
    href: "/admin/analytics",
    cta: "Ver RelatÃ³rios",
    icon: "ð",
    color: "info",
  },
  {
    title: "UsuÃ¡rios",
    desc: "Cadastre matrÃ­culas autorizadas (operador, mecÃ¢nico, admin).",
    href: "/admin/users",
    cta: "Gerenciar UsuÃ¡rios",
    icon: "ð¥",
    color: "primary",
    disabled: true,
  },
] as const;

const colorClasses = {
  primary: "border-primary/20 bg-primary-light hover:bg-primary-light/80 hover:border-primary/30",
  success: "border-success/20 bg-success-light hover:bg-success-light/80 hover:border-success/30",
  warning: "border-warning/20 bg-warning-light hover:bg-warning-light/80 hover:border-warning/30",
  info: "border-info/20 bg-info-light hover:bg-info-light/80 hover:border-info/30",
};

export default function AdminHomePage() {
  return (
    <div className="space-y-8">
      {/* Header da pÃ¡gina */}
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-medium flex items-center justify-center text-white font-bold text-sm">
            GF
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Painel de Controle
            </h1>
            <p className="text-foreground-secondary">
              Bem-vindo ao sistema de gestÃ£o de frota. Selecione um mÃ³dulo para comeÃ§ar.
            </p>
          </div>
        </div>
      </header>

      {/* Cards de navegaÃ§Ã£o */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <a
            key={card.href}
            href={card.disabled ? "#" : card.href}
            className={`
              group relative rounded-large border p-6 transition-all duration-medium
              ${card.disabled 
                ? "opacity-50 cursor-not-allowed border-border bg-surface" 
                : `${colorClasses[card.color]} hover:shadow-card-hover hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary/20`
              }
            `}
            aria-disabled={card.disabled}
          >
            {/* Ãcone e tÃ­tulo */}
            <div className="flex items-start gap-4 mb-4">
              <div className="text-2xl flex-shrink-0">
                {card.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {card.title}
                  {card.disabled && (
                    <span className="ml-2 text-xs bg-gray-200 text-foreground-tertiary px-2 py-0.5 rounded-small font-medium">
                      Em breve
                    </span>
                  )}
                </h3>
                <p className="text-sm text-foreground-secondary leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </div>

            {/* Call to action */}
            {!card.disabled && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary group-hover:text-primary-hover transition-colors">
                  {card.cta}
                </span>
                <svg 
                  className="w-4 h-4 text-primary group-hover:text-primary-hover group-hover:translate-x-1 transition-all" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}

            {/* Indicador visual para cards interativos */}
            {!card.disabled && (
              <div className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            )}
          </a>
        ))}
      </section>

      {/* SeÃ§Ã£o de status do sistema */}
      <section className="mt-12 p-6 bg-background-secondary rounded-large border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Status do Sistema
            </h3>
            <p className="text-sm text-foreground-secondary">
              Todos os serviÃ§os estÃ£o funcionando normalmente
            </p>
          </div>
          <div className="flex items-center gap-2 text-success">
            <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Online</span>
          </div>
        </div>
      </section>
    </div>
  );
}
