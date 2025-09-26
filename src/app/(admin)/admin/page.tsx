const cards = [
  {
    title: "Máquinas",
    desc: "Cadastre, edite, gere QR Codes e gerencie vínculos.",
    href: "/machines",
    cta: "Abrir Máquinas",
  },
  {
    title: "Templates",
    desc: "Crie e edite perguntas para operador ou mecânico.",
    href: "/templates",
    cta: "Gerenciar Templates",
  },
  {
    title: "Checklists",
    desc: "Veja checklists enviados, fotos e inconformidades.",
    href: "/responses",
    cta: "Ver Checklists",
  },
  {
    title: "Usuários",
    desc: "Cadastre matrículas autorizadas (operador, mecânico, admin).",
    href: "/users",
    cta: "Gerenciar Usuários",
  },
] as const;

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Bem-vindo(a) ao Painel</h1>
        <p className="text-sm text-gray-400">Selecione um módulo para começar.</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-gray-800 bg-gray-900 hover:bg-gray-900/70 p-5 transition"
          >
            <h3 className="text-lg font-semibold">{card.title}</h3>
            <p className="text-sm text-gray-400 mt-1">{card.desc}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-blue-300 group-hover:underline">
              {card.cta} →
            </div>
          </a>
        ))}
      </section>
    </div>
  );
}
