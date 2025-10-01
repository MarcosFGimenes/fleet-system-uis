# Issues sugeridas — Etapas 0 e 1

## Etapa 0 — Base & Correções imediatas

- **Issue:** `fix/nc-stabilization`
  - **Subtarefas:**
    1. Padronizar respostas das rotas `GET /api/kpi/nc` e `/api/nc`.
    2. Adicionar tratamento estruturado de erros e logging.
    3. Implementar estados de carregamento e erro no frontend com retry.
    4. Criar error boundary dedicado à página de NCs.
  - **Critérios de aceite:**
    - Endpoints retornam 200 com payload padronizado.
    - UI exibe skeleton, mensagens claras e ação "Tentar novamente".

## Etapa 1 — Modelo de dados & Migração mínima

- **Issue:** `feat/nc-data-model`
  - **Subtarefas:**
    1. Atualizar schema do Firestore com novos campos (`criticality`, `category`, etc.).
    2. Preparar script de migração para preencher `createdAt`/`updatedAt`.
    3. Registrar índices `status+criticality`, `machineId+status`, `createdAt desc` em `firestore.indexes.json`.
    4. Atualizar formulários e listagens para suportar criticidade e categoria.
  - **Critérios de aceite:**
    - Criação/edição persiste os novos campos.
    - Lista ordenada por `createdAt` com filtros de `criticality` funcionando.
