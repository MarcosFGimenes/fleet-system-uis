# Roadmap de Evolução do Módulo de Não Conformidades

Este documento resume o roteiro em etapas para evoluir o módulo de Não Conformidades em um sistema completo de manutenção.

## Etapa 0 — Base & Correções imediatas

- **Objetivo:** estabilizar a página e a API, remover erros 500 e instrumentar logs.
- **Backend:**
  - Padronizar as rotas `GET /api/kpi/nc` e `/api/nc` em relação a status e payload.
  - Adicionar tratamento de erros com `try/catch`, `console.error` estruturado e respostas `{ error, detailsId }`.
- **Frontend:**
  - Adicionar estados de carregamento (skeleton), empty-state e error-state com ação de tentar novamente.
  - Implementar um error boundary dedicado à página de Não Conformidades.
- **Testes / Definição de pronto:**
  - `GET /api/kpi/nc` retorna status 200 com formato definido.
  - A tela apresenta skeleton, mensagens de erro claras e opção de "Tentar novamente".

## Etapa 1 — Modelo de dados & Migração mínima

- **Objetivo:** preparar os campos que permitem priorização e rastreio.
- **Dados (Firestore):**
  - Acrescentar aos documentos `nonConformities`: `criticality ("low"|"med"|"high")`, `category`, `rootCause?`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Script de migração:**
  - Função Cloud (one-shot) ou script local para preencher `createdAt`/`updatedAt` nos documentos existentes.
- **Índices:**
  - `status+criticality`, `machineId+status`, `createdAt desc`.
- **Frontend:**
  - Formulário de criação/edição incluindo `criticality` e `category`.
  - Chips/badges na lista indicando criticidade (ex.: High = vermelho).
- **Testes / Definição de pronto:**
  - Criação/edição de NC persiste os novos campos.
  - Lista ordenada por `createdAt` e filtragem por `criticality`.

## Próximas etapas

As etapas seguintes (2 a 10) tratam de filtros avançados, ordens de serviço, SLAs, evidências, custos, KPIs, auditoria, offline/PWA e exportações. Consulte o roteiro completo para orientar a priorização futura.
