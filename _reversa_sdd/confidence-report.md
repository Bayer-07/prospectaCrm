# Relatório de Confiança — BZS One

> Gerado pelo Revisor em 2026-08-21.
> Escopo: 71 unidades, 237 documentos Markdown e 1 contrato OpenAPI previstos no plano do Redator.

---

## Resumo geral

As marcações textuais das specs foram mapeadas para os símbolos do Reversa: **[CONFIRMADO]** = 🟢, **[INFERIDO]** = 🟡 e **[A VALIDAR]** = 🔴.

| Nível | Quantidade | Percentual |
|---|---:|---:|
| 🟢 CONFIRMADO | 1885 | 59,8% |
| 🟡 INFERIDO | 1229 | 39,0% |
| 🔴 LACUNA | 39 | 1,2% |
| **Total** | **3153** | **100,0%** |

**Confiança geral:** **79,3%**, calculada como afirmações confirmadas mais metade das inferidas.

## Cobertura da revisão

- 238/238 arquivos previstos no plano existem e foram revisados.
- 71/71 unidades possuem requirements, design e tasks.
- 16/16 módulos da superfície arquitetural possuem specs.
- O OpenAPI possui 15 caminhos, parseia como YAML e não contém referências internas quebradas.
- As referências literais de código citadas como evidência foram verificadas contra o workspace.
- Revisão cruzada externa: não executada, pois o recurso `codex:rescue` não está disponível neste ambiente.

## Por spec

| Spec | 🟢 | 🟡 | 🔴 | Confiança |
|---|---:|---:|---:|---:|
| `identidade-acesso` | 158 | 13 | 5 | 93,5% |
| `identidade-acesso/login-sessoes` | 43 | 6 | 2 | 90,2% |
| `identidade-acesso/usuarios-papeis` | 43 | 4 | 1 | 93,8% |
| `identidade-acesso/convites-recuperacao` | 33 | 6 | 1 | 90% |
| `identidade-acesso/chaves-api` | 35 | 6 | 1 | 90,5% |
| `crm-vendas` | 74 | 15 | 1 | 90,6% |
| `crm-vendas/empresas-contatos` | 21 | 14 | 1 | 77,8% |
| `crm-vendas/pipeline-oportunidades` | 21 | 14 | 1 | 77,8% |
| `crm-vendas/tarefas-agenda` | 21 | 14 | 1 | 77,8% |
| `crm-vendas/importacao-segmentacao` | 21 | 14 | 1 | 77,8% |
| `whatsapp-inbox` | 50 | 22 | 2 | 82,4% |
| `whatsapp-inbox/conexoes-evolution` | 17 | 17 | 0 | 75% |
| `whatsapp-inbox/atendimento-tickets` | 17 | 17 | 0 | 75% |
| `whatsapp-inbox/mensagens-midias` | 17 | 17 | 0 | 75% |
| `whatsapp-inbox/sincronizacao-webhooks` | 17 | 17 | 0 | 75% |
| `campanhas-email` | 50 | 22 | 2 | 82,4% |
| `campanhas-email/criar-audiencia` | 17 | 17 | 0 | 75% |
| `campanhas-email/executar-whatsapp` | 17 | 17 | 0 | 75% |
| `campanhas-email/executar-email` | 17 | 17 | 0 | 75% |
| `campanhas-email/ciclo-campanha` | 17 | 17 | 0 | 75% |
| `chatbots` | 45 | 20 | 2 | 82,1% |
| `chatbots/modelar-publicar` | 17 | 17 | 0 | 75% |
| `chatbots/executar-regras` | 17 | 17 | 0 | 75% |
| `chatbots/espera-handoff-ia` | 17 | 17 | 0 | 75% |
| `automacoes` | 47 | 20 | 2 | 82,6% |
| `automacoes/modelar-publicar` | 17 | 17 | 0 | 75% |
| `automacoes/inscrever-contatos` | 17 | 17 | 0 | 75% |
| `automacoes/executar-acoes` | 17 | 17 | 0 | 75% |
| `follow-ups` | 39 | 21 | 2 | 79,8% |
| `follow-ups/agendar-editar` | 14 | 17 | 0 | 72,6% |
| `follow-ups/executar-sequencia` | 14 | 17 | 0 | 72,6% |
| `follow-ups/interromper-recuperar` | 14 | 17 | 0 | 72,6% |
| `ia-conhecimento` | 44 | 23 | 2 | 80,4% |
| `ia-conhecimento/configurar-openai` | 14 | 17 | 0 | 72,6% |
| `ia-conhecimento/resumir-sugerir` | 14 | 17 | 0 | 72,6% |
| `ia-conhecimento/pre-atendimento` | 14 | 17 | 0 | 72,6% |
| `ia-conhecimento/rag-documental` | 14 | 17 | 0 | 72,6% |
| `midia-transcricao` | 40 | 23 | 2 | 79,2% |
| `midia-transcricao/upload-download` | 14 | 17 | 0 | 72,6% |
| `midia-transcricao/midia-whatsapp` | 14 | 17 | 0 | 72,6% |
| `midia-transcricao/transcrever-audio` | 14 | 17 | 0 | 72,6% |
| `midia-transcricao/retencao` | 14 | 17 | 0 | 72,6% |
| `relatorios-webhooks` | 37 | 21 | 2 | 79,2% |
| `relatorios-webhooks/relatorios-pdf` | 14 | 17 | 0 | 72,6% |
| `relatorios-webhooks/configurar-webhooks` | 14 | 17 | 0 | 72,6% |
| `relatorios-webhooks/entregar-webhooks` | 14 | 17 | 0 | 72,6% |
| `respostas-rapidas` | 33 | 19 | 2 | 78,7% |
| `respostas-rapidas/gerenciar-catalogo` | 14 | 17 | 0 | 72,6% |
| `respostas-rapidas/inserir-no-composer` | 14 | 17 | 0 | 72,6% |
| `tempo-real-notificacoes` | 39 | 21 | 2 | 79,8% |
| `tempo-real-notificacoes/socket-autenticado` | 14 | 17 | 0 | 72,6% |
| `tempo-real-notificacoes/notificacoes` | 14 | 17 | 0 | 72,6% |
| `tempo-real-notificacoes/invalidacao-som` | 14 | 17 | 0 | 72,6% |
| `api-externa-mcp` | 53 | 16 | 1 | 87,1% |
| `api-externa-mcp/chaves-idempotencia` | 12 | 18 | 0 | 70% |
| `api-externa-mcp/api-publica-swagger` | 12 | 18 | 0 | 70% |
| `api-externa-mcp/servidor-mcp` | 12 | 18 | 0 | 70% |
| `interface-web` | 33 | 17 | 1 | 81,4% |
| `interface-web/autenticacao-navegacao` | 12 | 18 | 0 | 70% |
| `interface-web/busca-feedback` | 12 | 18 | 0 | 70% |
| `interface-web/interacoes-complexas` | 12 | 18 | 0 | 70% |
| `interface-web/tema-movimento` | 12 | 18 | 0 | 70% |
| `plataforma-assincrona` | 51 | 16 | 1 | 86,8% |
| `plataforma-assincrona/filas-workers` | 12 | 18 | 0 | 70% |
| `plataforma-assincrona/reconciliacao-manutencao` | 12 | 18 | 0 | 70% |
| `plataforma-assincrona/shutdown-operacao` | 12 | 18 | 0 | 70% |
| `infraestrutura` | 50 | 18 | 1 | 85,5% |
| `infraestrutura/topologia-docker` | 12 | 18 | 0 | 70% |
| `infraestrutura/proxy-redes` | 12 | 18 | 0 | 70% |
| `infraestrutura/rebuild-deploy` | 12 | 18 | 0 | 70% |
| `infraestrutura/backup-restore` | 12 | 18 | 0 | 70% |
| `global` | 132 | 31 | 0 | 90,5% |

