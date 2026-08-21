# RAG documental — Requisitos

## Objetivo

Ingerir documentos, recuperar trechos relevantes e adicioná-los ao contexto sem expor ou inventar conhecimento. **[CONFIRMADO]**

## Requisitos funcionais

| ID | Requisito | Prioridade | Aceite |
|---|---|---:|---|
| IA_CONHECIMENTO-4-FR-001 | Enviar documentos autorizados ao armazenamento e extrair texto em segundo plano. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-4-FR-002 | Fragmentar texto e persistir vetores/metadados por organização. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-4-FR-003 | Recuperar apenas fragmentos acima do limiar e dentro do limite de contexto. **[CONFIRMADO]** | Must | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-4-FR-004 | Mostrar documentos/fontes utilizados para revisão interna. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |
| IA_CONHECIMENTO-4-FR-005 | Permitir desativar ou excluir documento e impedir uso futuro dos fragmentos. **[CONFIRMADO]** | Should | O resultado correto é persistido; falha não deixa efeito parcial nem duplicado. **[INFERIDO]** |

## Regras transversais

- Autorização, organização e estado são revalidados no servidor. **[CONFIRMADO]**
- Jobs e eventos repetidos não duplicam efeito. **[CONFIRMADO]**
- A interface consulta detalhes apenas quando necessários. **[INFERIDO]**

## Aceitação

```gherkin
Cenário: fluxo principal de rag documental
  Dado que o ator possui acesso e os dados são válidos
  Quando o fluxo é iniciado
  Então o estado avança de forma persistente e idempotente
  E o resultado ou erro fica disponível ao usuário
```
**[INFERIDO]**

## Rastreabilidade

`apps/api/src/ai/ai.service.ts`, `apps/worker/src/ai-knowledge.processor.ts`, `packages/database/prisma/schema.prisma`. **[CONFIRMADO]**
