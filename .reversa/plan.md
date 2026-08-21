# Plano de Exploração — BZS One

> Criado pelo Reversa em 2026-08-21
> Marque cada tarefa com ✅ quando concluída.
> Você pode editar este plano antes de iniciar: adicione, remova ou reordene tarefas conforme necessário.

---

## Fase 1: Reconhecimento 🔍

- [x] ✅ **Scout** — Mapeamento de estrutura de pastas e tecnologias
- [x] ✅ **Scout** — Análise de dependências e gerenciadores de pacotes
- [x] ✅ **Scout** — Identificação de entry points, CI/CD e configurações

## Decisão de organização das specs 🗂️

> Entre o Scout e o Arqueólogo, o Reversa pergunta como você quer organizar as specs (por módulo, caso de uso, endpoint, híbrida, por features ou customizada). A escolha fica persistida em `.reversa/config.toml` na seção `[specs]` e não será reperguntada em execuções futuras. Para reapresentar o menu, remova manualmente a seção.

## Fase 2: Escavação 🏗️

> Módulos identificados pelo Scout em `.reversa/context/surface.json`.

- [x] ✅ **Arqueólogo** — Análise do módulo `identity-access`
- [x] ✅ **Arqueólogo** — Análise do módulo `crm-sales`
- [x] ✅ **Arqueólogo** — Análise do módulo `whatsapp-inbox`
- [x] ✅ **Arqueólogo** — Análise do módulo `campaigns-email`
- [x] ✅ **Arqueólogo** — Análise do módulo `chatbots`
- [x] ✅ **Arqueólogo** — Análise do módulo `workflows`
- [x] ✅ **Arqueólogo** — Análise do módulo `follow-ups`
- [x] ✅ **Arqueólogo** — Análise do módulo `ai-knowledge`
- [x] ✅ **Arqueólogo** — Análise do módulo `media-transcription`
- [ ] **Arqueólogo** — Análise do módulo `reports-webhooks`
- [ ] **Arqueólogo** — Análise do módulo `quick-replies`
- [ ] **Arqueólogo** — Análise do módulo `realtime-notifications`
- [ ] **Arqueólogo** — Análise do módulo `external-api-mcp`
- [ ] **Arqueólogo** — Análise do módulo `web-interface`
- [ ] **Arqueólogo** — Análise do módulo `async-platform`
- [ ] **Arqueólogo** — Análise do módulo `infrastructure`

## Fase 3: Interpretação 🧠

- [ ] **Detetive** — Arqueologia Git e ADRs retroativos
- [ ] **Detetive** — Regras de negócio implícitas e máquinas de estado
- [ ] **Detetive** — Matriz de permissões (RBAC/ACL)
- [ ] **Arquiteto** — Diagramas C4 (Contexto, Containers, Componentes)
- [ ] **Arquiteto** — ERD completo e integrações externas
- [ ] **Arquiteto** — Spec Impact Matrix

## Fase 4: Geração 📝

- [ ] **Redator** — Specs SDD por componente
- [ ] **Redator** — OpenAPI (se aplicável)
- [ ] **Redator** — User Stories (se aplicável)
- [ ] **Redator** — Code/Spec Matrix

## Fase 5: Revisão ✅

- [ ] **Revisor** — Revisão cruzada de specs
- [ ] **Revisor** — Resolução de lacunas com o usuário
- [ ] **Revisor** — Relatório de confiança final

---

## Agentes Independentes

> Execute estes agentes quando os recursos estiverem disponíveis — podem rodar em qualquer fase.

- [ ] **Visor** — Análise de interface via screenshots
- [ ] **Data Master** — Análise completa do banco de dados
- [ ] **Design System** — Extração de tokens de design
- [ ] **Tracer** — Análise dinâmica (requer sistema acessível)

---

## Próximo passo

Após o Time de Descoberta concluir e o `_reversa_sdd/` estar populado, você pode disparar um dos fluxos seguintes:

- `/reversa-migrate`: orquestrador do **Time de Migração** (Paradigm Advisor → Curator → Strategist → Designer → Screen Translator → Inspector). Gera as specs do sistema novo. Saída em `_reversa_sdd/migration/` e `_reversa_sdd/screens/`.
- `/reversa-reconstructor`: gera plano bottom-up para reimplementar o software a partir das specs do legado (uma tarefa por sessão).
