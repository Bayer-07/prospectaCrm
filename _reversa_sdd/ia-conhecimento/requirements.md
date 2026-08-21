# IA e conhecimento — Requisitos

## Visão geral

Usar a API da OpenAI para resumos, sugestões, pré-atendimento e respostas fundamentadas em documentos da organização. **[CONFIRMADO]**

## Regras de negócio

1. A chave OpenAI configurada pela organização é criptografada e nunca devolvida ao navegador. **[CONFIRMADO]**
2. Sugestão de resposta nunca é enviada automaticamente e não sobrescreve texto digitado. **[CONFIRMADO]**
3. Resumo e sugestão ficam obsoletos quando o contexto muda antes da conclusão. **[CONFIRMADO]**
4. Pré-atendimento automático atua somente sem responsável humano. **[CONFIRMADO]**
5. A IA não altera CRM nem cria empresa sem aprovação humana. **[CONFIRMADO]**
6. Documentos recuperados servem apenas como contexto e suas fontes devem acompanhar a resposta interna. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| IA_CONHECIMENTO-FR-001 | Permitir ao administrador armazenar chave, selecionar modelo, definir instruções e testar o provedor. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| IA_CONHECIMENTO-FR-002 | Gerar resumo persistente ou texto editável sob demanda, preservando o composer do usuário. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| IA_CONHECIMENTO-FR-003 | Responder automaticamente dentro do bloco de chatbot e transferir com segurança em baixa confiança ou falha. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| IA_CONHECIMENTO-FR-004 | Ingerir documentos, recuperar trechos relevantes e adicioná-los ao contexto sem expor ou inventar conhecimento. **[CONFIRMADO]** | Must | O fluxo autorizado conclui uma vez e preserva diagnóstico e histórico. **[INFERIDO]** |
| IA_CONHECIMENTO-FR-099 | Executar trabalho pesado em segundo plano e atualizar somente entidades afetadas. **[CONFIRMADO]** | Must | A API responde sem bloquear e o resultado chega por consulta ou evento. **[CONFIRMADO]** |

## Requisitos não funcionais

- PostgreSQL é a fonte de verdade; jobs efêmeros não substituem estado persistido. **[CONFIRMADO]**
- Processamentos repetidos devem ser idempotentes e retomáveis após reinício. **[CONFIRMADO]**
- Segredos e URLs temporárias não são persistidos em payloads públicos. **[CONFIRMADO]**
- Consultas novas não devem ser incluídas nas listagens gerais quando o dado só é necessário no detalhe. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: executar ia e conhecimento em segundo plano
  Dado que a solicitação é válida e autorizada
  Quando a API persiste a intenção e enfileira o trabalho
  Então o usuário continua utilizando o sistema
  E o resultado final é persistido e comunicado sem duplicidade
```
**[INFERIDO]**

## MoSCoW

- **Must:** regras, estados, autorização, idempotência e falhas descritos neste módulo. **[CONFIRMADO]**
- **Should:** progresso em tempo real e diagnóstico acionável. **[INFERIDO]**
- **Could:** métricas históricas adicionais. **[A VALIDAR]**
- **Won’t:** expor segredo de infraestrutura ao navegador. **[CONFIRMADO]**

## Rastreabilidade

`apps/api/src/ai/ai.controller.ts`, `apps/api/src/ai/ai.service.ts`, `apps/worker/src/ai.processor.ts`, `apps/worker/src/openai-client.ts`, `apps/web/src/pages/Settings.tsx`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
