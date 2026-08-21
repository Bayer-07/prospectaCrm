# ADR 008 — OpenAI com RAG em vez de Ollama local

- **Status:** aceito; substitui a decisão inicial de IA local
- **Data reconstruída:** 2026-08-18 a 2026-08-19
- **Confiança:** 🟢 CONFIRMADO
- **Evidência histórica:** commits `32c4d3c`, `52cffc9`, `40173f3`, `093449f`, `70bf912`

## Contexto

A primeira implementação usou Ollama em servidor com CPU limitada, 8 GiB de RAM e GTX 750 Ti. Mesmo reduzindo de Qwen 4B para Gemma 3 1B, respostas levaram minutos e resumos perderam qualidade/idioma. O produto precisava de melhor consistência e contexto próprio da empresa.

## Decisão

- Substituir geração local pelo endpoint da OpenAI.
- Permitir ao administrador armazenar chave criptografada e selecionar modelo pela interface.
- Manter a arquitetura assíncrona de gerações, prioridades, deduplicação, stale/cancelamento e propostas humanas.
- Adicionar RAG: documentos privados são extraídos, fragmentados, recebem embeddings e apenas trechos relevantes entram no contexto.
- Não duplicar prompt completo nos logs nem expor chave no navegador.

## Consequências

### Positivas

- Melhor qualidade e latência no hardware atual.
- Modelo pode evoluir por configuração, sem rebuild.
- Conhecimento da empresa entra por recuperação controlada, não por treinamento local.

### Negativas

- Custo variável, dependência de internet e provedor externo.
- Conteúdo selecionado sai do servidor para processamento pela OpenAI.
- RAG adiciona pipeline de extração, embeddings, armazenamento e avaliação de relevância.

## Alternativas consideradas

- Qwen 3 4B local: qualidade melhor, porém lento e pesado.
- Gemma 3 1B local: mais leve, mas resumo e idioma insuficientes.
- Modelo local carregado sob demanda: reduz RAM ociosa, não resolve latência/qualidade na máquina.
- Sem RAG: prompts gerais não conhecem materiais internos e aumentam risco de resposta incompleta.

## Restrições

- IA não executa ferramentas nem envia sugestão manual automaticamente.
- Propostas de CRM exigem aprovação humana.
- Chatbot automático deve transferir em falha ou baixa confiança.
- Apenas documentos `READY` podem compor o contexto recuperado.

## Evidências atuais

`apps/api/src/ai/*`, `apps/worker/src/ai.processor.ts`, `apps/worker/src/ai-knowledge.processor.ts`, modelos `OrganizationAiSettings`, `ConversationAiGeneration`, `AiKnowledgeDocument` e interface de integração de IA.