## Lacunas pendentes 🔴

### Desempenho e capacidade
- Não existem SLOs oficiais nem resultados de carga para os volumes reais. As 15 ocorrências estão agrupadas na [Pergunta 1](questions.md#pergunta-1).

### Observabilidade
- Métricas adicionais, limiares e destinatários de alertas ainda não foram definidos. As 12 ocorrências estão agrupadas na [Pergunta 2](questions.md#pergunta-2).

### Identidade e escala
- Cache/invalidação distribuída depende da decisão de escala horizontal: [Pergunta 3](questions.md#pergunta-3).
- Ciclo de vida de convites e reatribuição ao desativar usuários: [Pergunta 4](questions.md#pergunta-4).
- MFA, SSO, encerramento seletivo e política futura de senha: [Pergunta 5](questions.md#pergunta-5).

### Produto e roadmap
- Fontes e regras de enriquecimento externo do CRM: [Pergunta 6](questions.md#pergunta-6).
- Automações operacionais opcionais ainda sem prioridade: [Pergunta 7](questions.md#pergunta-7).

O inventário completo das 39 lacunas está em [gaps.md](gaps.md).

## Recomendações

- [ ] Definir volumes, percentis de latência e janelas de carga antes de otimizar consultas por hipótese.
- [ ] Definir métricas, alertas e responsáveis operacionais antes da expansão de uso em produção.
- [ ] Resolver a estratégia de invalidação antes de executar múltiplas réplicas da API.
- [ ] Registrar decisões de MFA/SSO, política de senha e reatribuição em ADRs antes de alterar o comportamento.
- [ ] Preencher [questions.md](questions.md) quando as decisões estiverem maduras; as specs atuais continuam utilizáveis sem essas respostas.

## Histórico de reclassificações e correções

| De | Para | Afirmação | Evidência |
|---|---|---|---|
| — | — | Nenhuma marcação de confiança precisou ser reclassificada. | A revisão preservou 39 lacunas honestas em vez de presumir decisões. |
| 🟢 | 🟢 | Referências de arquivos consolidados ou renomeados foram corrigidas sem alterar o comportamento documentado. | Verificação literal contra `apps/**` e `packages/**`; nenhuma referência ausente permaneceu. |
| 🟢 | 🟢 | Filtros, DTOs parciais e respostas do OpenAPI reconstruído foram alinhados ao Swagger implementado. | `apps/api/src/swagger/crm-openapi.ts` e `_reversa_sdd/openapi/bzs-one.yaml`. |

